-- ============================================================
-- LIVE SESSIONS TABLE
-- For managing live Google Meet classes
-- ============================================================
CREATE TABLE IF NOT EXISTS live_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  chapter_id uuid REFERENCES chapters(id) ON DELETE SET NULL,
  lesson_id uuid REFERENCES lessons(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text,
  session_date timestamptz NOT NULL,
  duration_minutes integer NOT NULL DEFAULT 60,
  google_meet_url text,
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'live', 'completed', 'cancelled')),
  slides_unlocked boolean NOT NULL DEFAULT false,
  materials_unlocked boolean NOT NULL DEFAULT false,
  attendance_required boolean NOT NULL DEFAULT true,
  preparation_notes text,
  created_by uuid NOT NULL REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_live_sessions_course ON live_sessions(course_id);
CREATE INDEX IF NOT EXISTS idx_live_sessions_status ON live_sessions(status);
CREATE INDEX IF NOT EXISTS idx_live_sessions_date ON live_sessions(session_date);
CREATE INDEX IF NOT EXISTS idx_live_sessions_chapter ON live_sessions(chapter_id);
CREATE INDEX IF NOT EXISTS idx_live_sessions_lesson ON live_sessions(lesson_id);

DROP TRIGGER IF EXISTS update_live_sessions_updated_at ON live_sessions;
CREATE TRIGGER update_live_sessions_updated_at
  BEFORE UPDATE ON live_sessions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- SESSION ATTENDANCE TABLE
-- Tracks student attendance for live sessions
-- ============================================================
CREATE TABLE IF NOT EXISTS session_attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES live_sessions(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  attendance_status text NOT NULL DEFAULT 'registered' CHECK (attendance_status IN ('registered', 'attended', 'absent', 'excused')),
  joined_at timestamptz,
  marked_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(session_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_session_attendance_session ON session_attendance(session_id);
CREATE INDEX IF NOT EXISTS idx_session_attendance_student ON session_attendance(student_id);
CREATE INDEX IF NOT EXISTS idx_session_attendance_status ON session_attendance(attendance_status);

DROP TRIGGER IF EXISTS update_session_attendance_updated_at ON session_attendance;
CREATE TRIGGER update_session_attendance_updated_at
  BEFORE UPDATE ON session_attendance
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- SESSION RESOURCES TABLE
-- Materials linked to live sessions (slides, notes, practice questions)
-- ============================================================
CREATE TABLE IF NOT EXISTS session_resources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES live_sessions(id) ON DELETE CASCADE,
  title text NOT NULL,
  resource_type text NOT NULL CHECK (resource_type IN ('slides', 'notes', 'practice_questions', 'code_example', 'quiz', 'assignment', 'downloadable')),
  file_url text,
  external_url text,
  content text,
  is_locked boolean NOT NULL DEFAULT true,
  order_index integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_session_resources_session ON session_resources(session_id);
CREATE INDEX IF NOT EXISTS idx_session_resources_type ON session_resources(resource_type);

-- ============================================================
-- ENABLE RLS ON NEW TABLES
-- ============================================================
ALTER TABLE live_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_resources ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- HELPER FUNCTIONS FOR LIVE SESSIONACCESS
-- ============================================================
CREATE OR REPLACE FUNCTION student_can_access_session(p_session_id uuid)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM live_sessions ls
    JOIN course_enrollments ce ON ce.course_id = ls.course_id
    WHERE ls.id = p_session_id AND ce.student_id = auth.uid()
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION faculty_can_manage_session(p_session_id uuid)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM live_sessions ls
    JOIN course_faculty cf ON cf.course_id = ls.course_id
    WHERE ls.id = p_session_id AND cf.faculty_id = auth.uid()
  ) OR is_admin();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ============================================================
-- RLS POLICIES: live_sessions
-- ============================================================
-- Students can view sessions for enrolled courses
DROP POLICY IF EXISTS "live_sessions_select_student" ON live_sessions;
CREATE POLICY "live_sessions_select_student" ON live_sessions FOR SELECT
  TO authenticated USING (
    student_can_access_session(id) OR faculty_can_manage_session(id)
  );

-- Faculty and admin can insert sessions for their courses
DROP POLICY IF EXISTS "live_sessions_insert" ON live_sessions;
CREATE POLICY "live_sessions_insert" ON live_sessions FOR INSERT
  TO authenticated WITH CHECK (faculty_can_access_course(course_id));

-- Faculty and admin can update sessions for their courses
DROP POLICY IF EXISTS "live_sessions_update" ON live_sessions;
CREATE POLICY "live_sessions_update" ON live_sessions FOR UPDATE
  TO authenticated USING (faculty_can_manage_session(id)) WITH CHECK (faculty_can_manage_session(id));

-- Only admin can delete sessions
DROP POLICY IF EXISTS "live_sessions_delete" ON live_sessions;
CREATE POLICY "live_sessions_delete" ON live_sessions FOR DELETE
  TO authenticated USING (is_admin());

-- ============================================================
-- RLS POLICIES: session_attendance
-- ============================================================
-- Students can view their own attendance
DROP POLICY IF EXISTS "session_attendance_select" ON session_attendance;
CREATE POLICY "session_attendance_select" ON session_attendance FOR SELECT
  TO authenticated USING (
    student_id = auth.uid() 
    OR faculty_can_manage_session(session_id)
    OR is_admin()
  );

-- Students auto-register when viewing a session (via trigger or app logic)
DROP POLICY IF EXISTS "session_attendance_insert" ON session_attendance;
CREATE POLICY "session_attendance_insert" ON session_attendance FOR INSERT
  TO authenticated WITH CHECK (
    student_id = auth.uid() 
    OR faculty_can_manage_session(session_id)
    OR is_admin()
  );

-- Faculty and admin can update attendance for their sessions
DROP POLICY IF EXISTS "session_attendance_update" ON session_attendance;
CREATE POLICY "session_attendance_update" ON session_attendance FOR UPDATE
  TO authenticated USING (
    student_id = auth.uid()
    OR faculty_can_manage_session(session_id)
    OR is_admin()
  ) WITH CHECK (
    student_id = auth.uid()
    OR faculty_can_manage_session(session_id)
    OR is_admin()
  );

-- Only admin can delete attendance records
DROP POLICY IF EXISTS "session_attendance_delete" ON session_attendance;
CREATE POLICY "session_attendance_delete" ON session_attendance FOR DELETE
  TO authenticated USING (is_admin());

-- ============================================================
-- RLS POLICIES: session_resources
-- ============================================================
-- Students can view unlocked resources for enrolled courses
DROP POLICY IF EXISTS "session_resources_select" ON session_resources;
CREATE POLICY "session_resources_select" ON session_resources FOR SELECT
  TO authenticated USING (
    (is_locked = false AND student_can_access_session(session_id))
    OR faculty_can_manage_session(session_id)
    OR is_admin()
  );

-- Faculty and admin can manage resources
DROP POLICY IF EXISTS "session_resources_insert" ON session_resources;
CREATE POLICY "session_resources_insert" ON session_resources FOR INSERT
  TO authenticated WITH CHECK (faculty_can_manage_session(session_id));

DROP POLICY IF EXISTS "session_resources_update" ON session_resources;
CREATE POLICY "session_resources_update" ON session_resources FOR UPDATE
  TO authenticated USING (faculty_can_manage_session(session_id)) WITH CHECK (faculty_can_manage_session(session_id));

DROP POLICY IF EXISTS "session_resources_delete" ON session_resources;
CREATE POLICY "session_resources_delete" ON session_resources FOR DELETE
  TO authenticated USING (faculty_can_manage_session(session_id));