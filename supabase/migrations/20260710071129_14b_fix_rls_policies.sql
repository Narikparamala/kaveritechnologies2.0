/*
# RLS Policy Fixes — Part 2

Fixes RLS for courses, course_faculty, live_sessions, session_attendance,
assignment_test_cases, and assignment_submissions.
*/

-- ============================================================
-- 1. courses INSERT — allow faculty to create draft courses
-- ============================================================
DROP POLICY IF EXISTS "courses_insert" ON courses;
CREATE POLICY "courses_insert" ON courses FOR INSERT
  TO authenticated WITH CHECK (
    is_admin()
    OR (is_faculty() AND created_by = auth.uid() AND is_published = false)
  );

-- ============================================================
-- 2. course_faculty INSERT — allow faculty to self-assign to courses they created
-- ============================================================
DROP POLICY IF EXISTS "course_faculty_insert" ON course_faculty;
CREATE POLICY "course_faculty_insert" ON course_faculty FOR INSERT
  TO authenticated WITH CHECK (
    is_admin()
    OR EXISTS (
      SELECT 1 FROM courses
      WHERE courses.id = course_faculty.course_id
      AND courses.created_by = auth.uid()
    )
  );

-- ============================================================
-- 3. live_sessions RLS fixes
-- ============================================================
DROP POLICY IF EXISTS "live_sessions_insert" ON live_sessions;
CREATE POLICY "live_sessions_insert" ON live_sessions FOR INSERT
  TO authenticated WITH CHECK (
    is_admin()
    OR faculty_can_access_course(course_id)
    OR (created_by = auth.uid() AND is_faculty())
  );

DROP POLICY IF EXISTS "live_sessions_update" ON live_sessions;
CREATE POLICY "live_sessions_update" ON live_sessions FOR UPDATE
  TO authenticated USING (
    is_admin()
    OR faculty_can_manage_session(id)
    OR (created_by = auth.uid())
  ) WITH CHECK (
    is_admin()
    OR faculty_can_manage_session(id)
    OR (created_by = auth.uid())
  );

DROP POLICY IF EXISTS "live_sessions_delete" ON live_sessions;
CREATE POLICY "live_sessions_delete" ON live_sessions FOR DELETE
  TO authenticated USING (
    is_admin()
    OR faculty_can_manage_session(id)
  );

-- ============================================================
-- 4. session_attendance RLS fixes
-- ============================================================
DROP POLICY IF EXISTS "session_attendance_insert" ON session_attendance;
CREATE POLICY "session_attendance_insert" ON session_attendance FOR INSERT
  TO authenticated WITH CHECK (
    is_admin()
    OR faculty_can_manage_session(session_id)
    OR student_id = auth.uid()
  );

DROP POLICY IF EXISTS "session_attendance_update" ON session_attendance;
CREATE POLICY "session_attendance_update" ON session_attendance FOR UPDATE
  TO authenticated USING (
    is_admin()
    OR faculty_can_manage_session(session_id)
  ) WITH CHECK (
    is_admin()
    OR faculty_can_manage_session(session_id)
  );

-- ============================================================
-- 5. assignment_test_cases RLS
-- ============================================================
DROP POLICY IF EXISTS "assignment_test_cases_select" ON assignment_test_cases;
CREATE POLICY "assignment_test_cases_select" ON assignment_test_cases FOR SELECT
  TO authenticated USING (
    is_admin()
    OR (
      is_hidden = false
      AND EXISTS (
        SELECT 1 FROM assignments a
        WHERE a.id = assignment_test_cases.assignment_id
        AND a.is_published = true
        AND EXISTS (
          SELECT 1 FROM course_enrollments ce
          WHERE ce.course_id = a.course_id
          AND ce.student_id = auth.uid()
          AND (ce.access_status = 'active' OR ce.access_status IS NULL)
        )
      )
    )
    OR EXISTS (
      SELECT 1 FROM assignments a
      JOIN course_faculty cf ON cf.course_id = a.course_id
      WHERE a.id = assignment_test_cases.assignment_id
      AND cf.faculty_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "assignment_test_cases_insert" ON assignment_test_cases;
CREATE POLICY "assignment_test_cases_insert" ON assignment_test_cases FOR INSERT
  TO authenticated WITH CHECK (
    is_admin()
    OR EXISTS (
      SELECT 1 FROM assignments a
      JOIN course_faculty cf ON cf.course_id = a.course_id
      WHERE a.id = assignment_test_cases.assignment_id
      AND cf.faculty_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "assignment_test_cases_update" ON assignment_test_cases;
CREATE POLICY "assignment_test_cases_update" ON assignment_test_cases FOR UPDATE
  TO authenticated USING (
    is_admin()
    OR EXISTS (
      SELECT 1 FROM assignments a
      JOIN course_faculty cf ON cf.course_id = a.course_id
      WHERE a.id = assignment_test_cases.assignment_id
      AND cf.faculty_id = auth.uid()
    )
  ) WITH CHECK (
    is_admin()
    OR EXISTS (
      SELECT 1 FROM assignments a
      JOIN course_faculty cf ON cf.course_id = a.course_id
      WHERE a.id = assignment_test_cases.assignment_id
      AND cf.faculty_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "assignment_test_cases_delete" ON assignment_test_cases;
CREATE POLICY "assignment_test_cases_delete" ON assignment_test_cases FOR DELETE
  TO authenticated USING (
    is_admin()
    OR EXISTS (
      SELECT 1 FROM assignments a
      JOIN course_faculty cf ON cf.course_id = a.course_id
      WHERE a.id = assignment_test_cases.assignment_id
      AND cf.faculty_id = auth.uid()
    )
  );

-- ============================================================
-- 6. Tighten assignment_submissions — prevent score/feedback tampering by students
-- ============================================================
DROP POLICY IF EXISTS "submissions_insert" ON assignment_submissions;
CREATE POLICY "submissions_insert" ON assignment_submissions FOR INSERT
  TO authenticated WITH CHECK (
    student_id = auth.uid()
    OR is_admin()
  );

DROP POLICY IF EXISTS "submissions_update" ON assignment_submissions;
CREATE POLICY "submissions_update" ON assignment_submissions FOR UPDATE
  TO authenticated USING (
    student_id = auth.uid()
    OR is_admin()
    OR EXISTS (
      SELECT 1 FROM assignments a
      JOIN course_faculty cf ON cf.course_id = a.course_id
      WHERE a.id = assignment_submissions.assignment_id
      AND cf.faculty_id = auth.uid()
    )
  ) WITH CHECK (
    student_id = auth.uid()
    OR is_admin()
    OR EXISTS (
      SELECT 1 FROM assignments a
      JOIN course_faculty cf ON cf.course_id = a.course_id
      WHERE a.id = assignment_submissions.assignment_id
      AND cf.faculty_id = auth.uid()
    )
  );

-- ============================================================
-- 7. course_enrollments — admin can manage, students read own, faculty read assigned
-- ============================================================
DROP POLICY IF EXISTS "enrollments_insert" ON course_enrollments;
CREATE POLICY "enrollments_insert" ON course_enrollments FOR INSERT
  TO authenticated WITH CHECK (
    student_id = auth.uid()
    OR is_admin()
  );

DROP POLICY IF EXISTS "enrollments_update" ON course_enrollments;
CREATE POLICY "enrollments_update" ON course_enrollments FOR UPDATE
  TO authenticated USING (
    student_id = auth.uid()
    OR is_admin()
    OR EXISTS (
      SELECT 1 FROM course_faculty cf
      WHERE cf.course_id = course_enrollments.course_id
      AND cf.faculty_id = auth.uid()
    )
  ) WITH CHECK (
    student_id = auth.uid()
    OR is_admin()
  );

DROP POLICY IF EXISTS "enrollments_delete" ON course_enrollments;
CREATE POLICY "enrollments_delete" ON course_enrollments FOR DELETE
  TO authenticated USING (
    student_id = auth.uid()
    OR is_admin()
  );
