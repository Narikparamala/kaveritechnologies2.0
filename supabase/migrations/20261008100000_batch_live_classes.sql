-- Batch Live Classes: timetable → join → attendance → auto-unlock
-- Admin owns the batch timetable (batch_schedules, already exists). Faculty
-- schedule live_sessions inside the batch slot. Batch membership = auto
-- registration. Clicking Join auto-marks attendance; 'attended' auto-releases
-- the session's lesson via lesson_releases when the session unlocks it.

-- ============================================================
-- 1. live_sessions: batch scoping + unlock flag
-- ============================================================
ALTER TABLE public.live_sessions
  ADD COLUMN IF NOT EXISTS batch_id uuid REFERENCES public.batches(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS unlocks_lesson boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS live_sessions_batch_id_idx
  ON public.live_sessions (batch_id)
  WHERE batch_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS live_sessions_session_date_idx
  ON public.live_sessions (session_date);

-- ============================================================
-- 2. Helper: active batch membership (security definer so RLS
--    policies can use it without recursive checks)
-- ============================================================
CREATE OR REPLACE FUNCTION public.is_batch_student(p_batch_id uuid, p_student_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.batch_students bs
    WHERE bs.batch_id = p_batch_id
      AND bs.student_id = p_student_id
      AND bs.status = 'active'
  );
$function$;

-- ============================================================
-- 3. Faculty timetable: day view merging batch_schedules slot
--    occurrences + scheduled live_sessions across all of the
--    faculty's batches, with clash detection.
--    day_of_week uses the JS convention (0 = Sunday), which is
--    what BatchDetailView writes and matches extract(dow).
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_faculty_timetable(p_faculty_id uuid, p_from date, p_to date)
 RETURNS TABLE(item_date date, kind text, batch_id uuid, batch_name text, starts_at timestamptz, ends_at timestamptz, title text, session_id uuid, lesson_title text, unlocks_lesson boolean, clash boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
WITH faculty_batches AS (
  SELECT b.id, b.name
  FROM public.batches b
  WHERE b.id IN (SELECT bf.batch_id FROM public.batch_faculty bf WHERE bf.faculty_id = p_faculty_id)
    AND (p_faculty_id = (SELECT auth.uid()) OR public.is_admin())
),
slots AS (
  SELECT
    s.id AS item_key,
    (d + s.start_time)::timestamptz AS starts_at,
    (d + s.end_time)::timestamptz AS ends_at,
    d::date AS item_date,
    'slot'::text AS kind,
    s.batch_id,
    fb.name AS batch_name,
    coalesce(nullif(trim(s.topic), ''), 'Class slot') AS title,
    NULL::uuid AS session_id,
    NULL::text AS lesson_title,
    NULL::boolean AS unlocks_lesson
  FROM public.batch_schedules s
  JOIN faculty_batches fb ON fb.id = s.batch_id
  CROSS JOIN generate_series(p_from, p_to, interval '1 day') d
  WHERE s.is_active
    AND extract(dow from d) = s.day_of_week
),
sessions AS (
  SELECT
    ls.id AS item_key,
    ls.session_date AS starts_at,
    ls.session_date + (ls.duration_minutes || ' minutes')::interval AS ends_at,
    ls.session_date::date AS item_date,
    'session'::text AS kind,
    ls.batch_id,
    coalesce(fb.name, 'Course-wide') AS batch_name,
    ls.title,
    ls.id AS session_id,
    l.title AS lesson_title,
    ls.unlocks_lesson
  FROM public.live_sessions ls
  LEFT JOIN faculty_batches fb ON fb.id = ls.batch_id
  LEFT JOIN public.lessons l ON l.id = ls.lesson_id
  WHERE (ls.batch_id IN (SELECT id FROM faculty_batches) OR ls.created_by = p_faculty_id)
    AND ls.status <> 'cancelled'
    AND ls.session_date::date BETWEEN p_from AND p_to
),
all_items AS (
  SELECT * FROM slots
  UNION ALL
  SELECT * FROM sessions
)
SELECT
  ai.item_date, ai.kind, ai.batch_id, ai.batch_name, ai.starts_at, ai.ends_at,
  ai.title, ai.session_id, ai.lesson_title, ai.unlocks_lesson,
  (SELECT count(*) FROM all_items o
   WHERE o.item_key <> ai.item_key
     AND o.starts_at < ai.ends_at AND o.ends_at > ai.starts_at) > 0 AS clash
FROM all_items ai
ORDER BY ai.starts_at, ai.batch_name;
$function$;

-- ============================================================
-- 4. join_live_session: the student-facing Join button.
--    Validates membership + the join window (10 min before start
--    until the class ends), then auto-marks attendance. Returns
--    the Meet URL (null when the session has none).
-- ============================================================
CREATE OR REPLACE FUNCTION public.join_live_session(p_session_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_session public.live_sessions%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sign in to join the class.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_session FROM public.live_sessions WHERE id = p_session_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Class not found.' USING ERRCODE = 'P0002';
  END IF;
  IF v_session.status = 'cancelled' THEN
    RAISE EXCEPTION 'This class was cancelled.' USING ERRCODE = 'P0004';
  END IF;
  IF now() < v_session.session_date - interval '10 minutes' THEN
    RAISE EXCEPTION 'The class room opens 10 minutes before start.' USING ERRCODE = 'P0004';
  END IF;
  IF now() > v_session.session_date + (v_session.duration_minutes || ' minutes')::interval THEN
    RAISE EXCEPTION 'This class has already ended.' USING ERRCODE = 'P0004';
  END IF;

  IF v_session.batch_id IS NOT NULL THEN
    IF NOT public.is_batch_student(v_session.batch_id, v_uid) THEN
      RAISE EXCEPTION 'You are not in this batch.' USING ERRCODE = '42501';
    END IF;
  ELSE
    IF NOT EXISTS (
      SELECT 1 FROM public.course_enrollments ce
      WHERE ce.course_id = v_session.course_id
        AND ce.student_id = v_uid
        AND ce.access_status = 'active'
    ) THEN
      RAISE EXCEPTION 'Enroll in the course first.' USING ERRCODE = '42501';
    END IF;
  END IF;

  INSERT INTO public.session_attendance (session_id, student_id, attendance_status, joined_at)
  VALUES (p_session_id, v_uid, 'attended', now())
  ON CONFLICT (session_id, student_id) DO UPDATE
    SET attendance_status = 'attended',
        joined_at = coalesce(public.session_attendance.joined_at, now()),
        updated_at = now();

  RETURN v_session.google_meet_url;
END;
$function$;

-- ============================================================
-- 5. Trigger: 'attended' on a session that unlocks its lesson
--    auto-releases that lesson for the student.
-- ============================================================
CREATE OR REPLACE FUNCTION public.on_session_attendance_marked()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_lesson uuid;
  v_course uuid;
BEGIN
  IF NEW.attendance_status <> 'attended' THEN
    RETURN NEW;
  END IF;
  SELECT s.lesson_id, s.course_id INTO v_lesson, v_course
  FROM public.live_sessions s
  WHERE s.id = NEW.session_id AND s.unlocks_lesson AND s.lesson_id IS NOT NULL;
  IF v_lesson IS NULL THEN
    RETURN NEW;
  END IF;
  INSERT INTO public.lesson_releases (student_id, lesson_id, course_id, source, granted_by)
  VALUES (NEW.student_id, v_lesson, v_course, 'live_session', NEW.marked_by)
  ON CONFLICT (student_id, lesson_id) DO NOTHING;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS session_attendance_release_trigger ON public.session_attendance;
CREATE TRIGGER session_attendance_release_trigger
  AFTER INSERT OR UPDATE OF attendance_status ON public.session_attendance
  FOR EACH ROW EXECUTE FUNCTION public.on_session_attendance_marked();

-- ============================================================
-- 6. release_lesson_to_absentees: faculty one-click release for
--    batch (or enrolled) students who did not attend. Returns
--    the number of releases created.
-- ============================================================
CREATE OR REPLACE FUNCTION public.release_lesson_to_absentees(p_session_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_session public.live_sessions%ROWTYPE;
  v_count integer;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Sign in first.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_session FROM public.live_sessions WHERE id = p_session_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Class not found.' USING ERRCODE = 'P0002';
  END IF;
  IF NOT (public.is_admin() OR public.faculty_can_access_course(v_session.course_id)) THEN
    RAISE EXCEPTION 'Only faculty of this course can release to absentees.' USING ERRCODE = '42501';
  END IF;
  IF v_session.lesson_id IS NULL THEN
    RAISE EXCEPTION 'This session is not tied to a lesson.' USING ERRCODE = 'P0004';
  END IF;

  IF v_session.batch_id IS NOT NULL THEN
    WITH absentees AS (
      SELECT bs.student_id
      FROM public.batch_students bs
      WHERE bs.batch_id = v_session.batch_id
        AND bs.status = 'active'
        AND NOT EXISTS (
          SELECT 1 FROM public.session_attendance sa
          WHERE sa.session_id = p_session_id
            AND sa.student_id = bs.student_id
            AND sa.attendance_status = 'attended'
        )
    )
    INSERT INTO public.lesson_releases (student_id, lesson_id, course_id, source, granted_by)
    SELECT a.student_id, v_session.lesson_id, v_session.course_id, 'live_session', (SELECT auth.uid())
    FROM absentees a
    ON CONFLICT (student_id, lesson_id) DO NOTHING;
  ELSE
    WITH absentees AS (
      SELECT ce.student_id
      FROM public.course_enrollments ce
      WHERE ce.course_id = v_session.course_id
        AND ce.access_status = 'active'
        AND NOT EXISTS (
          SELECT 1 FROM public.session_attendance sa
          WHERE sa.session_id = p_session_id
            AND sa.student_id = ce.student_id
            AND sa.attendance_status = 'attended'
        )
    )
    INSERT INTO public.lesson_releases (student_id, lesson_id, course_id, source, granted_by)
    SELECT a.student_id, v_session.lesson_id, v_session.course_id, 'live_session', (SELECT auth.uid())
    FROM absentees a
    ON CONFLICT (student_id, lesson_id) DO NOTHING;
  END IF;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$function$;

-- ============================================================
-- 7. RLS: replace the wide-open MVP policies.
--    live_sessions: batch students read their batch's sessions,
--    enrolled students read course-wide sessions, faculty of the
--    course manage, admin all.
--    session_attendance: students read (and see) their own rows;
--    only staff write — students mark attendance exclusively
--    through the join_live_session security-definer RPC, so a
--    student cannot self-mark attendance outside the join window.
-- ============================================================
DROP POLICY IF EXISTS live_sessions_mvp_access ON public.live_sessions;
DROP POLICY IF EXISTS session_attendance_mvp_access ON public.session_attendance;

ALTER TABLE public.live_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_attendance ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS live_sessions_read ON public.live_sessions;
CREATE POLICY live_sessions_read ON public.live_sessions
  FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR public.faculty_can_access_course(course_id)
    OR (
      batch_id IS NULL
      AND EXISTS (
        SELECT 1 FROM public.course_enrollments ce
        WHERE ce.course_id = live_sessions.course_id
          AND ce.student_id = (SELECT auth.uid())
          AND ce.access_status = 'active'
      )
    )
    OR (
      batch_id IS NOT NULL
      AND public.is_batch_student(batch_id, (SELECT auth.uid()))
    )
  );

DROP POLICY IF EXISTS live_sessions_staff_insert ON public.live_sessions;
CREATE POLICY live_sessions_staff_insert ON public.live_sessions
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin() OR public.faculty_can_access_course(course_id));

DROP POLICY IF EXISTS live_sessions_staff_update ON public.live_sessions;
CREATE POLICY live_sessions_staff_update ON public.live_sessions
  FOR UPDATE TO authenticated
  USING (public.is_admin() OR public.faculty_can_access_course(course_id))
  WITH CHECK (public.is_admin() OR public.faculty_can_access_course(course_id));

DROP POLICY IF EXISTS live_sessions_staff_delete ON public.live_sessions;
CREATE POLICY live_sessions_staff_delete ON public.live_sessions
  FOR DELETE TO authenticated
  USING (public.is_admin() OR public.faculty_can_access_course(course_id));

DROP POLICY IF EXISTS session_attendance_read ON public.session_attendance;
CREATE POLICY session_attendance_read ON public.session_attendance
  FOR SELECT TO authenticated
  USING (
    student_id = (SELECT auth.uid())
    OR public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.live_sessions s
      WHERE s.id = session_id
        AND (public.is_admin() OR public.faculty_can_access_course(s.course_id))
    )
  );

DROP POLICY IF EXISTS session_attendance_staff_insert ON public.session_attendance;
CREATE POLICY session_attendance_staff_insert ON public.session_attendance
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.live_sessions s
      WHERE s.id = session_id
        AND (public.is_admin() OR public.faculty_can_access_course(s.course_id))
    )
  );

DROP POLICY IF EXISTS session_attendance_staff_update ON public.session_attendance;
CREATE POLICY session_attendance_staff_update ON public.session_attendance
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.live_sessions s
      WHERE s.id = session_id
        AND (public.is_admin() OR public.faculty_can_access_course(s.course_id))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.live_sessions s
      WHERE s.id = session_id
        AND (public.is_admin() OR public.faculty_can_access_course(s.course_id))
    )
  );

DROP POLICY IF EXISTS session_attendance_staff_delete ON public.session_attendance;
CREATE POLICY session_attendance_staff_delete ON public.session_attendance
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.live_sessions s
      WHERE s.id = session_id
        AND (public.is_admin() OR public.faculty_can_access_course(s.course_id))
    )
  );
