create table if not exists public.ws_private_settings (
  setting_key text primary key,
  value_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.ws_private_settings enable row level security;
revoke all on public.ws_private_settings from anon, authenticated;

create or replace function public.configure_ws_admin_secret(p_secret text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if length(coalesce(p_secret,'')) < 32 then
    raise exception 'Admin secret must be at least 32 characters.';
  end if;
  if exists(select 1 from public.ws_private_settings where setting_key='admin_secret_sha256') then
    return jsonb_build_object('ok', true, 'configured', true, 'alreadyConfigured', true);
  end if;
  insert into public.ws_private_settings(setting_key,value_hash)
  values('admin_secret_sha256', encode(extensions.digest(convert_to(p_secret,'UTF8'),'sha256'),'hex'));
  return jsonb_build_object('ok', true, 'configured', true, 'alreadyConfigured', false);
end;
$$;
revoke all on function public.configure_ws_admin_secret(text) from public;
grant execute on function public.configure_ws_admin_secret(text) to anon, authenticated;

create or replace function public.ws_admin_ok(p_secret text)
returns boolean
language sql
security definer
set search_path = public, extensions
as $$
  select exists(
    select 1 from public.ws_private_settings
    where setting_key='admin_secret_sha256'
      and value_hash = encode(extensions.digest(convert_to(coalesce(p_secret,''),'UTF8'),'sha256'),'hex')
  );
$$;
revoke all on function public.ws_admin_ok(text) from public;

create or replace function public.get_ws_registration_snapshot(p_event_id text, p_secret text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_rows jsonb;
begin
  if not public.ws_admin_ok(p_secret) then raise exception 'Unauthorized.'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'timestamp', to_char(r.created_at at time zone 'Asia/Kolkata','YYYY-MM-DD HH24:MI:SS'),
    'registrationId', r.registration_id,
    'eventId', r.event_id,
    'workshop', e.workshop_name,
    'workshopDate', e.workshop_date,
    'fullName', r.full_name,
    'email', r.email,
    'mobile', r.mobile,
    'participantCategory', r.participant_category,
    'college', r.college,
    'qualification', r.qualification,
    'branch', r.branch,
    'academicYear', r.academic_year,
    'interestedTechnologies', r.interested_technologies,
    'expectation', r.expectation,
    'referralSource', r.referral_source,
    'registrationStatus', r.registration_status,
    'emailStatus', r.email_status,
    'attendanceStatus', case when r.checked_in_at is null then 'Not Checked In' else 'Checked In' end,
    'checkInTime', case when r.checked_in_at is null then '' else to_char(r.checked_in_at at time zone 'Asia/Kolkata','YYYY-MM-DD HH24:MI:SS') end,
    'checkedInBy', coalesce(r.checked_in_by,'')
  ) order by r.created_at desc), '[]'::jsonb)
  into v_rows
  from public.ws_registrations r join public.ws_workshop_events e on e.event_id=r.event_id
  where coalesce(p_event_id,'')='' or p_event_id='ALL' or r.event_id=p_event_id;
  return jsonb_build_object('ok',true,'registrations',v_rows,'generatedAt',to_char(now() at time zone 'Asia/Kolkata','YYYY-MM-DD HH24:MI:SS'));
end;
$$;
revoke all on function public.get_ws_registration_snapshot(text,text) from public;
grant execute on function public.get_ws_registration_snapshot(text,text) to anon, authenticated;

create or replace function public.check_in_ws_registration(p_registration_id text, p_checked_in_by text, p_secret text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare r public.ws_registrations%rowtype;
begin
  if not public.ws_admin_ok(p_secret) then raise exception 'Unauthorized.'; end if;
  update public.ws_registrations
    set checked_in_at=coalesce(checked_in_at,now()), checked_in_by=coalesce(nullif(checked_in_by,''),coalesce(nullif(trim(p_checked_in_by),''),'Admin')), updated_at=now()
    where registration_id=trim(p_registration_id)
    returning * into r;
  if not found then raise exception 'Registration not found.'; end if;
  return jsonb_build_object('ok',true,'registrationId',r.registration_id,'checkedInAt',r.checked_in_at,'checkedInBy',r.checked_in_by);
end;
$$;
revoke all on function public.check_in_ws_registration(text,text,text) from public;
grant execute on function public.check_in_ws_registration(text,text,text) to anon, authenticated;

create or replace function public.get_ws_pending_sync_batch(p_limit integer, p_secret text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_rows jsonb;
begin
  if not public.ws_admin_ok(p_secret) then raise exception 'Unauthorized.'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'registrationId',r.registration_id,'eventId',r.event_id,'fullName',r.full_name,'email',r.email,'mobile',r.mobile,
    'participantCategory',r.participant_category,'college',r.college,'qualification',r.qualification,'branch',r.branch,
    'academicYear',r.academic_year,'interestedTechnologies',r.interested_technologies,'expectation',r.expectation,
    'referralSource',r.referral_source,'createdAt',r.created_at,'emailStatus',r.email_status,'sheetSyncStatus',r.sheet_sync_status
  ) order by r.created_at), '[]'::jsonb)
  into v_rows
  from (
    select * from public.ws_registrations
    where sheet_sync_status <> 'Synced' or email_status = 'Queued'
    order by created_at
    limit greatest(1,least(coalesce(p_limit,50),100))
  ) r;
  return jsonb_build_object('ok',true,'registrations',v_rows);
end;
$$;
revoke all on function public.get_ws_pending_sync_batch(integer,text) from public;
grant execute on function public.get_ws_pending_sync_batch(integer,text) to anon, authenticated;

create or replace function public.mark_ws_sync_results(p_results jsonb, p_secret text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare item jsonb; v_count integer:=0;
begin
  if not public.ws_admin_ok(p_secret) then raise exception 'Unauthorized.'; end if;
  for item in select * from jsonb_array_elements(coalesce(p_results,'[]'::jsonb)) loop
    update public.ws_registrations
      set sheet_sync_status = coalesce(nullif(item->>'sheetSyncStatus',''),sheet_sync_status),
          email_status = coalesce(nullif(item->>'emailStatus',''),email_status),
          updated_at=now()
      where registration_id=item->>'registrationId';
    if found then v_count:=v_count+1; end if;
  end loop;
  return jsonb_build_object('ok',true,'updated',v_count);
end;
$$;
revoke all on function public.mark_ws_sync_results(jsonb,text) from public;
grant execute on function public.mark_ws_sync_results(jsonb,text) to anon, authenticated;
;
