-- =====================================================================
-- Workshop Bridge V1 — central workshop model + HMAC webhook ingestion
--
-- 1. workshops             — central catalog of platform workshops keyed by
--                            source + external_workshop_id (the Workshop
--                            app's stable event id). No passwords, no auth
--                            account creation.
-- 2. workshop_registrations — one row per workshop registration keyed by
--                            source + external_registration_id. user_id is
--                            set ONLY when the matching Supabase Auth email
--                            is verified; otherwise the attendee stays an
--                            external lead (user_id NULL). RLS: students see
--                            only their own rows; external attendees are
--                            never visible to students.
-- 3. integration_audit_log  — server-internal audit trail (NOT cryptograph-
--                            ically tamper-evident) with source + action +
--                            idempotency_key uniqueness so replays answer
--                            "duplicate" and never double-mutate.
-- 4. ingest_workshop_registration() — SECURITY DEFINER, service-role only:
--                            idempotent upsert of workshop + registration,
--                            verified-email account linking, event + in-app
--                            notification. NEVER queues an email — Apps
--                            Script remains the single registration email
--                            source (single-source rule).
--
-- Auth: the integrations-workshop Edge Function verifies HMAC-SHA256
-- (timestamp + "." + raw body) with a per-satellite secret (vault/env,
-- server-side only), then calls this RPC with the service-role client.
-- =====================================================================

-- ---------- 1. workshops ----------
create table public.workshops (
  id uuid primary key default gen_random_uuid(),
  source text not null default 'workshop-app',
  external_workshop_id text not null,
  name text not null,
  slug text,
  starts_at timestamptz,
  venue text,
  mode text check (mode in ('online', 'offline', 'hybrid')),
  status text not null default 'published'
    check (status in ('draft', 'published', 'completed', 'cancelled')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index workshops_source_external_uidx
  on public.workshops (source, external_workshop_id);

alter table public.workshops enable row level security;

-- Workshops are public event info: readable by anyone, writable only
-- server-side (no client policies for writes).
create policy workshops_select_public
  on public.workshops
  for select
  to anon, authenticated
  using (true);

-- ---------- 2. workshop_registrations ----------
create table public.workshop_registrations (
  id uuid primary key default gen_random_uuid(),
  workshop_id uuid not null references public.workshops(id) on delete cascade,
  source text not null default 'workshop-app',
  external_registration_id text not null,
  user_id uuid references public.profiles(id) on delete set null,
  email text not null,
  full_name text,
  phone text,
  status text not null default 'registered'
    check (status in ('registered', 'attended', 'cancelled', 'waitlisted')),
  registered_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index workshop_registrations_source_external_uidx
  on public.workshop_registrations (source, external_registration_id);

create index workshop_registrations_user_idx
  on public.workshop_registrations (user_id);

create index workshop_registrations_workshop_idx
  on public.workshop_registrations (workshop_id);

create index workshop_registrations_email_idx
  on public.workshop_registrations (email);

alter table public.workshop_registrations enable row level security;

-- Students see only their OWN registrations (linked via verified email).
-- External attendees (user_id NULL) are never exposed to students.
create policy workshop_registrations_select_own_or_admin
  on public.workshop_registrations
  for select
  to authenticated
  using (user_id = (select auth.uid()) or is_admin());

-- No client insert/update/delete policies: ingest goes through the
-- validated SECURITY DEFINER RPC only (admin direct ops via SQL).

-- ---------- 3. integration_audit_log ----------
create table public.integration_audit_log (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  action text not null,
  idempotency_key text not null,
  request_sha256 text,
  request_summary jsonb not null default '{}'::jsonb,
  response_code int,
  result text,
  created_at timestamptz not null default now()
);

comment on table public.integration_audit_log is
  'Server-internal audit trail of accepted (and rejected) integration calls. '
  'Not cryptographically tamper-evident. Uniqueness on (source, action, '
  'idempotency_key) makes replays harmless.';

create unique index integration_audit_log_key_idx
  on public.integration_audit_log (source, action, idempotency_key);

create index integration_audit_log_created_idx
  on public.integration_audit_log (created_at desc);

alter table public.integration_audit_log enable row level security;
-- No policies: server-internal, never client-readable.

-- ---------- 4. ingest RPC (idempotent, verified-email linking) ----------
create or replace function public.ingest_workshop_registration(
  p_source text,
  p_external_workshop_id text,
  p_external_registration_id text,
  p_workshop_name text,
  p_email text,
  p_full_name text default null,
  p_phone text default null,
  p_workshop_slug text default null,
  p_starts_at timestamptz default null,
  p_venue text default null,
  p_mode text default null,
  p_registration_status text default 'registered',
  p_registered_at timestamptz default null,
  p_metadata jsonb default '{}'::jsonb,
  p_idempotency_key text default null,
  p_action text default 'workshop.registration.upsert'
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_email text;
  v_workshop_id uuid;
  v_registration_id uuid;
  v_user_id uuid;
  v_event_id uuid;
  v_duplicate boolean := false;
  v_summary jsonb;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'INSUFFICIENT_PRIVILEGE';
  end if;

  v_email := lower(btrim(p_email));

  if v_email = '' or v_email is null then
    raise exception 'INVALID_EMAIL';
  end if;
  if p_external_workshop_id is null or p_external_workshop_id = '' then
    raise exception 'INVALID_EXTERNAL_WORKSHOP_ID';
  end if;
  if p_external_registration_id is null or p_external_registration_id = '' then
    raise exception 'INVALID_EXTERNAL_REGISTRATION_ID';
  end if;

  -- Idempotency: an already-processed key answers duplicate without
  -- mutating anything again.
  if p_idempotency_key is not null then
    select true, request_summary into v_duplicate, v_summary
    from public.integration_audit_log
    where source = p_source
      and action = p_action
      and idempotency_key = p_idempotency_key
    limit 1;

    if v_duplicate then
      return jsonb_build_object(
        'ok', true, 'duplicate', true,
        'registration_id', coalesce(v_summary ->> 'registration_id', null),
        'result', coalesce(v_summary ->> 'result', 'already processed')
      );
    end if;
  end if;

  -- Upsert the workshop (stable source + external key).
  insert into public.workshops (
    source, external_workshop_id, name, slug, starts_at, venue, mode, metadata
  )
  values (
    p_source, p_external_workshop_id, p_workshop_name, p_workshop_slug,
    p_starts_at, p_venue, nullif(p_mode, ''), coalesce(p_metadata, '{}'::jsonb)
  )
  on conflict (source, external_workshop_id) do update
    set name = excluded.name,
        slug = coalesce(excluded.slug, workshops.slug),
        starts_at = coalesce(excluded.starts_at, workshops.starts_at),
        venue = coalesce(excluded.venue, workshops.venue),
        mode = coalesce(excluded.mode, workshops.mode),
        metadata = case when excluded.metadata <> '{}'::jsonb
                        then excluded.metadata else workshops.metadata end,
        updated_at = now()
  returning id into v_workshop_id;

  -- Account linking ONLY when the Supabase Auth email is verified/confirmed.
  -- A profiles.email string alone is never proof of ownership.
  select p.id into v_user_id
  from public.profiles p
  join auth.users u on u.id = p.id
  where lower(u.email) = v_email
    and u.email_confirmed_at is not null
    and p.is_active = true
  limit 1;

  -- Upsert the registration (stable source + external key).
  insert into public.workshop_registrations (
    workshop_id, source, external_registration_id, user_id, email, full_name,
    phone, status, registered_at, metadata
  )
  values (
    v_workshop_id, p_source, p_external_registration_id, v_user_id, v_email,
    nullif(p_full_name, ''), nullif(p_phone, ''), p_registration_status,
    coalesce(p_registered_at, now()), coalesce(p_metadata, '{}'::jsonb)
  )
  on conflict (source, external_registration_id) do update
    set workshop_id = excluded.workshop_id,
        -- Never unlink a previously linked verified user on a replay; only
        -- upgrade an external lead to a linked user when now verified.
        user_id = coalesce(workshop_registrations.user_id, excluded.user_id),
        full_name = coalesce(excluded.full_name, workshop_registrations.full_name),
        phone = coalesce(excluded.phone, workshop_registrations.phone),
        status = excluded.status,
        registered_at = coalesce(excluded.registered_at, workshop_registrations.registered_at),
        metadata = case when excluded.metadata <> '{}'::jsonb
                        then excluded.metadata else workshop_registrations.metadata end,
        updated_at = now()
  returning id into v_registration_id;

  -- One append-only event per registration (idempotent per dedupe key).
  v_event_id := public.record_notification_event(
    'workshop_registered',
    null,
    v_user_id,
    'workshop_registration',
    v_registration_id,
    jsonb_build_object(
      'workshop_id', v_workshop_id,
      'workshop_name', p_workshop_name,
      'workshop_slug', p_workshop_slug,
      'starts_at', p_starts_at,
      'venue', p_venue,
      'registration_id', v_registration_id,
      'external_registration_id', p_external_registration_id,
      'linked_user_id', v_user_id,
      'linked', v_user_id is not null
    ),
    'workshop_registered:' || v_registration_id::text
  );

  -- In-app notification for linked users only. NO EMAIL: Apps Script stays
  -- the single registration confirmation source (single-source rule).
  if v_user_id is not null then
    perform public.kaveri_notify(
      v_user_id,
      'Workshop registration confirmed',
      'Your registration for "' || p_workshop_name || '" is confirmed.' ||
        case when p_starts_at is not null
             then ' Scheduled for ' || to_char(p_starts_at at time zone 'Asia/Kolkata', 'DD Mon YYYY, HH24:MI') || '.' else '' end,
      'workshop',
      v_registration_id, 'workshop_registration',
      case when p_workshop_slug is not null and p_workshop_slug <> ''
           then '/workshops/' || p_workshop_slug else null end
    );
  end if;

  -- Audit trail (only after a successful mutation).
  insert into public.integration_audit_log (
    source, action, idempotency_key, request_sha256,
    request_summary, response_code, result
  )
  values (
    p_source, p_action,
    coalesce(p_idempotency_key, 'manual:' || v_registration_id::text),
    null,
    jsonb_build_object(
      'external_workshop_id', p_external_workshop_id,
      'external_registration_id', p_external_registration_id,
      'registration_id', v_registration_id,
      'linked_user_id', v_user_id,
      'linked', v_user_id is not null,
      'email_domain', coalesce(split_part(v_email, '@', 2), '')
    ),
    200,
    'processed'
  )
  on conflict (source, action, idempotency_key) do nothing;

  return jsonb_build_object(
    'ok', true,
    'duplicate', false,
    'registration_id', v_registration_id,
    'workshop_id', v_workshop_id,
    'linked_user_id', v_user_id,
    'linked', v_user_id is not null,
    'event_id', v_event_id
  );
end;
$$;

-- ---------- execution scoping ----------
revoke all on function public.ingest_workshop_registration(text, text, text, text, text, text, text, text, timestamptz, text, text, text, timestamptz, jsonb, text, text)
  from public, anon, authenticated;
grant execute on function public.ingest_workshop_registration(text, text, text, text, text, text, text, text, timestamptz, text, text, text, timestamptz, jsonb, text, text) to service_role;