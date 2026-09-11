-- =====================================================================
-- Admissions / enrollment model
--
-- 1. courses.enrollment_mode: open | approval_required | closed
--    (default 'open' keeps every existing course backward compatible)
-- 2. enrollment_requests: student requests course access; admins approve
--    or reject through server-authoritative RPCs (no client-side grant path)
-- 3. free self-enrollment now additionally requires enrollment_mode = 'open'
-- =====================================================================

-- ---------- courses.enrollment_mode ----------
alter table public.courses
  add column enrollment_mode text not null default 'open',
  add constraint courses_enrollment_mode_check
    check (enrollment_mode in ('open', 'approval_required', 'closed'));

comment on column public.courses.enrollment_mode is
  'open = self-enroll; approval_required = request + admin approval; closed = no self-enroll/request';

-- ---------- free self-enroll requires an open course ----------
drop policy if exists enrollments_insert_hardened on public.course_enrollments;

create policy enrollments_insert_hardened on public.course_enrollments
  for insert to authenticated
  with check (
    is_admin()
    or (
      student_id = (select auth.uid())
      and access_status = 'active'
      and enrollment_source = 'free_enrollment'
      and exists (
        select 1
        from public.courses c
        where c.id = course_enrollments.course_id
          and c.is_published = true
          and c.price = 0
          and c.enrollment_mode = 'open'
      )
    )
  );

-- ---------- enrollment_requests table ----------
create table public.enrollment_requests (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  message text,
  requested_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles(id) on delete set null,
  review_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One active pending request per student per course.
create unique index enrollment_requests_pending_unique
  on public.enrollment_requests (student_id, course_id)
  where status = 'pending';

create index enrollment_requests_status_idx
  on public.enrollment_requests (status, requested_at desc);

create index enrollment_requests_course_idx
  on public.enrollment_requests (course_id);

alter table public.enrollment_requests enable row level security;

-- Students see their own requests; admins see all.
create policy enrollment_requests_select_own_or_admin
  on public.enrollment_requests
  for select
  to authenticated
  using (student_id = (select auth.uid()) or is_admin());

-- Students may create a request only for themselves, on a published course
-- that requires approval, when they do not already have active access.
create policy enrollment_requests_insert_student
  on public.enrollment_requests
  for insert
  to authenticated
  with check (
    status = 'pending'
    and student_id = (select auth.uid())
    and (
      select p.role from public.profiles p
      where p.id = (select auth.uid())
    ) = 'student'
    and exists (
      select 1
      from public.courses c
      where c.id = enrollment_requests.course_id
        and c.is_published = true
        and c.enrollment_mode = 'approval_required'
    )
    and not exists (
      select 1
      from public.course_enrollments e
      where e.student_id = enrollment_requests.student_id
        and e.course_id = enrollment_requests.course_id
        and e.access_status = 'active'
    )
  );

-- Mutations (approve/reject/cancel) go through SECURITY DEFINER RPCs so the
-- grant is always atomic and validated. Admin-only direct update/delete as
-- an escape hatch for record management (never a student path).
create policy enrollment_requests_update_admin
  on public.enrollment_requests
  for update
  to authenticated
  using (is_admin())
  with check (is_admin());

create policy enrollment_requests_delete_admin
  on public.enrollment_requests
  for delete
  to authenticated
  using (is_admin());

-- ---------- atomic approval RPC ----------
create or replace function public.approve_enrollment_request(p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_request public.enrollment_requests%rowtype;
  v_course_title text;
begin
  if not is_admin() then
    raise exception 'INSUFFICIENT_PRIVILEGE';
  end if;

  select * into v_request
  from public.enrollment_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'REQUEST_NOT_FOUND';
  end if;
  if v_request.status <> 'pending' then
    raise exception 'REQUEST_NOT_PENDING';
  end if;

  -- Grant (or reactivate) access in the same transaction.
  insert into public.course_enrollments (
    course_id, student_id, access_status, enrollment_source,
    granted_by, granted_at, progress_percentage
  )
  values (
    v_request.course_id, v_request.student_id, 'active', 'approved_request',
    (select auth.uid()), now(), 0
  )
  on conflict (course_id, student_id) do update
    set access_status = 'active',
        enrollment_source = 'approved_request',
        granted_by = (select auth.uid()),
        granted_at = now(),
        revoked_by = null,
        revoked_at = null,
        notes = coalesce(course_enrollments.notes, 'Approved via enrollment request');

  update public.enrollment_requests
  set status = 'approved',
      reviewed_at = now(),
      reviewed_by = (select auth.uid()),
      updated_at = now()
  where id = p_request_id;

  select title into v_course_title
  from public.courses
  where id = v_request.course_id;

  return jsonb_build_object(
    'ok', true,
    'request_id', v_request.id,
    'student_id', v_request.student_id,
    'course_id', v_request.course_id,
    'course_title', v_course_title
  );
end;
$$;

-- ---------- atomic reject RPC ----------
create or replace function public.reject_enrollment_request(
  p_request_id uuid,
  p_review_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_request public.enrollment_requests%rowtype;
begin
  if not is_admin() then
    raise exception 'INSUFFICIENT_PRIVILEGE';
  end if;

  select * into v_request
  from public.enrollment_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'REQUEST_NOT_FOUND';
  end if;
  if v_request.status <> 'pending' then
    raise exception 'REQUEST_NOT_PENDING';
  end if;

  update public.enrollment_requests
  set status = 'rejected',
      review_note = p_review_note,
      reviewed_at = now(),
      reviewed_by = (select auth.uid()),
      updated_at = now()
  where id = p_request_id;

  return jsonb_build_object('ok', true, 'request_id', v_request.id, 'status', 'rejected');
end;
$$;

-- ---------- student cancel RPC ----------
create or replace function public.cancel_enrollment_request(p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_request public.enrollment_requests%rowtype;
begin
  select * into v_request
  from public.enrollment_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'REQUEST_NOT_FOUND';
  end if;
  if v_request.student_id <> (select auth.uid()) then
    raise exception 'INSUFFICIENT_PRIVILEGE';
  end if;
  if v_request.status <> 'pending' then
    raise exception 'REQUEST_NOT_PENDING';
  end if;

  update public.enrollment_requests
  set status = 'cancelled',
      updated_at = now()
  where id = p_request_id;

  return jsonb_build_object('ok', true, 'request_id', v_request.id, 'status', 'cancelled');
end;
$$;

-- Execution: RPCs are called through PostgREST as authenticated. Approval
-- and rejection validate super-admin inside the function; cancel validates
-- ownership inside the function. No anonymous access.
revoke execute on function public.approve_enrollment_request(uuid) from public, anon;
revoke execute on function public.reject_enrollment_request(uuid, text) from public, anon;
revoke execute on function public.cancel_enrollment_request(uuid) from public, anon;

grant execute on function public.approve_enrollment_request(uuid) to authenticated;
grant execute on function public.reject_enrollment_request(uuid, text) to authenticated;
grant execute on function public.cancel_enrollment_request(uuid) to authenticated;
