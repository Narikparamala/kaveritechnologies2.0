create or replace function public.set_coding_vscode_assignment_target(
  p_assignment_id uuid,
  p_batch_id uuid,
  p_enabled boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_kaveri_staff() then
    raise exception 'Teacher access required';
  end if;

  if p_enabled then
    insert into public.coding_vscode_assignment_batches (assignment_id, batch_id)
    values (p_assignment_id, p_batch_id)
    on conflict (assignment_id, batch_id) do nothing;
  else
    delete from public.coding_vscode_assignment_batches
    where assignment_id = p_assignment_id
      and batch_id = p_batch_id;
  end if;
end;
$$;

revoke all on function public.set_coding_vscode_assignment_target(uuid, uuid, boolean) from public;
grant execute on function public.set_coding_vscode_assignment_target(uuid, uuid, boolean) to authenticated;;
