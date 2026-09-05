-- Kaveri LMS — offline exams: enrollment-scoped student visibility (forward,
-- LOCAL only)
--
-- 20260905235000's student SELECT policy exposes non-draft/cancelled exam
-- METADATA to every authenticated user. That is too broad for a real
-- institution: an exam for Course X should be visible only to students who
-- are actively enrolled in Course X (course-less platform-level exams remain
-- visible to everyone so announcements still work).
--
-- This keeps the confidentiality contract while making the E2E scope check
-- meaningful: an unassigned faculty member (and any non-enrolled user)
-- cannot even list the exam row.

drop policy if exists offline_exams_student_read on public.offline_exams;
create policy offline_exams_student_read on public.offline_exams
  for select to authenticated
  using (
    status not in ('draft','cancelled')
    and (
      course_id is null
      or exists (
        select 1 from public.course_enrollments ce
        where ce.course_id = offline_exams.course_id
          and ce.student_id = auth.uid()
          and ce.access_status = 'active'
      )
    )
  );