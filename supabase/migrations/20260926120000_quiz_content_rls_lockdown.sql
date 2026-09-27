-- Quiz content lockdown (quizzes / quiz_questions / quiz_options)
--
-- These tables previously had `using (true)` MVP policies: any visitor with the
-- public anon key (which ships inside the site JS bundle) could read the whole
-- quiz bank INCLUDING which option is correct for every question, and could
-- insert/update/delete quiz content. This migration replaces them with the
-- hardened pattern used by the rest of the platform:
--   * staff (faculty / super_admin): full management access
--   * active students: read published quizzes of courses they are enrolled in
--   * question and option rows: staff only — students always receive them
--     through the SECURITY DEFINER RPCs (get_quiz_questions_for_student /
--     submit_quiz_attempt), which never expose the answer key.

drop policy if exists quizzes_mvp_access on public.quizzes;
drop policy if exists quiz_questions_mvp_access on public.quiz_questions;
drop policy if exists quiz_options_mvp_access on public.quiz_options;

-- Staff: full management (same model as assignment_*_staff_all_secure).
create policy quizzes_staff_all on public.quizzes
  for all
  using (public.is_kaveri_staff())
  with check (public.is_kaveri_staff());

create policy quiz_questions_staff_all on public.quiz_questions
  for all
  using (public.is_kaveri_staff())
  with check (public.is_kaveri_staff());

create policy quiz_options_staff_all on public.quiz_options
  for all
  using (public.is_kaveri_staff())
  with check (public.is_kaveri_staff());

-- Students: read published quizzes for courses with an active enrollment
-- (quiz list, calendar, course workspace). Taking/grading a quiz stays inside
-- the SECURITY DEFINER RPCs, which additionally enforce the lesson lock.
create policy quizzes_students_read_published on public.quizzes
  for select
  using (
    is_published
    and exists (
      select 1
      from public.course_enrollments ce
      where ce.course_id = quizzes.course_id
        and ce.student_id = auth.uid()
        and ce.access_status = 'active'
    )
  );
