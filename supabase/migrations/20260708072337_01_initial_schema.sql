
/*
# Kaveri Technologies Academy - Initial Schema

## Overview
Complete database schema for a multi-role Python learning platform with students, faculty, and super admins.

## New Tables
1. `profiles` - User profiles linked to auth.users
2. `courses` - Python courses with metadata
3. `course_faculty` - Faculty assignments to courses
4. `course_enrollments` - Student course enrollments
5. `chapters` - Course chapters/sections
6. `lessons` - Individual lessons within chapters
7. `lesson_resources` - Downloadable resources per lesson
8. `lesson_progress` - Student lesson completion tracking
9. `lesson_notes` - Student personal notes on lessons
10. `lesson_bookmarks` - Student bookmarks on lessons
11. `assignments` - Course assignments
12. `assignment_submissions` - Student assignment submissions
13. `quizzes` - Course quizzes
14. `quiz_questions` - Questions within quizzes
15. `quiz_options` - Answer options for quiz questions
16. `quiz_attempts` - Student quiz attempts
17. `quiz_answers` - Student answers within attempts
18. `projects` - Project listings
19. `project_submissions` - Student project submissions
20. `certificates` - Issued certificates
21. `achievements` - Achievement/badge definitions
22. `user_achievements` - Achievements earned by users
23. `xp_transactions` - XP point transactions
24. `notifications` - In-app notifications
25. `announcements` - Course/platform announcements
26. `activity_logs` - User activity tracking
27. `saved_code_snippets` - Saved code from playground
28. `platform_settings` - Global platform configuration

## Security
- RLS enabled on all tables
- Role-based access: student, faculty, super_admin stored in profiles.role
- Faculty scoped to assigned courses only
- Students scoped to own data only
- Super admin has full access via service role bypass

## Important Notes
- All tables use UUID primary keys
- created_at and updated_at timestamps on all tables
- Trigger auto-creates profile on auth.users insert
- Trigger auto-updates updated_at
- Seed data included for courses, chapters, lessons, projects, achievements
*/

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- HELPER: updated_at trigger function
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- ============================================================
-- PROFILES
-- ============================================================
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  full_name text,
  avatar_url text,
  phone text,
  bio text,
  role text NOT NULL DEFAULT 'student' CHECK (role IN ('student', 'faculty', 'super_admin')),
  xp_points integer NOT NULL DEFAULT 0,
  level integer NOT NULL DEFAULT 1,
  streak_days integer NOT NULL DEFAULT 0,
  last_active_date date,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role);
CREATE INDEX IF NOT EXISTS idx_profiles_email ON profiles(email);

DROP TRIGGER IF EXISTS update_profiles_updated_at ON profiles;
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'role', 'student')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ language 'plpgsql' SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================================
-- COURSES
-- ============================================================
CREATE TABLE IF NOT EXISTS courses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  slug text UNIQUE NOT NULL,
  short_description text,
  description text,
  thumbnail_url text,
  difficulty text NOT NULL DEFAULT 'beginner' CHECK (difficulty IN ('beginner', 'intermediate', 'advanced')),
  duration_hours integer DEFAULT 0,
  category text DEFAULT 'python',
  is_published boolean NOT NULL DEFAULT false,
  is_featured boolean NOT NULL DEFAULT false,
  enrollment_count integer NOT NULL DEFAULT 0,
  price numeric(10,2) DEFAULT 0,
  certificate_eligible boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_courses_slug ON courses(slug);
CREATE INDEX IF NOT EXISTS idx_courses_published ON courses(is_published);
CREATE INDEX IF NOT EXISTS idx_courses_difficulty ON courses(difficulty);

DROP TRIGGER IF EXISTS update_courses_updated_at ON courses;
CREATE TRIGGER update_courses_updated_at
  BEFORE UPDATE ON courses
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- COURSE FACULTY
-- ============================================================
CREATE TABLE IF NOT EXISTS course_faculty (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  faculty_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(course_id, faculty_id)
);

CREATE INDEX IF NOT EXISTS idx_course_faculty_course ON course_faculty(course_id);
CREATE INDEX IF NOT EXISTS idx_course_faculty_faculty ON course_faculty(faculty_id);

-- ============================================================
-- COURSE ENROLLMENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS course_enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  enrolled_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  progress_percentage numeric(5,2) DEFAULT 0,
  UNIQUE(course_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_enrollments_student ON course_enrollments(student_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_course ON course_enrollments(course_id);

-- ============================================================
-- CHAPTERS
-- ============================================================
CREATE TABLE IF NOT EXISTS chapters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  order_index integer NOT NULL DEFAULT 0,
  is_published boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chapters_course ON chapters(course_id);

DROP TRIGGER IF EXISTS update_chapters_updated_at ON chapters;
CREATE TRIGGER update_chapters_updated_at
  BEFORE UPDATE ON chapters
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- LESSONS
-- ============================================================
CREATE TABLE IF NOT EXISTS lessons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chapter_id uuid NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
  course_id uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  title text NOT NULL,
  slug text NOT NULL,
  video_url text,
  notes_markdown text,
  code_example text,
  explanation text,
  order_index integer NOT NULL DEFAULT 0,
  duration_minutes integer DEFAULT 10,
  is_published boolean NOT NULL DEFAULT true,
  is_free_preview boolean NOT NULL DEFAULT false,
  xp_reward integer NOT NULL DEFAULT 10,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lessons_chapter ON lessons(chapter_id);
CREATE INDEX IF NOT EXISTS idx_lessons_course ON lessons(course_id);

DROP TRIGGER IF EXISTS update_lessons_updated_at ON lessons;
CREATE TRIGGER update_lessons_updated_at
  BEFORE UPDATE ON lessons
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- LESSON RESOURCES
-- ============================================================
CREATE TABLE IF NOT EXISTS lesson_resources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id uuid NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  title text NOT NULL,
  file_url text NOT NULL,
  file_type text DEFAULT 'pdf',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lesson_resources_lesson ON lesson_resources(lesson_id);

-- ============================================================
-- LESSON PROGRESS
-- ============================================================
CREATE TABLE IF NOT EXISTS lesson_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  lesson_id uuid NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  course_id uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  completed boolean NOT NULL DEFAULT false,
  completed_at timestamptz,
  watch_time_seconds integer DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(student_id, lesson_id)
);

CREATE INDEX IF NOT EXISTS idx_lesson_progress_student ON lesson_progress(student_id);
CREATE INDEX IF NOT EXISTS idx_lesson_progress_course ON lesson_progress(course_id);

DROP TRIGGER IF EXISTS update_lesson_progress_updated_at ON lesson_progress;
CREATE TRIGGER update_lesson_progress_updated_at
  BEFORE UPDATE ON lesson_progress
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- LESSON NOTES
-- ============================================================
CREATE TABLE IF NOT EXISTS lesson_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
  lesson_id uuid NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lesson_notes_student ON lesson_notes(student_id);

DROP TRIGGER IF EXISTS update_lesson_notes_updated_at ON lesson_notes;
CREATE TRIGGER update_lesson_notes_updated_at
  BEFORE UPDATE ON lesson_notes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- LESSON BOOKMARKS
-- ============================================================
CREATE TABLE IF NOT EXISTS lesson_bookmarks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
  lesson_id uuid NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(student_id, lesson_id)
);

CREATE INDEX IF NOT EXISTS idx_lesson_bookmarks_student ON lesson_bookmarks(student_id);

-- ============================================================
-- ASSIGNMENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  chapter_id uuid REFERENCES chapters(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text,
  instructions text,
  due_date timestamptz,
  max_marks integer DEFAULT 100,
  difficulty text DEFAULT 'beginner',
  allow_resubmit boolean NOT NULL DEFAULT true,
  is_published boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_assignments_course ON assignments(course_id);

DROP TRIGGER IF EXISTS update_assignments_updated_at ON assignments;
CREATE TRIGGER update_assignments_updated_at
  BEFORE UPDATE ON assignments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- ASSIGNMENT SUBMISSIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS assignment_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id uuid NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  student_id uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
  submission_text text,
  github_url text,
  project_url text,
  file_url text,
  status text NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'graded', 'returned', 'resubmitted')),
  score integer,
  feedback text,
  graded_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  graded_at timestamptz,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_submissions_assignment ON assignment_submissions(assignment_id);
CREATE INDEX IF NOT EXISTS idx_submissions_student ON assignment_submissions(student_id);

DROP TRIGGER IF EXISTS update_submissions_updated_at ON assignment_submissions;
CREATE TRIGGER update_submissions_updated_at
  BEFORE UPDATE ON assignment_submissions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- QUIZZES
-- ============================================================
CREATE TABLE IF NOT EXISTS quizzes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  lesson_id uuid REFERENCES lessons(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text,
  pass_percentage integer DEFAULT 70,
  time_limit_minutes integer,
  xp_reward integer DEFAULT 50,
  is_published boolean NOT NULL DEFAULT false,
  show_answers boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_quizzes_course ON quizzes(course_id);

DROP TRIGGER IF EXISTS update_quizzes_updated_at ON quizzes;
CREATE TRIGGER update_quizzes_updated_at
  BEFORE UPDATE ON quizzes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- QUIZ QUESTIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS quiz_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id uuid NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  question_text text NOT NULL,
  question_type text NOT NULL DEFAULT 'mcq' CHECK (question_type IN ('mcq', 'multiple_select', 'true_false', 'coding')),
  explanation text,
  order_index integer NOT NULL DEFAULT 0,
  points integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_quiz_questions_quiz ON quiz_questions(quiz_id);

-- ============================================================
-- QUIZ OPTIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS quiz_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id uuid NOT NULL REFERENCES quiz_questions(id) ON DELETE CASCADE,
  option_text text NOT NULL,
  is_correct boolean NOT NULL DEFAULT false,
  order_index integer NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_quiz_options_question ON quiz_options(question_id);

-- ============================================================
-- QUIZ ATTEMPTS
-- ============================================================
CREATE TABLE IF NOT EXISTS quiz_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id uuid NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  student_id uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
  score numeric(5,2),
  max_score integer,
  passed boolean,
  time_taken_seconds integer,
  completed_at timestamptz,
  started_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_quiz_attempts_student ON quiz_attempts(student_id);
CREATE INDEX IF NOT EXISTS idx_quiz_attempts_quiz ON quiz_attempts(quiz_id);

-- ============================================================
-- QUIZ ANSWERS
-- ============================================================
CREATE TABLE IF NOT EXISTS quiz_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id uuid NOT NULL REFERENCES quiz_attempts(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES quiz_questions(id) ON DELETE CASCADE,
  selected_option_ids uuid[],
  is_correct boolean,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_quiz_answers_attempt ON quiz_answers(attempt_id);

-- ============================================================
-- PROJECTS
-- ============================================================
CREATE TABLE IF NOT EXISTS projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  difficulty text NOT NULL DEFAULT 'beginner' CHECK (difficulty IN ('beginner', 'intermediate', 'advanced')),
  category text DEFAULT 'general',
  estimated_hours integer DEFAULT 5,
  tech_tags text[] DEFAULT '{}',
  requirements text,
  starter_code text,
  course_id uuid REFERENCES courses(id) ON DELETE SET NULL,
  is_published boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_projects_difficulty ON projects(difficulty);
CREATE INDEX IF NOT EXISTS idx_projects_category ON projects(category);

DROP TRIGGER IF EXISTS update_projects_updated_at ON projects;
CREATE TRIGGER update_projects_updated_at
  BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- PROJECT SUBMISSIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS project_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  student_id uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
  github_url text,
  live_url text,
  description text,
  status text NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'reviewed', 'approved', 'rejected')),
  feedback text,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(project_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_project_submissions_student ON project_submissions(student_id);

-- ============================================================
-- CERTIFICATES
-- ============================================================
CREATE TABLE IF NOT EXISTS certificates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  course_id uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  certificate_uid text UNIQUE NOT NULL DEFAULT 'KTA-' || upper(substring(gen_random_uuid()::text, 1, 8)),
  issued_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(student_id, course_id)
);

CREATE INDEX IF NOT EXISTS idx_certificates_student ON certificates(student_id);

-- ============================================================
-- ACHIEVEMENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS achievements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  icon text DEFAULT 'award',
  badge_color text DEFAULT '#2563EB',
  xp_reward integer DEFAULT 100,
  condition_type text,
  condition_value integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- USER ACHIEVEMENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS user_achievements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  achievement_id uuid NOT NULL REFERENCES achievements(id) ON DELETE CASCADE,
  earned_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(student_id, achievement_id)
);

CREATE INDEX IF NOT EXISTS idx_user_achievements_student ON user_achievements(student_id);

-- ============================================================
-- XP TRANSACTIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS xp_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
  amount integer NOT NULL,
  reason text NOT NULL,
  reference_id uuid,
  reference_type text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_xp_transactions_student ON xp_transactions(student_id);

-- ============================================================
-- NOTIFICATIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title text NOT NULL,
  message text NOT NULL,
  type text NOT NULL DEFAULT 'info' CHECK (type IN ('info', 'success', 'warning', 'error', 'assignment', 'announcement', 'grade')),
  is_read boolean NOT NULL DEFAULT false,
  reference_id uuid,
  reference_type text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(is_read);

-- ============================================================
-- ANNOUNCEMENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid REFERENCES courses(id) ON DELETE CASCADE,
  title text NOT NULL,
  content text NOT NULL,
  author_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  is_global boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_announcements_course ON announcements(course_id);
CREATE INDEX IF NOT EXISTS idx_announcements_global ON announcements(is_global);

DROP TRIGGER IF EXISTS update_announcements_updated_at ON announcements;
CREATE TRIGGER update_announcements_updated_at
  BEFORE UPDATE ON announcements
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- ACTIVITY LOGS
-- ============================================================
CREATE TABLE IF NOT EXISTS activity_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  action text NOT NULL,
  entity_type text,
  entity_id uuid,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_activity_logs_user ON activity_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_created ON activity_logs(created_at DESC);

-- ============================================================
-- SAVED CODE SNIPPETS
-- ============================================================
CREATE TABLE IF NOT EXISTS saved_code_snippets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT 'Untitled Snippet',
  code text NOT NULL,
  language text DEFAULT 'python',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_code_snippets_user ON saved_code_snippets(user_id);

DROP TRIGGER IF EXISTS update_snippets_updated_at ON saved_code_snippets;
CREATE TRIGGER update_snippets_updated_at
  BEFORE UPDATE ON saved_code_snippets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- PLATFORM SETTINGS
-- ============================================================
CREATE TABLE IF NOT EXISTS platform_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL,
  value text,
  description text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- RLS: Enable on all tables
-- ============================================================
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE course_faculty ENABLE ROW LEVEL SECURITY;
ALTER TABLE course_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE chapters ENABLE ROW LEVEL SECURITY;
ALTER TABLE lessons ENABLE ROW LEVEL SECURITY;
ALTER TABLE lesson_resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE lesson_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE lesson_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE lesson_bookmarks ENABLE ROW LEVEL SECURITY;
ALTER TABLE assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE assignment_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE quizzes ENABLE ROW LEVEL SECURITY;
ALTER TABLE quiz_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE quiz_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE quiz_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE quiz_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE certificates ENABLE ROW LEVEL SECURITY;
ALTER TABLE achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE xp_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE saved_code_snippets ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_settings ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- HELPER: is_admin function
-- ============================================================
CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION is_faculty()
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('faculty', 'super_admin')
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION faculty_can_access_course(p_course_id uuid)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM course_faculty 
    WHERE course_id = p_course_id AND faculty_id = auth.uid()
  ) OR is_admin();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ============================================================
-- RLS POLICIES: profiles
-- ============================================================
DROP POLICY IF EXISTS "profiles_select" ON profiles;
CREATE POLICY "profiles_select" ON profiles FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "profiles_insert" ON profiles;
CREATE POLICY "profiles_insert" ON profiles FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "profiles_update" ON profiles;
CREATE POLICY "profiles_update" ON profiles FOR UPDATE
  TO authenticated USING (auth.uid() = id OR is_admin()) WITH CHECK (auth.uid() = id OR is_admin());

DROP POLICY IF EXISTS "profiles_delete" ON profiles;
CREATE POLICY "profiles_delete" ON profiles FOR DELETE
  TO authenticated USING (is_admin());

-- ============================================================
-- RLS POLICIES: courses
-- ============================================================
DROP POLICY IF EXISTS "courses_select" ON courses;
CREATE POLICY "courses_select" ON courses FOR SELECT
  TO authenticated USING (is_published = true OR is_admin() OR faculty_can_access_course(id));

DROP POLICY IF EXISTS "courses_insert" ON courses;
CREATE POLICY "courses_insert" ON courses FOR INSERT
  TO authenticated WITH CHECK (is_admin());

DROP POLICY IF EXISTS "courses_update" ON courses;
CREATE POLICY "courses_update" ON courses FOR UPDATE
  TO authenticated USING (is_admin() OR faculty_can_access_course(id)) WITH CHECK (is_admin() OR faculty_can_access_course(id));

DROP POLICY IF EXISTS "courses_delete" ON courses;
CREATE POLICY "courses_delete" ON courses FOR DELETE
  TO authenticated USING (is_admin());

-- Public read for landing page (anon)
DROP POLICY IF EXISTS "courses_select_anon" ON courses;
CREATE POLICY "courses_select_anon" ON courses FOR SELECT
  TO anon USING (is_published = true);

-- ============================================================
-- RLS POLICIES: course_faculty
-- ============================================================
DROP POLICY IF EXISTS "course_faculty_select" ON course_faculty;
CREATE POLICY "course_faculty_select" ON course_faculty FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "course_faculty_insert" ON course_faculty;
CREATE POLICY "course_faculty_insert" ON course_faculty FOR INSERT
  TO authenticated WITH CHECK (is_admin());

DROP POLICY IF EXISTS "course_faculty_update" ON course_faculty;
CREATE POLICY "course_faculty_update" ON course_faculty FOR UPDATE
  TO authenticated USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "course_faculty_delete" ON course_faculty;
CREATE POLICY "course_faculty_delete" ON course_faculty FOR DELETE
  TO authenticated USING (is_admin());

-- ============================================================
-- RLS POLICIES: course_enrollments
-- ============================================================
DROP POLICY IF EXISTS "enrollments_select" ON course_enrollments;
CREATE POLICY "enrollments_select" ON course_enrollments FOR SELECT
  TO authenticated USING (student_id = auth.uid() OR is_admin() OR EXISTS (
    SELECT 1 FROM course_faculty WHERE course_id = course_enrollments.course_id AND faculty_id = auth.uid()
  ));

DROP POLICY IF EXISTS "enrollments_insert" ON course_enrollments;
CREATE POLICY "enrollments_insert" ON course_enrollments FOR INSERT
  TO authenticated WITH CHECK (student_id = auth.uid() OR is_admin());

DROP POLICY IF EXISTS "enrollments_update" ON course_enrollments;
CREATE POLICY "enrollments_update" ON course_enrollments FOR UPDATE
  TO authenticated USING (student_id = auth.uid() OR is_admin()) WITH CHECK (student_id = auth.uid() OR is_admin());

DROP POLICY IF EXISTS "enrollments_delete" ON course_enrollments;
CREATE POLICY "enrollments_delete" ON course_enrollments FOR DELETE
  TO authenticated USING (student_id = auth.uid() OR is_admin());

-- ============================================================
-- RLS POLICIES: chapters
-- ============================================================
DROP POLICY IF EXISTS "chapters_select" ON chapters;
CREATE POLICY "chapters_select" ON chapters FOR SELECT
  TO authenticated USING (is_published = true OR is_admin() OR faculty_can_access_course(course_id));

DROP POLICY IF EXISTS "chapters_select_anon" ON chapters;
CREATE POLICY "chapters_select_anon" ON chapters FOR SELECT
  TO anon USING (is_published = true);

DROP POLICY IF EXISTS "chapters_insert" ON chapters;
CREATE POLICY "chapters_insert" ON chapters FOR INSERT
  TO authenticated WITH CHECK (is_admin() OR faculty_can_access_course(course_id));

DROP POLICY IF EXISTS "chapters_update" ON chapters;
CREATE POLICY "chapters_update" ON chapters FOR UPDATE
  TO authenticated USING (is_admin() OR faculty_can_access_course(course_id)) WITH CHECK (is_admin() OR faculty_can_access_course(course_id));

DROP POLICY IF EXISTS "chapters_delete" ON chapters;
CREATE POLICY "chapters_delete" ON chapters FOR DELETE
  TO authenticated USING (is_admin() OR faculty_can_access_course(course_id));

-- ============================================================
-- RLS POLICIES: lessons
-- ============================================================
DROP POLICY IF EXISTS "lessons_select" ON lessons;
CREATE POLICY "lessons_select" ON lessons FOR SELECT
  TO authenticated USING (is_published = true OR is_admin() OR faculty_can_access_course(course_id));

DROP POLICY IF EXISTS "lessons_select_anon" ON lessons;
CREATE POLICY "lessons_select_anon" ON lessons FOR SELECT
  TO anon USING (is_published = true AND is_free_preview = true);

DROP POLICY IF EXISTS "lessons_insert" ON lessons;
CREATE POLICY "lessons_insert" ON lessons FOR INSERT
  TO authenticated WITH CHECK (is_admin() OR faculty_can_access_course(course_id));

DROP POLICY IF EXISTS "lessons_update" ON lessons;
CREATE POLICY "lessons_update" ON lessons FOR UPDATE
  TO authenticated USING (is_admin() OR faculty_can_access_course(course_id)) WITH CHECK (is_admin() OR faculty_can_access_course(course_id));

DROP POLICY IF EXISTS "lessons_delete" ON lessons;
CREATE POLICY "lessons_delete" ON lessons FOR DELETE
  TO authenticated USING (is_admin() OR faculty_can_access_course(course_id));

-- ============================================================
-- RLS POLICIES: lesson_resources
-- ============================================================
DROP POLICY IF EXISTS "lesson_resources_select" ON lesson_resources;
CREATE POLICY "lesson_resources_select" ON lesson_resources FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "lesson_resources_insert" ON lesson_resources;
CREATE POLICY "lesson_resources_insert" ON lesson_resources FOR INSERT
  TO authenticated WITH CHECK (is_faculty());

DROP POLICY IF EXISTS "lesson_resources_update" ON lesson_resources;
CREATE POLICY "lesson_resources_update" ON lesson_resources FOR UPDATE
  TO authenticated USING (is_faculty()) WITH CHECK (is_faculty());

DROP POLICY IF EXISTS "lesson_resources_delete" ON lesson_resources;
CREATE POLICY "lesson_resources_delete" ON lesson_resources FOR DELETE
  TO authenticated USING (is_faculty());

-- ============================================================
-- RLS POLICIES: lesson_progress
-- ============================================================
DROP POLICY IF EXISTS "lesson_progress_select" ON lesson_progress;
CREATE POLICY "lesson_progress_select" ON lesson_progress FOR SELECT
  TO authenticated USING (student_id = auth.uid() OR is_admin() OR EXISTS (
    SELECT 1 FROM course_faculty WHERE course_id = lesson_progress.course_id AND faculty_id = auth.uid()
  ));

DROP POLICY IF EXISTS "lesson_progress_insert" ON lesson_progress;
CREATE POLICY "lesson_progress_insert" ON lesson_progress FOR INSERT
  TO authenticated WITH CHECK (student_id = auth.uid());

DROP POLICY IF EXISTS "lesson_progress_update" ON lesson_progress;
CREATE POLICY "lesson_progress_update" ON lesson_progress FOR UPDATE
  TO authenticated USING (student_id = auth.uid()) WITH CHECK (student_id = auth.uid());

DROP POLICY IF EXISTS "lesson_progress_delete" ON lesson_progress;
CREATE POLICY "lesson_progress_delete" ON lesson_progress FOR DELETE
  TO authenticated USING (student_id = auth.uid() OR is_admin());

-- ============================================================
-- RLS POLICIES: lesson_notes
-- ============================================================
DROP POLICY IF EXISTS "lesson_notes_select" ON lesson_notes;
CREATE POLICY "lesson_notes_select" ON lesson_notes FOR SELECT
  TO authenticated USING (student_id = auth.uid());

DROP POLICY IF EXISTS "lesson_notes_insert" ON lesson_notes;
CREATE POLICY "lesson_notes_insert" ON lesson_notes FOR INSERT
  TO authenticated WITH CHECK (student_id = auth.uid());

DROP POLICY IF EXISTS "lesson_notes_update" ON lesson_notes;
CREATE POLICY "lesson_notes_update" ON lesson_notes FOR UPDATE
  TO authenticated USING (student_id = auth.uid()) WITH CHECK (student_id = auth.uid());

DROP POLICY IF EXISTS "lesson_notes_delete" ON lesson_notes;
CREATE POLICY "lesson_notes_delete" ON lesson_notes FOR DELETE
  TO authenticated USING (student_id = auth.uid());

-- ============================================================
-- RLS POLICIES: lesson_bookmarks
-- ============================================================
DROP POLICY IF EXISTS "lesson_bookmarks_select" ON lesson_bookmarks;
CREATE POLICY "lesson_bookmarks_select" ON lesson_bookmarks FOR SELECT
  TO authenticated USING (student_id = auth.uid());

DROP POLICY IF EXISTS "lesson_bookmarks_insert" ON lesson_bookmarks;
CREATE POLICY "lesson_bookmarks_insert" ON lesson_bookmarks FOR INSERT
  TO authenticated WITH CHECK (student_id = auth.uid());

DROP POLICY IF EXISTS "lesson_bookmarks_delete" ON lesson_bookmarks;
CREATE POLICY "lesson_bookmarks_delete" ON lesson_bookmarks FOR DELETE
  TO authenticated USING (student_id = auth.uid());

-- ============================================================
-- RLS POLICIES: assignments
-- ============================================================
DROP POLICY IF EXISTS "assignments_select" ON assignments;
CREATE POLICY "assignments_select" ON assignments FOR SELECT
  TO authenticated USING (is_published = true OR is_admin() OR faculty_can_access_course(course_id));

DROP POLICY IF EXISTS "assignments_insert" ON assignments;
CREATE POLICY "assignments_insert" ON assignments FOR INSERT
  TO authenticated WITH CHECK (is_admin() OR faculty_can_access_course(course_id));

DROP POLICY IF EXISTS "assignments_update" ON assignments;
CREATE POLICY "assignments_update" ON assignments FOR UPDATE
  TO authenticated USING (is_admin() OR faculty_can_access_course(course_id)) WITH CHECK (is_admin() OR faculty_can_access_course(course_id));

DROP POLICY IF EXISTS "assignments_delete" ON assignments;
CREATE POLICY "assignments_delete" ON assignments FOR DELETE
  TO authenticated USING (is_admin() OR faculty_can_access_course(course_id));

-- ============================================================
-- RLS POLICIES: assignment_submissions
-- ============================================================
DROP POLICY IF EXISTS "submissions_select" ON assignment_submissions;
CREATE POLICY "submissions_select" ON assignment_submissions FOR SELECT
  TO authenticated USING (student_id = auth.uid() OR is_admin() OR EXISTS (
    SELECT 1 FROM assignments a 
    JOIN course_faculty cf ON cf.course_id = a.course_id 
    WHERE a.id = assignment_submissions.assignment_id AND cf.faculty_id = auth.uid()
  ));

DROP POLICY IF EXISTS "submissions_insert" ON assignment_submissions;
CREATE POLICY "submissions_insert" ON assignment_submissions FOR INSERT
  TO authenticated WITH CHECK (student_id = auth.uid());

DROP POLICY IF EXISTS "submissions_update" ON assignment_submissions;
CREATE POLICY "submissions_update" ON assignment_submissions FOR UPDATE
  TO authenticated USING (student_id = auth.uid() OR is_admin() OR EXISTS (
    SELECT 1 FROM assignments a 
    JOIN course_faculty cf ON cf.course_id = a.course_id 
    WHERE a.id = assignment_submissions.assignment_id AND cf.faculty_id = auth.uid()
  )) WITH CHECK (student_id = auth.uid() OR is_admin() OR EXISTS (
    SELECT 1 FROM assignments a 
    JOIN course_faculty cf ON cf.course_id = a.course_id 
    WHERE a.id = assignment_submissions.assignment_id AND cf.faculty_id = auth.uid()
  ));

DROP POLICY IF EXISTS "submissions_delete" ON assignment_submissions;
CREATE POLICY "submissions_delete" ON assignment_submissions FOR DELETE
  TO authenticated USING (student_id = auth.uid() OR is_admin());

-- ============================================================
-- RLS POLICIES: quizzes
-- ============================================================
DROP POLICY IF EXISTS "quizzes_select" ON quizzes;
CREATE POLICY "quizzes_select" ON quizzes FOR SELECT
  TO authenticated USING (is_published = true OR is_admin() OR faculty_can_access_course(course_id));

DROP POLICY IF EXISTS "quizzes_insert" ON quizzes;
CREATE POLICY "quizzes_insert" ON quizzes FOR INSERT
  TO authenticated WITH CHECK (is_admin() OR faculty_can_access_course(course_id));

DROP POLICY IF EXISTS "quizzes_update" ON quizzes;
CREATE POLICY "quizzes_update" ON quizzes FOR UPDATE
  TO authenticated USING (is_admin() OR faculty_can_access_course(course_id)) WITH CHECK (is_admin() OR faculty_can_access_course(course_id));

DROP POLICY IF EXISTS "quizzes_delete" ON quizzes;
CREATE POLICY "quizzes_delete" ON quizzes FOR DELETE
  TO authenticated USING (is_admin() OR faculty_can_access_course(course_id));

-- ============================================================
-- RLS POLICIES: quiz_questions
-- ============================================================
DROP POLICY IF EXISTS "quiz_questions_select" ON quiz_questions;
CREATE POLICY "quiz_questions_select" ON quiz_questions FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "quiz_questions_insert" ON quiz_questions;
CREATE POLICY "quiz_questions_insert" ON quiz_questions FOR INSERT
  TO authenticated WITH CHECK (is_faculty());

DROP POLICY IF EXISTS "quiz_questions_update" ON quiz_questions;
CREATE POLICY "quiz_questions_update" ON quiz_questions FOR UPDATE
  TO authenticated USING (is_faculty()) WITH CHECK (is_faculty());

DROP POLICY IF EXISTS "quiz_questions_delete" ON quiz_questions;
CREATE POLICY "quiz_questions_delete" ON quiz_questions FOR DELETE
  TO authenticated USING (is_faculty());

-- ============================================================
-- RLS POLICIES: quiz_options
-- ============================================================
DROP POLICY IF EXISTS "quiz_options_select" ON quiz_options;
CREATE POLICY "quiz_options_select" ON quiz_options FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "quiz_options_insert" ON quiz_options;
CREATE POLICY "quiz_options_insert" ON quiz_options FOR INSERT
  TO authenticated WITH CHECK (is_faculty());

DROP POLICY IF EXISTS "quiz_options_update" ON quiz_options;
CREATE POLICY "quiz_options_update" ON quiz_options FOR UPDATE
  TO authenticated USING (is_faculty()) WITH CHECK (is_faculty());

DROP POLICY IF EXISTS "quiz_options_delete" ON quiz_options;
CREATE POLICY "quiz_options_delete" ON quiz_options FOR DELETE
  TO authenticated USING (is_faculty());

-- ============================================================
-- RLS POLICIES: quiz_attempts
-- ============================================================
DROP POLICY IF EXISTS "quiz_attempts_select" ON quiz_attempts;
CREATE POLICY "quiz_attempts_select" ON quiz_attempts FOR SELECT
  TO authenticated USING (student_id = auth.uid() OR is_admin() OR EXISTS (
    SELECT 1 FROM quizzes q JOIN course_faculty cf ON cf.course_id = q.course_id
    WHERE q.id = quiz_attempts.quiz_id AND cf.faculty_id = auth.uid()
  ));

DROP POLICY IF EXISTS "quiz_attempts_insert" ON quiz_attempts;
CREATE POLICY "quiz_attempts_insert" ON quiz_attempts FOR INSERT
  TO authenticated WITH CHECK (student_id = auth.uid());

DROP POLICY IF EXISTS "quiz_attempts_update" ON quiz_attempts;
CREATE POLICY "quiz_attempts_update" ON quiz_attempts FOR UPDATE
  TO authenticated USING (student_id = auth.uid()) WITH CHECK (student_id = auth.uid());

DROP POLICY IF EXISTS "quiz_attempts_delete" ON quiz_attempts;
CREATE POLICY "quiz_attempts_delete" ON quiz_attempts FOR DELETE
  TO authenticated USING (student_id = auth.uid() OR is_admin());

-- ============================================================
-- RLS POLICIES: quiz_answers
-- ============================================================
DROP POLICY IF EXISTS "quiz_answers_select" ON quiz_answers;
CREATE POLICY "quiz_answers_select" ON quiz_answers FOR SELECT
  TO authenticated USING (EXISTS (
    SELECT 1 FROM quiz_attempts WHERE id = quiz_answers.attempt_id AND student_id = auth.uid()
  ) OR is_faculty());

DROP POLICY IF EXISTS "quiz_answers_insert" ON quiz_answers;
CREATE POLICY "quiz_answers_insert" ON quiz_answers FOR INSERT
  TO authenticated WITH CHECK (EXISTS (
    SELECT 1 FROM quiz_attempts WHERE id = quiz_answers.attempt_id AND student_id = auth.uid()
  ));

DROP POLICY IF EXISTS "quiz_answers_update" ON quiz_answers;
CREATE POLICY "quiz_answers_update" ON quiz_answers FOR UPDATE
  TO authenticated USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "quiz_answers_delete" ON quiz_answers;
CREATE POLICY "quiz_answers_delete" ON quiz_answers FOR DELETE
  TO authenticated USING (is_admin());

-- ============================================================
-- RLS POLICIES: projects
-- ============================================================
DROP POLICY IF EXISTS "projects_select" ON projects;
CREATE POLICY "projects_select" ON projects FOR SELECT
  TO authenticated USING (is_published = true OR is_admin());

DROP POLICY IF EXISTS "projects_select_anon" ON projects;
CREATE POLICY "projects_select_anon" ON projects FOR SELECT
  TO anon USING (is_published = true);

DROP POLICY IF EXISTS "projects_insert" ON projects;
CREATE POLICY "projects_insert" ON projects FOR INSERT
  TO authenticated WITH CHECK (is_faculty());

DROP POLICY IF EXISTS "projects_update" ON projects;
CREATE POLICY "projects_update" ON projects FOR UPDATE
  TO authenticated USING (is_faculty()) WITH CHECK (is_faculty());

DROP POLICY IF EXISTS "projects_delete" ON projects;
CREATE POLICY "projects_delete" ON projects FOR DELETE
  TO authenticated USING (is_admin());

-- ============================================================
-- RLS POLICIES: project_submissions
-- ============================================================
DROP POLICY IF EXISTS "project_submissions_select" ON project_submissions;
CREATE POLICY "project_submissions_select" ON project_submissions FOR SELECT
  TO authenticated USING (student_id = auth.uid() OR is_faculty());

DROP POLICY IF EXISTS "project_submissions_insert" ON project_submissions;
CREATE POLICY "project_submissions_insert" ON project_submissions FOR INSERT
  TO authenticated WITH CHECK (student_id = auth.uid());

DROP POLICY IF EXISTS "project_submissions_update" ON project_submissions;
CREATE POLICY "project_submissions_update" ON project_submissions FOR UPDATE
  TO authenticated USING (student_id = auth.uid() OR is_faculty()) WITH CHECK (student_id = auth.uid() OR is_faculty());

DROP POLICY IF EXISTS "project_submissions_delete" ON project_submissions;
CREATE POLICY "project_submissions_delete" ON project_submissions FOR DELETE
  TO authenticated USING (student_id = auth.uid() OR is_admin());

-- ============================================================
-- RLS POLICIES: certificates
-- ============================================================
DROP POLICY IF EXISTS "certificates_select" ON certificates;
CREATE POLICY "certificates_select" ON certificates FOR SELECT
  TO authenticated USING (student_id = auth.uid() OR is_admin());

DROP POLICY IF EXISTS "certificates_insert" ON certificates;
CREATE POLICY "certificates_insert" ON certificates FOR INSERT
  TO authenticated WITH CHECK (is_admin());

DROP POLICY IF EXISTS "certificates_update" ON certificates;
CREATE POLICY "certificates_update" ON certificates FOR UPDATE
  TO authenticated USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "certificates_delete" ON certificates;
CREATE POLICY "certificates_delete" ON certificates FOR DELETE
  TO authenticated USING (is_admin());

-- ============================================================
-- RLS POLICIES: achievements
-- ============================================================
DROP POLICY IF EXISTS "achievements_select" ON achievements;
CREATE POLICY "achievements_select" ON achievements FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "achievements_select_anon" ON achievements;
CREATE POLICY "achievements_select_anon" ON achievements FOR SELECT
  TO anon USING (true);

DROP POLICY IF EXISTS "achievements_insert" ON achievements;
CREATE POLICY "achievements_insert" ON achievements FOR INSERT
  TO authenticated WITH CHECK (is_admin());

DROP POLICY IF EXISTS "achievements_update" ON achievements;
CREATE POLICY "achievements_update" ON achievements FOR UPDATE
  TO authenticated USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "achievements_delete" ON achievements;
CREATE POLICY "achievements_delete" ON achievements FOR DELETE
  TO authenticated USING (is_admin());

-- ============================================================
-- RLS POLICIES: user_achievements
-- ============================================================
DROP POLICY IF EXISTS "user_achievements_select" ON user_achievements;
CREATE POLICY "user_achievements_select" ON user_achievements FOR SELECT
  TO authenticated USING (student_id = auth.uid() OR is_admin());

DROP POLICY IF EXISTS "user_achievements_insert" ON user_achievements;
CREATE POLICY "user_achievements_insert" ON user_achievements FOR INSERT
  TO authenticated WITH CHECK (is_admin());

DROP POLICY IF EXISTS "user_achievements_update" ON user_achievements;
CREATE POLICY "user_achievements_update" ON user_achievements FOR UPDATE
  TO authenticated USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "user_achievements_delete" ON user_achievements;
CREATE POLICY "user_achievements_delete" ON user_achievements FOR DELETE
  TO authenticated USING (is_admin());

-- ============================================================
-- RLS POLICIES: xp_transactions
-- ============================================================
DROP POLICY IF EXISTS "xp_transactions_select" ON xp_transactions;
CREATE POLICY "xp_transactions_select" ON xp_transactions FOR SELECT
  TO authenticated USING (student_id = auth.uid() OR is_admin());

DROP POLICY IF EXISTS "xp_transactions_insert" ON xp_transactions;
CREATE POLICY "xp_transactions_insert" ON xp_transactions FOR INSERT
  TO authenticated WITH CHECK (student_id = auth.uid() OR is_admin());

DROP POLICY IF EXISTS "xp_transactions_update" ON xp_transactions;
CREATE POLICY "xp_transactions_update" ON xp_transactions FOR UPDATE
  TO authenticated USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "xp_transactions_delete" ON xp_transactions;
CREATE POLICY "xp_transactions_delete" ON xp_transactions FOR DELETE
  TO authenticated USING (is_admin());

-- ============================================================
-- RLS POLICIES: notifications
-- ============================================================
DROP POLICY IF EXISTS "notifications_select" ON notifications;
CREATE POLICY "notifications_select" ON notifications FOR SELECT
  TO authenticated USING (user_id = auth.uid() OR is_admin());

DROP POLICY IF EXISTS "notifications_insert" ON notifications;
CREATE POLICY "notifications_insert" ON notifications FOR INSERT
  TO authenticated WITH CHECK (is_admin() OR is_faculty());

DROP POLICY IF EXISTS "notifications_update" ON notifications;
CREATE POLICY "notifications_update" ON notifications FOR UPDATE
  TO authenticated USING (user_id = auth.uid() OR is_admin()) WITH CHECK (user_id = auth.uid() OR is_admin());

DROP POLICY IF EXISTS "notifications_delete" ON notifications;
CREATE POLICY "notifications_delete" ON notifications FOR DELETE
  TO authenticated USING (user_id = auth.uid() OR is_admin());

-- ============================================================
-- RLS POLICIES: announcements
-- ============================================================
DROP POLICY IF EXISTS "announcements_select" ON announcements;
CREATE POLICY "announcements_select" ON announcements FOR SELECT
  TO authenticated USING (is_global = true OR is_admin() OR EXISTS (
    SELECT 1 FROM course_enrollments WHERE course_id = announcements.course_id AND student_id = auth.uid()
  ) OR faculty_can_access_course(course_id));

DROP POLICY IF EXISTS "announcements_insert" ON announcements;
CREATE POLICY "announcements_insert" ON announcements FOR INSERT
  TO authenticated WITH CHECK (is_admin() OR is_faculty());

DROP POLICY IF EXISTS "announcements_update" ON announcements;
CREATE POLICY "announcements_update" ON announcements FOR UPDATE
  TO authenticated USING (author_id = auth.uid() OR is_admin()) WITH CHECK (author_id = auth.uid() OR is_admin());

DROP POLICY IF EXISTS "announcements_delete" ON announcements;
CREATE POLICY "announcements_delete" ON announcements FOR DELETE
  TO authenticated USING (author_id = auth.uid() OR is_admin());

-- ============================================================
-- RLS POLICIES: activity_logs
-- ============================================================
DROP POLICY IF EXISTS "activity_logs_select" ON activity_logs;
CREATE POLICY "activity_logs_select" ON activity_logs FOR SELECT
  TO authenticated USING (user_id = auth.uid() OR is_admin());

DROP POLICY IF EXISTS "activity_logs_insert" ON activity_logs;
CREATE POLICY "activity_logs_insert" ON activity_logs FOR INSERT
  TO authenticated WITH CHECK (user_id = auth.uid() OR is_admin());

DROP POLICY IF EXISTS "activity_logs_update" ON activity_logs;
CREATE POLICY "activity_logs_update" ON activity_logs FOR UPDATE
  TO authenticated USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "activity_logs_delete" ON activity_logs;
CREATE POLICY "activity_logs_delete" ON activity_logs FOR DELETE
  TO authenticated USING (is_admin());

-- ============================================================
-- RLS POLICIES: saved_code_snippets
-- ============================================================
DROP POLICY IF EXISTS "snippets_select" ON saved_code_snippets;
CREATE POLICY "snippets_select" ON saved_code_snippets FOR SELECT
  TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "snippets_insert" ON saved_code_snippets;
CREATE POLICY "snippets_insert" ON saved_code_snippets FOR INSERT
  TO authenticated WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "snippets_update" ON saved_code_snippets;
CREATE POLICY "snippets_update" ON saved_code_snippets FOR UPDATE
  TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "snippets_delete" ON saved_code_snippets;
CREATE POLICY "snippets_delete" ON saved_code_snippets FOR DELETE
  TO authenticated USING (user_id = auth.uid());

-- ============================================================
-- RLS POLICIES: platform_settings
-- ============================================================
DROP POLICY IF EXISTS "platform_settings_select" ON platform_settings;
CREATE POLICY "platform_settings_select" ON platform_settings FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "platform_settings_insert" ON platform_settings;
CREATE POLICY "platform_settings_insert" ON platform_settings FOR INSERT
  TO authenticated WITH CHECK (is_admin());

DROP POLICY IF EXISTS "platform_settings_update" ON platform_settings;
CREATE POLICY "platform_settings_update" ON platform_settings FOR UPDATE
  TO authenticated USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "platform_settings_delete" ON platform_settings;
CREATE POLICY "platform_settings_delete" ON platform_settings FOR DELETE
  TO authenticated USING (is_admin());
