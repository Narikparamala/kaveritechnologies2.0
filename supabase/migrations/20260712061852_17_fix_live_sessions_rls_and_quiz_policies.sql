-- ================================================================
-- Fix live_sessions RLS: replace SECURITY DEFINER function calls
-- with inline subqueries so auth.uid() is always in caller context
-- ================================================================

DROP POLICY IF EXISTS "live_sessions_insert" ON live_sessions;
DROP POLICY IF EXISTS "live_sessions_select_student" ON live_sessions;
DROP POLICY IF EXISTS "live_sessions_update" ON live_sessions;
DROP POLICY IF EXISTS "live_sessions_delete" ON live_sessions;

-- SELECT: enrolled students OR faculty assigned to the course OR admin
CREATE POLICY "live_sessions_select" ON live_sessions
  FOR SELECT TO authenticated
  USING (
    is_admin()
    OR EXISTS (
      SELECT 1 FROM course_faculty cf
      WHERE cf.course_id = live_sessions.course_id
        AND cf.faculty_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM course_enrollments ce
      WHERE ce.course_id = live_sessions.course_id
        AND ce.student_id = auth.uid()
        AND ce.access_status = 'active'
    )
  );

-- INSERT: admin OR faculty assigned to the course OR any faculty who sets themselves as created_by
CREATE POLICY "live_sessions_insert" ON live_sessions
  FOR INSERT TO authenticated
  WITH CHECK (
    is_admin()
    OR EXISTS (
      SELECT 1 FROM course_faculty cf
      WHERE cf.course_id = live_sessions.course_id
        AND cf.faculty_id = auth.uid()
    )
    OR (
      live_sessions.created_by = auth.uid()
      AND EXISTS (
        SELECT 1 FROM profiles p
        WHERE p.id = auth.uid()
          AND p.role IN ('faculty', 'super_admin')
      )
    )
  );

-- UPDATE: admin OR faculty assigned to the course
CREATE POLICY "live_sessions_update" ON live_sessions
  FOR UPDATE TO authenticated
  USING (
    is_admin()
    OR live_sessions.created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM course_faculty cf
      WHERE cf.course_id = live_sessions.course_id
        AND cf.faculty_id = auth.uid()
    )
  )
  WITH CHECK (
    is_admin()
    OR live_sessions.created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM course_faculty cf
      WHERE cf.course_id = live_sessions.course_id
        AND cf.faculty_id = auth.uid()
    )
  );

-- DELETE: admin OR session creator OR faculty assigned to course
CREATE POLICY "live_sessions_delete" ON live_sessions
  FOR DELETE TO authenticated
  USING (
    is_admin()
    OR live_sessions.created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM course_faculty cf
      WHERE cf.course_id = live_sessions.course_id
        AND cf.faculty_id = auth.uid()
    )
  );

-- ================================================================
-- Fix session_attendance RLS if table exists
-- ================================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'session_attendance' AND table_schema = 'public') THEN
    -- Drop existing policies
    DROP POLICY IF EXISTS "session_attendance_select" ON session_attendance;
    DROP POLICY IF EXISTS "session_attendance_insert" ON session_attendance;
    DROP POLICY IF EXISTS "session_attendance_update" ON session_attendance;
    DROP POLICY IF EXISTS "session_attendance_delete" ON session_attendance;

    -- Recreate with inline subqueries
    EXECUTE $pol$
      CREATE POLICY "session_attendance_select" ON session_attendance
        FOR SELECT TO authenticated
        USING (
          student_id = auth.uid()
          OR is_admin()
          OR EXISTS (
            SELECT 1 FROM live_sessions ls
            JOIN course_faculty cf ON cf.course_id = ls.course_id
            WHERE ls.id = session_attendance.session_id
              AND cf.faculty_id = auth.uid()
          )
        )
    $pol$;

    EXECUTE $pol$
      CREATE POLICY "session_attendance_insert" ON session_attendance
        FOR INSERT TO authenticated
        WITH CHECK (
          student_id = auth.uid()
          OR is_admin()
          OR EXISTS (
            SELECT 1 FROM live_sessions ls
            JOIN course_faculty cf ON cf.course_id = ls.course_id
            WHERE ls.id = session_attendance.session_id
              AND cf.faculty_id = auth.uid()
          )
        )
    $pol$;

    EXECUTE $pol$
      CREATE POLICY "session_attendance_update" ON session_attendance
        FOR UPDATE TO authenticated
        USING (
          is_admin()
          OR EXISTS (
            SELECT 1 FROM live_sessions ls
            JOIN course_faculty cf ON cf.course_id = ls.course_id
            WHERE ls.id = session_attendance.session_id
              AND cf.faculty_id = auth.uid()
          )
        )
        WITH CHECK (
          is_admin()
          OR EXISTS (
            SELECT 1 FROM live_sessions ls
            JOIN course_faculty cf ON cf.course_id = ls.course_id
            WHERE ls.id = session_attendance.session_id
              AND cf.faculty_id = auth.uid()
          )
        )
    $pol$;

    EXECUTE $pol$
      CREATE POLICY "session_attendance_delete" ON session_attendance
        FOR DELETE TO authenticated
        USING (
          is_admin()
          OR EXISTS (
            SELECT 1 FROM live_sessions ls
            JOIN course_faculty cf ON cf.course_id = ls.course_id
            WHERE ls.id = session_attendance.session_id
              AND cf.faculty_id = auth.uid()
          )
        )
    $pol$;
  END IF;
END;
$$;

-- ================================================================
-- Google Meet support: add columns to live_sessions
-- ================================================================

ALTER TABLE live_sessions
  ADD COLUMN IF NOT EXISTS calendar_event_id text,
  ADD COLUMN IF NOT EXISTS organizer_email text,
  ADD COLUMN IF NOT EXISTS meeting_id text;

-- ================================================================
-- Faculty Google OAuth connections table
-- ================================================================

CREATE TABLE IF NOT EXISTS faculty_google_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  faculty_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  google_email text NOT NULL,
  access_token text NOT NULL,
  refresh_token text NOT NULL,
  token_expiry timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (faculty_id)
);

ALTER TABLE faculty_google_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fgc_select" ON faculty_google_connections
  FOR SELECT TO authenticated
  USING (faculty_id = auth.uid() OR is_admin());

CREATE POLICY "fgc_insert" ON faculty_google_connections
  FOR INSERT TO authenticated
  WITH CHECK (faculty_id = auth.uid() OR is_admin());

CREATE POLICY "fgc_update" ON faculty_google_connections
  FOR UPDATE TO authenticated
  USING (faculty_id = auth.uid() OR is_admin())
  WITH CHECK (faculty_id = auth.uid() OR is_admin());

CREATE POLICY "fgc_delete" ON faculty_google_connections
  FOR DELETE TO authenticated
  USING (faculty_id = auth.uid() OR is_admin());
