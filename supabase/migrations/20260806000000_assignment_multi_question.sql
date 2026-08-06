/*
  # Multi-question Assignment Support
  
  1. New Tables
    - `assignment_questions`
      - `id` (uuid, primary key)
      - `assignment_id` (uuid, references assignments)
      - `title` (text)
      - `problem_statement` (text)
      - `instructions` (text)
      - `input_format` (text)
      - `output_format` (text)
      - `constraints_text` (text)
      - `starter_code` (text)
      - `hints` (jsonb)
      - `question_type` (text) - 'coding', 'short_answer', 'long_answer'
      - `difficulty` (text)
      - `marks` (numeric)
      - `order_index` (integer)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)
    
    - `assignment_question_submissions`
      - `id` (uuid, primary key)
      - `submission_id` (uuid, references assignment_submissions)
      - `question_id` (uuid, references assignment_questions)
      - `submitted_code` (text)
      - `submitted_text` (text)
      - `execution_output` (text)
      - `passed_test_cases` (integer)
      - `total_test_cases` (integer)
      - `marks_awarded` (numeric)
      - `feedback` (text)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Alterations
    - Add `assignment_type` to `assignments`
    - Update `assignment_test_cases` to reference `question_id`
    - Add `status` to `assignments` (draft, published, closed)
    - Add `start_date` to `assignments`
    - Add `allow_late_submission` to `assignments`

  3. Security
    - Enable RLS on new tables
    - Add policies for students and faculty
*/

-- 1. Extend assignments table
ALTER TABLE assignments 
ADD COLUMN IF NOT EXISTS assignment_type text DEFAULT 'coding',
ADD COLUMN IF NOT EXISTS status text DEFAULT 'draft',
ADD COLUMN IF NOT EXISTS start_date timestamptz,
ADD COLUMN IF NOT EXISTS allow_late_submission boolean DEFAULT false;

-- 2. Create assignment_questions table
CREATE TABLE IF NOT EXISTS assignment_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id uuid NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  title text NOT NULL,
  problem_statement text,
  instructions text,
  input_format text,
  output_format text,
  constraints_text text,
  starter_code text,
  hints jsonb NOT NULL DEFAULT '[]'::jsonb,
  question_type text NOT NULL DEFAULT 'coding',
  difficulty text DEFAULT 'medium',
  marks numeric NOT NULL DEFAULT 0,
  order_index integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 3. Update assignment_test_cases to reference questions
ALTER TABLE assignment_test_cases 
ADD COLUMN IF NOT EXISTS question_id uuid REFERENCES assignment_questions(id) ON DELETE CASCADE;

-- 4. Create assignment_question_submissions table
CREATE TABLE IF NOT EXISTS assignment_question_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL REFERENCES assignment_submissions(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES assignment_questions(id) ON DELETE CASCADE,
  submitted_code text,
  submitted_text text,
  execution_output text,
  passed_test_cases integer DEFAULT 0,
  total_test_cases integer DEFAULT 0,
  marks_awarded numeric,
  feedback text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(submission_id, question_id)
);

-- 5. Enable RLS
ALTER TABLE assignment_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE assignment_question_submissions ENABLE ROW LEVEL SECURITY;

-- 6. RLS Policies

-- Helper function to check if user is faculty for a course
CREATE OR REPLACE FUNCTION is_faculty_for_course(course_id uuid)
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM course_faculty
    WHERE course_faculty.course_id = $1
    AND faculty_id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Helper function to check if user is enrolled in a course
CREATE OR REPLACE FUNCTION is_student_enrolled(course_id uuid)
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM course_enrollments
    WHERE course_enrollments.course_id = $1
    AND student_id = auth.uid()
    AND access_status = 'active'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- assignment_questions policies
CREATE POLICY "Faculty can manage questions for their assignments"
  ON assignment_questions
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM assignments
      WHERE assignments.id = assignment_questions.assignment_id
      AND is_faculty_for_course(assignments.course_id)
    )
    OR (SELECT role FROM profiles WHERE id = auth.uid()) = 'super_admin'
  );

CREATE POLICY "Students can read questions for enrolled assignments"
  ON assignment_questions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM assignments
      WHERE assignments.id = assignment_questions.assignment_id
      AND is_student_enrolled(assignments.course_id)
      AND assignments.is_published = true
    )
  );

-- assignment_question_submissions policies
CREATE POLICY "Students can manage their own question submissions"
  ON assignment_question_submissions
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM assignment_submissions
      WHERE assignment_submissions.id = assignment_question_submissions.submission_id
      AND assignment_submissions.student_id = auth.uid()
    )
  );

CREATE POLICY "Faculty can read and grade question submissions"
  ON assignment_question_submissions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM assignment_submissions
      JOIN assignments ON assignments.id = assignment_submissions.assignment_id
      WHERE assignment_submissions.id = assignment_question_submissions.submission_id
      AND (is_faculty_for_course(assignments.course_id) OR (SELECT role FROM profiles WHERE id = auth.uid()) = 'super_admin')
    )
  );

CREATE POLICY "Faculty can update marks and feedback"
  ON assignment_question_submissions
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM assignment_submissions
      JOIN assignments ON assignments.id = assignment_submissions.assignment_id
      WHERE assignment_submissions.id = assignment_question_submissions.submission_id
      AND (is_faculty_for_course(assignments.course_id) OR (SELECT role FROM profiles WHERE id = auth.uid()) = 'super_admin')
    )
  );

-- Update assignment_test_cases policies to include question-based access
DROP POLICY IF EXISTS "Faculty can manage test cases" ON assignment_test_cases;
CREATE POLICY "Faculty can manage test cases"
  ON assignment_test_cases
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM assignments
      WHERE assignments.id = assignment_test_cases.assignment_id
      AND is_faculty_for_course(assignments.course_id)
    )
    OR (SELECT role FROM profiles WHERE id = auth.uid()) = 'super_admin'
  );

DROP POLICY IF EXISTS "Students can read visible test cases" ON assignment_test_cases;
CREATE POLICY "Students can read visible test cases"
  ON assignment_test_cases
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM assignments
      WHERE assignments.id = assignment_test_cases.assignment_id
      AND is_student_enrolled(assignments.course_id)
      AND assignments.is_published = true
    )
    AND is_hidden = false
  );
