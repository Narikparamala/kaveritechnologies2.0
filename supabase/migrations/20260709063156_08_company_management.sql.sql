-- ============================================================
-- COMPANY MANAGEMENT TABLES
-- For internal HR, payroll, and student support management
-- ============================================================

-- ============================================================
-- FACULTY EMPLOYMENT
-- Tracks employment status, salary, and benefits for faculty
-- ============================================================
CREATE TABLE IF NOT EXISTS faculty_employment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  faculty_id uuid UNIQUE NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  employee_code text UNIQUE,
  employment_status text NOT NULL DEFAULT 'active' CHECK (employment_status IN ('active', 'probation', 'on_leave', 'inactive', 'terminated')),
  joining_date date,
  department text,
  designation text,
  manager_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  base_salary numeric(12,2),
  salary_currency text NOT NULL DEFAULT 'INR',
  payment_frequency text NOT NULL DEFAULT 'monthly' CHECK (payment_frequency IN ('monthly', 'bi_weekly', 'weekly')),
  bank_details_masked text,
  benefits jsonb DEFAULT '[]',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_faculty_employment_faculty ON faculty_employment(faculty_id);
CREATE INDEX IF NOT EXISTS idx_faculty_employment_status ON faculty_employment(employment_status);
CREATE INDEX IF NOT EXISTS idx_faculty_employment_manager ON faculty_employment(manager_id);

DROP TRIGGER IF EXISTS update_faculty_employment_updated_at ON faculty_employment;
CREATE TRIGGER update_faculty_employment_updated_at
  BEFORE UPDATE ON faculty_employment
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- FACULTY COMPENSATION HISTORY
-- Track salary changes, incentives, bonuses, and deductions
-- ============================================================
CREATE TABLE IF NOT EXISTS faculty_compensation_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  faculty_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  change_type text NOT NULL CHECK (change_type IN ('salary', 'incentive', 'hike', 'bonus', 'deduction', 'benefit')),
  amount numeric(12,2),
  percentage numeric(5,2),
  effective_date date NOT NULL,
  reason text,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_faculty_comp_faculty ON faculty_compensation_history(faculty_id);
CREATE INDEX IF NOT EXISTS idx_faculty_comp_date ON faculty_compensation_history(effective_date);
CREATE INDEX IF NOT EXISTS idx_faculty_comp_type ON faculty_compensation_history(change_type);

-- ============================================================
-- FACULTY PERFORMANCE REVIEWS
-- Track periodic performance evaluations
-- ============================================================
CREATE TABLE IF NOT EXISTS faculty_performance_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  faculty_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  reviewer_id uuid NOT NULL REFERENCES profiles(id) ON DELETE SET NULL,
  review_period text NOT NULL,
  rating numeric(3,1) CHECK (rating >= 0 AND rating <= 5),
  strengths text,
  improvements text,
  goals text,
  review_date date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_performance_reviews_faculty ON faculty_performance_reviews(faculty_id);
CREATE INDEX IF NOT EXISTS idx_performance_reviews_reviewer ON faculty_performance_reviews(reviewer_id);
CREATE INDEX IF NOT EXISTS idx_performance_reviews_period ON faculty_performance_reviews(review_period);

DROP TRIGGER IF EXISTS update_performance_reviews_updated_at ON faculty_performance_reviews;
CREATE TRIGGER update_performance_reviews_updated_at
  BEFORE UPDATE ON faculty_performance_reviews
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- STUDENT SUPPORT RECORDS
-- Track academic, attendance, behavior, and general support issues
-- ============================================================
CREATE TABLE IF NOT EXISTS student_support_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  faculty_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  category text NOT NULL CHECK (category IN ('academic', 'attendance', 'behavior', 'payment', 'general')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved')),
  priority text NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
  notes text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_support_records_student ON student_support_records(student_id);
CREATE INDEX IF NOT EXISTS idx_support_records_faculty ON student_support_records(faculty_id);
CREATE INDEX IF NOT EXISTS idx_support_records_status ON student_support_records(status);
CREATE INDEX IF NOT EXISTS idx_support_records_category ON student_support_records(category);

DROP TRIGGER IF EXISTS update_support_records_updated_at ON student_support_records;
CREATE TRIGGER update_support_records_updated_at
  BEFORE UPDATE ON student_support_records
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- ENABLE RLS ON NEW TABLES
-- ============================================================
ALTER TABLE faculty_employment ENABLE ROW LEVEL SECURITY;
ALTER TABLE faculty_compensation_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE faculty_performance_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_support_records ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- HELPER FUNCTIONS
-- ============================================================

-- Check if current user is admin or the faculty themselves (for own data)
CREATE OR REPLACE FUNCTION is_self_or_admin(p_user_id uuid)
RETURNS boolean AS $$
  SELECT auth.uid() = p_user_id OR is_admin();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Check if faculty can access student (enrolled in faculty's assigned courses)
CREATE OR REPLACE FUNCTION faculty_can_access_student(p_student_id uuid)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM course_enrollments ce
    JOIN course_faculty cf ON cf.course_id = ce.course_id
    WHERE ce.student_id = p_student_id AND cf.faculty_id = auth.uid()
  ) OR is_admin();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ============================================================
-- RLS POLICIES: faculty_employment
-- ============================================================
-- Admin has full access
-- Faculty can view only their own employment record (no salary details for others)
DROP POLICY IF EXISTS "faculty_employment_select" ON faculty_employment;
CREATE POLICY "faculty_employment_select" ON faculty_employment FOR SELECT
  TO authenticated USING (
    faculty_id = auth.uid() OR is_admin()
  );

DROP POLICY IF EXISTS "faculty_employment_insert" ON faculty_employment;
CREATE POLICY "faculty_employment_insert" ON faculty_employment FOR INSERT
  TO authenticated WITH CHECK (is_admin());

DROP POLICY IF EXISTS "faculty_employment_update" ON faculty_employment;
CREATE POLICY "faculty_employment_update" ON faculty_employment FOR UPDATE
  TO authenticated USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "faculty_employment_delete" ON faculty_employment;
CREATE POLICY "faculty_employment_delete" ON faculty_employment FOR DELETE
  TO authenticated USING (is_admin());

-- ============================================================
-- RLS POLICIES: faculty_compensation_history
-- ============================================================
-- Only admin can access compensation history
-- Faculty cannot see their own or others' compensation details
DROP POLICY IF EXISTS "faculty_compensation_select" ON faculty_compensation_history;
CREATE POLICY "faculty_compensation_select" ON faculty_compensation_history FOR SELECT
  TO authenticated USING (is_admin());

DROP POLICY IF EXISTS "faculty_compensation_insert" ON faculty_compensation_history;
CREATE POLICY "faculty_compensation_insert" ON faculty_compensation_history FOR INSERT
  TO authenticated WITH CHECK (is_admin());

DROP POLICY IF EXISTS "faculty_compensation_update" ON faculty_compensation_history;
CREATE POLICY "faculty_compensation_update" ON faculty_compensation_history FOR UPDATE
  TO authenticated USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "faculty_compensation_delete" ON faculty_compensation_history;
CREATE POLICY "faculty_compensation_delete" ON faculty_compensation_history FOR DELETE
  TO authenticated USING (is_admin());

-- ============================================================
-- RLS POLICIES: faculty_performance_reviews
-- ============================================================
-- Admin has full access
-- Faculty can view their own reviews (but not others')
DROP POLICY IF EXISTS "performance_reviews_select" ON faculty_performance_reviews;
CREATE POLICY "performance_reviews_select" ON faculty_performance_reviews FOR SELECT
  TO authenticated USING (
    faculty_id = auth.uid() OR is_admin()
  );

DROP POLICY IF EXISTS "performance_reviews_insert" ON faculty_performance_reviews;
CREATE POLICY "performance_reviews_insert" ON faculty_performance_reviews FOR INSERT
  TO authenticated WITH CHECK (is_admin());

DROP POLICY IF EXISTS "performance_reviews_update" ON faculty_performance_reviews;
CREATE POLICY "performance_reviews_update" ON faculty_performance_reviews FOR UPDATE
  TO authenticated USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "performance_reviews_delete" ON faculty_performance_reviews;
CREATE POLICY "performance_reviews_delete" ON faculty_performance_reviews FOR DELETE
  TO authenticated USING (is_admin());

-- ============================================================
-- RLS POLICIES: student_support_records
-- ============================================================
-- Admin has full access
-- Faculty can manage records for students in their assigned courses
-- Students can view their own support records only
DROP POLICY IF EXISTS "support_records_select" ON student_support_records;
CREATE POLICY "support_records_select" ON student_support_records FOR SELECT
  TO authenticated USING (
    student_id = auth.uid()
    OR faculty_can_access_student(student_id)
    OR is_admin()
  );

DROP POLICY IF EXISTS "support_records_insert" ON student_support_records;
CREATE POLICY "support_records_insert" ON student_support_records FOR INSERT
  TO authenticated WITH CHECK (
    faculty_can_access_student(student_id) OR is_admin()
  );

DROP POLICY IF EXISTS "support_records_update" ON student_support_records;
CREATE POLICY "support_records_update" ON student_support_records FOR UPDATE
  TO authenticated USING (
    faculty_can_access_student(student_id) OR is_admin()
  ) WITH CHECK (
    faculty_can_access_student(student_id) OR is_admin()
  );

DROP POLICY IF EXISTS "support_records_delete" ON student_support_records;
CREATE POLICY "support_records_delete" ON student_support_records FOR DELETE
  TO authenticated USING (is_admin());