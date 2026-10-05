-- Mini-project concepts + course-project progression gates.
--
-- 1. coding_vscode_assignments gains:
--      concepts           text[]  - the concepts a project requires (faculty decides; the AI only suggests)
--      prerequisite_mode  text    - 'none' (default, always available) or 'all_course_items'
--                                   (unlocks only when every published course item is done)
-- 2. course_items_remaining(course, student): the same "items left" definition the
--    student course sidebar shows — lessons completed + lesson quizzes completed +
--    chapter quizzes passed + coding questions solved + lesson assignments submitted
--    (non-draft). Used for gate reasons and the sidebar remaining counter.
-- 3. mini_project_unlocked(assignment, student): true unless the assignment requires
--    all course items and every linked course still has items remaining.
-- 4. get_course_project_steps(course): one row per project step in a course —
--    batch-released mini projects (with the student's verified state) plus course
--    projects — including lock state + reason. Self-gated like get_student_course_plan.
-- 5. Student SELECT policies on coding_vscode_assignments / coding_vscode_test_cases
--    are extended so a gated-and-locked mini project is hidden from the REST API
--    (same pattern as locked lessons); the RPC still lists it as a locked step.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS + CREATE OR REPLACE + DROP POLICY IF EXISTS.

-- ============================================================
-- 1. Columns
-- ============================================================
ALTER TABLE public.coding_vscode_assignments
  ADD COLUMN IF NOT EXISTS concepts text[] NOT NULL DEFAULT '{}';

ALTER TABLE public.coding_vscode_assignments
  ADD COLUMN IF NOT EXISTS prerequisite_mode text NOT NULL DEFAULT 'none';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'coding_vscode_assignments_prerequisite_mode_check'
      AND conrelid = 'public.coding_vscode_assignments'::regclass
  ) THEN
    ALTER TABLE public.coding_vscode_assignments
      ADD CONSTRAINT coding_vscode_assignments_prerequisite_mode_check
      CHECK (prerequisite_mode IN ('none', 'all_course_items'));
  END IF;
END $$;

-- ============================================================
-- 2. course_items_remaining(course, student)
-- ============================================================
CREATE OR REPLACE FUNCTION public.course_items_remaining(p_course_id uuid, p_student_id uuid)
RETURNS integer
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT COALESCE(
    -- Lessons not completed
    (SELECT count(*)
       FROM public.lessons l
       JOIN public.chapters c ON c.id = l.chapter_id
       LEFT JOIN public.lesson_progress lp
         ON lp.lesson_id = l.id AND lp.student_id = p_student_id AND lp.completed
      WHERE l.course_id = p_course_id AND l.is_published AND c.is_published AND lp.id IS NULL)
    -- Lesson-scoped quizzes not completed
    + (SELECT count(*)
         FROM public.quizzes q
         JOIN public.lessons l ON l.id = q.lesson_id
         JOIN public.chapters c ON c.id = l.chapter_id
         LEFT JOIN public.quiz_attempts qa
           ON qa.quiz_id = q.id AND qa.student_id = p_student_id AND qa.completed_at IS NOT NULL
        WHERE l.course_id = p_course_id AND l.is_published AND c.is_published
          AND q.is_published AND qa.id IS NULL)
    -- Chapter-scoped quizzes not passed
    + (SELECT count(*)
         FROM public.quizzes q
         JOIN public.chapters c ON c.id = q.chapter_id
         LEFT JOIN public.quiz_attempts qa
           ON qa.quiz_id = q.id AND qa.student_id = p_student_id AND qa.passed
        WHERE c.course_id = p_course_id AND c.is_published
          AND q.is_published AND q.chapter_id IS NOT NULL AND q.lesson_id IS NULL
          AND qa.id IS NULL)
    -- Coding questions (lesson- or chapter-scoped) not solved
    + (SELECT count(*)
         FROM public.coding_questions cq
         LEFT JOIN public.lessons l ON l.id = cq.lesson_id
         LEFT JOIN public.chapters c ON c.id = cq.chapter_id
         LEFT JOIN public.coding_question_attempts ca
           ON ca.question_id = cq.id AND ca.student_id = p_student_id AND ca.first_solved_at IS NOT NULL
        WHERE cq.is_published AND ca.id IS NULL
          AND ((cq.lesson_id IS NOT NULL AND l.is_published AND l.course_id = p_course_id)
            OR (cq.lesson_id IS NULL AND cq.chapter_id IS NOT NULL AND c.is_published AND c.course_id = p_course_id)))
    -- Lesson assignments not submitted (a draft does not count)
    + (SELECT count(*)
         FROM public.assignments a
         JOIN public.lessons l ON l.id = a.lesson_id
         JOIN public.chapters c ON c.id = l.chapter_id
         LEFT JOIN public.assignment_submissions s
           ON s.assignment_id = a.id AND s.student_id = p_student_id AND s.status <> 'draft'
        WHERE l.course_id = p_course_id AND l.is_published AND c.is_published
          AND a.is_published AND s.id IS NULL),
    0);
$function$;

REVOKE ALL ON FUNCTION public.course_items_remaining(uuid, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.course_items_remaining(uuid, uuid) TO authenticated;

-- ============================================================
-- 3. mini_project_unlocked(assignment, student)
-- ============================================================
CREATE OR REPLACE FUNCTION public.mini_project_unlocked(p_assignment_id uuid, p_student_id uuid DEFAULT NULL::uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_uid uuid := COALESCE(p_student_id, auth.uid());
  v_mode text;
  v_course uuid;
BEGIN
  IF v_uid IS NULL THEN
    RETURN true;
  END IF;

  SELECT a.prerequisite_mode INTO v_mode
  FROM public.coding_vscode_assignments a
  WHERE a.id = p_assignment_id;

  IF v_mode IS DISTINCT FROM 'all_course_items' THEN
    RETURN true;
  END IF;

  -- Unlocked when ANY course this project is linked to has zero items remaining.
  SELECT b.course_id INTO v_course
  FROM public.coding_vscode_assignment_batches cab
  JOIN public.batches b ON b.id = cab.batch_id
  WHERE cab.assignment_id = p_assignment_id
    AND b.course_id IS NOT NULL
    AND public.course_items_remaining(b.course_id, v_uid) = 0
  LIMIT 1;

  RETURN v_course IS NOT NULL;
END;
$function$;

REVOKE ALL ON FUNCTION public.mini_project_unlocked(uuid, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.mini_project_unlocked(uuid, uuid) TO authenticated;

-- ============================================================
-- 4. get_course_project_steps(course, student)
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_course_project_steps(p_course_id uuid, p_student_id uuid DEFAULT NULL::uuid)
RETURNS TABLE(
  kind text,
  ref_id uuid,
  title text,
  meta text,
  concepts text[],
  state text,
  unlocked boolean,
  reason text,
  remaining integer
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_uid uuid := COALESCE(p_student_id, auth.uid());
  v_caller uuid := auth.uid();
  v_staff boolean;
  v_remaining integer;
BEGIN
  IF v_caller IS NULL THEN
    RETURN;
  END IF;

  v_staff := public.is_admin() OR public.faculty_can_access_course(p_course_id);

  IF p_student_id IS NOT NULL AND p_student_id <> v_caller THEN
    IF NOT v_staff THEN
      RAISE EXCEPTION 'Not authorized to view this student''s project steps.' USING errcode = '42501';
    END IF;
  ELSIF NOT v_staff THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.course_enrollments ce
      WHERE ce.course_id = p_course_id AND ce.student_id = v_caller AND ce.access_status = 'active'
    ) THEN
      RETURN;
    END IF;
  END IF;

  v_remaining := public.course_items_remaining(p_course_id, v_uid);

  RETURN QUERY
  -- Mini projects released to this student through a batch of this course.
  SELECT
    'mini'::text,
    a.id,
    a.title,
    COALESCE(a.marks::text || ' marks', ''),
    COALESCE(a.concepts, '{}'::text[]),
    CASE
      WHEN EXISTS (
        SELECT 1 FROM public.coding_vscode_submissions s
        WHERE s.assignment_key = a.assignment_key
          AND s.student_id = v_uid
          AND s.verification_status = 'verified'
          AND s.verified_passed = s.verified_total
      ) THEN 'completed'
      ELSE 'todo'
    END,
    CASE WHEN v_staff OR v_remaining = 0 OR a.prerequisite_mode IS DISTINCT FROM 'all_course_items'
      THEN true ELSE false END,
    CASE WHEN v_staff OR v_remaining = 0 OR a.prerequisite_mode IS DISTINCT FROM 'all_course_items'
      THEN ''
      ELSE 'Complete all course items to unlock — ' || v_remaining || ' remaining' END,
    v_remaining
  FROM public.coding_vscode_assignments a
  WHERE a.is_published
    AND EXISTS (
      SELECT 1
      FROM public.coding_vscode_assignment_batches cab
      JOIN public.batches b ON b.id = cab.batch_id
      LEFT JOIN public.batch_students bs
        ON bs.batch_id = cab.batch_id AND bs.student_id = v_uid AND bs.status = 'active'
      LEFT JOIN public.coding_vscode_student_assignment_access pa
        ON pa.student_id = v_uid AND pa.assignment_id = cab.assignment_id AND pa.batch_id = cab.batch_id
      WHERE cab.assignment_id = a.id
        AND b.course_id = p_course_id
        AND b.status = 'active'
        AND (v_staff OR ((cab.is_permanently_released = true OR pa.id IS NOT NULL) AND bs.id IS NOT NULL))
    )

  UNION ALL

  -- Course projects (faculty-built), with the student's submission state.
  SELECT
    'project'::text,
    p.id,
    p.title,
    COALESCE(p.difficulty, '') ||
      CASE WHEN p.estimated_hours IS NOT NULL THEN ' · ' || p.estimated_hours || 'h' ELSE '' END,
    COALESCE(p.tech_tags, '{}'::text[]),
    CASE COALESCE((
      SELECT ps.status FROM public.project_submissions ps
      WHERE ps.project_id = p.id AND ps.student_id = v_uid
      ORDER BY ps.submitted_at DESC
      LIMIT 1
    ), '')
      WHEN 'approved' THEN 'completed'
      WHEN 'submitted' THEN 'in_review'
      WHEN 'reviewed' THEN 'in_review'
      ELSE 'todo'
    END,
    true,
    '',
    v_remaining
  FROM public.projects p
  WHERE p.is_published AND p.course_id = p_course_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_course_project_steps(uuid, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_course_project_steps(uuid, uuid) TO authenticated;

-- ============================================================
-- 5. RLS: gated + locked mini projects are invisible over REST
-- ============================================================
DROP POLICY IF EXISTS vscode_assignments_student_read_published ON public.coding_vscode_assignments;
CREATE POLICY vscode_assignments_student_read_published
ON public.coding_vscode_assignments
FOR SELECT TO authenticated
USING (
  is_published = true
  AND public.mini_project_unlocked(id, auth.uid())
  AND EXISTS (
    SELECT 1
    FROM public.coding_vscode_assignment_batches cab
    JOIN public.batch_students bs ON bs.batch_id = cab.batch_id
    JOIN public.batches b ON b.id = cab.batch_id
    LEFT JOIN public.coding_vscode_student_assignment_access pa
      ON pa.student_id = auth.uid()
      AND pa.assignment_id = cab.assignment_id
      AND pa.batch_id = cab.batch_id
    WHERE cab.assignment_id = coding_vscode_assignments.id
      AND bs.student_id = auth.uid()
      AND bs.status = 'active'
      AND b.status = 'active'
      AND (cab.is_permanently_released = true OR pa.id IS NOT NULL)
  )
);

DROP POLICY IF EXISTS vscode_test_cases_student_visible ON public.coding_vscode_test_cases;
CREATE POLICY vscode_test_cases_student_visible
ON public.coding_vscode_test_cases
FOR SELECT TO authenticated
USING (
  is_hidden = false
  AND EXISTS (
    SELECT 1
    FROM public.coding_vscode_assignments a
    JOIN public.coding_vscode_assignment_batches cab ON cab.assignment_id = a.id
    JOIN public.batch_students bs ON bs.batch_id = cab.batch_id
    JOIN public.batches b ON b.id = cab.batch_id
    LEFT JOIN public.coding_vscode_student_assignment_access pa
      ON pa.student_id = auth.uid()
      AND pa.assignment_id = cab.assignment_id
      AND pa.batch_id = cab.batch_id
    WHERE a.id = coding_vscode_test_cases.assignment_id
      AND a.is_published = true
      AND public.mini_project_unlocked(a.id, auth.uid())
      AND bs.student_id = auth.uid()
      AND bs.status = 'active'
      AND b.status = 'active'
      AND (cab.is_permanently_released = true OR pa.id IS NOT NULL)
  )
);
