-- Kaveri LMS — offline exams staff-scope refinement (forward, LOCAL only)
--
-- 20260905235000 granted every staff member read access to ALL offline_exams
-- and ALL offline_exam_results. That is unnecessarily broad for faculty:
-- they should see only the exams of courses they are assigned to (admins see
-- everything). Update/result-entry were already course-manageable gated; this
-- closes the read gap so a course faculty member cannot even list metadata or
-- result rows of exams belonging to other courses.

drop policy if exists offline_exams_staff_read on public.offline_exams;
create policy offline_exams_staff_read on public.offline_exams
  for select to authenticated
  using (
    public.is_admin()
    or (course_id is not null and public.is_faculty_for_course(course_id))
  );

drop policy if exists offline_results_staff_read on public.offline_exam_results;
create policy offline_results_staff_read on public.offline_exam_results
  for select to authenticated
  using (
    public.is_admin()
    or public.offline_exam_manageable(exam_id)
  );

-- The staff result-entry UI lists exam rows through the exams query; the
-- student roster is fetched through course_enrollments, whose existing
-- policies already scope faculty to their own courses.
