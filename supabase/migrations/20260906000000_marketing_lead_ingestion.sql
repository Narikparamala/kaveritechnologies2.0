-- =====================================================================
-- Marketing Lead Ingestion — central lead CRM for Kaveri Technologies
--
-- Tables: marketing_leads, marketing_lead_status_history,
--         marketing_lead_activities, marketing_lead_assignments,
--         idempotency_keys
-- RPC:    ingest_marketing_lead() — SECURITY DEFINER, service-role only
--
-- Auth: the marketing-lead-ingest Edge Function verifies HMAC-SHA256
-- (timestamp + "." + idempotency_key + "." + raw_body) with the shared
-- secret (env KAVERI_LEAD_API_SECRET, else vault secret
-- 'marketing.lead.secret'), then calls this RPC with the service-role
-- client. RLS blocks all direct anon/authenticated access.
-- =====================================================================

-- ---------- 0. Helper: marketing staff check ----------
create or replace function public.is_marketing_staff()
returns boolean
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role in ('faculty', 'super_admin')
  );
$$;

revoke all on function public.is_marketing_staff() from public, anon, authenticated;
grant execute on function public.is_marketing_staff() to authenticated, service_role;

-- ---------- 0b. Server secret lookup ----------
create or replace function public.get_server_secret(p_name text)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
stable
as $$
  declare
    v_secret text;
  begin
    select value into v_secret from public.server_secrets where name = p_name;
    return v_secret;
  end;
$$;

revoke all on function public.get_server_secret(text) from public, anon, authenticated;
grant execute on function public.get_server_secret(text) to service_role;

-- ---------- 0c. Server secrets table ----------
create table if not exists public.server_secrets (
  name text primary key,
  value text not null,
  created_at timestamptz not null default now()
);

alter table public.server_secrets enable row level security;

revoke all on public.server_secrets from public, anon, authenticated;
grant all on public.server_secrets to service_role;

-- ---------- 0d. Integration audit log ----------
create table if not exists public.integration_audit_log (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  action text not null,
  idempotency_key text not null,
  request_sha256 text,
  request_summary jsonb,
  response_code integer,
  result text not null check (result in ('success', 'rejected', 'error')),
  created_at timestamptz not null default now(),
  unique (source, action, idempotency_key)
);

create index idx_audit_source_action on public.integration_audit_log (source, action);
create index idx_audit_created_at on public.integration_audit_log (created_at desc);

alter table public.integration_audit_log enable row level security;

revoke all on public.integration_audit_log from public, anon, authenticated;
grant all on public.integration_audit_log to service_role;

-- ---------- 1. marketing_leads ----------
create table public.marketing_leads (
  id uuid primary key default gen_random_uuid(),
  idempotency_key text unique not null,
  lead_type text not null,
  full_name text not null,
  phone_e164 text not null,
  phone_display text not null,
  email text,
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
  first_touch jsonb,
  last_touch jsonb,
  page_url text,
  user_agent text,
  ip_hash text,
  consent boolean not null,
  consent_timestamp timestamptz not null,
  status text not null default 'NEW'
    check (status in ('NEW','CONTACTED','INTERESTED','COUNSELLING','DEMO_SCHEDULED','FOLLOW_UP','JOINED','NOT_INTERESTED','INVALID','NO_RESPONSE')),
  status_history jsonb not null default '[]'::jsonb,
  assigned_counsellor uuid references public.profiles(id) on delete set null,
  converted_profile_id uuid references public.profiles(id) on delete set null,
  spam_flag boolean not null default false,
  honeypot_triggered boolean not null default false,
  signature_verified boolean not null default true,
  received_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- 2. marketing_lead_status_history ----------
create table public.marketing_lead_status_history (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.marketing_leads(id) on delete cascade,
  from_status text,
  to_status text not null,
  changed_by uuid references public.profiles(id) on delete set null,
  note text,
  created_at timestamptz not null default now()
);

create index idx_mlsh_lead_id on public.marketing_lead_status_history (lead_id);
create index idx_mlsh_created_at on public.marketing_lead_status_history (created_at desc);
alter table public.marketing_lead_status_history enable row level security;
create policy mlsh_select_staff on public.marketing_lead_status_history for select to authenticated using (public.is_marketing_staff() or public.is_admin());
create policy mlsh_insert_staff on public.marketing_lead_status_history for insert to authenticated with check (public.is_marketing_staff() or public.is_admin());

-- ---------- 3. marketing_lead_activities ----------
create table public.marketing_lead_activities (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.marketing_leads(id) on delete cascade,
  activity_type text not null,
  detail jsonb,
  performed_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index idx_mla_lead_id on public.marketing_lead_activities (lead_id);
create index idx_mla_created_at on public.marketing_lead_activities (created_at desc);
alter table public.marketing_lead_activities enable row level security;
create policy mla_select_staff on public.marketing_lead_activities for select to authenticated using (public.is_marketing_staff() or public.is_admin());
create policy mla_insert_staff on public.marketing_lead_activities for insert to authenticated with check (public.is_marketing_staff() or public.is_admin());

-- ---------- 4. marketing_lead_assignments ----------
create table public.marketing_lead_assignments (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.marketing_leads(id) on delete cascade,
  counsellor_id uuid not null references public.profiles(id) on delete cascade,
  assigned_at timestamptz not null default now(),
  assigned_by uuid references public.profiles(id) on delete set null
);

create index idx_mlassign_lead on public.marketing_lead_assignments (lead_id);
create index idx_mlassign_counsellor on public.marketing_lead_assignments (counsellor_id);
alter table public.marketing_lead_assignments enable row level security;
create policy mlassign_select_staff on public.marketing_lead_assignments for select to authenticated using (public.is_marketing_staff() or public.is_admin());
create policy mlassign_insert_staff on public.marketing_lead_assignments for insert to authenticated with check (public.is_marketing_staff() or public.is_admin());
create policy mlassign_delete_admin on public.marketing_lead_assignments for delete to authenticated using (public.is_admin());

-- ---------- 5. idempotency_keys ----------
create table public.idempotency_keys (
  key text primary key,
  lead_id uuid not null references public.marketing_leads(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index idx_idempotency_keys_lead on public.idempotency_keys (lead_id);
alter table public.idempotency_keys enable row level security;


create index idx_marketing_leads_status on public.marketing_leads (status);
create index idx_marketing_leads_lead_type on public.marketing_leads (lead_type);
create index idx_marketing_leads_assigned_counsellor on public.marketing_leads (assigned_counsellor);

-- ---------- 6. ingest_marketing_lead() RPC ----------
create or replace function public.ingest_marketing_lead(
  p_idempotency_key text,
  p_lead_type text,
  p_full_name text,
  p_phone text,
  p_email text default null,
  p_college text default null,
  p_qualification text default null,
  p_degree text default null,
  p_branch text default null,
  p_graduation_year text default null,
  p_skills text default null,
  p_internship_area text default null,
  p_experience text default null,
  p_resume_url text default null,
  p_message text default null,
  p_course_slug text default null,
  p_course_title text default null,
  p_first_touch jsonb default null,
  p_last_touch jsonb default null,
  p_page_url text default null,
  p_user_agent text default null,
  p_ip_hash text default null,
  p_consent boolean default true,
  p_consent_timestamp timestamptz default now(),
  p_received_at timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_lead_id uuid;
  v_existing_lead_id uuid;
  v_status_history jsonb;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'INSUFFICIENT_PRIVILEGE';
  end if;
  if p_idempotency_key is null or p_idempotency_key = '' then
    raise exception 'INVALID_IDEMPOTENCY_KEY';
  end if;
  if p_lead_type is null or p_lead_type = '' then
    raise exception 'INVALID_LEAD_TYPE';
  end if;
  if p_full_name is null or btrim(p_full_name) = '' then
    raise exception 'INVALID_FULL_NAME';
  end if;
  if p_phone is null or p_phone !~ '^[6-9][0-9]{9}$' then
    raise exception 'INVALID_PHONE';
  end if;
  if p_consent is distinct from true then
    raise exception 'CONSENT_REQUIRED';
  end if;

  -- Idempotency check: if the same key was already used, return existing lead
  select ik.lead_id into v_existing_lead_id
  from public.idempotency_keys ik
  where ik.key = p_idempotency_key;

  if v_existing_lead_id is not null then
    return jsonb_build_object('ok', true, 'duplicate', true, 'leadId', v_existing_lead_id);
  end if;

  v_status_history := jsonb_build_array(
    jsonb_build_object('status', 'NEW', 'at', coalesce(p_consent_timestamp, now()), 'by', 'system')
  );

  insert into public.marketing_leads (
    idempotency_key, lead_type, full_name, phone_e164, phone_display,
    email, college, qualification, degree, branch, graduation_year,
    skills, internship_area, experience, resume_url, message,
    course_slug, course_title, first_touch, last_touch, page_url,
    user_agent, ip_hash, consent, consent_timestamp, status,
    status_history, received_at
  ) values (
    p_idempotency_key, p_lead_type, btrim(p_full_name), p_phone, p_phone,
    nullif(btrim(p_email), ''), nullif(btrim(p_college), ''),
    nullif(btrim(p_qualification), ''), nullif(btrim(p_degree), ''),
    nullif(btrim(p_branch), ''), nullif(btrim(p_graduation_year), ''),
    nullif(btrim(p_skills), ''), nullif(btrim(p_internship_area), ''),
    nullif(btrim(p_experience), ''), nullif(btrim(p_resume_url), ''),
    nullif(btrim(p_message), ''), nullif(btrim(p_course_slug), ''),
    nullif(btrim(p_course_title), ''), p_first_touch, p_last_touch,
    nullif(btrim(p_page_url), ''), nullif(btrim(p_user_agent), ''),
    nullif(btrim(p_ip_hash), ''), p_consent,
    coalesce(p_consent_timestamp, now()), 'NEW', v_status_history,
    coalesce(p_received_at, now())
  )
  returning id into v_lead_id;

  insert into public.idempotency_keys (key, lead_id) values (p_idempotency_key, v_lead_id);

  insert into public.marketing_lead_status_history (lead_id, from_status, to_status, note)
  values (v_lead_id, null, 'NEW', 'Lead received via marketing-lead-ingest');

  return jsonb_build_object('ok', true, 'duplicate', false, 'leadId', v_lead_id);
end;
$$;

create index idx_marketing_leads_created_at on public.marketing_leads (created_at desc);

drop trigger if exists update_marketing_leads_updated_at on public.marketing_leads;
create trigger update_marketing_leads_updated_at
  before update on public.marketing_leads
  for each row execute function public.update_updated_at_column();

alter table public.marketing_leads enable row level security;

create policy marketing_leads_select_staff on public.marketing_leads for select to authenticated using (public.is_marketing_staff() or public.is_admin());
create policy marketing_leads_update_staff on public.marketing_leads for update to authenticated using (public.is_marketing_staff() or public.is_admin()) with check (public.is_marketing_staff() or public.is_admin());
create policy marketing_leads_insert_staff on public.marketing_leads for insert to authenticated with check (public.is_marketing_staff() or public.is_admin());
create policy marketing_leads_delete_admin on public.marketing_leads for delete to authenticated using (public.is_admin());
