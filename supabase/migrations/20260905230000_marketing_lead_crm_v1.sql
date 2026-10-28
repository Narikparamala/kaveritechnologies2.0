-- =====================================================================
-- Marketing Lead CRM V1
--
-- Ingestion target for the Kaveri marketing-growth app:
--   marketing app (server only)
--     -> Edge Function integrations-marketing-leads (HMAC verified)
--       -> ingest_marketing_lead() RPC (service-role only)
--         -> marketing_leads + attribution + status history
--           -> Super Admin CRM UI (/leads)
--
-- A marketing lead is an EXTERNAL prospect. It must NEVER automatically
-- create an auth user or profile. JOINED is a CRM state; conversion to a
-- student happens later via an explicit admin admission action.
-- =====================================================================

-- ---------- Enums ----------
create type public.marketing_lead_status as enum (
  'NEW', 'CONTACTED', 'INTERESTED', 'COUNSELLING', 'DEMO_SCHEDULED',
  'FOLLOW_UP', 'JOINED', 'NOT_INTERESTED', 'INVALID', 'NO_RESPONSE'
);

create type public.marketing_lead_type as enum (
  'course_enquiry', 'general_training', 'career_return',
  'computer_skills', 'internship', 'project_mentoring', 'trainer_application'
);

-- ---------- Main lead table ----------
create table public.marketing_leads (
  id uuid primary key default gen_random_uuid(),
  reference_code text not null unique,
  lead_type public.marketing_lead_type not null,
  full_name text not null,
  phone text not null,
  normalized_phone text not null,
  email text,
  normalized_email text,
  college text,
  qualification text,
  degree text,
  branch text,
  graduation_year text,
  skills text,
  internship_area text,
  experience text,
  resume_url text,
  message text,
  course_slug text,
  course_title text,
  consent boolean not null,
  status public.marketing_lead_status not null default 'NEW',
  next_followup_at timestamptz,
  converted_profile_id uuid references public.profiles(id),
  converted_at timestamptz,
  duplicate_of_lead_id uuid references public.marketing_leads(id),
  landing_page text,
  user_agent text,
  ip_hash text,
  source_system text not null default 'kaveri-marketing-growth',
  source_event text not null default 'marketing.lead.created',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index marketing_leads_created_at_idx on public.marketing_leads (created_at desc);
create index marketing_leads_status_idx on public.marketing_leads (status);
create index marketing_leads_lead_type_idx on public.marketing_leads (lead_type);
create index marketing_leads_normalized_phone_idx on public.marketing_leads (normalized_phone);
create index marketing_leads_normalized_email_idx on public.marketing_leads (normalized_email);
create index marketing_leads_converted_profile_idx on public.marketing_leads (converted_profile_id)
  where converted_profile_id is not null;

-- ---------- Status history ----------
create table public.marketing_lead_status_history (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.marketing_leads(id) on delete cascade,
  from_status public.marketing_lead_status,
  to_status public.marketing_lead_status not null,
  changed_by uuid references public.profiles(id),
  changed_via text not null default 'admin' check (changed_via in ('admin', 'integration', 'system')),
  note text,
  created_at timestamptz not null default now()
);

create index marketing_lead_status_history_lead_idx on public.marketing_lead_status_history (lead_id, created_at);

-- ---------- Internal notes ----------
create table public.marketing_lead_notes (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.marketing_leads(id) on delete cascade,
  author_profile_id uuid references public.profiles(id),
  note text not null check (char_length(note) between 1 and 4000),
  created_at timestamptz not null default now()
);

create index marketing_lead_notes_lead_idx on public.marketing_lead_notes (lead_id, created_at desc);

-- ---------- Follow-ups ----------
create table public.marketing_lead_followups (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.marketing_leads(id) on delete cascade,
  due_at timestamptz not null,
  completed_at timestamptz,
  summary text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index marketing_lead_followups_lead_idx on public.marketing_lead_followups (lead_id, due_at);

-- ---------- Attribution ----------
create table public.marketing_attribution_touches (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.marketing_leads(id) on delete cascade,
  touch_type text not null check (touch_type in ('first_touch', 'last_touch')),
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  utm_term text,
  fbclid text,
  gclid text,
  landing_page text,
  referrer text,
  captured_at timestamptz,
  created_at timestamptz not null default now(),
  unique (lead_id, touch_type)
);

create index marketing_attribution_touches_source_idx on public.marketing_attribution_touches (utm_source);
create index marketing_attribution_touches_campaign_idx on public.marketing_attribution_touches (utm_campaign);

-- ---------- updated_at trigger ----------
create or replace function public.marketing_leads_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_marketing_leads_updated_at
  before update on public.marketing_leads
  for each row execute function public.marketing_leads_set_updated_at();

-- =====================================================================
-- Secure ingestion RPC (service-role only; called by the Edge Function)
-- =====================================================================

-- Simple text sanitizer: trim, collapse whitespace, enforce max length.
create or replace function public.ml_clean_text(p_value jsonb, p_max int)
returns text language sql immutable as $$
  select nullif(left(regexp_replace(coalesce(p_value #>> '{}', ''), '\s+', ' ', 'g'), p_max), '')
$$;

create or replace function public.ml_normalize_phone(p_phone text)
returns text language plpgsql immutable as $$
declare
  digits text;
begin
  digits := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  -- Accept 10-digit local numbers starting 6-9, or with a 91 country prefix.
  if char_length(digits) = 12 and left(digits, 2) = '91' then
    digits := right(digits, 10);
  elsif char_length(digits) = 11 and left(digits, 1) = '0' then
    digits := right(digits, 10);
  end if;
  if char_length(digits) <> 10 or left(digits, 1) not in ('6', '7', '8', '9') then
    raise exception 'Invalid phone number';
  end if;
  return digits;
end;
$$;

create or replace function public.ml_touch_from_json(p_touch jsonb)
returns public.marketing_attribution_touches
language sql stable as $$
  select h::public.marketing_attribution_touches
  from (
    select
      (p_touch ->> 'utm_source')   as utm_source,
      (p_touch ->> 'utm_medium')   as utm_medium,
      (p_touch ->> 'utm_campaign') as utm_campaign,
      (p_touch ->> 'utm_content')  as utm_content,
      (p_touch ->> 'utm_term')     as utm_term,
      (p_touch ->> 'fbclid')       as fbclid,
      (p_touch ->> 'gclid')        as gclid,
      left(nullif(regexp_replace(coalesce(p_touch ->> 'landing_page', ''), '\s+', ' ', 'g'), ''), 1000) as landing_page,
      left(nullif(coalesce(p_touch ->> 'referrer', ''), ''), 1000) as referrer,
      case
        when p_touch ->> 'captured_at' is null then null
        when (p_touch ->> 'captured_at') ~ '^\d{4}-\d{2}-\d{2}T' then (p_touch ->> 'captured_at')::timestamptz
        else null
      end as captured_at
  ) h
$$;

-- Ingest one marketing lead. Only service_role may execute this.
create or replace function public.ingest_marketing_lead(
  p_idempotency_key text,
  p_request_sha256 text,
  p_lead jsonb,
  p_first_touch jsonb,
  p_last_touch jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source      constant text := 'kaveri-marketing-growth';
  v_action      constant text := 'marketing.lead.created';
  v_existing    record;
  v_audit_id    uuid;
  v_ref         text;
  v_lead_id     uuid;
  v_lead_type   public.marketing_lead_type;
  v_norm_phone  text;
  v_norm_email  text;
  v_dup_id      uuid;
  v_result      jsonb;
begin
  if p_idempotency_key is null or char_length(p_idempotency_key) < 8 or char_length(p_idempotency_key) > 200 then
    raise exception 'Invalid idempotency key';
  end if;
  if p_request_sha256 is null or p_request_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid request hash';
  end if;

  -- ----- Idempotency: audit log is authoritative (source + action + key) -----
  select ial.request_sha256, ial.request_summary
    into v_existing
    from public.integration_audit_log ial
   where ial.source = v_source
     and ial.action = v_action
     and ial.idempotency_key = p_idempotency_key
     limit 1;

  if v_existing is not null then
    if v_existing.request_sha256 = p_request_sha256
       and v_existing.request_summary ? 'lead_id' then
      -- Same payload retried after a timeout: safely return the original result.
      return v_existing.request_summary;
    end if;
    raise exception 'Idempotency conflict';
  end if;

  -- ----- Validation -----
  if p_lead is null or jsonb_typeof(p_lead) <> 'object' then
    raise exception 'Invalid lead payload';
  end if;

  if coalesce((p_lead ->> 'consent')::boolean, false) is not true then
    raise exception 'Consent is required';
  end if;

  v_lead_type := (p_lead ->> 'leadType')::public.marketing_lead_type;
  if v_lead_type is null then
    raise exception 'Invalid lead type';
  end if;

  v_norm_phone := public.ml_normalize_phone(p_lead ->> 'phone');
  v_norm_email := lower(nullif(btrim(coalesce(p_lead ->> 'email', '')), ''));
  if v_norm_email is not null and v_norm_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    v_norm_email := null;
  end if;

  if char_length(coalesce(p_lead ->> 'fullName', '')) < 2
     or char_length(coalesce(p_lead ->> 'fullName', '')) > 120 then
    raise exception 'Invalid full name';
  end if;

  if coalesce(p_lead ->> 'resumeUrl', '') <> ''
     and coalesce(p_lead ->> 'resumeUrl', '') !~ '^https?://\S{1,1000}$' then
    raise exception 'Invalid resume URL';
  end if;

  if coalesce(p_lead ->> 'graduationYear', '') <> ''
     and coalesce(p_lead ->> 'graduationYear', '') !~ '^\d{4}$' then
    raise exception 'Invalid graduation year';
  end if;

  -- ----- Reserve the idempotency key atomically (race-safe) -----
  insert into public.integration_audit_log (source, action, idempotency_key, request_sha256, result)
  values (v_source, v_action, p_idempotency_key, p_request_sha256, 'processing')
  on conflict (source, action, idempotency_key) do nothing
  returning id into v_audit_id;

  if v_audit_id is null then
    -- Lost a concurrent race for this key: re-read and apply the same rules.
    select ial.request_sha256, ial.request_summary
      into v_existing
      from public.integration_audit_log ial
     where ial.source = v_source
       and ial.action = v_action
       and ial.idempotency_key = p_idempotency_key
       limit 1;
    if v_existing.request_sha256 = p_request_sha256
       and v_existing.request_summary ? 'lead_id' then
      return v_existing.request_summary;
    end if;
    raise exception 'Idempotency conflict';
  end if;

  begin
    -- ----- Extract and insert the lead -----
    v_ref := 'ML-' || to_char(now(), 'YYYYMMDD') || '-'
             || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));

    -- Conservative duplicate-candidate rule: a prior, non-INVALID lead with
    -- the same normalized phone in the last 180 days. The new enquiry is
    -- ALWAYS preserved; we only record the relationship for the CRM UI.
    select l.id into v_dup_id
      from public.marketing_leads l
     where l.normalized_phone = public.ml_normalize_phone(p_lead ->> 'phone')
       and l.status <> 'INVALID'
       and l.created_at > now() - interval '180 days'
     order by l.created_at desc
     limit 1;

    insert into public.marketing_leads (
      reference_code, lead_type, full_name, phone, normalized_phone,
      email, normalized_email, college, qualification, degree, branch,
      graduation_year, skills, internship_area, experience, resume_url,
      message, course_slug, course_title, consent, landing_page,
      user_agent, ip_hash, duplicate_of_lead_id
    ) values (
      v_ref,
      v_lead_type,
      public.ml_clean_text(p_lead -> 'fullName', 120),
      public.ml_clean_text(p_lead -> 'phone', 20),
      v_norm_phone,
      public.ml_clean_text(p_lead -> 'email', 254),
      v_norm_email,
      public.ml_clean_text(p_lead -> 'college', 180),
      public.ml_clean_text(p_lead -> 'qualification', 180),
      public.ml_clean_text(p_lead -> 'degree', 120),
      public.ml_clean_text(p_lead -> 'branch', 120),
      nullif(public.ml_clean_text(p_lead -> 'graduationYear', 4), ''),
      public.ml_clean_text(p_lead -> 'skills', 500),
      public.ml_clean_text(p_lead -> 'internshipArea', 120),
      public.ml_clean_text(p_lead -> 'experience', 1500),
      public.ml_clean_text(p_lead -> 'resumeUrl', 1000),
      public.ml_clean_text(p_lead -> 'message', 1500),
      public.ml_clean_text(p_lead -> 'courseSlug', 100),
      public.ml_clean_text(p_lead -> 'courseTitle', 180),
      true,
      public.ml_clean_text(p_lead -> 'page', 1000),
      public.ml_clean_text(p_lead -> 'userAgent', 500),
      nullif(public.ml_clean_text(p_lead -> 'ipHash', 128), ''),
      v_dup_id
    ) returning id into v_lead_id;

    -- ----- Attribution (first touch + last/current touch) -----
    if p_first_touch is not null and jsonb_typeof(p_first_touch) = 'object' and p_first_touch <> '{}'::jsonb then
      insert into public.marketing_attribution_touches (
        lead_id, touch_type, utm_source, utm_medium, utm_campaign,
        utm_content, utm_term, fbclid, gclid, landing_page, referrer, captured_at
      )
      select v_lead_id, 'first_touch', t.utm_source, t.utm_medium, t.utm_campaign,
             t.utm_content, t.utm_term, t.fbclid, t.gclid, t.landing_page, t.referrer, t.captured_at
        from (select (public.ml_touch_from_json(p_first_touch)).*) t;
    end if;

    if p_last_touch is not null and jsonb_typeof(p_last_touch) = 'object' and p_last_touch <> '{}'::jsonb then
      insert into public.marketing_attribution_touches (
        lead_id, touch_type, utm_source, utm_medium, utm_campaign,
        utm_content, utm_term, fbclid, gclid, landing_page, referrer, captured_at
      )
      select v_lead_id, 'last_touch', t.utm_source, t.utm_medium, t.utm_campaign,
             t.utm_content, t.utm_term, t.fbclid, t.gclid, t.landing_page, t.referrer, t.captured_at
        from (select (public.ml_touch_from_json(p_last_touch)).*) t;
    end if;

    -- ----- Initial CRM status evidence -----
    insert into public.marketing_lead_status_history (lead_id, from_status, to_status, changed_via)
    values (v_lead_id, null, 'NEW', 'integration');

    v_result := jsonb_build_object(
      'ok', true,
      'leadId', v_lead_id,
      'referenceCode', v_ref,
      'duplicateCandidate', (v_dup_id is not null)
    );

    update public.integration_audit_log
       set request_summary = v_result,
           result = 'success'
     where id = v_audit_id;

    return v_result;
  exception
    when others then
      -- The whole transaction (including the reserved idempotency-key row)
      -- rolls back on re-raise, so the key stays retryable for the sender
      -- after a transient failure. No half-processed lead can persist.
      raise;
  end;
$$;

-- =====================================================================
-- Super Admin CRM action RPCs
-- History integrity is enforced server-side: the UI cannot mutate
-- status or bypass history evidence because tables are insert-protected.
-- =====================================================================

-- Change lead status with mandatory status-history evidence.
create or replace function public.marketing_lead_set_status(
  p_lead_id uuid,
  p_to_status public.marketing_lead_status,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current public.marketing_lead_status;
begin
  if not public.is_admin() then
    raise exception 'Not authorized';
  end if;

  select status into v_current from public.marketing_leads where id = p_lead_id;
  if v_current is null then
    raise exception 'Lead not found';
  end if;
  if v_current = p_to_status then
    return;
  end if;

  update public.marketing_leads set status = p_to_status where id = p_lead_id;

  insert into public.marketing_lead_status_history (lead_id, from_status, to_status, changed_by, changed_via, note)
  values (p_lead_id, v_current, p_to_status, auth.uid(), 'admin', public.ml_clean_text(to_jsonb(p_note), 500));
end;
$$;

-- Add an internal CRM note.
create or replace function public.marketing_lead_add_note(p_lead_id uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Not authorized';
  end if;
  if p_note is null or btrim(p_note) = '' then
    raise exception 'Note is required';
  end if;
  if not exists (select 1 from public.marketing_leads where id = p_lead_id) then
    raise exception 'Lead not found';
  end if;
  insert into public.marketing_lead_notes (lead_id, author_profile_id, note)
  values (p_lead_id, auth.uid(), left(btrim(p_note), 4000));
end;
$$;

-- Create a follow-up and reflect it on the lead for list views.
create or replace function public.marketing_lead_create_followup(
  p_lead_id uuid,
  p_due_at timestamptz,
  p_summary text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Not authorized';
  end if;
  if p_due_at is null then
    raise exception 'Due date is required';
  end if;
  if not exists (select 1 from public.marketing_leads where id = p_lead_id) then
    raise exception 'Lead not found';
  end if;

  insert into public.marketing_lead_followups (lead_id, due_at, summary, created_by)
  values (p_lead_id, p_due_at, public.ml_clean_text(to_jsonb(p_summary), 1000), auth.uid())
  returning id into v_id;

  update public.marketing_leads
     set next_followup_at = p_due_at
   where id = p_lead_id
     and (next_followup_at is null or p_due_at < next_followup_at);

  return v_id;
end;
$$;

-- Complete a follow-up.
create or replace function public.marketing_lead_complete_followup(p_followup_id uuid, p_summary text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Not authorized';
  end if;

  update public.marketing_lead_followups
     set completed_at = now(),
         summary = coalesce(public.ml_clean_text(to_jsonb(p_summary), 1000), summary),
         updated_at = now()
   where id = p_followup_id and completed_at is null
   returning lead_id into v_lead_id;

  if v_lead_id is null then
    raise exception 'Follow-up not found or already completed';
  end if;

  -- Recompute the lead's next open follow-up.
  update public.marketing_leads l
     set next_followup_at = (
       select min(f.due_at) from public.marketing_lead_followups f
        where f.lead_id = l.id and f.completed_at is null
     )
   where l.id = v_lead_id;
end;
$$;

-- =====================================================================
-- Row Level Security
--
-- Invariant:
--   anon                  -> nothing
--   ordinary authenticated -> nothing (no CRM access for students/faculty)
--   super_admin (is_admin) -> controlled read access via PostgREST
--   service_role           -> full access (Edge Function ingestion path)
--
-- All writes go through the RPCs above so status history, note authorship
-- and follow-up bookkeeping can never be bypassed by the UI.
-- =====================================================================

alter table public.marketing_leads enable row level security;
alter table public.marketing_lead_status_history enable row level security;
alter table public.marketing_lead_notes enable row level security;
alter table public.marketing_lead_followups enable row level security;
alter table public.marketing_attribution_touches enable row level security;

-- Read access for super admins only. No insert/update/delete policies are
-- created: writes are exclusively via security-definer RPCs.
create policy marketing_leads_admin_read on public.marketing_leads
  for select to authenticated
  using (public.is_admin());

create policy marketing_lead_status_history_admin_read on public.marketing_lead_status_history
  for select to authenticated
  using (public.is_admin());

create policy marketing_lead_notes_admin_read on public.marketing_lead_notes
  for select to authenticated
  using (public.is_admin());

create policy marketing_lead_followups_admin_read on public.marketing_lead_followups
  for select to authenticated
  using (public.is_admin());

create policy marketing_attribution_touches_admin_read on public.marketing_attribution_touches
  for select to authenticated
  using (public.is_admin());

-- =====================================================================
-- Table grants (SQL privileges layer under RLS)
-- =====================================================================

revoke all on public.marketing_leads from anon, authenticated;
revoke all on public.marketing_lead_status_history from anon, authenticated;
revoke all on public.marketing_lead_notes from anon, authenticated;
revoke all on public.marketing_lead_followups from anon, authenticated;
revoke all on public.marketing_attribution_touches from anon, authenticated;

grant select on public.marketing_leads to authenticated;
grant select on public.marketing_lead_status_history to authenticated;
grant select on public.marketing_lead_notes to authenticated;
grant select on public.marketing_lead_followups to authenticated;
grant select on public.marketing_attribution_touches to authenticated;

-- =====================================================================
-- Function execute privileges
-- =====================================================================

-- Ingestion: service-role only (the Edge Function uses the service key).
revoke all on function public.ingest_marketing_lead(text, text, jsonb, jsonb, jsonb)
  from public, anon, authenticated;

-- Sanitizers/helpers are internal; keep them out of public surface.
revoke all on function public.ml_clean_text(jsonb, int) from public, anon, authenticated;
revoke all on function public.ml_normalize_phone(text) from public, anon, authenticated;
revoke all on function public.ml_touch_from_json(jsonb) from public, anon, authenticated;

-- Admin CRM actions: authenticated users may execute; the functions verify
-- is_admin() internally and all table writes stay inside the definer.
revoke all on function public.marketing_lead_set_status(uuid, public.marketing_lead_status, text)
  from public, anon;
grant execute on function public.marketing_lead_set_status(uuid, public.marketing_lead_status, text)
  to authenticated;

revoke all on function public.marketing_lead_add_note(uuid, text) from public, anon;
grant execute on function public.marketing_lead_add_note(uuid, text) to authenticated;

revoke all on function public.marketing_lead_create_followup(uuid, timestamptz, text)
  from public, anon;
grant execute on function public.marketing_lead_create_followup(uuid, timestamptz, text)
  to authenticated;

revoke all on function public.marketing_lead_complete_followup(uuid, text) from public, anon;
grant execute on function public.marketing_lead_complete_followup(uuid, text) to authenticated;
