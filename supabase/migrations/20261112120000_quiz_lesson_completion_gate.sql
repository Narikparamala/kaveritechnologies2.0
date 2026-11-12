-- ============================================================================
-- KAVERI LMS — quiz lesson-completion gate
-- ----------------------------------------------------------------------------
-- get_quiz_questions_for_student() previously only required the parent
-- lesson to be *available* (via student_activity_unlocked), while the
-- student UI locks a quiz until its lesson is *completed*. A student
-- calling the RPC directly could fetch questions for an unlocked-but-
-- uncompleted lesson. This migration redefines the function — verbatim
-- except for the added completion check below — so the server enforces
-- the same lock the UI shows. submit_quiz_attempt() still uses the
-- availability gate and should be tightened the same way in a follow-up
-- if the product wants grading to match.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_quiz_questions_for_student(p_quiz_id uuid) RETURNS TABLE(id uuid, quiz_id uuid, question_text text, question_type text, order_index integer, points integer, created_at timestamp with time zone, difficulty text, code_snippet text, image_url text, enable_playground boolean, time_limit_seconds integer, options jsonb)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_uid uuid := auth.uid();
  v_course_id uuid;
  v_lesson_id uuid;
begin
  if v_uid is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  select q.course_id, q.lesson_id into v_course_id, v_lesson_id
  from public.quizzes q
  where q.id = p_quiz_id and q.is_published;

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

  -- Lesson-completion lock (2026-11-12): the client-side quiz lock in
  -- QuizzesPage.tsx requires the parent lesson to be *completed*, but
  -- student_activity_unlocked() above only requires it to be
  -- *available*. A student calling this RPC directly could therefore
  -- fetch questions for a lesson they had not completed. Require
  -- completion here too, so the server enforces the same lock the UI
  -- shows. Two deliberate exceptions, mirroring
  -- student_activity_unlocked():
  --   * course-level quizzes (v_lesson_id is null) have no lesson to
  --     complete, so they are unaffected;
  --   * the quiz IS the gate activity of its own parent lesson (the
  --     circular gate) — otherwise that lesson could never be unlocked.
  -- Return shape is unchanged: options carry no is_correct /
  -- correct_answer_text, so the answer key is still never exposed.
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

  return query
  select
    qq.id,
    qq.quiz_id,
    qq.question_text,
    qq.question_type,
    qq.order_index,
    qq.points,
    qq.created_at,
    qq.difficulty,
    qq.code_snippet,
    qq.image_url,
    qq.enable_playground,
    qq.time_limit_seconds,
    coalesce((
      select jsonb_agg(
        jsonb_build_object('id', o.id, 'option_text', o.option_text, 'order_index', o.order_index)
        order by o.order_index
      )
      from public.quiz_options o
      where o.question_id = qq.id
    ), '[]'::jsonb) as options
  from public.quiz_questions qq
  where qq.quiz_id = p_quiz_id
  order by qq.order_index;
end;
$$;
