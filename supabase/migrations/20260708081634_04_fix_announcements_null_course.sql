
/*
# Fix announcements RLS for null course_id

The faculty_can_access_course function call in the announcements SELECT policy
passed a crafted UUID for null course_id which is incorrect.
Simplify the policy to handle null course_id safely.
*/

DROP POLICY IF EXISTS "announcements_select" ON announcements;
CREATE POLICY "announcements_select" ON announcements FOR SELECT
  TO authenticated
  USING (
    is_global = true
    OR is_admin()
    OR (
      course_id IS NOT NULL AND
      EXISTS (
        SELECT 1 FROM course_enrollments
        WHERE course_id = announcements.course_id
          AND student_id = auth.uid()
      )
    )
    OR (
      course_id IS NOT NULL AND
      faculty_can_access_course(course_id)
    )
  );

DROP POLICY IF EXISTS "announcements_insert" ON announcements;
CREATE POLICY "announcements_insert" ON announcements FOR INSERT
  TO authenticated
  WITH CHECK (
    is_admin()
    OR (
      author_id = auth.uid()
      AND is_faculty()
      AND (course_id IS NULL OR faculty_can_access_course(course_id))
    )
  );

DROP POLICY IF EXISTS "announcements_update" ON announcements;
CREATE POLICY "announcements_update" ON announcements FOR UPDATE
  TO authenticated
  USING (author_id = auth.uid() OR is_admin())
  WITH CHECK (author_id = auth.uid() OR is_admin());

DROP POLICY IF EXISTS "announcements_delete" ON announcements;
CREATE POLICY "announcements_delete" ON announcements FOR DELETE
  TO authenticated
  USING (author_id = auth.uid() OR is_admin());

-- Also fix: xp_transactions INSERT needs to allow the trigger-level insert
-- when awarding XP from lesson completion (profile.xp_points update is direct,
-- but the transaction log insert needs to work)
DROP POLICY IF EXISTS "xp_transactions_insert" ON xp_transactions;
CREATE POLICY "xp_transactions_insert" ON xp_transactions FOR INSERT
  TO authenticated
  WITH CHECK (student_id = auth.uid() OR is_admin());

-- Fix lesson_progress to use auth.uid() for student_id by default
-- This ensures the INSERT policy WITH CHECK works even when student_id is explicit
DROP POLICY IF EXISTS "lesson_progress_insert" ON lesson_progress;
CREATE POLICY "lesson_progress_insert" ON lesson_progress FOR INSERT
  TO authenticated
  WITH CHECK (student_id = auth.uid());

-- Fix course_enrollments update (for progress update)
DROP POLICY IF EXISTS "enrollments_update" ON course_enrollments;
CREATE POLICY "enrollments_update" ON course_enrollments FOR UPDATE
  TO authenticated
  USING (student_id = auth.uid() OR is_admin() OR EXISTS (
    SELECT 1 FROM course_faculty WHERE course_id = course_enrollments.course_id AND faculty_id = auth.uid()
  ))
  WITH CHECK (student_id = auth.uid() OR is_admin() OR EXISTS (
    SELECT 1 FROM course_faculty WHERE course_id = course_enrollments.course_id AND faculty_id = auth.uid()
  ));
