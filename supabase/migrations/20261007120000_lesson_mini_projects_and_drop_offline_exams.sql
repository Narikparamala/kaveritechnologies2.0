-- ============================================================================
-- 20261007120000 — Lesson-attached mini projects + Offline Exams removal
-- ============================================================================
-- 1. coding_vscode_assignments gains lesson_id + lesson_order_index so a mini
--    project can attach to a lesson (same attach pattern as coding_questions).
-- 2. get_student_course_plan: lesson activities gain a 'mini' union entry
--    (sort 05, after assignment, before practice) — completed when the student
--    has a verified submission with all verified tests passing.
-- 3. course_items_remaining: lesson-attached published minis without a
--    completed verified submission count toward the course gate, so
--    all_course_items prerequisites (incl. course projects) require them too.
-- 4. RLS: lesson-attached minis become readable by actively-enrolled students
--    of the parent course (batch-release path stays unchanged — OR-joined).
-- 5. Offline Exams concept removed entirely: triggers, functions and the three
--    tables are dropped (verified 0 rows before writing this migration).
--
-- Idempotent: IF EXISTS guards + CREATE OR REPLACE.
-- ============================================================================

-- ============================================================
-- 1. Columns + keys
-- ============================================================
ALTER TABLE public.coding_vscode_assignments
  ADD COLUMN IF NOT EXISTS lesson_id uuid REFERENCES public.lessons(id) ON DELETE SET NULL;

ALTER TABLE public.coding_vscode_assignments
  ADD COLUMN IF NOT EXISTS lesson_order_index integer;

-- Attach + unlink must stay consistent: both set, or both NULL.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'coding_vscode_assignments_lesson_pair_check'
      AND conrelid = 'public.coding_vscode_assignments'::regclass
  ) THEN
    ALTER TABLE public.coding_vscode_assignments
      ADD CONSTRAINT coding_vscode_assignments_lesson_pair_check
      CHECK ((lesson_id IS NULL) = (lesson_order_index IS NULL));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS coding_vscode_assignments_lesson_id_idx
  ON public.coding_vscode_assignments (lesson_id)
  WHERE lesson_id IS NOT NULL;

-- ============================================================
-- 2. get_student_course_plan — 'mini' lesson activity (sort 05)
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_student_course_plan(p_course_id uuid, p_student_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(lesson_id uuid, chapter_id uuid, course_id uuid, title text, slug text, teaching_mode text, enable_coding_playground boolean, duration_minutes integer, xp_reward integer, order_index integer, is_free_preview boolean, chapter_title text, chapter_order_index integer, access text, reason text, is_released boolean, requires_activity_type text, requires_activity_id uuid, requires_activity_title text, activities jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := coalesce(p_student_id, auth.uid());
  v_caller uuid := auth.uid();
  v_unlock text;
begin
  if v_caller is null then
    return;
  end if;

  -- staff viewing another student: caller must be admin or faculty of this course
  if p_student_id is not null and p_student_id <> v_caller then
    if not (public.is_admin() or public.faculty_can_access_course(p_course_id)) then
      raise exception 'Not authorized to view this student''s course plan.' using errcode = '42501';
    end if;
  elsif not (public.is_admin() or public.faculty_can_access_course(p_course_id)) then
    if not exists (
      select 1
      from public.course_enrollments ce
      where ce.course_id = p_course_id
        and ce.student_id = v_caller
        and ce.access_status = 'active'
    ) then
      raise exception 'Not authorized to view this course plan.' using errcode = '42501';
    end if;
  end if;

  return query
  with ordered as (
    select l2.id, row_number() over (order by c2.order_index, l2.order_index) as rn
    from public.lessons l2
    join public.chapters c2 on c2.id = l2.chapter_id
    where l2.course_id = p_course_id and l2.is_published and c2.is_published
  ),
  base as (
  select
    l.id as lesson_id,
    l.chapter_id,
    l.course_id,
    l.title,
    l.slug,
    l.teaching_mode,
    l.enable_coding_playground,
    l.duration_minutes,
    l.xp_reward,
    l.order_index,
    l.is_free_preview,
    c.title as chapter_title,
    c.order_index as chapter_order_index,
    case
      when lp.id is not null then 'completed'
      when lr.id is not null then 'available'
      when (case when l.unlock_rule = 'gated' and l.requires_activity_id is not null then 'gated' when v_unlock = 'open' then 'open' when v_unlock = 'sequential' then 'sequential' when v_unlock = 'gated' then (case when l.requires_activity_id is not null then 'gated' else 'sequential' end) else l.unlock_rule end) = 'open' then 'available'
      when (case when l.unlock_rule = 'gated' and l.requires_activity_id is not null then 'gated' when v_unlock = 'open' then 'open' when v_unlock = 'sequential' then 'sequential' when v_unlock = 'gated' then (case when l.requires_activity_id is not null then 'gated' else 'sequential' end) else l.unlock_rule end) = 'gated'
           and (l.requires_activity_id is null
                or not public.activity_requirement_satisfied(l.requires_activity_type, l.requires_activity_id, v_uid))
        then 'locked'
      when prev.id is not null and prev_lp.id is null then 'locked'
      else 'available'
    end as access,
    case
      when lp.id is not null then 'Completed'
      when lr.id is not null then 'Released by faculty or admin'
      when (case when l.unlock_rule = 'gated' and l.requires_activity_id is not null then 'gated' when v_unlock = 'open' then 'open' when v_unlock = 'sequential' then 'sequential' when v_unlock = 'gated' then (case when l.requires_activity_id is not null then 'gated' else 'sequential' end) else l.unlock_rule end) = 'open' then ''
      when (case when l.unlock_rule = 'gated' and l.requires_activity_id is not null then 'gated' when v_unlock = 'open' then 'open' when v_unlock = 'sequential' then 'sequential' when v_unlock = 'gated' then (case when l.requires_activity_id is not null then 'gated' else 'sequential' end) else l.unlock_rule end) = 'gated'
           and (l.requires_activity_id is null
                or not public.activity_requirement_satisfied(l.requires_activity_type, l.requires_activity_id, v_uid))
        then 'Complete the required ' || l.requires_activity_type
             || coalesce(' "' || (
                  case l.requires_activity_type
                    when 'assignment' then (select a.title from public.assignments a where a.id = l.requires_activity_id)
                    when 'quiz' then (select q.title from public.quizzes q where q.id = l.requires_activity_id)
                    when 'coding' then (select cq.title from public.coding_questions cq where cq.id = l.requires_activity_id)
                  end
                ) || '"', '') || ' to unlock this lesson'
      when prev.id is not null and prev_lp.id is null then 'Complete "' || prev_l.title || '" first'
      else ''
    end as reason,
    lr.id is not null as is_released,
    l.requires_activity_type,
    l.requires_activity_id,
    case l.requires_activity_type
      when 'assignment' then (select a.title from public.assignments a where a.id = l.requires_activity_id)
      when 'quiz' then (select q.title from public.quizzes q where q.id = l.requires_activity_id)
      when 'coding' then (select cq.title from public.coding_questions cq where cq.id = l.requires_activity_id)
    end as requires_activity_title,
    coalesce((
      select jsonb_agg(act order by act->>'sort')
      from (
        select jsonb_build_object(
                 'sort', '01',
                 'kind', r.resource_type,
                 'title', r.title,
                 'state', case
                            when lp.id is not null then 'completed'
                            when r.is_locked is not true then 'available'
                            else 'locked'
                          end
               ) as act
        from public.lesson_resources r
        where r.lesson_id = l.id
          and r.is_published
          and (r.is_locked is not true or (p_student_id is not null and p_student_id <> v_caller))
        union all
        select jsonb_build_object(
                 'sort', '02',
                 'kind', 'live',
                 'title', ls.title,
                 'session_id', ls.id,
                 'state', case
                            when ls.status = 'cancelled' then 'cancelled'
                            when ls.status = 'completed' then 'completed'
                            when ls.status = 'live'
                                 or (now() >= ls.session_date
                                     and now() <= ls.session_date + (ls.duration_minutes || ' minutes')::interval)
                              then 'live_now'
                            else 'upcoming'
                          end,
                 'recording', case
                                when ls.status = 'completed' then coalesce((
                                  select case
                                    when count(*) filter (where sr.is_locked is not true) > 0 then 'available'
                                    when count(*) filter (where sr.is_locked) > 0 then 'locked'
                                    else 'none'
                                  end
                                  from public.session_resources sr
                                  where sr.session_id = ls.id
                                    and sr.resource_type = 'recording'
                                ), 'none')
                                else 'none'
                              end,
                 'date', to_char(ls.session_date, 'Mon DD, YYYY')
               ) as act
        from public.live_sessions ls
        where ls.lesson_id = l.id
        union all
        select jsonb_build_object(
                 'sort', '03',
                 'kind', 'quiz',
                 'title', q.title,
                 'quiz_id', q.id,
                 'state', case
                            when exists (
                              select 1 from public.quiz_attempts qa
                              where qa.quiz_id = q.id and qa.student_id = v_uid and qa.completed_at is not null
                            ) then 'completed'
                            else 'available'
                          end
               ) as act
        from public.quizzes q
        where q.lesson_id = l.id and q.is_published
        union all
        select jsonb_build_object(
                 'sort', '04',
                 'kind', 'assignment',
                 'title', a.title,
                 'assignment_id', a.id,
                 'state', coalesce((
                   select s.status
                   from public.assignment_submissions s
                   where s.assignment_id = a.id and s.student_id = v_uid
                   order by s.submitted_at desc nulls last
                   limit 1
                 ), 'available')
               ) as act
        from public.assignments a
        where a.lesson_id = l.id and a.is_published
        union all
        -- Lesson-attached mini projects (sort 05): completed when the student
        -- has a verified submission with every verified test passing — the
        -- same rule the mini project workspace uses.
        select jsonb_build_object(
                 'sort', '05',
                 'kind', 'mini',
                 'title', m.title,
                 'mini_id', m.id,
                 'marks', m.marks,
                 'state', case
                            when exists (
                              select 1 from public.coding_vscode_submissions s
                              where s.assignment_key = m.assignment_key
                                and s.student_id = v_uid
                                and s.verification_status = 'verified'
                                and s.verified_passed = s.verified_total
                            ) then 'completed'
                            else 'available'
                          end
               ) as act
        from public.coding_vscode_assignments m
        where m.lesson_id = l.id and m.is_published
        union all
        select jsonb_build_object(
                 'sort', '06',
                 'kind', 'practice',
                 'title', 'Practice Questions',
                 'count', count(*),
                 'state', case when lp.id is not null then 'completed' else 'available' end
               ) as act
        from public.lesson_practice_questions pq
        where pq.lesson_id = l.id
        having count(*) > 0
      ) acts
    ), '[]'::jsonb) as activities
  from public.lessons l
  join public.chapters c on c.id = l.chapter_id
  left join public.lesson_releases lr on lr.lesson_id = l.id and lr.student_id = v_uid
  left join public.lesson_progress lp on lp.lesson_id = l.id and lp.student_id = v_uid and lp.completed
  left join ordered cur on cur.id = l.id
  left join ordered prev on prev.rn = cur.rn - 1
  left join public.lessons prev_l on prev_l.id = prev.id
  left join public.lesson_progress prev_lp on prev_lp.lesson_id = prev.id and prev_lp.student_id = v_uid and prev_lp.completed
  where l.course_id = p_course_id and l.is_published and c.is_published
  )
  select
    b.lesson_id,
    b.chapter_id,
    b.course_id,
    b.title,
    b.slug,
    b.teaching_mode,
    b.enable_coding_playground,
    b.duration_minutes,
    b.xp_reward,
    b.order_index,
    b.is_free_preview,
    b.chapter_title,
    b.chapter_order_index,
    b.access,
    b.reason,
    b.is_released,
    b.requires_activity_type,
    b.requires_activity_id,
    b.requires_activity_title,
    case
      when b.access = 'locked' then coalesce((
        select jsonb_agg(
                 case
                   when (b.requires_activity_type = 'quiz' and el ->> 'kind' = 'quiz' and el ->> 'quiz_id' = b.requires_activity_id::text)
                     or (b.requires_activity_type = 'assignment' and el ->> 'kind' = 'assignment' and el ->> 'assignment_id' = b.requires_activity_id::text)
                     then el
                   else jsonb_set(el, '{state}', '"locked"'::jsonb)
                 end
                 order by el ->> 'sort')
        from jsonb_array_elements(b.activities) el
      ), '[]'::jsonb)
      else b.activities
    end as activities
  from base b
  order by b.chapter_order_index, b.order_index;
end;
$function$;

REVOKE ALL ON FUNCTION public.get_student_course_plan(uuid, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_student_course_plan(uuid, uuid) TO authenticated;

-- ============================================================
-- 3. course_items_remaining — lesson minis count toward the gate
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
          AND a.is_published AND s.id IS NULL)
    -- Lesson-attached mini projects without a fully verified submission
    + (SELECT count(*)
         FROM public.coding_vscode_assignments m
         JOIN public.lessons l ON l.id = m.lesson_id
         JOIN public.chapters c ON c.id = l.chapter_id
        WHERE l.course_id = p_course_id AND l.is_published AND c.is_published
          AND m.is_published
          AND NOT EXISTS (
            SELECT 1
            FROM public.coding_vscode_submissions s
            WHERE s.assignment_key = m.assignment_key
              AND s.student_id = p_student_id
              AND s.verification_status = 'verified'
              AND s.verified_passed = s.verified_total
          )),
    0);
$function$;

-- ============================================================
-- 4. RLS — lesson-attached minis visible to enrolled students
--    (batch-release path OR-joined, unchanged)
-- ============================================================
DROP POLICY IF EXISTS vscode_assignments_student_read_published ON public.coding_vscode_assignments;
CREATE POLICY vscode_assignments_student_read_published
ON public.coding_vscode_assignments
FOR SELECT TO authenticated
USING (
  is_published = true
  AND public.mini_project_unlocked(id, auth.uid())
  AND (
    -- Batch-release path (Mini Projects manager)
    EXISTS (
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
    -- Lesson-attachment path (course workspace flow)
    OR EXISTS (
      SELECT 1
      FROM public.lessons l
      JOIN public.chapters c ON c.id = l.chapter_id
      JOIN public.course_enrollments ce
        ON ce.course_id = l.course_id AND ce.student_id = auth.uid() AND ce.access_status = 'active'
      WHERE l.id = coding_vscode_assignments.lesson_id
        AND l.is_published
        AND c.is_published
    )
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
    WHERE a.id = coding_vscode_test_cases.assignment_id
      AND a.is_published = true
      AND public.mini_project_unlocked(a.id, auth.uid())
      AND (
        EXISTS (
          SELECT 1
          FROM public.coding_vscode_assignment_batches cab
          JOIN public.batch_students bs ON bs.batch_id = cab.batch_id
          JOIN public.batches b ON b.id = cab.batch_id
          LEFT JOIN public.coding_vscode_student_assignment_access pa
            ON pa.student_id = auth.uid()
            AND pa.assignment_id = cab.assignment_id
            AND pa.batch_id = cab.batch_id
          WHERE cab.assignment_id = a.id
            AND bs.student_id = auth.uid()
            AND bs.status = 'active'
            AND b.status = 'active'
            AND (cab.is_permanently_released = true OR pa.id IS NOT NULL)
        )
        OR EXISTS (
          SELECT 1
          FROM public.lessons l
          JOIN public.chapters c ON c.id = l.chapter_id
          JOIN public.course_enrollments ce
            ON ce.course_id = l.course_id AND ce.student_id = auth.uid() AND ce.access_status = 'active'
          WHERE l.id = a.lesson_id
            AND l.is_published
            AND c.is_published
        )
      )
  )
);

-- ============================================================
-- 5. Drop the Offline Exams concept (tables verified empty)
-- ============================================================
DROP TRIGGER IF EXISTS trg_offline_exam_results_audit ON public.offline_exam_results;
DROP TRIGGER IF EXISTS trg_offline_exam_results_guard ON public.offline_exam_results;
DROP TRIGGER IF EXISTS trg_offline_results_updated_at ON public.offline_exam_results;
DROP TRIGGER IF EXISTS trg_offline_exams_status_audit ON public.offline_exams;
DROP TRIGGER IF EXISTS trg_offline_exams_updated_at ON public.offline_exams;

DROP FUNCTION IF EXISTS public.offline_exam_results_audit() CASCADE;
DROP FUNCTION IF EXISTS public.offline_exam_results_guard() CASCADE;
DROP FUNCTION IF EXISTS public.offline_exam_set_updated_at() CASCADE;
DROP FUNCTION IF EXISTS public.offline_exams_status_audit() CASCADE;
DROP FUNCTION IF EXISTS public.save_offline_exam_results(uuid, jsonb) CASCADE;
DROP FUNCTION IF EXISTS public.publish_offline_exam_results(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.create_offline_exam(text, uuid, text, date, time, integer, integer, text, text) CASCADE;
DROP FUNCTION IF EXISTS public.ingest_offline_exam(jsonb) CASCADE;
DROP FUNCTION IF EXISTS public.offline_exam_manageable(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.offline_exam_course_writable(uuid) CASCADE;

DROP TABLE IF EXISTS public.offline_exam_results CASCADE;
DROP TABLE IF EXISTS public.offline_exam_students CASCADE;
DROP TABLE IF EXISTS public.offline_exams CASCADE;
