create or replace function public.is_kaveri_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role in ('faculty', 'super_admin')
  );
$$;

revoke all on function public.is_kaveri_staff() from public;
grant execute on function public.is_kaveri_staff() to authenticated;

create table if not exists public.coding_vscode_submissions (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles(id) on delete cascade,
  student_name_snapshot text,
  assignment_key text not null,
  assignment_title text not null,
  language text not null default 'python',
  file_name text not null default 'main.py',
  code text not null,
  visible_tests_passed integer not null default 0 check (visible_tests_passed >= 0),
  visible_tests_total integer not null default 0 check (visible_tests_total >= 0),
  provisional_visible_score numeric(8,2) not null default 0,
  max_marks numeric(8,2) not null default 0,
  test_results jsonb not null default '[]'::jsonb,
  status text not null default 'submitted' check (status in ('submitted','reviewed')),
  teacher_score numeric(8,2),
  teacher_feedback text,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  submitted_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists coding_vscode_submissions_student_idx
  on public.coding_vscode_submissions(student_id, submitted_at desc);
create index if not exists coding_vscode_submissions_assignment_idx
  on public.coding_vscode_submissions(assignment_key, submitted_at desc);

alter table public.coding_vscode_submissions enable row level security;

revoke all on table public.coding_vscode_submissions from anon;
revoke all on table public.coding_vscode_submissions from authenticated;
grant select, insert, update, delete on table public.coding_vscode_submissions to authenticated;

drop policy if exists "vscode_students_insert_own" on public.coding_vscode_submissions;
create policy "vscode_students_insert_own"
on public.coding_vscode_submissions
for insert
to authenticated
with check (student_id = auth.uid());

drop policy if exists "vscode_students_read_own_or_staff" on public.coding_vscode_submissions;
create policy "vscode_students_read_own_or_staff"
on public.coding_vscode_submissions
for select
to authenticated
using (student_id = auth.uid() or public.is_kaveri_staff());

drop policy if exists "vscode_staff_update_submissions" on public.coding_vscode_submissions;
create policy "vscode_staff_update_submissions"
on public.coding_vscode_submissions
for update
to authenticated
using (public.is_kaveri_staff())
with check (public.is_kaveri_staff());

drop policy if exists "vscode_staff_delete_submissions" on public.coding_vscode_submissions;
create policy "vscode_staff_delete_submissions"
on public.coding_vscode_submissions
for delete
to authenticated
using (public.is_kaveri_staff());;
