revoke execute on function public.is_kaveri_staff() from public;
revoke execute on function public.is_kaveri_staff() from anon;
grant execute on function public.is_kaveri_staff() to authenticated;;
