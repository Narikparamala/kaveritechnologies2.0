create or replace function public.reset_ws_load_test(p_event_id text, p_secret text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_deleted integer := 0;
begin
  if not public.ws_admin_ok(p_secret) then raise exception 'Unauthorized.'; end if;
  if p_event_id not like 'KT-LOADTEST-%' then raise exception 'Only KT-LOADTEST events can be reset by this function.'; end if;
  delete from public.ws_registrations where event_id = p_event_id;
  get diagnostics v_deleted = row_count;
  delete from public.ws_workshop_events where event_id = p_event_id;
  return jsonb_build_object('ok',true,'deletedRegistrations',v_deleted,'deletedEventId',p_event_id);
end;
$$;
revoke all on function public.reset_ws_load_test(text,text) from public;
grant execute on function public.reset_ws_load_test(text,text) to anon, authenticated;;
