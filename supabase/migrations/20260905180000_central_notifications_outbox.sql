-- =====================================================================
-- Central notifications + email outbox architecture
--
-- 1. notification_events  — append-only server-authoritative event log.
-- 2. notification_outbox  — durable email (future: webhook) queue with
--    retries, backoff, idempotency (dedupe_key), and a delivery state
--    machine.  Delivery happens asynchronously; queueing NEVER rolls
--    back the core business transaction that created the event.
-- 3. Enrollment wiring    — request created / approved / rejected create
--    events + in-app notifications + outbox emails in the SAME
--    transaction as the business state change.
--
-- Secrets policy: no email provider secret is stored in Vite/browser
-- code.  Real delivery is configured server-side via kaveri_app_settings
-- (and supabase_vault for credentials) and executed by
-- process_notification_outbox() (production: scheduled worker / pg_cron).
-- Auth emails remain Supabase Auth/SMTP — untouched by this outbox.
-- =====================================================================

-- ---------- 1. widen in-app notification types for platform events ----------
alter table public.notifications drop constraint notifications_type_check;

alter table public.notifications
  add constraint notifications_type_check
  check (type in (
    'info', 'success', 'warning', 'error',
    'assignment', 'announcement', 'grade', 'submission', 'quiz',
    'project', 'live_class', 'student', 'support',
    'enrollment', 'workshop', 'exam', 'ecosystem', 'system'
  ));

-- ---------- 2. notification_events (server-authoritative log) ----------
create table public.notification_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  actor_user_id uuid references public.profiles(id) on delete set null,
  subject_user_id uuid references public.profiles(id) on delete set null,
  entity_type text,
  entity_id uuid,
  payload jsonb not null default '{}'::jsonb,
  dedupe_key text,
  created_at timestamptz not null default now()
);

comment on table public.notification_events is
  'Append-only log of platform events. Written only by SECURITY DEFINER functions.';

create unique index notification_events_dedupe_key_idx
  on public.notification_events (dedupe_key)
  where dedupe_key is not null;

create index notification_events_created_idx
  on public.notification_events (created_at desc);

create index notification_events_subject_idx
  on public.notification_events (subject_user_id, created_at desc);

create index notification_events_entity_idx
  on public.notification_events (entity_type, entity_id);

alter table public.notification_events enable row level security;
-- No policies: the log is server-internal and never exposed to clients.

-- ---------- 3. notification_outbox (durable async delivery queue) ----------
create table public.notification_outbox (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references public.notification_events(id) on delete set null,
  channel text not null default 'email' check (channel in ('email', 'webhook')),
  template_key text not null,
  recipient_user_id uuid references public.profiles(id) on delete cascade,
  recipient_email text,
  recipient_name text,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'queued'
    check (status in ('queued', 'sending', 'sent', 'failed', 'skipped')),
  attempts integer not null default 0,
  max_attempts integer not null default 5 check (max_attempts between 1 and 20),
  next_attempt_at timestamptz not null default now(),
  dedupe_key text,
  last_error text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.notification_outbox is
  'Durable outbox for asynchronous email/webhook delivery. Enqueued inside the '
  'business transaction; processed later by process_notification_outbox(). '
  'A delivery failure never rolls back the business operation.';

create unique index notification_outbox_dedupe_key_idx
  on public.notification_outbox (dedupe_key)
  where dedupe_key is not null;

create index notification_outbox_due_idx
  on public.notification_outbox (status, next_attempt_at)
  where status in ('queued', 'sending');

create index notification_outbox_recipient_idx
  on public.notification_outbox (recipient_user_id, created_at desc);

alter table public.notification_outbox enable row level security;
-- No policies: queue contents (which include recipient data) are
-- server-internal.  Students must never read another user's queue rows.

-- ---------- 4. server-side settings (delivery mode etc.) ----------
create table public.kaveri_app_settings (
  key text primary key,
  value jsonb not null,
  description text,
  updated_at timestamptz not null default now()
);

comment on table public.kaveri_app_settings is
  'Server-side application settings, written by ops via SQL/service role only. '
  'Never exposed through client RLS.';

insert into public.kaveri_app_settings (key, value, description)
values (
  'email_delivery',
  '{"mode": "disabled"}'::jsonb,
  'mode: disabled (queue only) | simulate_failure (dev, proves retries) | '
  'pg_net (production: outbox posts to a mailer endpoint). Credentials live in supabase_vault.'
)
on conflict (key) do nothing;

alter table public.kaveri_app_settings enable row level security;
-- No policies: server-internal settings.

-- =====================================================================
-- Server-side helpers (SECURITY DEFINER; no client execute)
-- =====================================================================

-- In-app notification (bypasses RLS as the definer; type validated by the
-- widened check constraint above).
create or replace function public.kaveri_notify(
  p_user_id uuid,
  p_title text,
  p_message text,
  p_type text default 'info',
  p_reference_id uuid default null,
  p_reference_type text default null,
  p_action_url text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_notification_id uuid;
begin
  insert into public.notifications (
    user_id, title, message, type, reference_id, reference_type, action_url
  )
  values (
    p_user_id, p_title, p_message, p_type,
    p_reference_id, p_reference_type, p_action_url
  )
  returning id into v_notification_id;

  return v_notification_id;
end;
$$;

-- Record a platform event (idempotent per dedupe_key).
create or replace function public.record_notification_event(
  p_event_type text,
  p_actor_user_id uuid,
  p_subject_user_id uuid,
  p_entity_type text,
  p_entity_id uuid,
  p_payload jsonb,
  p_dedupe_key text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_event_id uuid;
begin
  insert into public.notification_events (
    event_type, actor_user_id, subject_user_id, entity_type, entity_id,
    payload, dedupe_key
  )
  values (
    p_event_type, p_actor_user_id, p_subject_user_id, p_entity_type,
    p_entity_id, coalesce(p_payload, '{}'::jsonb), p_dedupe_key
  )
  on conflict (dedupe_key) where dedupe_key is not null
    do update set payload = excluded.payload
  returning id into v_event_id;

  return v_event_id;
end;
$$;

-- Queue one email in the outbox (idempotent per dedupe_key).
create or replace function public.kaveri_queue_email(
  p_recipient_user_id uuid,
  p_template_key text,
  p_payload jsonb,
  p_dedupe_key text default null,
  p_event_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_outbox_id uuid;
begin
  insert into public.notification_outbox (
    event_id, channel, template_key, recipient_user_id, recipient_email,
    recipient_name, payload, dedupe_key
  )
  select
    p_event_id, 'email', p_template_key, pr.id, pr.email, pr.full_name,
    coalesce(p_payload, '{}'::jsonb), p_dedupe_key
  from public.profiles pr
  where pr.id = p_recipient_user_id
    and pr.email is not null
  on conflict (dedupe_key) where dedupe_key is not null
    do nothing
  returning id into v_outbox_id;

  -- Conflict (already queued) → return the existing row for idempotency.
  if v_outbox_id is null and p_dedupe_key is not null then
    select id into v_outbox_id
    from public.notification_outbox
    where dedupe_key = p_dedupe_key
    limit 1;
  end if;

  return v_outbox_id;
end;
$$;

-- =====================================================================
-- Enrollment event orchestration (created / approved / rejected)
-- =====================================================================
create or replace function public.process_enrollment_event(
  p_event_type text,
  p_request_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_request public.enrollment_requests%rowtype;
  v_course   public.courses%rowtype;
  v_student  public.profiles%rowtype;
  v_event_id uuid;
  v_staff    uuid;
  v_base_payload jsonb;
  v_action_url text;
begin
  if p_event_type not in (
    'enrollment_request_created', 'enrollment_approved', 'enrollment_rejected'
  ) then
    raise exception 'UNSUPPORTED_ENROLLMENT_EVENT';
  end if;

  select * into v_request from public.enrollment_requests where id = p_request_id;
  if not found then
    raise exception 'REQUEST_NOT_FOUND';
  end if;

  select * into v_course from public.courses where id = v_request.course_id;
  select * into v_student from public.profiles where id = v_request.student_id;

  if v_course.id is null or v_student.id is null then
    raise exception 'ENROLLMENT_EVENT_CONTEXT_MISSING';
  end if;

  v_action_url := '/courses/' || coalesce(v_course.slug, '');

  v_base_payload := jsonb_build_object(
    'request_id', v_request.id,
    'student_id', v_student.id,
    'student_name', v_student.full_name,
    'student_email', v_student.email,
    'course_id', v_course.id,
    'course_title', v_course.title,
    'course_slug', v_course.slug,
    'requested_at', v_request.requested_at,
    'request_message', v_request.message
  );

  -- One append-only event per business action (idempotent per dedupe key).
  v_event_id := public.record_notification_event(
    p_event_type,
    (select auth.uid()),
    v_student.id,
    'course_enrollment_request',
    v_request.id,
    v_base_payload,
    p_event_type || ':' || v_request.id::text
  );

  if p_event_type = 'enrollment_request_created' then
    -- Student ack (in-app only).
    perform public.kaveri_notify(
      v_student.id,
      'Request received',
      'We received your access request for "' || v_course.title ||
        '". Our team will review it and you will be notified.',
      'info',
      v_request.id, 'enrollment_request', v_action_url
    );

    -- Notify + email admissions staff (super admins).
    for v_staff in
      select p.id from public.profiles p
      where p.role = 'super_admin' and p.is_active = true
    loop
      perform public.kaveri_notify(
        v_staff,
        'New enrollment request',
        v_student.full_name || ' requested access to "' || v_course.title || '".',
        'enrollment',
        v_request.id, 'enrollment_request', '/admin/enrollments/requests'
      );
      perform public.kaveri_queue_email(
        v_staff,
        'enrollment_request_created',
        v_base_payload,
        'enrollment_request_created:' || v_request.id::text || ':staff:' || v_staff::text,
        v_event_id
      );
    end loop;

  elsif p_event_type = 'enrollment_approved' then
    perform public.kaveri_notify(
      v_student.id,
      'Course access approved',
      'Your request for "' || v_course.title || '" was approved — the course is now available to you.',
      'success',
      v_request.id, 'enrollment_request', v_action_url
    );
    perform public.kaveri_queue_email(
      v_student.id,
      'enrollment_approved',
      v_base_payload,
      'enrollment_approved:' || v_request.id::text,
      v_event_id
    );

  elsif p_event_type = 'enrollment_rejected' then
    perform public.kaveri_notify(
      v_student.id,
      'Course access request not approved',
      'Your request for "' || v_course.title ||
        '" was not approved' ||
        case when v_request.review_note is not null and v_request.review_note <> ''
          then ': ' || v_request.review_note else '. Contact Kaveri if you believe this is an error.' end,
      'error',
      v_request.id, 'enrollment_request', v_action_url
    );
    perform public.kaveri_queue_email(
      v_student.id,
      'enrollment_rejected',
      jsonb_build_object(
        'review_note', v_request.review_note,
        'reviewed_at', v_request.reviewed_at
      ) || v_base_payload,
      'enrollment_rejected:' || v_request.id::text,
      v_event_id
    );
  end if;

  return v_event_id;
end;
$$;

-- Trigger: request created by a student → event immediately.
create or replace function public.on_enrollment_request_created()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.status = 'pending' then
    perform public.process_enrollment_event('enrollment_request_created', new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists enrollment_request_created_notify_trigger
  on public.enrollment_requests;

create trigger enrollment_request_created_notify_trigger
  after insert on public.enrollment_requests
  for each row
  execute function public.on_enrollment_request_created();

-- ---------- Approve / reject now emit events inside the SAME transaction ----------
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

  -- Emit event + in-app + outbox (same transaction; async delivery).
  perform public.process_enrollment_event('enrollment_rejected', p_request_id);

  return jsonb_build_object('ok', true, 'request_id', v_request.id, 'status', 'rejected');
end;
$$;

-- =====================================================================
-- Outbox worker (delivery state machine with retries + backoff)
-- =====================================================================
create or replace function public.process_notification_outbox(
  p_batch_size int default 25
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_mode text;
  v_claimed uuid[];
  v_item uuid;
  v_delivered int := 0;
  v_failed int := 0;
  v_skipped int := 0;
  v_transient int := 0;
begin
  if p_batch_size < 1 or p_batch_size > 500 then
    raise exception 'INVALID_BATCH_SIZE';
  end if;

  select coalesce(value ->> 'mode', 'disabled')
  into v_mode
  from public.kaveri_app_settings
  where key = 'email_delivery';

  -- Claim due rows (row lock held until commit; concurrent workers skip
  -- locked rows, so an email is never double-sent).  array_agg over an
  -- empty set returns NULL, so the loop below tolerates that.
  select array_agg(claimed.id)
  into v_claimed
  from (
    select o.id
    from public.notification_outbox o
    where o.status in ('queued', 'sending')
      and o.attempts < o.max_attempts
      and o.next_attempt_at <= now()
    order by o.created_at asc
    limit p_batch_size
    for update skip locked
  ) claimed;

  foreach v_item in array coalesce(v_claimed, array[]::uuid[]) loop
    if v_mode = 'simulate_failure' then
      -- Dev/diagnostic mode: first attempt fails transiently, later succeeds.
      -- Exercises backoff + retry without any mail provider.
      if (select payload ->> 'simulated_failure_applied' from public.notification_outbox where id = v_item) is null then
        update public.notification_outbox
        set attempts = attempts + 1,
            status = 'queued',
            next_attempt_at = now() + interval '1 minute',
            payload = payload || '{"simulated_failure_applied": true}'::jsonb,
            last_error = 'simulated transient delivery failure',
            updated_at = now()
        where id = v_item;
        v_transient := v_transient + 1;
      else
        update public.notification_outbox
        set attempts = attempts + 1,
            status = 'sent',
            sent_at = now(),
            last_error = null,
            updated_at = now()
        where id = v_item;
        v_delivered := v_delivered + 1;
      end if;

    elsif v_mode = 'pg_net' then
      -- Production adapter: outbox → pg_net → configured mailer endpoint.
      -- Requires pg_net extension + vault-stored endpoint/credentials
      -- (see docs/ecosystem-integration-design.md). Until the adapter posts,
      -- rows stay queued and are retried on schedule without burning attempts.
      update public.notification_outbox
      set status = 'queued',
          next_attempt_at = now() + interval '5 minutes',
          updated_at = now()
      where id = v_item;
      v_transient := v_transient + 1;

    else
      -- mode = 'disabled' (default local state): queue is durable but no
      -- mailer is configured. Mark skipped honestly; ops can requeue later.
      update public.notification_outbox
      set attempts = attempts + 1,
          status = 'skipped',
          last_error = 'email delivery disabled (kaveri_app_settings email_delivery); requeue when a provider is configured',
          updated_at = now()
      where id = v_item;
      v_skipped := v_skipped + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'claimed', coalesce(array_length(v_claimed, 1), 0),
    'mode', v_mode,
    'delivered', v_delivered,
    'transient_retry', v_transient,
    'skipped_no_provider', v_skipped,
    'failed', v_failed
  );
end;
$$;

-- Ops helper: requeue skipped/failed rows (optionally one row).
create or replace function public.requeue_notification_outbox(
  p_id uuid default null,
  p_reset_attempts boolean default true
)
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_id is not null then
    update public.notification_outbox
    set status = 'queued',
        next_attempt_at = now(),
        attempts = case when p_reset_attempts then 0 else attempts end,
        last_error = null,
        updated_at = now()
    where id = p_id
      and status in ('skipped', 'failed', 'sent');
  else
    update public.notification_outbox
    set status = 'queued',
        next_attempt_at = now(),
        attempts = case when p_reset_attempts then 0 else attempts end,
        last_error = null,
        updated_at = now()
    where status in ('skipped', 'failed')
      and (payload ->> 'simulated_failure_applied') is null;
  end if;

  return 1;
end;
$$;

-- ---------- Execution scoping ----------
-- Internal helpers + worker are not client-callable.  They run as the
-- SECURITY DEFINER owner from triggers, RPC bodies, or the service role.
revoke all on function public.kaveri_notify(uuid, text, text, text, uuid, text, text)
  from public, anon, authenticated;
revoke all on function public.record_notification_event(text, uuid, uuid, text, uuid, jsonb, text)
  from public, anon, authenticated;
revoke all on function public.kaveri_queue_email(uuid, text, jsonb, text, uuid)
  from public, anon, authenticated;
revoke all on function public.process_enrollment_event(text, uuid)
  from public, anon, authenticated;
revoke all on function public.on_enrollment_request_created()
  from public, anon, authenticated;
revoke all on function public.process_notification_outbox(int)
  from public, anon, authenticated;
revoke all on function public.requeue_notification_outbox(uuid, boolean)
  from public, anon, authenticated;

grant execute on function public.process_notification_outbox(int) to service_role;
grant execute on function public.requeue_notification_outbox(uuid, boolean) to service_role;
