create table if not exists public.coding_vscode_assignment_batches (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.coding_vscode_assignments(id) on delete cascade,
  batch_id uuid not null references public.batches(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (assignment_id, batch_id)
);

alter table public.coding_vscode_assignment_batches enable row level security;

drop policy if exists vscode_assignment_batches_staff_all on public.coding_vscode_assignment_batches;
create policy vscode_assignment_batches_staff_all
on public.coding_vscode_assignment_batches
for all
to authenticated
using (public.is_kaveri_staff())
with check (public.is_kaveri_staff());

drop policy if exists vscode_assignment_batches_student_read_own on public.coding_vscode_assignment_batches;
create policy vscode_assignment_batches_student_read_own
on public.coding_vscode_assignment_batches
for select
to authenticated
using (
  exists (
    select 1
    from public.batch_students bs
    where bs.batch_id = coding_vscode_assignment_batches.batch_id
      and bs.student_id = auth.uid()
      and bs.status = 'active'
  )
);

-- Replace broad published assignment reads with batch-aware authenticated reads.
drop policy if exists vscode_assignments_public_read on public.coding_vscode_assignments;
drop policy if exists vscode_public_read_published_assignments on public.coding_vscode_assignments;
drop policy if exists vscode_assignments_student_read_published on public.coding_vscode_assignments;
create policy vscode_assignments_student_read_published
on public.coding_vscode_assignments
for select
to authenticated
using (
  is_published = true
  and (
    not exists (
      select 1 from public.coding_vscode_assignment_batches cab
      where cab.assignment_id = coding_vscode_assignments.id
    )
    or exists (
      select 1
      from public.coding_vscode_assignment_batches cab
      join public.batch_students bs on bs.batch_id = cab.batch_id
      where cab.assignment_id = coding_vscode_assignments.id
        and bs.student_id = auth.uid()
        and bs.status = 'active'
    )
  )
);

-- Visible tests follow assignment visibility. Hidden tests remain staff-only.
drop policy if exists vscode_public_read_visible_tests on public.coding_vscode_test_cases;
drop policy if exists vscode_test_cases_visible_or_staff on public.coding_vscode_test_cases;
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
    where a.id = coding_vscode_test_cases.assignment_id
      and a.is_published = true
      and (
        not exists (
          select 1 from public.coding_vscode_assignment_batches cab
          where cab.assignment_id = a.id
        )
        or exists (
          select 1
          from public.coding_vscode_assignment_batches cab
          join public.batch_students bs on bs.batch_id = cab.batch_id
          where cab.assignment_id = a.id
            and bs.student_id = auth.uid()
            and bs.status = 'active'
        )
      )
  )
);
;
