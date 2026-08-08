/*
  Kaveri Academy MVP: persistent Google Calendar connections and attendance.

  Google OAuth tokens are server-only. Browser API roles receive no privileges
  on faculty_google_connections; only Edge Functions using the service role use it.
*/

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS public.faculty_google_connections (
  faculty_id uuid PRIMARY KEY,
  google_email text NOT NULL,
  access_token text NOT NULL,
  refresh_token text,
  token_expiry timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.faculty_google_connections
  ADD COLUMN IF NOT EXISTS google_email text,
  ADD COLUMN IF NOT EXISTS access_token text,
  ADD COLUMN IF NOT EXISTS refresh_token text,
  ADD COLUMN IF NOT EXISTS token_expiry timestamptz,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS idx_faculty_google_connections_faculty
  ON public.faculty_google_connections(faculty_id);

ALTER TABLE public.faculty_google_connections ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.faculty_google_connections FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS public.session_attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.live_sessions(id) ON DELETE CASCADE,
  student_id uuid NOT NULL,
  attendance_status text NOT NULL DEFAULT 'registered'
    CHECK (attendance_status IN ('registered', 'attended', 'absent', 'excused')),
  joined_at timestamptz,
  marked_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_session_attendance_session
  ON public.session_attendance(session_id);
CREATE INDEX IF NOT EXISTS idx_session_attendance_student
  ON public.session_attendance(student_id);

ALTER TABLE public.session_attendance ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS session_attendance_mvp_access ON public.session_attendance;
CREATE POLICY session_attendance_mvp_access
  ON public.session_attendance
  FOR ALL TO anon, authenticated
  USING (true)
  WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.session_attendance TO anon, authenticated;

-- Add every enrolled student to every session for that course.
INSERT INTO public.session_attendance (session_id, student_id)
SELECT ls.id, ce.student_id
FROM public.live_sessions ls
JOIN public.course_enrollments ce ON ce.course_id = ls.course_id
ON CONFLICT (session_id, student_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.seed_attendance_for_live_session()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.session_attendance (session_id, student_id)
  SELECT NEW.id, ce.student_id
  FROM public.course_enrollments ce
  WHERE ce.course_id = NEW.course_id
  ON CONFLICT (session_id, student_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS seed_attendance_after_live_session ON public.live_sessions;
CREATE TRIGGER seed_attendance_after_live_session
  AFTER INSERT ON public.live_sessions
  FOR EACH ROW EXECUTE FUNCTION public.seed_attendance_for_live_session();

CREATE OR REPLACE FUNCTION public.seed_attendance_for_course_enrollment()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.session_attendance (session_id, student_id)
  SELECT ls.id, NEW.student_id
  FROM public.live_sessions ls
  WHERE ls.course_id = NEW.course_id
  ON CONFLICT (session_id, student_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS seed_attendance_after_enrollment ON public.course_enrollments;
CREATE TRIGGER seed_attendance_after_enrollment
  AFTER INSERT OR UPDATE OF course_id, student_id ON public.course_enrollments
  FOR EACH ROW EXECUTE FUNCTION public.seed_attendance_for_course_enrollment();

NOTIFY pgrst, 'reload schema';
