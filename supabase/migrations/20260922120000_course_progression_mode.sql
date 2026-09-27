-- Course-wide progression + (UI) chapter delete support.
--
-- 1. courses.progression_mode ('per_lesson' default): course-level default for
--    lesson unlocking so faculty set Open/Sequential/Gated once instead of
--    lesson by lesson. get_student_course_plan now computes an EFFECTIVE rule:
--      - 'per_lesson'  -> unchanged legacy behavior (lesson's own unlock_rule)
--      - 'open'        -> all lessons available, EXCEPT lessons with their own
--                         gated activity requirement stay enforced
--      - 'sequential'  -> every lesson unlocks after the previous completes
--      - 'gated'       -> lessons with a required activity enforce it; lessons
--                         without one fall back to sequential (no footgun where
--                         switching to gated locks everything with no reason)
-- 2. No new policies needed: courses UPDATE is already faculty/admin-governed.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS + CREATE OR REPLACE FUNCTION.

ALTER TABLE public.courses
  ADD COLUMN IF NOT EXISTS progression_mode text NOT NULL DEFAULT 'per_lesson'
  CHECK (progression_mode IN ('per_lesson', 'open', 'sequential', 'gated'));

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
    -- self-service: caller must be actively enrolled
    if not exists (
      select 1 from public.course_enrollments ce
      where ce.course_id = p_course_id and ce.student_id = v_caller and ce.access_status = 'active'
    ) then
      return;
    end if;
  end if;

  -- Course-wide progression default (added 20260922120000). 'per_lesson' keeps
  -- the exact pre-existing per-lesson unlock_rule semantics.
  select coalesce(c.progression_mode, 'per_lesson') into v_unlock
  from public.courses c where c.id = p_course_id;

  return query
  with ordered as (
    select l.id,
           row_number() over (order by c.order_index, l.order_index) as rn
    from public.lessons l
    join public.chapters c on c.id = l.chapter_id
    where l.course_id = p_course_id and l.is_published and c.is_published
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
        select jsonb_build_object(
                 'sort', '05',
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
$function$

