create table if not exists public.coding_vscode_assignments (
  id uuid primary key default gen_random_uuid(),
  assignment_key text not null unique,
  title text not null,
  topic text not null default 'General',
  question text not null,
  language text not null default 'python',
  file_name text not null default 'main.py',
  starter_code text not null default '',
  marks numeric(6,2) not null default 10,
  is_published boolean not null default false,
  created_by uuid null references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.coding_vscode_test_cases (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.coding_vscode_assignments(id) on delete cascade,
  input_text text not null default '',
  expected_output text not null default '',
  is_hidden boolean not null default false,
  position integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists coding_vscode_test_cases_assignment_idx
  on public.coding_vscode_test_cases(assignment_id, position);

alter table public.coding_vscode_assignments enable row level security;
alter table public.coding_vscode_test_cases enable row level security;

drop policy if exists vscode_public_read_published_assignments on public.coding_vscode_assignments;
create policy vscode_public_read_published_assignments
  on public.coding_vscode_assignments
  for select
  to anon, authenticated
  using (is_published = true);

drop policy if exists vscode_staff_read_all_assignments on public.coding_vscode_assignments;
create policy vscode_staff_read_all_assignments
  on public.coding_vscode_assignments
  for select
  to authenticated
  using (public.is_kaveri_staff());

drop policy if exists vscode_staff_insert_assignments on public.coding_vscode_assignments;
create policy vscode_staff_insert_assignments
  on public.coding_vscode_assignments
  for insert
  to authenticated
  with check (public.is_kaveri_staff());

drop policy if exists vscode_staff_update_assignments on public.coding_vscode_assignments;
create policy vscode_staff_update_assignments
  on public.coding_vscode_assignments
  for update
  to authenticated
  using (public.is_kaveri_staff())
  with check (public.is_kaveri_staff());

drop policy if exists vscode_staff_delete_assignments on public.coding_vscode_assignments;
create policy vscode_staff_delete_assignments
  on public.coding_vscode_assignments
  for delete
  to authenticated
  using (public.is_kaveri_staff());

drop policy if exists vscode_public_read_visible_tests on public.coding_vscode_test_cases;
create policy vscode_public_read_visible_tests
  on public.coding_vscode_test_cases
  for select
  to anon, authenticated
  using (
    is_hidden = false
    and exists (
      select 1
      from public.coding_vscode_assignments a
      where a.id = coding_vscode_test_cases.assignment_id
        and a.is_published = true
    )
  );

drop policy if exists vscode_staff_read_all_tests on public.coding_vscode_test_cases;
create policy vscode_staff_read_all_tests
  on public.coding_vscode_test_cases
  for select
  to authenticated
  using (public.is_kaveri_staff());

drop policy if exists vscode_staff_insert_tests on public.coding_vscode_test_cases;
create policy vscode_staff_insert_tests
  on public.coding_vscode_test_cases
  for insert
  to authenticated
  with check (public.is_kaveri_staff());

drop policy if exists vscode_staff_update_tests on public.coding_vscode_test_cases;
create policy vscode_staff_update_tests
  on public.coding_vscode_test_cases
  for update
  to authenticated
  using (public.is_kaveri_staff())
  with check (public.is_kaveri_staff());

drop policy if exists vscode_staff_delete_tests on public.coding_vscode_test_cases;
create policy vscode_staff_delete_tests
  on public.coding_vscode_test_cases
  for delete
  to authenticated
  using (public.is_kaveri_staff());

insert into public.coding_vscode_assignments (
  assignment_key, title, topic, question, language, file_name, starter_code, marks, is_published
) values
  ('sum-1-to-n', 'Sum of Numbers 1 to N', 'Loops', 'Write a Python program to find the sum of all numbers from 1 to N.', 'python', 'main.py', '# Write your solution below\n', 10, true),
  ('even-or-odd', 'Even or Odd', 'Conditions', 'Read an integer and print Even if it is even, otherwise print Odd.', 'python', 'main.py', '# Write your solution below\n', 10, true),
  ('reverse-number', 'Reverse a Number', 'Loops', 'Write a Python program to reverse the digits of a positive integer.', 'python', 'main.py', '# Write your solution below\n', 10, true)
on conflict (assignment_key) do update set
  title = excluded.title,
  topic = excluded.topic,
  question = excluded.question,
  language = excluded.language,
  file_name = excluded.file_name,
  starter_code = excluded.starter_code,
  marks = excluded.marks,
  is_published = true,
  updated_at = now();

with a as (
  select id, assignment_key from public.coding_vscode_assignments
  where assignment_key in ('sum-1-to-n','even-or-odd','reverse-number')
)
delete from public.coding_vscode_test_cases t
using a
where t.assignment_id = a.id;

insert into public.coding_vscode_test_cases (assignment_id, input_text, expected_output, is_hidden, position)
select a.id, v.input_text, v.expected_output, v.is_hidden, v.position
from public.coding_vscode_assignments a
join (values
  ('sum-1-to-n','1','1',false,1),
  ('sum-1-to-n','5','15',false,2),
  ('sum-1-to-n','10','55',false,3),
  ('sum-1-to-n','100','5050',false,4),
  ('sum-1-to-n','25','325',true,5),
  ('even-or-odd','8','Even',false,1),
  ('even-or-odd','7','Odd',false,2),
  ('even-or-odd','0','Even',false,3),
  ('even-or-odd','-3','Odd',false,4),
  ('even-or-odd','1024','Even',true,5),
  ('reverse-number','1234','4321',false,1),
  ('reverse-number','500','5',false,2),
  ('reverse-number','7','7',false,3),
  ('reverse-number','1000','1',false,4),
  ('reverse-number','908070','70809',true,5)
) as v(assignment_key,input_text,expected_output,is_hidden,position)
  on a.assignment_key = v.assignment_key;;
