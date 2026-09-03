create or replace function public.get_coding_vscode_assignment_targets()
returns table (
  id uuid,
  assignment_id uuid,
  batch_id uuid,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_kaveri_staff() then
    raise exception 'Teacher access required';
  end if;

  return query
  select ab.id, ab.assignment_id, ab.batch_id, ab.created_at
  from public.coding_vscode_assignment_batches ab
  order by ab.created_at;
end;
$$;

revoke all on function public.get_coding_vscode_assignment_targets() from public;
grant execute on function public.get_coding_vscode_assignment_targets() to authenticated;;
