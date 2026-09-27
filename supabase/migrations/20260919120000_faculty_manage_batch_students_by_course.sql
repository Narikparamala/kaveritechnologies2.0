-- Faculty batch management scoped to courses they teach.
--
-- Before: faculty could only manage batch_students of batches they were
-- explicitly assigned to via batch_faculty. Most batches have no
-- batch_faculty rows ("0 faculty" in the UI), so effectively nobody could
-- add students to them. Admin already has full CRUD via
-- admin_all_batch_students; the gap was faculty power.
--
-- Scope: faculty may manage batches whose course is assigned to them via
-- course_faculty — the same scope the existing faculty_read_batch_students
-- SELECT policy already uses for batch_students. Consistent and least-
-- privilege: faculty gain add/update/remove only inside their own courses.

-- INSERT: mirror the SELECT scope (course_faculty), plus keep the existing
-- batch_faculty path. Admin path already covered by admin_all_* (ALL).
DROP POLICY IF EXISTS faculty_manage_batch_students ON public.batch_students;
CREATE POLICY faculty_manage_batch_students
  ON public.batch_students
  FOR INSERT
  TO authenticated
  WITH CHECK (
    is_faculty()
    AND (
      EXISTS (
        SELECT 1
        FROM batches b
        JOIN course_faculty cf ON cf.course_id = b.course_id
        WHERE b.id = batch_students.batch_id
          AND cf.faculty_id = auth.uid()
      )
      OR EXISTS (
        SELECT 1
        FROM batch_faculty bf
        WHERE bf.batch_id = batch_students.batch_id
          AND bf.faculty_id = auth.uid()
      )
    )
  );

-- UPDATE/DELETE: same scope, so faculty can also fix mistakes (set a row
-- back to active, remove a wrong student) inside their own courses.
DROP POLICY IF EXISTS faculty_update_batch_students ON public.batch_students;
CREATE POLICY faculty_update_batch_students
  ON public.batch_students
  FOR UPDATE
  TO authenticated
  USING (
    is_faculty()
    AND (
      EXISTS (
        SELECT 1
        FROM batches b
        JOIN course_faculty cf ON cf.course_id = b.course_id
        WHERE b.id = batch_students.batch_id
          AND cf.faculty_id = auth.uid()
      )
      OR EXISTS (
        SELECT 1
        FROM batch_faculty bf
        WHERE bf.batch_id = batch_students.batch_id
          AND bf.faculty_id = auth.uid()
      )
    )
  )
  WITH CHECK (
    is_faculty()
    AND (
      EXISTS (
        SELECT 1
        FROM batches b
        JOIN course_faculty cf ON cf.course_id = b.course_id
        WHERE b.id = batch_students.batch_id
          AND cf.faculty_id = auth.uid()
      )
      OR EXISTS (
        SELECT 1
        FROM batch_faculty bf
        WHERE bf.batch_id = batch_students.batch_id
          AND bf.faculty_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS faculty_delete_batch_students ON public.batch_students;
CREATE POLICY faculty_delete_batch_students
  ON public.batch_students
  FOR DELETE
  TO authenticated
  USING (
    is_faculty()
    AND (
      EXISTS (
        SELECT 1
        FROM batches b
        JOIN course_faculty cf ON cf.course_id = b.course_id
        WHERE b.id = batch_students.batch_id
          AND cf.faculty_id = auth.uid()
      )
      OR EXISTS (
        SELECT 1
        FROM batch_faculty bf
        WHERE bf.batch_id = batch_students.batch_id
          AND bf.faculty_id = auth.uid()
      )
    )
  );

-- Faculty need to READ batches of courses they teach to pick them in the
-- "Add to Batch" dropdown (previously only batch_faculty-assigned batches
-- were visible).
DROP POLICY IF EXISTS faculty_read_assigned_batches ON public.batches;
CREATE POLICY faculty_read_assigned_batches
  ON public.batches
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM course_faculty cf
      WHERE cf.course_id = batches.course_id
        AND cf.faculty_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1
      FROM batch_faculty bf
      WHERE bf.batch_id = batches.id
        AND bf.faculty_id = auth.uid()
    )
  );
