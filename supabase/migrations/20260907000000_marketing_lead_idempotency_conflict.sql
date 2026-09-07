-- Idempotency conflict hardening for the marketing lead ingestion system.
--
-- Adds a payload hash to idempotency_keys so that reusing an idempotency key
-- with a DIFFERENT payload is rejected as a conflict (surface as HTTP 409 by
-- the marketing-lead-ingest Edge Function) instead of being silently treated
-- as an idempotent retry.
--
-- The payload hash is the SHA-256 hex digest of the exact raw request body,
-- computed by the Edge Function after signature verification. Identical
-- retries from the marketing sender re-send byte-identical bodies, so the
-- raw-body hash is a safe fingerprint for idempotent replay detection.

alter table public.idempotency_keys
  add column if not exists payload_hash text not null default '';

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
  p_received_at timestamptz default now(),
  p_payload_hash text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_lead_id uuid;
  v_existing_lead_id uuid;
  v_existing_payload_hash text;
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

  -- Idempotency check: same key + same payload hash -> return existing lead.
  -- Same key + different payload hash -> conflict (never create a second lead
  -- and never mask the mismatch as a duplicate retry).
  select ik.lead_id, ik.payload_hash
    into v_existing_lead_id, v_existing_payload_hash
  from public.idempotency_keys ik
  where ik.key = p_idempotency_key;

  if v_existing_lead_id is not null then
    if coalesce(v_existing_payload_hash, '') = coalesce(p_payload_hash, '') then
      return jsonb_build_object('ok', true, 'duplicate', true, 'leadId', v_existing_lead_id);
    end if;
    raise exception 'IDEMPOTENCY_KEY_CONFLICT';
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

  insert into public.idempotency_keys (key, lead_id, payload_hash)
  values (p_idempotency_key, v_lead_id, coalesce(p_payload_hash, ''));

  insert into public.marketing_lead_status_history (lead_id, from_status, to_status, note)
  values (v_lead_id, null, 'NEW', 'Lead received via marketing-lead-ingest');

  return jsonb_build_object('ok', true, 'duplicate', false, 'leadId', v_lead_id);
end;
$$;

revoke all on function public.ingest_marketing_lead(text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, jsonb, jsonb, text, text, text, boolean, timestamptz, timestamptz, text) from public, anon, authenticated;
grant execute on function public.ingest_marketing_lead(text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, jsonb, jsonb, text, text, text, boolean, timestamptz, timestamptz, text) to service_role;