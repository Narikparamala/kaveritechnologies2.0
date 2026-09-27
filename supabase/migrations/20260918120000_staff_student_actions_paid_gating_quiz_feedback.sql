-- Staff act as real students + paid-course gating enforced + quiz answer review
--
-- Three product fixes in one additive, idempotent migration:
--
-- 1. STAFF AS REAL STUDENTS: faculty/super_admin entering the Student portal
--    can now do everything a student can (enroll, request access, complete
--    lessons, take quizzes, join batches/live classes, request coding
--    assignment access). The five SECURITY DEFINER RPCs that hard-required
--    role = 'student' now accept staff roles too. XP/progress/certificates
--    are tracked on the staff member's own account exactly like a student.
--
-- 2. PAID-COURSE GATING ENFORCED SERVER-SIDE: the enrollment insert policy
--    lost its enrollment_mode = 'open' clause in a later repair migration, so
--    any authenticated user could self-enroll into approval_required courses
--    via direct REST. The clause is restored. Existing production courses are
--    flipped to 'approval_required' — the paid (PhonePe offline) model.
--
-- 3. QUIZ ANSWER REVIEW: submit_quiz_attempt now records per-question
--    quiz_answers rows and returns per-question results (correct/incorrect,
--    correct answer, explanation) in its response so the results screen can
--    show real feedback. Answers are only revealed to the submitting user,
--    after submission, for their own attempt.

-- ============================================================
-- 1a. complete_lesson: accept staff
-- ============================================================
CREATE OR REPLACE FUNCTION public.complete_lesson(p_lesson_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  current_user_id uuid := (select auth.uid());
  lesson_record public.lessons%rowtype;
  progress_record public.lesson_progress%rowtype;
  was_completed boolean := false;
  total_lessons integer := 0;
  completed_lessons integer := 0;
  awarded_xp integer := 0;
  total_xp integer := 0;
  current_level integer := 1;
  course_progress numeric(5,2) := 0;
  certificate_insert_count integer := 0;
begin
  if current_user_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.profiles profile
    where profile.id = current_user_id
      and profile.role in ('student', 'faculty', 'super_admin')
      and profile.is_active = true
  ) then
    raise exception 'Only an active account may complete a lesson.' using errcode = '42501';
  end if;

  select lesson.* into lesson_record
  from public.lessons lesson
  join public.courses course on course.id = lesson.course_id
  where lesson.id = p_lesson_id
    and lesson.is_published = true
    and course.is_published = true;
  if lesson_record.id is null then
    raise exception 'Published lesson not found.' using errcode = 'P0002';
  end if;
  if not exists (
    select 1 from public.course_enrollments enrollment
    where enrollment.course_id = lesson_record.course_id
      and enrollment.student_id = current_user_id
      and enrollment.access_status = 'active'
  ) then
    raise exception 'An active course enrollment is required.' using errcode = '42501';
  end if;

  -- progression guard: locked lessons cannot be completed out of order
  if public.student_lesson_access(p_lesson_id) = 'locked' then
    raise exception 'This lesson is locked. Complete the required previous work first, or wait for your faculty to release it.' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(current_user_id::text || ':' || p_lesson_id::text, 0));
  select progress.completed into was_completed
  from public.lesson_progress progress
  where progress.student_id = current_user_id and progress.lesson_id = p_lesson_id
  for update;
  was_completed := coalesce(was_completed, false);

  insert into public.lesson_progress (student_id, lesson_id, course_id, completed, completed_at)
  values (current_user_id, lesson_record.id, lesson_record.course_id, true, now())
  on conflict (student_id, lesson_id) do update
  set course_id = excluded.course_id,
      completed = true,
      completed_at = coalesce(public.lesson_progress.completed_at, excluded.completed_at),
      updated_at = now()
  returning * into progress_record;

  if not was_completed then
    awarded_xp := greatest(coalesce(lesson_record.xp_reward, 0), 0);
    if awarded_xp > 0 then
      insert into public.xp_transactions (student_id, amount, reason, reference_id, reference_type)
      values (current_user_id, awarded_xp, 'Completed lesson: ' || lesson_record.title, lesson_record.id, 'lesson');
      update public.profiles
      set xp_points = xp_points + awarded_xp,
          level = floor(sqrt(greatest(xp_points + awarded_xp, 0)::numeric / 100))::integer + 1,
          updated_at = now()
      where id = current_user_id
      returning xp_points, level into total_xp, current_level;
    end if;
  end if;
  if awarded_xp = 0 then
    select profile.xp_points, profile.level into total_xp, current_level
    from public.profiles profile where profile.id = current_user_id;
  end if;

  select count(*) into total_lessons from public.lessons lesson
  where lesson.course_id = lesson_record.course_id and lesson.is_published = true;
  select count(*) into completed_lessons
  from public.lesson_progress progress
  join public.lessons lesson on lesson.id = progress.lesson_id
  where progress.student_id = current_user_id
    and progress.completed = true
    and lesson.course_id = lesson_record.course_id
    and lesson.is_published = true;
  course_progress := case when total_lessons = 0 then 0
    else round((completed_lessons::numeric / total_lessons::numeric) * 100, 2) end;

  update public.course_enrollments
  set progress_percentage = course_progress,
      completed_at = case when course_progress = 100 then coalesce(completed_at, now()) else null end
  where course_id = lesson_record.course_id
    and student_id = current_user_id
    and access_status = 'active';

  if course_progress = 100 and exists (
    select 1 from public.courses course
    where course.id = lesson_record.course_id and course.certificate_eligible = true
  ) then
    insert into public.certificates (student_id, course_id)
    values (current_user_id, lesson_record.course_id)
    on conflict (student_id, course_id) do nothing;
    get diagnostics certificate_insert_count = row_count;
  end if;

  return jsonb_build_object(
    'progress', to_jsonb(progress_record),
    'course_progress', course_progress,
    'xp_awarded', awarded_xp,
    'total_xp', total_xp,
    'level', current_level,
    'certificate_issued', certificate_insert_count > 0
  );
end;
$function$;

-- ============================================================
-- 1b. submit_quiz_attempt: accept staff + per-question results
-- ============================================================
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

-- ============================================================
-- 1c-1e. join/request RPCs: accept staff
-- ============================================================
CREATE OR REPLACE FUNCTION public.join_batch_by_code(p_code text)
 RETURNS TABLE(batch_id uuid, batch_name text, membership_status text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user uuid := auth.uid();
  v_batch public.batches%rowtype;
begin
  if v_user is null then
    raise exception 'You must be signed in.';
  end if;

  select * into v_batch
  from public.batches
  where upper(join_code) = upper(trim(p_code))
    and status = 'active'
  limit 1;

  if v_batch.id is null then
    raise exception 'Invalid or inactive batch code.';
  end if;

  if not exists (
    select 1 from public.profiles p
    where p.id = v_user
      and p.role in ('student', 'faculty', 'super_admin')
      and coalesce(p.is_active, true) = true
  ) then
    raise exception 'Only active accounts can join a batch.';
  end if;

  insert into public.batch_students (batch_id, student_id, status)
  values (v_batch.id, v_user, 'active')
  on conflict (batch_id, student_id)
  do update set status = 'active';

  return query
  select v_batch.id, v_batch.name, 'active'::text;
end;
$function$;

CREATE OR REPLACE FUNCTION public.join_coding_live_class(p_batch_id uuid)
 RETURNS TABLE(unlocked_count integer, batch_name text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_count integer := 0;
  v_batch_name text;
begin
  if auth.uid() is null then raise exception 'You must be signed in'; end if;
  if not exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role in ('student', 'faculty', 'super_admin') and coalesce(p.is_active, true) = true
  ) then raise exception 'Only active accounts can join a live class'; end if;

  select b.name into v_batch_name
  from public.batch_students bs
  join public.batches b on b.id = bs.batch_id
  where bs.student_id = auth.uid()
    and bs.status = 'active'
    and b.status = 'active'
    and b.id = p_batch_id;

  if v_batch_name is null then raise exception 'You are not enrolled in this active batch'; end if;

  insert into public.coding_vscode_student_assignment_access (
    student_id, assignment_id, batch_id, source, granted_at, granted_by
  )
  select auth.uid(), ab.assignment_id, ab.batch_id, 'live_attendance', now(), null
  from public.coding_vscode_assignment_batches ab
  join public.coding_vscode_assignments a on a.id = ab.assignment_id
  where ab.batch_id = p_batch_id
    and a.is_published = true
    and ab.is_unlocked = true
    and ab.live_until is not null
    and ab.live_until > now()
  on conflict (student_id, assignment_id, batch_id)
  do update set source = 'live_attendance', granted_at = least(public.coding_vscode_student_assignment_access.granted_at, excluded.granted_at);

  get diagnostics v_count = row_count;

  if v_count = 0 and not exists (
    select 1 from public.coding_vscode_assignment_batches ab
    where ab.batch_id = p_batch_id
      and ab.is_unlocked = true
      and ab.live_until is not null
      and ab.live_until > now()
  ) then
    raise exception 'There is no live coding class active for this batch right now';
  end if;

  return query select v_count, v_batch_name;
end;
$function$;

CREATE OR REPLACE FUNCTION public.request_coding_assignment_access(p_assignment_id uuid, p_batch_id uuid, p_reason text DEFAULT NULL::text)
 RETURNS TABLE(request_id uuid, request_status text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_id uuid;
  v_status text;
begin
  if auth.uid() is null then raise exception 'You must be signed in'; end if;
  if not exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.role in ('student', 'faculty', 'super_admin') and coalesce(p.is_active, true) = true
  ) then raise exception 'Only active accounts can request access'; end if;

  if exists (
    select 1
    from public.coding_vscode_assignment_batches ab
    left join public.coding_vscode_student_assignment_access pa
      on pa.student_id = auth.uid() and pa.assignment_id = ab.assignment_id and pa.batch_id = ab.batch_id
    where ab.assignment_id = p_assignment_id
      and ab.batch_id = p_batch_id
      and (ab.is_permanently_released = true or pa.id is not null)
  ) then raise exception 'This question is already permanently available to you'; end if;

  if exists (
    select 1 from public.coding_vscode_assignment_batches ab
    where ab.assignment_id = p_assignment_id
      and ab.batch_id = p_batch_id
      and ab.is_unlocked = true
      and ab.live_until is not null
      and ab.live_until > now()
  ) then raise exception 'Your live class is active. Join the live class instead'; end if;

  if not exists (
    select 1
    from public.batch_students bs
    join public.batches b on b.id = bs.batch_id
    join public.coding_vscode_assignment_batches ab on ab.batch_id = bs.batch_id
    where bs.student_id = auth.uid()
      and bs.status = 'active'
      and b.status = 'active'
      and bs.batch_id = p_batch_id
      and ab.assignment_id = p_assignment_id
  ) then raise exception 'This question is not part of your class history'; end if;

  insert into public.coding_vscode_access_requests (
    student_id, assignment_id, batch_id, status, reason, requested_at,
    decided_at, decided_by, access_until, updated_at
  ) values (
    auth.uid(), p_assignment_id, p_batch_id, 'pending', nullif(trim(coalesce(p_reason,'')),''), now(),
    null, null, null, now()
  )
  on conflict (student_id, assignment_id, batch_id)
  do update set
    status = 'pending',
    reason = excluded.reason,
    requested_at = now(),
    decided_at = null,
    decided_by = null,
    access_until = null,
    updated_at = now()
  returning id, status into v_id, v_status;

  return query select v_id, v_status;
end;
$function$;

-- ============================================================
-- 2. Paid-course gating enforced server-side
-- ============================================================
-- Self-enrollment (the free path) is only valid for open courses. Admin
-- grants (is_admin branch) and the approve_enrollment_request RPC are
-- unaffected.
DROP POLICY IF EXISTS enrollments_insert_hardened ON public.course_enrollments;
CREATE POLICY enrollments_insert_hardened ON public.course_enrollments
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (
    is_admin()
    OR (
      student_id = (SELECT auth.uid())
      AND access_status = 'active'
      AND enrollment_source = 'free_enrollment'
      AND EXISTS (
        SELECT 1 FROM public.courses c
        WHERE c.id = course_enrollments.course_id
          AND c.is_published = true
          AND c.enrollment_mode = 'open'
      )
    )
  );

-- Staff may file access requests for paid courses too (they act as students
-- in the student portal). Request policy: same shape as before, widened role.
DROP POLICY IF EXISTS enrollment_requests_insert_student ON public.enrollment_requests;
CREATE POLICY enrollment_requests_insert_student ON public.enrollment_requests
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (
    status = 'pending'
    AND student_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = (SELECT auth.uid())
        AND p.role IN ('student', 'faculty', 'super_admin')
        AND coalesce(p.is_active, true)
    )
    AND EXISTS (
      SELECT 1 FROM public.courses c
      WHERE c.id = enrollment_requests.course_id
        AND c.is_published = true
        AND c.enrollment_mode = 'approval_required'
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.course_enrollments e
      WHERE e.student_id = enrollment_requests.student_id
        AND e.course_id = enrollment_requests.course_id
        AND e.access_status = 'active'
    )
  );

-- Faculty can read enrollment requests (their manage-access page loaded
-- nothing before: the SELECT policy only allowed own rows + admin).
DROP POLICY IF EXISTS enrollment_requests_select_faculty ON public.enrollment_requests;
CREATE POLICY enrollment_requests_select_faculty ON public.enrollment_requests
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (is_faculty());

-- Product decision: all courses are paid (PhonePe offline payment, then
-- staff approval). The coding workspace remains free. Idempotent: only
-- touches courses still marked open at migration time.
UPDATE public.courses
SET enrollment_mode = 'approval_required',
    updated_at = now()
WHERE enrollment_mode = 'open';
