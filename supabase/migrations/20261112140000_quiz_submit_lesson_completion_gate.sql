-- ============================================================================
-- KAVERI LMS — quiz-submit lesson-completion gate
-- ----------------------------------------------------------------------------
-- submit_quiz_attempt() still uses the availability-only gate
-- (student_activity_unlocked), while get_quiz_questions_for_student() was
-- tightened in 20261112120000 (PR #46) to require the parent lesson to be
-- *completed*. This migration redefines submit_quiz_attempt — verbatim from
-- 20260918120000, its latest definition, except for the added completion
-- check below — so grading matches the lock the UI shows and the fetch
-- gate enforces. No signature, return shape, XP rule, or per-question
-- results change. CREATE OR REPLACE preserves the existing grants
-- (authenticated only; revoked from public in 20260904150000).
--
-- Apply on staging first and smoke-test: (1) a student cannot submit a
-- quiz whose lesson is uncompleted (expect 'Complete the lesson to unlock
-- this quiz.'); (2) a completed-lesson quiz still submits, passes and
-- awards XP once; (3) a gate-quiz (the quiz IS its lesson's required
-- activity) still submits; (4) a course-level quiz (no lesson) still
-- submits. Do NOT apply to production until #46 has merged — this file
-- is sequenced after it (20261112140000 > 20261112120000).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.submit_quiz_attempt(p_quiz_id uuid, p_answers jsonb, p_time_taken_seconds integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := auth.uid();
  v_course_id uuid;
  v_lesson_id uuid;
  v_pass_pct integer;
  v_xp_reward integer;
  v_total numeric := 0;
  v_earned numeric := 0;
  v_pct numeric := 0;
  v_attempt_id uuid;
  v_passed boolean;
  v_was_passed boolean;
  qr record;
  ans jsonb;
  v_selected jsonb;
  v_correct_ids jsonb;
  v_q_correct boolean;
  v_results jsonb := '[]'::jsonb;
begin
  if v_uid is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.profiles p
    where p.id = v_uid and p.role in ('student', 'faculty', 'super_admin') and p.is_active
  ) then
    raise exception 'Only an active account may submit a quiz.' using errcode = '42501';
  end if;

  select qz.course_id, qz.lesson_id, qz.pass_percentage, qz.xp_reward
    into v_course_id, v_lesson_id, v_pass_pct, v_xp_reward
  from public.quizzes qz
  where qz.id = p_quiz_id and qz.is_published;

  if v_course_id is null then
    raise exception 'Published quiz not found.' using errcode = 'P0002';
  end if;

  if not exists (
    select 1 from public.course_enrollments ce
    where ce.course_id = v_course_id
      and ce.student_id = v_uid
      and ce.access_status = 'active'
  ) then
    raise exception 'An active enrollment in this course is required.' using errcode = '42501';
  end if;

  if not public.student_activity_unlocked(v_lesson_id, 'quiz', p_quiz_id) then
    raise exception 'This quiz unlocks with its lesson.' using errcode = '42501';
  end if;

  -- Lesson-completion lock (2026-11-12): mirrors the gate added to
  -- get_quiz_questions_for_student in 20261112120000 (PR #46). The student
  -- UI locks a quiz until its parent lesson is *completed*, but
  -- student_activity_unlocked() above only requires the lesson to be
  -- *available*. Without this check a student calling this RPC directly
  -- could submit — and pass, earning XP — a quiz for a lesson they had
  -- not completed, even though fetching its questions is now gated.
  -- Two deliberate exceptions, mirroring student_activity_unlocked():
  --   * course-level quizzes (v_lesson_id is null) have no lesson to
  --     complete, so they are unaffected;
  --   * the quiz IS the gate activity of its own parent lesson (the
  --     circular gate) — otherwise that lesson could never be unlocked.
  if v_lesson_id is not null
    and not exists (
      select 1 from public.lesson_progress lp
      where lp.lesson_id = v_lesson_id
        and lp.student_id = v_uid
        and lp.completed
    )
    and not exists (
      select 1 from public.lessons l
      where l.id = v_lesson_id
        and l.requires_activity_type = 'quiz'
        and l.requires_activity_id = p_quiz_id
    )
  then
    raise exception 'Complete the lesson to unlock this quiz.' using errcode = '42501';
  end if;

  for qr in
    select qq.id, qq.question_type, qq.points, qq.correct_answer_text, qq.explanation,
           coalesce((
             select jsonb_agg(
               jsonb_build_object('id', o.id, 'is_correct', o.is_correct)
               order by o.order_index
             )
             from public.quiz_options o
             where o.question_id = qq.id
           ), '[]'::jsonb) as options
    from public.quiz_questions qq
    where qq.quiz_id = p_quiz_id
    order by qq.order_index
  loop
    v_total := v_total + qr.points;
    ans := p_answers -> qr.id::text;
    v_q_correct := null;
    v_correct_ids := null;
    v_selected := null;

    if qr.question_type in ('fill_in_blank', 'code_output') then
      v_q_correct := lower(trim(coalesce(ans->>'text', ''))) = lower(trim(coalesce(qr.correct_answer_text, '')));
      if v_q_correct then
        v_earned := v_earned + qr.points;
      end if;
    elsif qr.question_type <> 'coding' then
      -- mcq / true_false / multiple_select: exact set match.
      -- Compare option-id strings on both sides: qr.options holds
      -- jsonb objects, so project elem->>'id' before ordering.
      select coalesce(jsonb_agg(elem->>'id' order by elem->>'id'), '[]'::jsonb)
        into v_correct_ids
      from jsonb_array_elements(qr.options) elem
      where (elem->>'is_correct')::boolean;

      select coalesce(jsonb_agg(elem order by elem), '[]'::jsonb)
        into v_selected
      from jsonb_array_elements_text(coalesce(ans->'selected', '[]'::jsonb)) elem;

      v_q_correct := v_correct_ids = v_selected;
      if v_q_correct then
        v_earned := v_earned + qr.points;
      end if;
    end if;
    -- 'coding' questions are manually graded: no automatic points,
    -- v_q_correct stays null (shown as "pending review")

    v_results := v_results || jsonb_build_object(
      'question_id', qr.id,
      'question_type', qr.question_type,
      'is_correct', v_q_correct,
      'points', qr.points,
      'earned', case when v_q_correct then qr.points else 0 end,
      'selected_option_ids', coalesce(v_selected, '[]'::jsonb),
      'correct_option_ids', v_correct_ids,
      'correct_answer_text', case when qr.question_type in ('fill_in_blank', 'code_output') then qr.correct_answer_text else null end,
      'explanation', qr.explanation
    );
  end loop;

  if v_total > 0 then
    v_pct := round((v_earned / v_total) * 100, 2);
  end if;
  v_passed := v_pct >= coalesce(v_pass_pct, 70);

  -- Award the advertised XP at most once per passed quiz (mirrors the
  -- trusted lesson-completion XP path). Serialize on student+quiz so
  -- parallel submits cannot double-grant.
  if v_passed and coalesce(v_xp_reward, 0) > 0 then
    perform pg_advisory_xact_lock(hashtextextended(v_uid::text || ':' || p_quiz_id::text, 0));
  end if;

  select exists (
    select 1 from public.quiz_attempts qp
    where qp.quiz_id = p_quiz_id
      and qp.student_id = v_uid
      and qp.passed
  ) into v_was_passed;

  insert into public.quiz_attempts (
    quiz_id, student_id, score, max_score, passed,
    time_taken_seconds, completed_at
  )
  values (
    p_quiz_id, v_uid, v_pct, v_total::integer,
    v_passed,
    p_time_taken_seconds, now()
  )
  returning id into v_attempt_id;

  -- Per-question answer sheet: lets the student review their attempt and
  -- faculty audit what was answered. Auto-graded questions only (coding
  -- questions have no is_correct until manual grading).
  insert into public.quiz_answers (attempt_id, question_id, selected_option_ids, is_correct)
  select
    v_attempt_id,
    (r->>'question_id')::uuid,
    coalesce(
      (select array_agg(x::uuid order by x) from jsonb_array_elements_text(r->'selected_option_ids') x),
      '{}'::uuid[]
    ),
    (r->>'is_correct')::boolean
  from jsonb_array_elements(v_results) r
  where r->>'is_correct' is not null;

  if v_passed and not v_was_passed and coalesce(v_xp_reward, 0) > 0 then
    insert into public.xp_transactions (student_id, amount, reason, reference_id, reference_type)
    select v_uid, qz2.xp_reward, 'Passed quiz: ' || qz2.title, qz2.id, 'quiz'
    from public.quizzes qz2
    where qz2.id = p_quiz_id;

    update public.profiles
    set xp_points = xp_points + coalesce(v_xp_reward, 0),
        level = floor(sqrt(greatest(xp_points + coalesce(v_xp_reward, 0), 0)::numeric / 100))::integer + 1,
        updated_at = now()
    where id = v_uid;
  end if;

  return jsonb_build_object(
    'attempt_id', v_attempt_id,
    'score', v_pct,
    'max_score', v_total::integer,
    'passed', v_passed,
    'xp_reward', case when v_passed then coalesce(v_xp_reward, 0) else 0 end,
    'xp_awarded', case when v_passed and not v_was_passed then coalesce(v_xp_reward, 0) else 0 end,
    'results', v_results
  );
end;
$function$;
