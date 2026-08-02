/*
# Placement & Jobs Module

## Overview
Creates a complete placement/jobs system for the training academy.
Admin manages hiring companies and job postings. Faculty recommend students.
Students browse, apply, and track their placement journey.

## New Tables

### `hiring_companies`
- `id` (uuid, PK)
- `name` (text) - company name
- `logo_url` (text) - company logo
- `website` (text)
- `industry` (text) - e.g., IT, Healthcare
- `description` (text)
- `location` (text) - HQ location
- `is_active` (boolean)
- `created_at` (timestamptz)

### `job_postings`
- `id` (uuid, PK)
- `company_id` (uuid, FK→hiring_companies)
- `title` (text) - job title
- `description` (text) - full JD
- `location` (text) - job location
- `job_type` (text) - full_time / internship / contract
- `ctc_min` (numeric) - min compensation (LPA)
- `ctc_max` (numeric) - max compensation (LPA)
- `openings` (int) - number of positions
- `eligibility_criteria` (text) - requirements
- `required_skills` (text[]) - skill tags
- `apply_by` (timestamptz) - application deadline
- `status` (text) - open / closed / on_hold / filled
- `created_by` (uuid) - admin who posted
- `created_at` / `updated_at` (timestamptz)

### `job_applications`
- `id` (uuid, PK)
- `job_id` (uuid, FK→job_postings)
- `student_id` (uuid, FK→profiles)
- `status` (text) - applied / shortlisted / interview / selected / rejected / withdrawn
- `resume_url` (text)
- `cover_letter` (text)
- `faculty_recommendation` (text) - faculty notes
- `recommended_by` (uuid, FK→profiles) - faculty who recommended
- `interview_date` (timestamptz)
- `interview_notes` (text)
- `offer_ctc` (numeric)
- `applied_at` (timestamptz)
- `updated_at` (timestamptz)
- Unique constraint on (job_id, student_id)

## Security
- RLS enabled on all tables.
- Admin has full CRUD.
- Faculty can read all jobs, recommend students, update application status.
- Students can read open jobs, apply, and view their own applications.
*/

-- Hiring companies
CREATE TABLE IF NOT EXISTS hiring_companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  logo_url text,
  website text,
  industry text,
  description text,
  location text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE hiring_companies ENABLE ROW LEVEL SECURITY;

-- Job postings
CREATE TABLE IF NOT EXISTS job_postings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES hiring_companies(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  location text,
  job_type text NOT NULL DEFAULT 'full_time' CHECK (job_type IN ('full_time', 'internship', 'contract', 'part_time')),
  ctc_min numeric,
  ctc_max numeric,
  openings int DEFAULT 1,
  eligibility_criteria text,
  required_skills text[] DEFAULT '{}',
  apply_by timestamptz,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed', 'on_hold', 'filled')),
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE job_postings ENABLE ROW LEVEL SECURITY;

-- Job applications
CREATE TABLE IF NOT EXISTS job_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES job_postings(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'applied' CHECK (status IN ('applied', 'shortlisted', 'interview', 'selected', 'rejected', 'withdrawn')),
  resume_url text,
  cover_letter text,
  faculty_recommendation text,
  recommended_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  interview_date timestamptz,
  interview_notes text,
  offer_ctc numeric,
  applied_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(job_id, student_id)
);

ALTER TABLE job_applications ENABLE ROW LEVEL SECURITY;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_job_postings_company ON job_postings(company_id);
CREATE INDEX IF NOT EXISTS idx_job_postings_status ON job_postings(status);
CREATE INDEX IF NOT EXISTS idx_job_postings_apply_by ON job_postings(apply_by);
CREATE INDEX IF NOT EXISTS idx_job_applications_job ON job_applications(job_id);
CREATE INDEX IF NOT EXISTS idx_job_applications_student ON job_applications(student_id);
CREATE INDEX IF NOT EXISTS idx_job_applications_status ON job_applications(status);

-- ===== RLS POLICIES =====

-- HIRING_COMPANIES
DROP POLICY IF EXISTS "admin_all_hiring_companies" ON hiring_companies;
CREATE POLICY "admin_all_hiring_companies" ON hiring_companies FOR ALL
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'));

DROP POLICY IF EXISTS "authenticated_read_hiring_companies" ON hiring_companies;
CREATE POLICY "authenticated_read_hiring_companies" ON hiring_companies FOR SELECT
  TO authenticated
  USING (is_active = true);

-- JOB_POSTINGS
DROP POLICY IF EXISTS "admin_all_job_postings" ON job_postings;
CREATE POLICY "admin_all_job_postings" ON job_postings FOR ALL
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'));

DROP POLICY IF EXISTS "faculty_read_job_postings" ON job_postings;
CREATE POLICY "faculty_read_job_postings" ON job_postings FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'faculty'));

DROP POLICY IF EXISTS "student_read_open_jobs" ON job_postings;
CREATE POLICY "student_read_open_jobs" ON job_postings FOR SELECT
  TO authenticated
  USING (status = 'open' AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'student'));

-- JOB_APPLICATIONS
DROP POLICY IF EXISTS "admin_all_job_applications" ON job_applications;
CREATE POLICY "admin_all_job_applications" ON job_applications FOR ALL
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'));

DROP POLICY IF EXISTS "faculty_read_job_applications" ON job_applications;
CREATE POLICY "faculty_read_job_applications" ON job_applications FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'faculty'));

DROP POLICY IF EXISTS "faculty_update_job_applications" ON job_applications;
CREATE POLICY "faculty_update_job_applications" ON job_applications FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'faculty'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'faculty'));

DROP POLICY IF EXISTS "student_read_own_applications" ON job_applications;
CREATE POLICY "student_read_own_applications" ON job_applications FOR SELECT
  TO authenticated
  USING (student_id = auth.uid());

DROP POLICY IF EXISTS "student_insert_application" ON job_applications;
CREATE POLICY "student_insert_application" ON job_applications FOR INSERT
  TO authenticated
  WITH CHECK (student_id = auth.uid());

DROP POLICY IF EXISTS "student_update_own_application" ON job_applications;
CREATE POLICY "student_update_own_application" ON job_applications FOR UPDATE
  TO authenticated
  USING (student_id = auth.uid() AND status = 'applied')
  WITH CHECK (student_id = auth.uid());
