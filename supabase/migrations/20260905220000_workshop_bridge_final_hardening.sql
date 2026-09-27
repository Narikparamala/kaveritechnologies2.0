-- =====================================================================
-- Workshop Bridge final hardening (forward migration, local-only)
--
-- 1. workshops SELECT RLS by status:
--      anon            → published rows only
--      authenticated   → non-draft rows (a linked student's completed /
--                        cancelled workshop stays usable); admins see all
--                        rows including draft
--    (service_role bypasses RLS for ingestion/admin ops)
--
-- 2. ingest_workshop_registration():
--      - in-app notification dedupe by stable registration identity
--        (user_id + reference_type='workshop_registration' +
--        reference_id) so a replay under a different idempotency key
--        never duplicates the confirmation
--      - blank venue/slug/mode are treated as unknown (NULL) so a replay
--        can never blank curated central workshop values
--      - mode is normalized to online | offline | hybrid; anything else
--        is stored as NULL (never invented)
-- =====================================================================

-- ---------- 1. workshops status-scoped SELECT policies ----------
drop policy if exists workshops_select_public on public.workshops;

create policy workshops_select_anon_published
  on public.workshops
  for select
  to anon
  using (status = 'published');

create policy workshops_select_authenticated
  on public.workshops
  for select
  to authenticated
  using (status <> 'draft' or is_admin());

-- ---------- 2. hardened ingest RPC ----------
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
  v_venue text;
  v_slug text;
  v_mode text;
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

  -- Blank strings are "unknown", never "erase": existing central values
  -- are preserved via the coalesce upsert below.
  v_venue := nullif(btrim(coalesce(p_venue, '')), '');
  v_slug := nullif(btrim(coalesce(p_workshop_slug, '')), '');
  v_mode := case when p_mode in ('online', 'offline', 'hybrid') then p_mode else null end;

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

  -- Upsert the workshop (stable source + external key). Metadata refreshes
  -- only when the incoming payload actually carries metadata.
  insert into public.workshops (
    source, external_workshop_id, name, slug, starts_at, venue, mode, metadata
  )
  values (
    p_source, p_external_workshop_id, p_workshop_name, v_slug,
    p_starts_at, v_venue, v_mode, coalesce(p_metadata, '{}'::jsonb)
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
      'workshop_slug', v_slug,
      'starts_at', p_starts_at,
      'venue', v_venue,
      'registration_id', v_registration_id,
      'external_registration_id', p_external_registration_id,
      'linked_user_id', v_user_id,
      'linked', v_user_id is not null
    ),
    'workshop_registered:' || v_registration_id::text
  );

  -- In-app notification for linked users only, deduped by the stable
  -- registration identity so a replay under a different idempotency key
  -- can never stack duplicate confirmations. NO EMAIL: Apps Script stays
  -- the single registration confirmation source (single-source rule).
  if v_user_id is not null then
    if not exists (
      select 1
      from public.notifications n
      where n.user_id = v_user_id
        and n.reference_type = 'workshop_registration'
        and n.reference_id = v_registration_id
    ) then
      perform public.kaveri_notify(
        v_user_id,
        'Workshop registration confirmed',
        'Your registration for "' || p_workshop_name || '" is confirmed.' ||
          case when p_starts_at is not null
               then ' Scheduled for ' || to_char(p_starts_at at time zone 'Asia/Kolkata', 'DD Mon YYYY, HH24:MI') || '.' else '' end,
        'workshop',
        v_registration_id, 'workshop_registration',
        case when v_slug is not null and v_slug <> ''
             then '/workshops/' || v_slug else null end
      );
    end if;
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

-- ---------- execution scoping (unchanged, re-asserted) ----------
revoke all on function public.ingest_workshop_registration(text, text, text, text, text, text, text, text, timestamptz, text, text, text, timestamptz, jsonb, text, text)
  from public, anon, authenticated;
grant execute on function public.ingest_workshop_registration(text, text, text, text, text, text, text, text, timestamptz, text, text, text, timestamptz, jsonb, text, text) to service_role;
