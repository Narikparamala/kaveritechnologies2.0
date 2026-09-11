-- =====================================================================
-- Widen enrollment-request approve/reject RPCs to accept faculty role.
--
-- Before: is_admin() → INSUFFICIENT_PRIVILEGE
-- After:  is_admin() OR is_faculty() → INSUFFICIENT_PRIVILEGE
--
-- Cancel remains student-only (checks student_id = auth.uid()).
-- Idempotent: CREATE OR REPLACE is safe to re-run.
-- =====================================================================

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
  if not (is_admin() or is_faculty()) then
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

  -- Emit event + in-app + outbox (same transaction; async delivery).
  perform public.process_enrollment_event('enrollment_approved', p_request_id);

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
  if not (is_admin() or is_faculty()) then
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

  -- Emit event + in-app + outbox (same transaction; async delivery).
  perform public.process_enrollment_event('enrollment_rejected', p_request_id);

  return jsonb_build_object('ok', true, 'request_id', v_request.id, 'status', 'rejected');
end;
$$;
