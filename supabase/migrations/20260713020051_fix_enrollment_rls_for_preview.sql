/*
# Fix course_enrollments RLS for anon access

Adds INSERT, SELECT, and UPDATE policies for the anon role on course_enrollments
so that preview mode (which uses the anon key without an authenticated session)
can enroll in courses. Authenticated-user policies remain unchanged.
*/

-- Allow anon to enroll (preview mode)
DROP POLICY IF EXISTS "anon_insert_enrollments" ON course_enrollments;
CREATE POLICY "anon_insert_enrollments" ON course_enrollments
  FOR INSERT TO anon
  WITH CHECK (true);

-- Allow anon to read enrollments
DROP POLICY IF EXISTS "anon_select_enrollments" ON course_enrollments;
CREATE POLICY "anon_select_enrollments" ON course_enrollments
  FOR SELECT TO anon
  USING (true);

-- Allow anon to update enrollments (progress tracking)
DROP POLICY IF EXISTS "anon_update_enrollments" ON course_enrollments;
CREATE POLICY "anon_update_enrollments" ON course_enrollments
  FOR UPDATE TO anon
  USING (true) WITH CHECK (true);

-- Allow anon to delete enrollments (unenroll)
DROP POLICY IF EXISTS "anon_delete_enrollments" ON course_enrollments;
CREATE POLICY "anon_delete_enrollments" ON course_enrollments
  FOR DELETE TO anon
  USING (true);
