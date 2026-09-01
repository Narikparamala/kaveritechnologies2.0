-- Kaveri Technologies Academy
-- Reusable coding question bank for practice and assignments.

create extension if not exists pgcrypto;

create table if not exists public.coding_questions (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text not null unique,
  problem_statement text not null,
  instructions text,
  input_format text,
  output_format text,
  constraints_text text,
  starter_code text,
  reference_solution text,
  explanation text,
  hints text[] not null default '{}',
  difficulty text not null default 'easy'
    check (difficulty in ('easy', 'medium', 'hard')),
  topic text not null default 'Python Basics',
  subtopic text,
  tags text[] not null default '{}',
  company_tags text[] not null default '{}',
  frequency_score integer not null default 0
    check (frequency_score between 0 and 100),
  language text not null default 'python',
  default_marks integer not null default 10
    check (default_marks > 0),
  source_type text not null default 'original'
    check (source_type in ('original', 'faculty_created', 'adapted_pattern')),
  is_published boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.coding_question_test_cases (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.coding_questions(id) on delete cascade,
  input_data text,
  expected_output text not null,
  is_hidden boolean not null default false,
  weight integer not null default 1 check (weight > 0),
  order_index integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.coding_question_attempts (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.coding_questions(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  submitted_code text,
  status text not null default 'started'
    check (status in ('started', 'attempted', 'solved')),
  attempts_count integer not null default 0,
  passed_test_cases integer not null default 0,
  total_test_cases integer not null default 0,
  last_execution_output text,
  first_solved_at timestamptz,
  last_attempted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (question_id, student_id)
);

alter table public.assignment_questions
  add column if not exists question_bank_id uuid
  references public.coding_questions(id) on delete set null;

create index if not exists coding_questions_published_idx
  on public.coding_questions (is_published, difficulty, topic);
create index if not exists coding_questions_tags_idx
  on public.coding_questions using gin (tags);
create index if not exists coding_questions_company_tags_idx
  on public.coding_questions using gin (company_tags);
create index if not exists coding_question_test_cases_question_idx
  on public.coding_question_test_cases (question_id, order_index);
create index if not exists coding_question_attempts_student_idx
  on public.coding_question_attempts (student_id, status);
create index if not exists assignment_questions_bank_idx
  on public.assignment_questions (question_bank_id);

create or replace function public.kaveri_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists coding_questions_set_updated_at on public.coding_questions;
create trigger coding_questions_set_updated_at
before update on public.coding_questions
for each row execute function public.kaveri_set_updated_at();

drop trigger if exists coding_question_test_cases_set_updated_at on public.coding_question_test_cases;
create trigger coding_question_test_cases_set_updated_at
before update on public.coding_question_test_cases
for each row execute function public.kaveri_set_updated_at();

drop trigger if exists coding_question_attempts_set_updated_at on public.coding_question_attempts;
create trigger coding_question_attempts_set_updated_at
before update on public.coding_question_attempts
for each row execute function public.kaveri_set_updated_at();

alter table public.coding_questions enable row level security;
alter table public.coding_question_test_cases enable row level security;
alter table public.coding_question_attempts enable row level security;

-- Preview-development policies. Tighten these when real authentication is enabled.
drop policy if exists preview_coding_questions_all on public.coding_questions;
create policy preview_coding_questions_all
on public.coding_questions for all to anon, authenticated
using (true) with check (true);

drop policy if exists preview_coding_question_test_cases_all on public.coding_question_test_cases;
create policy preview_coding_question_test_cases_all
on public.coding_question_test_cases for all to anon, authenticated
using (true) with check (true);

drop policy if exists preview_coding_question_attempts_all on public.coding_question_attempts;
create policy preview_coding_question_attempts_all
on public.coding_question_attempts for all to anon, authenticated
using (true) with check (true);

-- Five system-authored starter questions. created_by is intentionally NULL:
-- seed content must not depend on a preview, faculty, or production user.
-- The bank can later be expanded through authenticated faculty workflows.
insert into public.coding_questions (
  id, title, slug, problem_statement, input_format, output_format,
  constraints_text, starter_code, reference_solution, explanation, hints,
  difficulty, topic, subtopic, tags, company_tags, frequency_score,
  default_marks, source_type, is_published, created_by
)
values
(
  '21000000-0000-0000-0000-000000000001',
  'Add Two Numbers',
  'add-two-numbers',
  'Given two integers A and B, print their sum.',
  E'The first line contains integer A.\nThe second line contains integer B.',
  'Print one integer representing A + B.',
  '-100000 <= A, B <= 100000',
  E'a = int(input())\nb = int(input())\n# Write your code below',
  E'a = int(input())\nb = int(input())\nprint(a + b)',
  'Read both integers, add them, and print the result.',
  array['Use the + operator after reading both inputs.'],
  'easy', 'Python Basics', 'Input and Output',
  array['input', 'output', 'arithmetic'],
  array['TCS', 'Infosys', 'Wipro', 'Accenture'], 90,
  10, 'original', true,
  null
),
(
  '21000000-0000-0000-0000-000000000002',
  'Even or Odd',
  'even-or-odd',
  'Given an integer N, print Even when N is divisible by 2; otherwise print Odd.',
  'A single integer N.',
  'Print Even or Odd.',
  '-100000 <= N <= 100000',
  E'n = int(input())\n# Write your code below',
  E'n = int(input())\nif n % 2 == 0:\n    print("Even")\nelse:\n    print("Odd")',
  'The remainder after division by 2 determines whether a number is even.',
  array['Check n % 2.'],
  'easy', 'Conditional Statements', 'If-Else',
  array['conditions', 'modulo'],
  array['TCS', 'Cognizant', 'Capgemini'], 88,
  10, 'original', true,
  null
),
(
  '21000000-0000-0000-0000-000000000003',
  'Largest of Three Numbers',
  'largest-of-three-numbers',
  'Given three integers A, B and C, print the largest value.',
  'Three integers, each provided on a separate line.',
  'Print the largest integer.',
  '-100000 <= A, B, C <= 100000',
  E'a = int(input())\nb = int(input())\nc = int(input())\n# Write your code below',
  E'a = int(input())\nb = int(input())\nc = int(input())\nprint(max(a, b, c))',
  'Compare all three values and keep the greatest one.',
  array['You can compare values using if-elif-else.'],
  'easy', 'Conditional Statements', 'Comparisons',
  array['conditions', 'comparison'],
  array['Infosys', 'Wipro', 'Accenture'], 82,
  10, 'original', true,
  null
),
(
  '21000000-0000-0000-0000-000000000004',
  'Reverse a String',
  'reverse-a-string',
  'Given a string S, print the characters of S in reverse order.',
  'A single line containing string S.',
  'Print the reversed string.',
  '1 <= length of S <= 1000',
  E's = input()\n# Write your code below',
  E's = input()\nprint(s[::-1])',
  'Extended slicing with a step of -1 visits the string from right to left.',
  array['Try extended slicing.'],
  'easy', 'Strings', 'Slicing',
  array['strings', 'slicing'],
  array['TCS', 'Cognizant', 'Amazon'], 86,
  10, 'adapted_pattern', true,
  null
),
(
  '21000000-0000-0000-0000-000000000005',
  'Count Vowels',
  'count-vowels',
  'Given a string S, print the number of English vowels in it. Treat uppercase and lowercase vowels equally.',
  'A single line containing string S.',
  'Print one integer: the vowel count.',
  '1 <= length of S <= 1000',
  E's = input()\n# Write your code below',
  E's = input()\ncount = 0\nfor char in s:\n    if char.lower() in "aeiou":\n        count += 1\nprint(count)',
  'Visit every character and increase a counter when it is a vowel.',
  array['Convert each character to lowercase before comparing.'],
  'easy', 'Strings', 'Loops',
  array['strings', 'loops', 'counting'],
  array['TCS', 'Infosys', 'Cognizant'], 84,
  10, 'original', true,
  null
)
on conflict (id) do update set
  title = excluded.title,
  problem_statement = excluded.problem_statement,
  input_format = excluded.input_format,
  output_format = excluded.output_format,
  constraints_text = excluded.constraints_text,
  starter_code = excluded.starter_code,
  reference_solution = excluded.reference_solution,
  explanation = excluded.explanation,
  hints = excluded.hints,
  difficulty = excluded.difficulty,
  topic = excluded.topic,
  subtopic = excluded.subtopic,
  tags = excluded.tags,
  company_tags = excluded.company_tags,
  frequency_score = excluded.frequency_score,
  is_published = excluded.is_published;

insert into public.coding_question_test_cases (
  id, question_id, input_data, expected_output, is_hidden, weight, order_index
)
values
  ('31000000-0000-0000-0000-000000000001', '21000000-0000-0000-0000-000000000001', E'5\n7', '12', false, 1, 0),
  ('31000000-0000-0000-0000-000000000002', '21000000-0000-0000-0000-000000000001', E'-3\n8', '5', true, 1, 1),
  ('31000000-0000-0000-0000-000000000003', '21000000-0000-0000-0000-000000000002', '8', 'Even', false, 1, 0),
  ('31000000-0000-0000-0000-000000000004', '21000000-0000-0000-0000-000000000002', '7', 'Odd', true, 1, 1),
  ('31000000-0000-0000-0000-000000000005', '21000000-0000-0000-0000-000000000003', E'3\n9\n5', '9', false, 1, 0),
  ('31000000-0000-0000-0000-000000000006', '21000000-0000-0000-0000-000000000003', E'-4\n-2\n-9', '-2', true, 1, 1),
  ('31000000-0000-0000-0000-000000000007', '21000000-0000-0000-0000-000000000004', 'Python', 'nohtyP', false, 1, 0),
  ('31000000-0000-0000-0000-000000000008', '21000000-0000-0000-0000-000000000004', 'Kaveri Technologies', 'seigolonhceT irevaK', true, 1, 1),
  ('31000000-0000-0000-0000-000000000009', '21000000-0000-0000-0000-000000000005', 'Education', '5', false, 1, 0),
  ('31000000-0000-0000-0000-000000000010', '21000000-0000-0000-0000-000000000005', 'rhythms', '0', true, 1, 1)
on conflict (id) do update set
  input_data = excluded.input_data,
  expected_output = excluded.expected_output,
  is_hidden = excluded.is_hidden,
  weight = excluded.weight,
  order_index = excluded.order_index;
