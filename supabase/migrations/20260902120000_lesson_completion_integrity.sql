begin;

-- Progress, XP, levels and certificates are authoritative records. Browsers
-- request completion through complete_lesson() instead of writing them.

drop policy if exists preview_course_enrollments on public.course_enrollments;
drop policy if exists enrollments_select on public.course_enrollments;
drop policy if exists enrollments_insert on public.course_enrollments;
drop policy if exists enrollments_update on public.course_enrollments;
drop policy if exists enrollments_delete on public.course_enrollments;
drop policy if exists enrollments_select_hardened on public.course_enrollments;
drop policy if exists enrollments_insert_hardened on public.course_enrollments;
drop policy if exists enrollments_delete_admin on public.course_enrollments;

create policy enrollments_select_hardened
on public.course_enrollments for select to authenticated
using (
  student_id = (select auth.uid())
  or public.is_admin()
  or public.faculty_can_access_course(course_id)
);

create policy enrollments_insert_hardened
on public.course_enrollments for insert to authenticated
with check (
  public.is_admin()
  or (
    student_id = (select auth.uid())
    and access_status = 'active'
    and enrollment_source = 'free_enrollment'
    and exists (
      select 1 from public.courses course
      where course.id = public.course_enrollments.course_id
        and course.is_published = true
    )
  )
);

create policy enrollments_delete_admin
on public.course_enrollments for delete to authenticated
using (public.is_admin());

revoke all on table public.course_enrollments from anon;
revoke update on table public.course_enrollments from authenticated;
grant select, insert, delete on table public.course_enrollments to authenticated;

drop policy if exists lesson_progress_insert on public.lesson_progress;
drop policy if exists lesson_progress_update on public.lesson_progress;
drop policy if exists lesson_progress_delete on public.lesson_progress;
revoke insert, update, delete on table public.lesson_progress from authenticated;
grant select on table public.lesson_progress to authenticated;

drop policy if exists xp_transactions_insert on public.xp_transactions;
drop policy if exists xp_transactions_update on public.xp_transactions;
drop policy if exists xp_transactions_delete on public.xp_transactions;
revoke insert, update, delete on table public.xp_transactions from authenticated;
grant select on table public.xp_transactions to authenticated;

-- Self-service profile editing is limited to non-authoritative columns.
revoke update on table public.profiles from authenticated;
grant update (full_name, avatar_url, phone, bio)
  on table public.profiles to authenticated;

create or replace function public.admin_set_enrollment_access(
  p_enrollment_id uuid,
  p_access_status text,
  p_notes text default null
)
returns public.course_enrollments
language plpgsql
security definer
set search_path = ''
as $$
declare
  updated_enrollment public.course_enrollments;
begin
  if not public.is_admin() then
    raise exception 'Only an active Super Admin may change enrollment access.'
      using errcode = '42501';
  end if;
  if p_enrollment_id is null then
    raise exception 'Enrollment is required.' using errcode = '22023';
  end if;
  if p_access_status not in ('active', 'revoked') then
    raise exception 'Invalid enrollment access status.' using errcode = '22023';
  end if;

  update public.course_enrollments
  set access_status = p_access_status,
      enrollment_source = case when p_access_status = 'active' then 'admin_grant' else enrollment_source end,
      granted_by = case when p_access_status = 'active' then (select auth.uid()) else granted_by end,
      granted_at = case when p_access_status = 'active' then now() else granted_at end,
      revoked_by = case when p_access_status = 'revoked' then (select auth.uid()) else null end,
      revoked_at = case when p_access_status = 'revoked' then now() else null end,
      notes = coalesce(p_notes, notes)
  where id = p_enrollment_id
  returning * into updated_enrollment;

  if updated_enrollment.id is null then
    raise exception 'Enrollment not found.' using errcode = 'P0002';
  end if;
  return updated_enrollment;
end;
$$;

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

revoke all on function public.admin_set_enrollment_access(uuid, text, text) from public;
revoke all on function public.complete_lesson(uuid) from public;
grant execute on function public.admin_set_enrollment_access(uuid, text, text) to authenticated;
grant execute on function public.complete_lesson(uuid) to authenticated;

notify pgrst, 'reload schema';
commit;
