/*
# Fix Faculty Course Creation, Live Sessions RLS, Assignment Test Cases, Enrollment Management

## Root Cause of live_sessions RLS Error
courses_insert and course_faculty_insert only allowed is_admin(). Faculty could never create
courses or self-assign. Without course_faculty, faculty_can_access_course() returns false,
and live_sessions INSERT fails.

## This migration (Part 1): Add all new columns and the assignment_test_cases table.
Part 2 will add the RLS policies after columns exist.
*/

-- ============================================================
-- 1. Extend assignments table with coding-assignment fields
-- ============================================================
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='assignments' AND column_name='problem_statement') THEN ALTER TABLE assignments ADD COLUMN problem_statement text; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='assignments' AND column_name='input_format') THEN ALTER TABLE assignments ADD COLUMN input_format text; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='assignments' AND column_name='output_format') THEN ALTER TABLE assignments ADD COLUMN output_format text; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='assignments' AND column_name='constraints_text') THEN ALTER TABLE assignments ADD COLUMN constraints_text text; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='assignments' AND column_name='starter_code') THEN ALTER TABLE assignments ADD COLUMN starter_code text; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='assignments' AND column_name='hints') THEN ALTER TABLE assignments ADD COLUMN hints jsonb NOT NULL DEFAULT '[]'::jsonb; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='assignments' AND column_name='sample_solution') THEN ALTER TABLE assignments ADD COLUMN sample_solution text; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='assignments' AND column_name='sample_solution_visibility') THEN ALTER TABLE assignments ADD COLUMN sample_solution_visibility text NOT NULL DEFAULT 'after_submission'; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='assignments' AND column_name='max_submissions') THEN ALTER TABLE assignments ADD COLUMN max_submissions integer; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='assignments' AND column_name='passing_score') THEN ALTER TABLE assignments ADD COLUMN passing_score numeric; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='assignments' AND column_name='order_index') THEN ALTER TABLE assignments ADD COLUMN order_index integer NOT NULL DEFAULT 0; END IF; END $$;

-- ============================================================
-- 2. Extend assignment_submissions with coding fields
-- ============================================================
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='assignment_submissions' AND column_name='submitted_code') THEN ALTER TABLE assignment_submissions ADD COLUMN submitted_code text; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='assignment_submissions' AND column_name='language') THEN ALTER TABLE assignment_submissions ADD COLUMN language text NOT NULL DEFAULT 'python'; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='assignment_submissions' AND column_name='execution_output') THEN ALTER TABLE assignment_submissions ADD COLUMN execution_output text; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='assignment_submissions' AND column_name='visible_tests_passed') THEN ALTER TABLE assignment_submissions ADD COLUMN visible_tests_passed integer NOT NULL DEFAULT 0; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='assignment_submissions' AND column_name='visible_tests_total') THEN ALTER TABLE assignment_submissions ADD COLUMN visible_tests_total integer NOT NULL DEFAULT 0; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='assignment_submissions' AND column_name='submission_number') THEN ALTER TABLE assignment_submissions ADD COLUMN submission_number integer NOT NULL DEFAULT 1; END IF; END $$;

-- ============================================================
-- 3. Extend course_enrollments with access management fields
-- ============================================================
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='course_enrollments' AND column_name='enrollment_source') THEN ALTER TABLE course_enrollments ADD COLUMN enrollment_source text NOT NULL DEFAULT 'manual'; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='course_enrollments' AND column_name='access_status') THEN ALTER TABLE course_enrollments ADD COLUMN access_status text NOT NULL DEFAULT 'active'; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='course_enrollments' AND column_name='granted_by') THEN ALTER TABLE course_enrollments ADD COLUMN granted_by uuid; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='course_enrollments' AND column_name='granted_at') THEN ALTER TABLE course_enrollments ADD COLUMN granted_at timestamptz; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='course_enrollments' AND column_name='revoked_by') THEN ALTER TABLE course_enrollments ADD COLUMN revoked_by uuid; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='course_enrollments' AND column_name='revoked_at') THEN ALTER TABLE course_enrollments ADD COLUMN revoked_at timestamptz; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='course_enrollments' AND column_name='notes') THEN ALTER TABLE course_enrollments ADD COLUMN notes text; END IF; END $$;

-- ============================================================
-- 4. Extend lessons with requires_previous_lesson_completion
-- ============================================================
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='lessons' AND column_name='requires_previous_lesson_completion') THEN ALTER TABLE lessons ADD COLUMN requires_previous_lesson_completion boolean NOT NULL DEFAULT false; END IF; END $$;

-- ============================================================
-- 5. New table: assignment_test_cases
-- ============================================================
CREATE TABLE IF NOT EXISTS assignment_test_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id uuid NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  input_data text,
  expected_output text NOT NULL,
  is_hidden boolean NOT NULL DEFAULT false,
  weight numeric NOT NULL DEFAULT 1,
  order_index integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_assignment_test_cases_assignment_id ON assignment_test_cases(assignment_id);
ALTER TABLE assignment_test_cases ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 6. Database trigger: auto-assign course_faculty on course creation
-- ============================================================
CREATE OR REPLACE FUNCTION auto_assign_course_faculty()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.created_by IS NOT NULL THEN
    INSERT INTO course_faculty (course_id, faculty_id)
    VALUES (NEW.id, NEW.created_by)
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_auto_assign_course_faculty ON courses;
CREATE TRIGGER trigger_auto_assign_course_faculty
  AFTER INSERT ON courses
  FOR EACH ROW
  EXECUTE FUNCTION auto_assign_course_faculty();
