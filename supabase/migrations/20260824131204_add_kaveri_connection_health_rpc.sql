create or replace function public.kaveri_connection_health()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'ok', true,
    'published_assignments', (select count(*) from public.coding_vscode_assignments where is_published = true),
    'checked_at', now()
  );
$$;

grant execute on function public.kaveri_connection_health() to anon, authenticated;;
