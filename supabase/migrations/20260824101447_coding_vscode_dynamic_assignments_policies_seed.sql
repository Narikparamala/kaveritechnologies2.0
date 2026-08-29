alter table public.coding_vscode_assignments enable row level security;
alter table public.coding_vscode_test_cases enable row level security;

drop policy if exists vscode_assignments_public_read on public.coding_vscode_assignments;
create policy vscode_assignments_public_read on public.coding_vscode_assignments
for select to authenticated
using (is_published = true or is_kaveri_staff());

drop policy if exists vscode_assignments_staff_all on public.coding_vscode_assignments;
create policy vscode_assignments_staff_all on public.coding_vscode_assignments
for all to authenticated
using (is_kaveri_staff())
with check (is_kaveri_staff());

drop policy if exists vscode_test_cases_visible_or_staff on public.coding_vscode_test_cases;
create policy vscode_test_cases_visible_or_staff on public.coding_vscode_test_cases
for select to authenticated
using ((not is_hidden and exists (
  select 1 from public.coding_vscode_assignments a
  where a.id = assignment_id and a.is_published = true
)) or is_kaveri_staff());

drop policy if exists vscode_test_cases_staff_all on public.coding_vscode_test_cases;
create policy vscode_test_cases_staff_all on public.coding_vscode_test_cases
for all to authenticated
using (is_kaveri_staff())
with check (is_kaveri_staff());

create index if not exists coding_vscode_test_cases_assignment_idx on public.coding_vscode_test_cases(assignment_id, position);

insert into public.coding_vscode_assignments (assignment_key, title, topic, language, file_name, marks, question, starter_code, is_published)
values
('sum-1-to-n','Sum of Numbers 1 to N','Loops','python','main.py',10,'Write a Python program to find the sum of all numbers from 1 to N.','# Write your solution below\n',true),
('even-or-odd','Even or Odd','Conditions','python','main.py',10,'Read an integer and print Even if it is even, otherwise print Odd.','# Write your solution below\n',true),
('reverse-number','Reverse a Number','Loops','python','main.py',10,'Write a Python program to reverse the digits of a positive integer.','# Write your solution below\n',true)
on conflict (assignment_key) do nothing;

insert into public.coding_vscode_test_cases (assignment_id, position, input_text, expected_output, is_hidden)
select a.id, x.position, x.input_text, x.expected_output, false
from public.coding_vscode_assignments a
join (values
('sum-1-to-n',1,'1','1'),('sum-1-to-n',2,'5','15'),('sum-1-to-n',3,'10','55'),('sum-1-to-n',4,'100','5050'),
('even-or-odd',1,'8','Even'),('even-or-odd',2,'7','Odd'),('even-or-odd',3,'0','Even'),('even-or-odd',4,'-3','Odd'),
('reverse-number',1,'1234','4321'),('reverse-number',2,'500','5'),('reverse-number',3,'7','7'),('reverse-number',4,'1000','1')
) as x(assignment_key, position, input_text, expected_output)
on a.assignment_key = x.assignment_key
where not exists (
  select 1 from public.coding_vscode_test_cases t
  where t.assignment_id = a.id and t.position = x.position
);;
