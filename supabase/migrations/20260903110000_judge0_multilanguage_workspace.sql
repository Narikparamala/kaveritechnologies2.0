-- Kaveri LMS Judge0 multi-language workspace.
-- Persists the selected runtime and rate-limits non-authoritative code runs.

begin;

alter table public.coding_question_attempts
  add column if not exists language_id integer,
  add column if not exists language_name text;

alter table public.assignment_question_submissions
  add column if not exists language_id integer,
  add column if not exists language_name text;

create table if not exists public.coding_execution_requests (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles(id) on delete cascade,
  mode text not null check (mode in ('sample', 'custom')),
  language_id integer not null check (language_id > 0),
  input_count integer not null default 1 check (input_count between 1 and 30),
  status text not null default 'running' check (status in ('running', 'completed', 'error')),
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists coding_execution_requests_student_created_idx
  on public.coding_execution_requests (student_id, created_at desc);

alter table public.coding_execution_requests enable row level security;

revoke all on table public.coding_execution_requests from public;
revoke all on table public.coding_execution_requests from anon;
revoke all on table public.coding_execution_requests from authenticated;

drop function if exists public.get_student_coding_questions(uuid);

create function public.get_student_coding_questions(
  p_question_id uuid default null
)
returns table (
  id uuid,
  title text,
  slug text,
  problem_statement text,
  instructions text,
  input_format text,
  output_format text,
  constraints_text text,
  starter_code text,
  explanation text,
  hints text[],
  difficulty text,
  topic text,
  subtopic text,
  tags text[],
  company_tags text[],
  frequency_score integer,
  language text,
  default_marks integer,
  is_published boolean
)
language sql
security definer
set search_path = ''
stable
as $$
  select
    q.id, q.title, q.slug, q.problem_statement, q.instructions,
    q.input_format, q.output_format, q.constraints_text, q.starter_code,
    q.explanation, q.hints, q.difficulty, q.topic, q.subtopic,
    q.tags, q.company_tags, q.frequency_score, q.language,
    q.default_marks, q.is_published
  from public.coding_questions q
  where auth.uid() is not null
    and q.is_published = true
    and (p_question_id is null or q.id = p_question_id)
  order by q.frequency_score desc, q.title asc;
$$;

revoke all on function public.get_student_coding_questions(uuid) from public;
revoke all on function public.get_student_coding_questions(uuid) from anon;
grant execute on function public.get_student_coding_questions(uuid) to authenticated;

comment on table public.coding_execution_requests is
  'Server-only rate-limit and operational audit for sample and custom Judge0 runs.';

commit;
