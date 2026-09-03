-- Kaveri LMS: defense-in-depth function privilege hardening.
-- Explicit Supabase bootstrap grants can leave anon EXECUTE privileges even
-- after revoking from PUBLIC. These functions are authenticated-only entry
-- points or authorization helpers and should not be callable by anon.

begin;

revoke all on function public.is_active_user() from anon;
revoke all on function public.admin_set_user_role(uuid, text) from anon;
revoke all on function public.admin_set_user_active(uuid, boolean) from anon;
revoke all on function public.admin_set_enrollment_access(uuid, text, text) from anon;
revoke all on function public.complete_lesson(uuid) from anon;

-- Preserve the intended authenticated application contract explicitly.
grant execute on function public.is_active_user() to authenticated;
grant execute on function public.admin_set_user_role(uuid, text) to authenticated;
grant execute on function public.admin_set_user_active(uuid, boolean) to authenticated;
grant execute on function public.admin_set_enrollment_access(uuid, text, text) to authenticated;
grant execute on function public.complete_lesson(uuid) to authenticated;

commit;
