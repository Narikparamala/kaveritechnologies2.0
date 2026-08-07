/*
# Batch Management Module

## Overview
Creates a complete batch management system for the training academy.
Batches group students with assigned faculty, course curricula, schedules, and announcements.

## New Tables

### `batches`
- `id` (uuid, PK) - unique batch identifier
- `name` (text) - batch display name (e.g., "Python Batch 2026-July")
- `description` (text) - optional batch description
- `course_id` (uuid, FK→courses) - the course this batch follows
- `start_date` (date) - batch start date
- `end_date` (date) - batch end date
- `max_students` (int) - maximum capacity
- `status` (text) - active / completed / archived / upcoming
- `created_by` (uuid, FK→profiles) - admin who created it
- `created_at` / `updated_at` (timestamptz)

### `batch_faculty`
- `id` (uuid, PK)
- `batch_id` (uuid, FK→batches)
- `faculty_id` (uuid, FK→profiles)
- `role` (text) - lead / assistant / guest
- `assigned_at` (timestamptz)
- Unique constraint on (batch_id, faculty_id)

### `batch_students`
- `id` (uuid, PK)
- `batch_id` (uuid, FK→batches)
- `student_id` (uuid, FK→profiles)
- `enrolled_at` (timestamptz)
- `status` (text) - active / removed / completed / transferred
- Unique constraint on (batch_id, student_id)

### `batch_schedules`
- `id` (uuid, PK)
- `batch_id` (uuid, FK→batches)
- `day_of_week` (int) - 0=Sun..6=Sat
- `start_time` (time) - class start
- `end_time` (time) - class end
- `topic` (text) - optional topic for the slot
- `is_active` (boolean)

### `batch_announcements`
- `id` (uuid, PK)
- `batch_id` (uuid, FK→batches)
- `title` (text)
- `content` (text)
- `author_id` (uuid, FK→profiles)
- `is_pinned` (boolean)
- `created_at` (timestamptz)

## Security
- RLS enabled on all tables.
- Admin (super_admin) has full CRUD on all tables.
- Faculty can read batches they are assigned to, manage students in those batches.
- Students can read their own batch info and announcements.
*/

-- Batches table
CREATE TABLE IF NOT EXISTS batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  course_id uuid REFERENCES courses(id) ON DELETE SET NULL,
  start_date date,
  end_date date,
  max_students int DEFAULT 30,
  status text NOT NULL DEFAULT 'upcoming' CHECK (status IN ('upcoming', 'active', 'completed', 'archived')),
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE batches ENABLE ROW LEVEL SECURITY;

-- Batch faculty junction
CREATE TABLE IF NOT EXISTS batch_faculty (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
  faculty_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'lead' CHECK (role IN ('lead', 'assistant', 'guest')),
  assigned_at timestamptz DEFAULT now(),
  UNIQUE(batch_id, faculty_id)
);

ALTER TABLE batch_faculty ENABLE ROW LEVEL SECURITY;

-- Batch students junction
CREATE TABLE IF NOT EXISTS batch_students (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  enrolled_at timestamptz DEFAULT now(),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'removed', 'completed', 'transferred')),
  UNIQUE(batch_id, student_id)
);

ALTER TABLE batch_students ENABLE ROW LEVEL SECURITY;

-- Batch schedules
CREATE TABLE IF NOT EXISTS batch_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
  day_of_week int NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time time NOT NULL,
  end_time time NOT NULL,
  topic text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE batch_schedules ENABLE ROW LEVEL SECURITY;

-- Batch announcements
CREATE TABLE IF NOT EXISTS batch_announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
  title text NOT NULL,
  content text,
  author_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  is_pinned boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE batch_announcements ENABLE ROW LEVEL SECURITY;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_batches_course ON batches(course_id);
CREATE INDEX IF NOT EXISTS idx_batches_status ON batches(status);
CREATE INDEX IF NOT EXISTS idx_batch_faculty_batch ON batch_faculty(batch_id);
CREATE INDEX IF NOT EXISTS idx_batch_faculty_faculty ON batch_faculty(faculty_id);
CREATE INDEX IF NOT EXISTS idx_batch_students_batch ON batch_students(batch_id);
CREATE INDEX IF NOT EXISTS idx_batch_students_student ON batch_students(student_id);
CREATE INDEX IF NOT EXISTS idx_batch_schedules_batch ON batch_schedules(batch_id);
CREATE INDEX IF NOT EXISTS idx_batch_announcements_batch ON batch_announcements(batch_id);

-- ===== RLS POLICIES =====

-- Helper: check if user is admin
-- We use profiles.role = 'super_admin'

-- BATCHES policies
DROP POLICY IF EXISTS "admin_all_batches" ON batches;
CREATE POLICY "admin_all_batches" ON batches FOR ALL
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'));

DROP POLICY IF EXISTS "faculty_read_assigned_batches" ON batches;
CREATE POLICY "faculty_read_assigned_batches" ON batches FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM batch_faculty WHERE batch_faculty.batch_id = batches.id AND batch_faculty.faculty_id = auth.uid()));

DROP POLICY IF EXISTS "student_read_own_batch" ON batches;
CREATE POLICY "student_read_own_batch" ON batches FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM batch_students WHERE batch_students.batch_id = batches.id AND batch_students.student_id = auth.uid() AND batch_students.status = 'active'));

-- BATCH_FACULTY policies
DROP POLICY IF EXISTS "admin_all_batch_faculty" ON batch_faculty;
CREATE POLICY "admin_all_batch_faculty" ON batch_faculty FOR ALL
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'));

DROP POLICY IF EXISTS "faculty_read_batch_faculty" ON batch_faculty;
CREATE POLICY "faculty_read_batch_faculty" ON batch_faculty FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'faculty'));

-- BATCH_STUDENTS policies
DROP POLICY IF EXISTS "admin_all_batch_students" ON batch_students;
CREATE POLICY "admin_all_batch_students" ON batch_students FOR ALL
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'));

DROP POLICY IF EXISTS "faculty_read_batch_students" ON batch_students;
CREATE POLICY "faculty_read_batch_students" ON batch_students FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM batch_faculty
    WHERE batch_faculty.batch_id = batch_students.batch_id
    AND batch_faculty.faculty_id = auth.uid()
  ));

DROP POLICY IF EXISTS "faculty_manage_batch_students" ON batch_students;
CREATE POLICY "faculty_manage_batch_students" ON batch_students FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM batch_faculty
    WHERE batch_faculty.batch_id = batch_students.batch_id
    AND batch_faculty.faculty_id = auth.uid()
  ));

DROP POLICY IF EXISTS "faculty_update_batch_students" ON batch_students;
CREATE POLICY "faculty_update_batch_students" ON batch_students FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM batch_faculty
    WHERE batch_faculty.batch_id = batch_students.batch_id
    AND batch_faculty.faculty_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM batch_faculty
    WHERE batch_faculty.batch_id = batch_students.batch_id
    AND batch_faculty.faculty_id = auth.uid()
  ));

DROP POLICY IF EXISTS "student_read_own_batch_students" ON batch_students;
CREATE POLICY "student_read_own_batch_students" ON batch_students FOR SELECT
  TO authenticated
  USING (student_id = auth.uid());

-- BATCH_SCHEDULES policies
DROP POLICY IF EXISTS "admin_all_batch_schedules" ON batch_schedules;
CREATE POLICY "admin_all_batch_schedules" ON batch_schedules FOR ALL
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'));

DROP POLICY IF EXISTS "faculty_manage_batch_schedules" ON batch_schedules;
CREATE POLICY "faculty_manage_batch_schedules" ON batch_schedules FOR ALL
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM batch_faculty
    WHERE batch_faculty.batch_id = batch_schedules.batch_id
    AND batch_faculty.faculty_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM batch_faculty
    WHERE batch_faculty.batch_id = batch_schedules.batch_id
    AND batch_faculty.faculty_id = auth.uid()
  ));

DROP POLICY IF EXISTS "student_read_batch_schedules" ON batch_schedules;
CREATE POLICY "student_read_batch_schedules" ON batch_schedules FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM batch_students
    WHERE batch_students.batch_id = batch_schedules.batch_id
    AND batch_students.student_id = auth.uid()
    AND batch_students.status = 'active'
  ));

-- BATCH_ANNOUNCEMENTS policies
DROP POLICY IF EXISTS "admin_all_batch_announcements" ON batch_announcements;
CREATE POLICY "admin_all_batch_announcements" ON batch_announcements FOR ALL
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'));

DROP POLICY IF EXISTS "faculty_manage_batch_announcements" ON batch_announcements;
CREATE POLICY "faculty_manage_batch_announcements" ON batch_announcements FOR ALL
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM batch_faculty
    WHERE batch_faculty.batch_id = batch_announcements.batch_id
    AND batch_faculty.faculty_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM batch_faculty
    WHERE batch_faculty.batch_id = batch_announcements.batch_id
    AND batch_faculty.faculty_id = auth.uid()
  ));

DROP POLICY IF EXISTS "student_read_batch_announcements" ON batch_announcements;
CREATE POLICY "student_read_batch_announcements" ON batch_announcements FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM batch_students
    WHERE batch_students.batch_id = batch_announcements.batch_id
    AND batch_students.student_id = auth.uid()
    AND batch_students.status = 'active'
  ));
