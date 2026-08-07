/*
# Fix Course Creation, Live Session RLS, and Add Course Deletion RPC

## Root Causes
1. SECURITY DEFINER functions have NO search_path set, causing silent failures on PostgreSQL 15+.
2. The auto_assign_course_faculty trigger fails silently, so course_faculty is never created,
   making faculty_can_access_course() return false for all subsequent operations.
3. courses_delete policy only allows is_admin().

## Fixes
1. Recreate all SECURITY DEFINER functions with SET search_path = public
2. Replace trigger approach with secure RPC: create_faculty_course(p_payload jsonb)
3. Add delete_course_with_content(course_id uuid) RPC
4. Fix courses_delete RLS to allow assigned faculty
*/

-- ============================================================
-- 1. Fix all SECURITY DEFINER functions with search_path = public
-- ============================================================

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
SELECT EXISTS (
  SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'
);
$function$;

CREATE OR REPLACE FUNCTION public.is_faculty()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
SELECT EXISTS (
  SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('faculty', 'super_admin')
);
$function$;

CREATE OR REPLACE FUNCTION public.faculty_can_access_course(p_course_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
SELECT EXISTS (
  SELECT 1 FROM course_faculty
  WHERE course_id = p_course_id AND faculty_id = auth.uid()
) OR public.is_admin();
$function$;

CREATE OR REPLACE FUNCTION public.faculty_can_manage_session(p_session_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
SELECT EXISTS (
  SELECT 1 FROM live_sessions ls
  JOIN course_faculty cf ON cf.course_id = ls.course_id
  WHERE ls.id = p_session_id AND cf.faculty_id = auth.uid()
) OR public.is_admin();
$function$;

CREATE OR REPLACE FUNCTION public.student_can_access_session(p_session_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
SELECT EXISTS (
  SELECT 1 FROM live_sessions ls
  JOIN course_enrollments ce ON ce.course_id = ls.course_id
  WHERE ls.id = p_session_id
  AND ce.student_id = auth.uid()
  AND (ce.access_status = 'active' OR ce.access_status IS NULL)
);
$function$;

-- ============================================================
-- 2. Secure RPC: create_faculty_course
-- ============================================================
CREATE OR REPLACE FUNCTION public.create_faculty_course(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_role text;
  v_course_id uuid;
  v_title text := p_payload->>'title';
  v_slug text := p_payload->>'slug';
  v_short_desc text := COALESCE(p_payload->>'short_description', NULL);
  v_desc text := COALESCE(p_payload->>'description', NULL);
  v_thumb text := COALESCE(p_payload->>'thumbnail_url', NULL);
  v_diff text := COALESCE(p_payload->>'difficulty', 'beginner');
  v_cat text := COALESCE(p_payload->>'category', 'python');
  v_lang text := COALESCE(p_payload->>'language', 'English');
  v_dur int := COALESCE((p_payload->>'duration_hours')::int, 0);
  v_is_published boolean := COALESCE((p_payload->>'is_published')::boolean, false);
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT role INTO v_role FROM profiles WHERE id = v_user_id;
  IF v_role IS NULL THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;

  IF v_role NOT IN ('faculty', 'super_admin') THEN
    RAISE EXCEPTION 'Only faculty or admin can create courses';
  END IF;

  IF v_role = 'faculty' AND v_is_published = true THEN
    v_is_published := false;
  END IF;

  IF v_title IS NULL OR trim(v_title) = '' THEN
    RAISE EXCEPTION 'Title is required';
  END IF;
  IF v_slug IS NULL OR trim(v_slug) = '' THEN
    RAISE EXCEPTION 'Slug is required';
  END IF;

  INSERT INTO courses (
    title, slug, short_description, description, thumbnail_url,
    difficulty, category, language, duration_hours,
    is_published, is_featured, created_by
  ) VALUES (
    v_title, v_slug, v_short_desc, v_desc, v_thumb,
    v_diff, v_cat, v_lang, v_dur,
    v_is_published, false, v_user_id
  ) RETURNING id INTO v_course_id;

  INSERT INTO course_faculty (course_id, faculty_id)
  VALUES (v_course_id, v_user_id)
  ON CONFLICT (course_id, faculty_id) DO NOTHING;

  RETURN jsonb_build_object(
    'id', v_course_id,
    'title', v_title,
    'slug', v_slug,
    'created_by', v_user_id,
    'is_published', v_is_published
  );
END;
$function$;

-- ============================================================
-- 3. Secure RPC: delete_course_with_content
-- ============================================================
CREATE OR REPLACE FUNCTION public.delete_course_with_content(p_course_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_role text;
  v_is_assigned boolean;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT role INTO v_role FROM profiles WHERE id = v_user_id;
  IF v_role IS NULL THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;

  IF v_role = 'super_admin' THEN
    v_is_assigned := true;
  ELSE
    SELECT EXISTS (
      SELECT 1 FROM course_faculty
      WHERE course_id = p_course_id AND faculty_id = v_user_id
    ) INTO v_is_assigned;
  END IF;

  IF NOT v_is_assigned THEN
    RAISE EXCEPTION 'You are not authorized to delete this course';
  END IF;

  -- Delete dependent content in safe order
  DELETE FROM quiz_answers WHERE attempt_id IN (
    SELECT id FROM quiz_attempts WHERE quiz_id IN (
      SELECT id FROM quizzes WHERE course_id = p_course_id
    )
  );
  DELETE FROM quiz_attempts WHERE quiz_id IN (
    SELECT id FROM quizzes WHERE course_id = p_course_id
  );
  DELETE FROM quiz_questions WHERE quiz_id IN (
    SELECT id FROM quizzes WHERE course_id = p_course_id
  );
  DELETE FROM quizzes WHERE course_id = p_course_id;

  DELETE FROM assignment_test_cases WHERE assignment_id IN (
    SELECT id FROM assignments WHERE course_id = p_course_id
  );
  DELETE FROM assignment_submissions WHERE assignment_id IN (
    SELECT id FROM assignments WHERE course_id = p_course_id
  );
  DELETE FROM assignments WHERE course_id = p_course_id;

  DELETE FROM project_submissions WHERE project_id IN (
    SELECT id FROM projects WHERE course_id = p_course_id
  );
  DELETE FROM projects WHERE course_id = p_course_id;

  DELETE FROM lesson_practice_questions WHERE lesson_id IN (
    SELECT id FROM lessons WHERE course_id = p_course_id
  );
  DELETE FROM lesson_subtopics WHERE topic_id IN (
    SELECT id FROM lesson_topics WHERE lesson_id IN (
      SELECT id FROM lessons WHERE course_id = p_course_id
    )
  );
  DELETE FROM lesson_topics WHERE lesson_id IN (
    SELECT id FROM lessons WHERE course_id = p_course_id
  );
  DELETE FROM lesson_resources WHERE lesson_id IN (
    SELECT id FROM lessons WHERE course_id = p_course_id
  );
  DELETE FROM lesson_progress WHERE course_id = p_course_id;
  DELETE FROM lessons WHERE course_id = p_course_id;

  DELETE FROM chapters WHERE course_id = p_course_id;

  DELETE FROM session_attendance WHERE session_id IN (
    SELECT id FROM live_sessions WHERE course_id = p_course_id
  );
  DELETE FROM live_sessions WHERE course_id = p_course_id;

  DELETE FROM announcements WHERE course_id = p_course_id;
  DELETE FROM course_enrollments WHERE course_id = p_course_id;
  DELETE FROM course_faculty WHERE course_id = p_course_id;
  DELETE FROM courses WHERE id = p_course_id;

  RETURN jsonb_build_object('success', true, 'course_id', p_course_id);
END;
$function$;

-- ============================================================
-- 4. Fix courses_delete RLS
-- ============================================================
DROP POLICY IF EXISTS "courses_delete" ON courses;
CREATE POLICY "courses_delete" ON courses FOR DELETE
  TO authenticated USING (
    public.is_admin()
    OR public.faculty_can_access_course(id)
  );

-- ============================================================
-- 5. Drop old trigger
-- ============================================================
DROP TRIGGER IF EXISTS trigger_auto_assign_course_faculty ON courses;
DROP FUNCTION IF EXISTS public.auto_assign_course_faculty() CASCADE;

-- ============================================================
-- 6. Grant execute on RPCs to authenticated only
-- ============================================================
REVOKE EXECUTE ON FUNCTION public.create_faculty_course(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_faculty_course(jsonb) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.delete_course_with_content(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_course_with_content(uuid) TO authenticated;
