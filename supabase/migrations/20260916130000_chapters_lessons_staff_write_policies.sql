-- chapters and lessons had SELECT-only RLS: the course builder's
-- Add/Edit/Delete Chapter and Add/Edit/Delete Lesson actions all failed with
-- 42501 (RLS violation) for faculty in production. This mirrors the role
-- model of the existing *_select policies: admins and faculty assigned to
-- the course (faculty_can_access_course) may manage curriculum. Students
-- keep no write access.

-- ============ chapters ============
CREATE POLICY chapters_staff_insert
  ON public.chapters
  FOR INSERT
  TO authenticated
  WITH CHECK (
    is_admin() OR faculty_can_access_course(course_id)
  );

CREATE POLICY chapters_staff_update
  ON public.chapters
  FOR UPDATE
  TO authenticated
  USING (
    is_admin() OR faculty_can_access_course(course_id)
  )
  WITH CHECK (
    is_admin() OR faculty_can_access_course(course_id)
  );

CREATE POLICY chapters_staff_delete
  ON public.chapters
  FOR DELETE
  TO authenticated
  USING (
    is_admin() OR faculty_can_access_course(course_id)
  );

-- ============ lessons ============
CREATE POLICY lessons_staff_insert
  ON public.lessons
  FOR INSERT
  TO authenticated
  WITH CHECK (
    is_admin() OR faculty_can_access_course(course_id)
  );

CREATE POLICY lessons_staff_update
  ON public.lessons
  FOR UPDATE
  TO authenticated
  USING (
    is_admin() OR faculty_can_access_course(course_id)
  )
  WITH CHECK (
    is_admin() OR faculty_can_access_course(course_id)
  );

CREATE POLICY lessons_staff_delete
  ON public.lessons
  FOR DELETE
  TO authenticated
  USING (
    is_admin() OR faculty_can_access_course(course_id)
  );
