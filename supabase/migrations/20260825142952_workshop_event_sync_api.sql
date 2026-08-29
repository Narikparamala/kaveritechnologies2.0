create or replace function public.upsert_ws_event(
  p_event_id text,
  p_workshop_name text,
  p_workshop_date text,
  p_registrations_open boolean,
  p_max_seats integer,
  p_secret text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_event public.ws_workshop_events%rowtype;
begin
  if not public.ws_admin_ok(p_secret) then raise exception 'Unauthorized.'; end if;
  if length(trim(coalesce(p_event_id,''))) < 4 then raise exception 'Event ID is required.'; end if;

  insert into public.ws_workshop_events(event_id, workshop_name, workshop_date, registrations_open, max_seats)
  values(
    trim(p_event_id),
    trim(coalesce(p_workshop_name,'')),
    trim(coalesce(p_workshop_date,'')),
    coalesce(p_registrations_open,false),
    greatest(coalesce(p_max_seats,0),0)
  )
  on conflict (event_id) do update set
    workshop_name = excluded.workshop_name,
    workshop_date = excluded.workshop_date,
    registrations_open = excluded.registrations_open,
    max_seats = excluded.max_seats,
    updated_at = now()
  returning * into v_event;

  return jsonb_build_object(
    'ok',true,
    'eventId',v_event.event_id,
    'registeredCount',v_event.registered_count,
    'maxSeats',v_event.max_seats,
    'registrationsOpen',v_event.registrations_open
  );
end;
$$;
revoke all on function public.upsert_ws_event(text,text,text,boolean,integer,text) from public;
grant execute on function public.upsert_ws_event(text,text,text,boolean,integer,text) to anon, authenticated;;
