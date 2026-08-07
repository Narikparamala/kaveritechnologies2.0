/*
# Enhanced Enrollment Management & Offline Exams

1. Modified Tables
   - `course_enrollments`: added `expiry_date` (timestamptz, nullable), `enrollment_reason` (text, nullable)
   
2. New Tables
   - `offline_exams` — faculty-created offline exams linked to a course
     - id, course_id, title, description, exam_date, duration_minutes, max_marks, venue, status, created_by, created_at, updated_at
   - `offline_exam_students` — students assigned to an offline exam
     - id, exam_id, student_id, marks_obtained, scanned_sheet_url, attendance_status, graded_by, graded_at, created_at, updated_at
   
3. Security
   - RLS enabled on both new tables
   - Policies: admin full access, faculty access for their courses, students see own records
   
4. Notes
   - expiry_date on course_enrollments allows time-limited access grants
   - enrollment_reason tracks scholarship, campus drive, internal training, etc.
   - offline_exam_students.attendance_status tracks present/absent for offline exams
*/

-- Add columns to course_enrollments
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='course_enrollments' AND column_name='expiry_date') THEN
    ALTER TABLE course_enrollments ADD COLUMN expiry_date timestamptz DEFAULT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='course_enrollments' AND column_name='enrollment_reason') THEN
    ALTER TABLE course_enrollments ADD COLUMN enrollment_reason text DEFAULT NULL;
  END IF;
END $$;

-- Offline Exams table
CREATE TABLE IF NOT EXISTS offline_exams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  exam_date timestamptz NOT NULL,
  duration_minutes integer NOT NULL DEFAULT 60,
  max_marks numeric NOT NULL DEFAULT 100,
  venue text,
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','ongoing','completed','cancelled')),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE offline_exams ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_select_offline_exams" ON offline_exams;
CREATE POLICY "admin_select_offline_exams" ON offline_exams FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'super_admin')
    OR EXISTS (SELECT 1 FROM course_faculty WHERE course_faculty.course_id = offline_exams.course_id AND course_faculty.faculty_id = auth.uid())
    OR EXISTS (SELECT 1 FROM course_enrollments WHERE course_enrollments.course_id = offline_exams.course_id AND course_enrollments.student_id = auth.uid() AND course_enrollments.access_status = 'active')
  );

DROP POLICY IF EXISTS "admin_insert_offline_exams" ON offline_exams;
CREATE POLICY "admin_insert_offline_exams" ON offline_exams FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'super_admin')
    OR EXISTS (SELECT 1 FROM course_faculty WHERE course_faculty.course_id = offline_exams.course_id AND course_faculty.faculty_id = auth.uid())
  );

DROP POLICY IF EXISTS "admin_update_offline_exams" ON offline_exams;
CREATE POLICY "admin_update_offline_exams" ON offline_exams FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'super_admin')
    OR EXISTS (SELECT 1 FROM course_faculty WHERE course_faculty.course_id = offline_exams.course_id AND course_faculty.faculty_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'super_admin')
    OR EXISTS (SELECT 1 FROM course_faculty WHERE course_faculty.course_id = offline_exams.course_id AND course_faculty.faculty_id = auth.uid())
  );

DROP POLICY IF EXISTS "admin_delete_offline_exams" ON offline_exams;
CREATE POLICY "admin_delete_offline_exams" ON offline_exams FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'super_admin')
    OR EXISTS (SELECT 1 FROM course_faculty WHERE course_faculty.course_id = offline_exams.course_id AND course_faculty.faculty_id = auth.uid())
  );

-- Offline Exam Students table
CREATE TABLE IF NOT EXISTS offline_exam_students (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id uuid NOT NULL REFERENCES offline_exams(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  marks_obtained numeric,
  scanned_sheet_url text,
  attendance_status text NOT NULL DEFAULT 'registered' CHECK (attendance_status IN ('registered','present','absent')),
  graded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  graded_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(exam_id, student_id)
);

ALTER TABLE offline_exam_students ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_offline_exam_students" ON offline_exam_students;
CREATE POLICY "select_offline_exam_students" ON offline_exam_students FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'super_admin')
    OR student_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM offline_exams oe
      JOIN course_faculty cf ON cf.course_id = oe.course_id
      WHERE oe.id = offline_exam_students.exam_id AND cf.faculty_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "insert_offline_exam_students" ON offline_exam_students;
CREATE POLICY "insert_offline_exam_students" ON offline_exam_students FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'super_admin')
    OR EXISTS (
      SELECT 1 FROM offline_exams oe
      JOIN course_faculty cf ON cf.course_id = oe.course_id
      WHERE oe.id = offline_exam_students.exam_id AND cf.faculty_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "update_offline_exam_students" ON offline_exam_students;
CREATE POLICY "update_offline_exam_students" ON offline_exam_students FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'super_admin')
    OR EXISTS (
      SELECT 1 FROM offline_exams oe
      JOIN course_faculty cf ON cf.course_id = oe.course_id
      WHERE oe.id = offline_exam_students.exam_id AND cf.faculty_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'super_admin')
    OR EXISTS (
      SELECT 1 FROM offline_exams oe
      JOIN course_faculty cf ON cf.course_id = oe.course_id
      WHERE oe.id = offline_exam_students.exam_id AND cf.faculty_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "delete_offline_exam_students" ON offline_exam_students;
CREATE POLICY "delete_offline_exam_students" ON offline_exam_students FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'super_admin')
    OR EXISTS (
      SELECT 1 FROM offline_exams oe
      JOIN course_faculty cf ON cf.course_id = oe.course_id
      WHERE oe.id = offline_exam_students.exam_id AND cf.faculty_id = auth.uid()
    )
  );

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_offline_exams_course_id ON offline_exams(course_id);
CREATE INDEX IF NOT EXISTS idx_offline_exams_status ON offline_exams(status);
CREATE INDEX IF NOT EXISTS idx_offline_exam_students_exam_id ON offline_exam_students(exam_id);
CREATE INDEX IF NOT EXISTS idx_offline_exam_students_student_id ON offline_exam_students(student_id);
CREATE INDEX IF NOT EXISTS idx_course_enrollments_expiry ON course_enrollments(expiry_date) WHERE expiry_date IS NOT NULL;
