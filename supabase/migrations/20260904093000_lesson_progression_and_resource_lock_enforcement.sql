-- ============================================================
-- Lesson progression (unlock rules) + lesson resource lock RLS
-- Phase 1: server-enforced progression and resource locks.
--
-- Contract:
--   lessons.unlock_rule:
--     open        -> available to any actively enrolled student (backward compatible default)
--     sequential  -> available when the previous published lesson in course order is completed
--     gated       -> available when a required authoritative activity is satisfied
--                    AND the previous published lesson is completed
--   lesson_releases: explicit staff release per (student, lesson) that bypasses the rule
--   lesson_resources.is_locked: enforced server-side (student REST cannot read locked rows)
-- ============================================================

begin;

-- ------------------------------------------------------------------
-- 1. lessons: unlock rule columns (default 'open' keeps existing content open)
-- ------------------------------------------------------------------
alter table public.lessons
  add column unlock_rule text not null default 'open',
  add column requires_activity_type text,
  add column requires_activity_id uuid;

alter table public.lessons
  add constraint lessons_unlock_rule_check
    check (unlock_rule in ('open', 'sequential', 'gated')),
  add constraint lessons_requires_activity_type_check
    check (requires_activity_type is null or requires_activity_type in ('assignment', 'quiz', 'coding'));
-- NOTE: gated activity fields are intentionally not FK/equivalence-enforced at the
-- table level because faculty configure gated lessons in two steps (rule first,
-- then activity). The authoritative access logic treats a gated lesson with a
-- missing activity as locked, so the default is always safe.

create index idx_lessons_unlock_rule on public.lessons (unlock_rule) where unlock_rule <> 'open';

-- ------------------------------------------------------------------
-- 2. lesson_releases: explicit staff release/override
-- ------------------------------------------------------------------
create table public.lesson_releases (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles(id) on delete cascade,
  lesson_id uuid not null references public.lessons(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade,
  source text not null default 'manual',
  granted_by uuid references public.profiles(id) on delete set null,
  granted_at timestamptz not null default now(),
  constraint lesson_releases_student_lesson_key unique (student_id, lesson_id)
);

create index idx_lesson_releases_course on public.lesson_releases (course_id);
create index idx_lesson_releases_lesson on public.lesson_releases (lesson_id);

alter table public.lesson_releases enable row level security;

create policy lesson_releases_select on public.lesson_releases
  for select to authenticated
  using (
    is_admin()
    or student_id = auth.uid()
    or exists (
      select 1 from public.course_faculty cf
      where cf.course_id = lesson_releases.course_id and cf.faculty_id = auth.uid()
    )
  );

create policy lesson_releases_insert on public.lesson_releases
  for insert to authenticated
  with check (
    is_admin()
    or exists (
      select 1 from public.course_faculty cf
      where cf.course_id = lesson_releases.course_id and cf.faculty_id = auth.uid()
    )
  );

create policy lesson_releases_delete on public.lesson_releases
  for delete to authenticated
  using (
    is_admin()
    or exists (
      select 1 from public.course_faculty cf
      where cf.course_id = lesson_releases.course_id and cf.faculty_id = auth.uid()
    )
  );

-- ------------------------------------------------------------------
-- 3. core access-state helpers (SECURITY DEFINER, locked-down search_path)
-- ------------------------------------------------------------------

-- Authoritative check that a required activity is satisfied for a student.
create or replace function public.activity_requirement_satisfied(
  p_activity_type text,
  p_activity_id uuid,
  p_student_id uuid
) returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_activity_type = 'assignment' then
    return exists (
      select 1 from public.assignment_submissions s
      where s.assignment_id = p_activity_id
        and s.student_id = p_student_id
        and s.status in ('submitted', 'graded', 'returned', 'resubmitted')
    );
  elsif p_activity_type = 'quiz' then
    return exists (
      select 1 from public.quiz_attempts a
      where a.quiz_id = p_activity_id
        and a.student_id = p_student_id
        and a.completed_at is not null
    );
  elsif p_activity_type = 'coding' then
    return exists (
      select 1 from public.coding_question_attempts a
      where a.question_id = p_activity_id
        and a.student_id = p_student_id
        and a.status = 'solved'
    );
  end if;
  return false;
end;
$$;

-- Single-lesson access state for the calling student.
-- Returns 'available' | 'completed' | 'locked'.
create or replace function public.student_lesson_access(p_lesson_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_course_id uuid;
  v_unlock_rule text;
  v_req_type text;
  v_req_id uuid;
  v_prev_id uuid;
begin
  if v_uid is null then
    return 'locked';
  end if;

  select l.course_id, l.unlock_rule, l.requires_activity_type, l.requires_activity_id
    into v_course_id, v_unlock_rule, v_req_type, v_req_id
  from public.lessons l
  join public.courses c on c.id = l.course_id
  where l.id = p_lesson_id and l.is_published and c.is_published;

  if v_course_id is null then
    return 'locked';
  end if;

  if not exists (
    select 1 from public.course_enrollments ce
    where ce.course_id = v_course_id
      and ce.student_id = v_uid
      and ce.access_status = 'active'
  ) then
    return 'locked';
  end if;

  if exists (
    select 1 from public.lesson_progress lp
    where lp.lesson_id = p_lesson_id and lp.student_id = v_uid and lp.completed
  ) then
    return 'completed';
  end if;

  if exists (
    select 1 from public.lesson_releases lr
    where lr.lesson_id = p_lesson_id and lr.student_id = v_uid
  ) then
    return 'available';
  end if;

  if v_unlock_rule = 'gated'
     and (v_req_id is null or not public.activity_requirement_satisfied(v_req_type, v_req_id, v_uid)) then
    return 'locked';
  end if;

  -- sequential (or gated whose activity is satisfied): previous published lesson must be completed
  select prev.id into v_prev_id
  from (
    select l.id,
           row_number() over (order by c.order_index, l.order_index) as rn
    from public.lessons l
    join public.chapters c on c.id = l.chapter_id
    where l.course_id = v_course_id and l.is_published and c.is_published
  ) cur
  join (
    select l.id,
           row_number() over (order by c.order_index, l.order_index) as rn
    from public.lessons l
    join public.chapters c on c.id = l.chapter_id
    where l.course_id = v_course_id and l.is_published and c.is_published
  ) prev on prev.rn = cur.rn - 1
  where cur.id = p_lesson_id;

  if v_prev_id is not null and not exists (
    select 1 from public.lesson_progress lp
    where lp.lesson_id = v_prev_id and lp.student_id = v_uid and lp.completed
  ) then
    return 'locked';
  end if;

  return 'available';
end;
$$;

-- ------------------------------------------------------------------
-- 4. get_student_course_plan: full chapter/lesson plan with access + reason
--    Self-service (p_student_id omitted) or staff view (admin / course faculty)
-- ------------------------------------------------------------------
create or replace function public.get_student_course_plan(
  p_course_id uuid,
  p_student_id uuid default null
)
returns table (
  lesson_id uuid,
  chapter_id uuid,
  course_id uuid,
  title text,
  slug text,
  teaching_mode text,
  enable_coding_playground boolean,
  duration_minutes integer,
  xp_reward integer,
  order_index integer,
  is_free_preview boolean,
  chapter_title text,
  chapter_order_index integer,
  access text,
  reason text,
  is_released boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := coalesce(p_student_id, auth.uid());
  v_caller uuid := auth.uid();
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

  return query
  with ordered as (
    select l.id,
           row_number() over (order by c.order_index, l.order_index) as rn
    from public.lessons l
    join public.chapters c on c.id = l.chapter_id
    where l.course_id = p_course_id and l.is_published and c.is_published
  )
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
      when l.unlock_rule = 'open' then 'available'
      when l.unlock_rule = 'gated'
           and (l.requires_activity_id is null
                or not public.activity_requirement_satisfied(l.requires_activity_type, l.requires_activity_id, v_uid))
        then 'locked'
      when prev.id is not null and prev_lp.id is null then 'locked'
      else 'available'
    end as access,
    case
      when lp.id is not null then 'Completed'
      when lr.id is not null then 'Released by faculty or admin'
      when l.unlock_rule = 'open' then ''
      when l.unlock_rule = 'gated'
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
    lr.id is not null as is_released
  from public.lessons l
  join public.chapters c on c.id = l.chapter_id
  left join public.lesson_releases lr on lr.lesson_id = l.id and lr.student_id = v_uid
  left join public.lesson_progress lp on lp.lesson_id = l.id and lp.student_id = v_uid and lp.completed
  left join ordered cur on cur.id = l.id
  left join ordered prev on prev.rn = cur.rn - 1
  left join public.lessons prev_l on prev_l.id = prev.id
  left join public.lesson_progress prev_lp on prev_lp.lesson_id = prev.id and prev_lp.student_id = v_uid and prev_lp.completed
  where l.course_id = p_course_id and l.is_published and c.is_published
  order by c.order_index, l.order_index;
end;
$$;

-- ------------------------------------------------------------------
-- 5. get_student_lesson_access: single-lesson access + reason (student self-service)
-- ------------------------------------------------------------------
create or replace function public.get_student_lesson_access(p_lesson_id uuid)
returns table (access text, reason text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.access, p.reason
  from public.lessons l
  join public.get_student_course_plan(l.course_id) p on p.lesson_id = l.id
  where l.id = p_lesson_id
  limit 1;
$$;

-- ------------------------------------------------------------------
-- 6. staff release / revoke (course-scoped)
-- ------------------------------------------------------------------
create or replace function public.release_lesson_for_student(p_student_id uuid, p_lesson_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_course_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  select l.course_id into v_course_id
  from public.lessons l
  where l.id = p_lesson_id and l.is_published = true;

  if v_course_id is null then
    raise exception 'Published lesson not found.' using errcode = 'P0002';
  end if;

  if not (public.is_admin() or public.faculty_can_access_course(v_course_id)) then
    raise exception 'Not authorized to release lessons for this course.' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.course_enrollments ce
    where ce.course_id = v_course_id and ce.student_id = p_student_id and ce.access_status = 'active'
  ) then
    raise exception 'Student is not actively enrolled in this course.' using errcode = '42501';
  end if;

  insert into public.lesson_releases (student_id, lesson_id, course_id, source, granted_by)
  values (p_student_id, p_lesson_id, v_course_id, 'manual', auth.uid())
  on conflict (student_id, lesson_id)
  do update set granted_by = excluded.granted_by, granted_at = now(), source = 'manual';
end;
$$;

create or replace function public.revoke_lesson_release(p_student_id uuid, p_lesson_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_course_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  select l.course_id into v_course_id
  from public.lessons l
  where l.id = p_lesson_id;

  if v_course_id is null then
    raise exception 'Lesson not found.' using errcode = 'P0002';
  end if;

  if not (public.is_admin() or public.faculty_can_access_course(v_course_id)) then
    raise exception 'Not authorized to release lessons for this course.' using errcode = '42501';
  end if;

  delete from public.lesson_releases lr
  where lr.student_id = p_student_id and lr.lesson_id = p_lesson_id;
end;
$$;

-- ------------------------------------------------------------------
-- 7. complete_lesson: reject completion of locked lessons
-- ------------------------------------------------------------------
create or replace function public.complete_lesson(p_lesson_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  lesson_record public.lessons%rowtype;
  progress_record public.lesson_progress%rowtype;
  was_completed boolean := false;
  total_lessons integer := 0;
  completed_lessons integer := 0;
  awarded_xp integer := 0;
  total_xp integer := 0;
  current_level integer := 1;
  course_progress numeric(5,2) := 0;
  certificate_insert_count integer := 0;
begin
  if current_user_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.profiles profile
    where profile.id = current_user_id
      and profile.role = 'student'
      and profile.is_active = true
  ) then
    raise exception 'Only an active student may complete a lesson.' using errcode = '42501';
  end if;

  select lesson.* into lesson_record
  from public.lessons lesson
  join public.courses course on course.id = lesson.course_id
  where lesson.id = p_lesson_id
    and lesson.is_published = true
    and course.is_published = true;
  if lesson_record.id is null then
    raise exception 'Published lesson not found.' using errcode = 'P0002';
  end if;
  if not exists (
    select 1 from public.course_enrollments enrollment
    where enrollment.course_id = lesson_record.course_id
      and enrollment.student_id = current_user_id
      and enrollment.access_status = 'active'
  ) then
    raise exception 'An active course enrollment is required.' using errcode = '42501';
  end if;

  -- progression guard: locked lessons cannot be completed out of order
  if public.student_lesson_access(p_lesson_id) = 'locked' then
    raise exception 'This lesson is locked. Complete the required previous work first, or wait for your faculty to release it.' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(current_user_id::text || ':' || p_lesson_id::text, 0));
  select progress.completed into was_completed
  from public.lesson_progress progress
  where progress.student_id = current_user_id and progress.lesson_id = p_lesson_id
  for update;
  was_completed := coalesce(was_completed, false);

  insert into public.lesson_progress (student_id, lesson_id, course_id, completed, completed_at)
  values (current_user_id, lesson_record.id, lesson_record.course_id, true, now())
  on conflict (student_id, lesson_id) do update
  set course_id = excluded.course_id,
      completed = true,
      completed_at = coalesce(public.lesson_progress.completed_at, excluded.completed_at),
      updated_at = now()
  returning * into progress_record;

  if not was_completed then
    awarded_xp := greatest(coalesce(lesson_record.xp_reward, 0), 0);
    if awarded_xp > 0 then
      insert into public.xp_transactions (student_id, amount, reason, reference_id, reference_type)
      values (current_user_id, awarded_xp, 'Completed lesson: ' || lesson_record.title, lesson_record.id, 'lesson');
      update public.profiles
      set xp_points = xp_points + awarded_xp,
          level = floor(sqrt(greatest(xp_points + awarded_xp, 0)::numeric / 100))::integer + 1,
          updated_at = now()
      where id = current_user_id
      returning xp_points, level into total_xp, current_level;
    end if;
  end if;
  if awarded_xp = 0 then
    select profile.xp_points, profile.level into total_xp, current_level
    from public.profiles profile where profile.id = current_user_id;
  end if;

  select count(*) into total_lessons from public.lessons lesson
  where lesson.course_id = lesson_record.course_id and lesson.is_published = true;
  select count(*) into completed_lessons
  from public.lesson_progress progress
  join public.lessons lesson on lesson.id = progress.lesson_id
  where progress.student_id = current_user_id
    and progress.completed = true
    and lesson.course_id = lesson_record.course_id
    and lesson.is_published = true;
  course_progress := case when total_lessons = 0 then 0
    else round((completed_lessons::numeric / total_lessons::numeric) * 100, 2) end;

  update public.course_enrollments
  set progress_percentage = course_progress,
      completed_at = case when course_progress = 100 then coalesce(completed_at, now()) else null end
  where course_id = lesson_record.course_id
    and student_id = current_user_id
    and access_status = 'active';

  if course_progress = 100 and exists (
    select 1 from public.courses course
    where course.id = lesson_record.course_id and course.certificate_eligible = true
  ) then
    insert into public.certificates (student_id, course_id)
    values (current_user_id, lesson_record.course_id)
    on conflict (student_id, course_id) do nothing;
    get diagnostics certificate_insert_count = row_count;
  end if;

  return jsonb_build_object(
    'progress', to_jsonb(progress_record),
    'course_progress', course_progress,
    'xp_awarded', awarded_xp,
    'total_xp', total_xp,
    'level', current_level,
    'certificate_issued', certificate_insert_count > 0
  );
end;
$$;

-- ------------------------------------------------------------------
-- 8. RLS: remove legacy permissive mvp policies, enforce progression + locks
-- ------------------------------------------------------------------

-- lessons: anon keeps only free-preview reads; students see only published
-- lessons they can actually access
drop policy if exists lessons_mvp_access on public.lessons;
drop policy if exists lessons_select on public.lessons;
create policy lessons_select on public.lessons
  for select to authenticated
  using (
    is_admin()
    or faculty_can_access_course(course_id)
    or (
      is_published = true
      and exists (
        select 1 from public.course_enrollments ce
        where ce.course_id = lessons.course_id
          and ce.student_id = auth.uid()
          and ce.access_status = 'active'
      )
      and public.student_lesson_access(lessons.id) in ('available', 'completed')
    )
  );

-- chapters: students must be enrolled (course structure no longer public to any auth user)
drop policy if exists chapters_mvp_access on public.chapters;
drop policy if exists chapters_select on public.chapters;
create policy chapters_select on public.chapters
  for select to authenticated
  using (
    is_admin()
    or faculty_can_access_course(course_id)
    or (
      is_published = true
      and exists (
        select 1 from public.course_enrollments ce
        where ce.course_id = chapters.course_id
          and ce.student_id = auth.uid()
          and ce.access_status = 'active'
      )
    )
  );

-- lesson_resources: students may only read published, unlocked resources of
-- lessons they can access; locked resource rows (and their URLs) are hidden
drop policy if exists lesson_resources_mvp_access on public.lesson_resources;
drop policy if exists lesson_resources_select on public.lesson_resources;
create policy lesson_resources_select on public.lesson_resources
  for select to authenticated
  using (
    is_admin()
    or exists (
      select 1 from public.lessons l
      join public.course_faculty cf on cf.course_id = l.course_id
      where l.id = lesson_resources.lesson_id and cf.faculty_id = auth.uid()
    )
    or (
      lesson_resources.is_published = true
      and lesson_resources.is_locked is not true
      and lesson_id in (
        select l.id
        from public.lessons l
        join public.chapters c on c.id = l.chapter_id
        where l.is_published = true
          and c.is_published = true
          and exists (
            select 1 from public.course_enrollments ce
            where ce.course_id = l.course_id
              and ce.student_id = auth.uid()
              and ce.access_status = 'active'
          )
          and public.student_lesson_access(l.id) in ('available', 'completed')
      )
    )
  );

-- ------------------------------------------------------------------
-- 9. function grants
-- ------------------------------------------------------------------
revoke all on function public.activity_requirement_satisfied(text, uuid, uuid) from public;
grant execute on function public.activity_requirement_satisfied(text, uuid, uuid) to authenticated;

revoke all on function public.student_lesson_access(uuid) from public;
grant execute on function public.student_lesson_access(uuid) to authenticated;

revoke all on function public.get_student_course_plan(uuid, uuid) from public;
grant execute on function public.get_student_course_plan(uuid, uuid) to authenticated;

revoke all on function public.get_student_lesson_access(uuid) from public;
grant execute on function public.get_student_lesson_access(uuid) to authenticated;

revoke all on function public.release_lesson_for_student(uuid, uuid) from public;
grant execute on function public.release_lesson_for_student(uuid, uuid) to authenticated;

revoke all on function public.revoke_lesson_release(uuid, uuid) from public;
grant execute on function public.revoke_lesson_release(uuid, uuid) to authenticated;

revoke all on function public.complete_lesson(uuid) from public;
grant execute on function public.complete_lesson(uuid) to authenticated;

commit;