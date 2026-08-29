create table if not exists public.ws_workshop_events (
  event_id text primary key,
  workshop_name text not null,
  workshop_date text not null default '',
  registrations_open boolean not null default true,
  max_seats integer not null default 0 check (max_seats >= 0),
  registered_count integer not null default 0 check (registered_count >= 0),
  next_sequence bigint not null default 0 check (next_sequence >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ws_registrations (
  id uuid primary key default gen_random_uuid(),
  registration_id text not null unique,
  event_id text not null references public.ws_workshop_events(event_id) on delete restrict,
  full_name text not null,
  email text not null,
  mobile text not null,
  participant_category text not null,
  college text not null default '',
  qualification text not null,
  branch text not null,
  academic_year text not null,
  interested_technologies text[] not null default '{}',
  expectation text not null default '',
  referral_source text not null,
  consent boolean not null default true,
  registration_status text not null default 'Confirmed',
  email_status text not null default 'Queued',
  sheet_sync_status text not null default 'Queued',
  checked_in_at timestamptz,
  checked_in_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists ws_registrations_event_email_uq
  on public.ws_registrations (event_id, lower(email));
create unique index if not exists ws_registrations_event_mobile_uq
  on public.ws_registrations (event_id, mobile);
create index if not exists ws_registrations_event_created_idx
  on public.ws_registrations (event_id, created_at desc);
create index if not exists ws_registrations_sheet_queue_idx
  on public.ws_registrations (sheet_sync_status, created_at)
  where sheet_sync_status <> 'Synced';
create index if not exists ws_registrations_email_queue_idx
  on public.ws_registrations (email_status, created_at)
  where email_status <> 'Sent';

alter table public.ws_workshop_events enable row level security;
alter table public.ws_registrations enable row level security;
revoke all on public.ws_workshop_events from anon, authenticated;
revoke all on public.ws_registrations from anon, authenticated;

create or replace function public.register_workshop_participant(
  p_event_id text,
  p_full_name text,
  p_email text,
  p_mobile text,
  p_participant_category text,
  p_college text,
  p_qualification text,
  p_branch text,
  p_academic_year text,
  p_interested_technologies text[],
  p_expectation text,
  p_referral_source text,
  p_consent boolean
)
returns table (
  status text,
  registration_id text,
  existing_registration_id text,
  message text,
  email_status text,
  sheet_sync_status text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event public.ws_workshop_events%rowtype;
  v_email text := lower(trim(coalesce(p_email, '')));
  v_mobile text := regexp_replace(coalesce(p_mobile, ''), '\D', '', 'g');
  v_existing text;
  v_sequence bigint;
  v_registration_id text;
begin
  if length(trim(coalesce(p_event_id, ''))) < 4 then
    return query select 'validation', null::text, null::text, 'Event ID is required.', null::text, null::text;
    return;
  end if;
  if length(trim(coalesce(p_full_name, ''))) < 2 then
    return query select 'validation', null::text, null::text, 'Full name is required.', null::text, null::text;
    return;
  end if;
  if v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    return query select 'validation', null::text, null::text, 'Enter a valid email address.', null::text, null::text;
    return;
  end if;
  if v_mobile !~ '^[6-9][0-9]{9}$' then
    return query select 'validation', null::text, null::text, 'Enter a valid 10-digit Indian mobile number.', null::text, null::text;
    return;
  end if;
  if not coalesce(p_consent, false) then
    return query select 'validation', null::text, null::text, 'Consent is required.', null::text, null::text;
    return;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(trim(p_event_id) || '|' || v_email || '|' || v_mobile, 0));

  select r.registration_id into v_existing
  from public.ws_registrations r
  where r.event_id = trim(p_event_id)
    and (lower(r.email) = v_email or r.mobile = v_mobile)
  order by r.created_at asc
  limit 1;

  if v_existing is not null then
    return query select 'duplicate', null::text, v_existing, 'You are already registered for this workshop.', null::text, null::text;
    return;
  end if;

  update public.ws_workshop_events e
  set registered_count = e.registered_count + 1,
      next_sequence = e.next_sequence + 1,
      updated_at = now()
  where e.event_id = trim(p_event_id)
    and e.registrations_open = true
    and (e.max_seats = 0 or e.registered_count < e.max_seats)
  returning e.* into v_event;

  if not found then
    select * into v_event from public.ws_workshop_events e where e.event_id = trim(p_event_id);
    if not found then
      return query select 'error', null::text, null::text, 'This workshop could not be found. Refresh the page and try again.', null::text, null::text;
    elsif not v_event.registrations_open then
      return query select 'error', null::text, null::text, 'Registrations are currently closed for this workshop.', null::text, null::text;
    else
      return query select 'error', null::text, null::text, 'This workshop is full. No seats are currently available.', null::text, null::text;
    end if;
    return;
  end if;

  v_sequence := v_event.next_sequence;
  v_registration_id := v_event.event_id || '-' || lpad(v_sequence::text, 4, '0');

  begin
    insert into public.ws_registrations (
      registration_id, event_id, full_name, email, mobile,
      participant_category, college, qualification, branch, academic_year,
      interested_technologies, expectation, referral_source, consent
    ) values (
      v_registration_id, v_event.event_id, trim(p_full_name), v_email, v_mobile,
      trim(coalesce(p_participant_category, '')), trim(coalesce(p_college, '')),
      trim(coalesce(p_qualification, '')), trim(coalesce(p_branch, '')),
      trim(coalesce(p_academic_year, '')), coalesce(p_interested_technologies, '{}'),
      trim(coalesce(p_expectation, '')), trim(coalesce(p_referral_source, '')), true
    );
  exception when unique_violation then
    update public.ws_workshop_events
      set registered_count = greatest(registered_count - 1, 0), updated_at = now()
      where event_id = v_event.event_id;
    select r.registration_id into v_existing
      from public.ws_registrations r
      where r.event_id = v_event.event_id
        and (lower(r.email) = v_email or r.mobile = v_mobile)
      order by r.created_at asc limit 1;
    return query select 'duplicate', null::text, v_existing, 'You are already registered for this workshop.', null::text, null::text;
    return;
  end;

  return query select 'success', v_registration_id, null::text, 'Registration confirmed.', 'Queued', 'Queued';
end;
$$;

revoke all on function public.register_workshop_participant(text,text,text,text,text,text,text,text,text,text[],text,text,boolean) from public;
grant execute on function public.register_workshop_participant(text,text,text,text,text,text,text,text,text,text[],text,text,boolean) to anon, authenticated;
;
