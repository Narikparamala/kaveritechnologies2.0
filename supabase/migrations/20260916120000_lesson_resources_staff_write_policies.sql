-- lesson_resources had only a SELECT policy, so faculty got 403 on
-- INSERT/UPDATE/DELETE (the Materials "Add" button silently failed).
-- Add staff write policies mirroring the SELECT policy's faculty branch
-- (faculty assigned to the lesson's course via course_faculty) plus admins.

CREATE POLICY lesson_resources_faculty_insert
  ON public.lesson_resources
  FOR INSERT
  TO authenticated
  WITH CHECK (
    is_admin()
    OR EXISTS (
      SELECT 1
      FROM lessons l
      JOIN course_faculty cf ON cf.course_id = l.course_id
      WHERE l.id = lesson_resources.lesson_id
        AND cf.faculty_id = auth.uid()
    )
  );

CREATE POLICY lesson_resources_faculty_update
  ON public.lesson_resources
  FOR UPDATE
  TO authenticated
  USING (
    is_admin()
    OR EXISTS (
      SELECT 1
      FROM lessons l
      JOIN course_faculty cf ON cf.course_id = l.course_id
      WHERE l.id = lesson_resources.lesson_id
        AND cf.faculty_id = auth.uid()
    )
  )
  WITH CHECK (
    is_admin()
    OR EXISTS (
      SELECT 1
      FROM lessons l
      JOIN course_faculty cf ON cf.course_id = l.course_id
      WHERE l.id = lesson_resources.lesson_id
        AND cf.faculty_id = auth.uid()
    )
  );

CREATE POLICY lesson_resources_faculty_delete
  ON public.lesson_resources
  FOR DELETE
  TO authenticated
  USING (
    is_admin()
    OR EXISTS (
      SELECT 1
      FROM lessons l
      JOIN course_faculty cf ON cf.course_id = l.course_id
      WHERE l.id = lesson_resources.lesson_id
        AND cf.faculty_id = auth.uid()
    )
  );
