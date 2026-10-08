-- ============================================================
-- Lesson auto-release gating: only an ACTUAL student join marks
-- the lesson released. join_live_session is the only code path
-- that writes joined_at; manual attendance (faculty "Mark all
-- present", Present chips, admin attendance page) leaves
-- joined_at NULL and therefore no longer releases. Faculties who
-- want to grant the lesson to non-joiners use the explicit
-- "Release to absentees" action (release_lesson_to_absentees).
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
  -- Release only when the attendance row carries a real join
  -- timestamp (set exclusively by join_live_session).
  IF NEW.attendance_status <> 'attended' OR NEW.joined_at IS NULL THEN
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
