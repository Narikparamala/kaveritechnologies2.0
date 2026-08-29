drop policy if exists vscode_assignments_student_read_published on public.coding_vscode_assignments;
create policy vscode_assignments_student_read_published
on public.coding_vscode_assignments
for select
to authenticated
using (
  is_published = true
  and exists (
    select 1
    from public.coding_vscode_assignment_batches cab
    join public.batch_students bs on bs.batch_id = cab.batch_id
    join public.batches b on b.id = cab.batch_id
    where cab.assignment_id = coding_vscode_assignments.id
      and cab.is_unlocked = true
      and bs.student_id = auth.uid()
      and bs.status = 'active'
      and b.status = 'active'
  )
);

drop policy if exists vscode_test_cases_student_visible on public.coding_vscode_test_cases;
create policy vscode_test_cases_student_visible
on public.coding_vscode_test_cases
for select
to authenticated
using (
  is_hidden = false
  and exists (
    select 1
    from public.coding_vscode_assignments a
    join public.coding_vscode_assignment_batches cab on cab.assignment_id = a.id
    join public.batch_students bs on bs.batch_id = cab.batch_id
    join public.batches b on b.id = cab.batch_id
    where a.id = coding_vscode_test_cases.assignment_id
      and a.is_published = true
      and cab.is_unlocked = true
      and bs.student_id = auth.uid()
      and bs.status = 'active'
      and b.status = 'active'
  )
);;
