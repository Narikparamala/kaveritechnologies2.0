revoke execute on function public.ws_admin_ok(text) from anon, authenticated;
revoke execute on function public.register_workshop_participant(text,text,text,text,text,text,text,text,text,text[],text,text,boolean) from authenticated;
revoke execute on function public.configure_ws_admin_secret(text) from authenticated;
revoke execute on function public.get_ws_registration_snapshot(text,text) from authenticated;
revoke execute on function public.check_in_ws_registration(text,text,text) from authenticated;
revoke execute on function public.get_ws_pending_sync_batch(integer,text) from authenticated;
revoke execute on function public.mark_ws_sync_results(jsonb,text) from authenticated;
revoke execute on function public.upsert_ws_event(text,text,text,boolean,integer,text) from authenticated;
revoke execute on function public.reset_ws_load_test(text,text) from authenticated;;
