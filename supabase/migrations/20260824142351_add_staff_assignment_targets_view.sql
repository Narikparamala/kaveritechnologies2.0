create or replace view public.coding_vscode_assignment_targets_staff
with (security_barrier = true)
as
select ab.id, ab.assignment_id, ab.batch_id, ab.created_at
from public.coding_vscode_assignment_batches ab
where public.is_kaveri_staff();

revoke all on public.coding_vscode_assignment_targets_staff from anon;
grant select on public.coding_vscode_assignment_targets_staff to authenticated;;
