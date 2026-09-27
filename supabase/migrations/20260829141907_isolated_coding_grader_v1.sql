-- Kaveri LMS isolated coding grader v1.
-- Stores server-verified grading runs without exposing hidden test data.

create table if not exists public.secure_grading_runs (
  id uuid primary key default gen_random_uuid(),
  source_kind text not null check (source_kind in ('practice', 'assignment')),
  student_id uuid not null references public.profiles(id) on delete cascade,
  assignment_submission_id uuid references public.assignment_submissions(id) on delete cascade,
  assignment_question_submission_id uuid references public.assignment_question_submissions(id) on delete cascade,
  coding_question_id uuid references public.coding_questions(id) on delete cascade,
  language text not null default 'python',
  code_hash text not null,
  status text not null default 'running' check (status in ('running', 'passed', 'failed', 'error')),
  passed_test_cases integer not null default 0 check (passed_test_cases >= 0),
  total_test_cases integer not null default 0 check (total_test_cases >= 0),
  score integer,
  max_score integer,
  public_result jsonb not null default '{}'::jsonb,
  error_code text,
  provider_ref text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint secure_grading_runs_source_check check (
    (
      source_kind = 'practice'
      and coding_question_id is not null
      and assignment_submission_id is null
      and assignment_question_submission_id is null
    )
    or
    (
      source_kind = 'assignment'
      and coding_question_id is null
      and assignment_submission_id is not null
      and assignment_question_submission_id is not null
    )
  ),
  constraint secure_grading_runs_counts_check check (passed_test_cases <= total_test_cases),
  constraint secure_grading_runs_score_check check (
    score is null or (score >= 0 and max_score is not null and score <= max_score)
  )
);

create index if not exists secure_grading_runs_student_created_idx
  on public.secure_grading_runs (student_id, created_at desc);
create index if not exists secure_grading_runs_assignment_idx
  on public.secure_grading_runs (assignment_submission_id, created_at desc)
  where assignment_submission_id is not null;
create index if not exists secure_grading_runs_practice_idx
  on public.secure_grading_runs (coding_question_id, student_id, created_at desc)
  where coding_question_id is not null;

alter table public.secure_grading_runs enable row level security;

revoke all on table public.secure_grading_runs from public;
revoke all on table public.secure_grading_runs from anon;
revoke all on table public.secure_grading_runs from authenticated;
grant select on table public.secure_grading_runs to authenticated;

drop policy if exists secure_grading_runs_students_read_own on public.secure_grading_runs;
create policy secure_grading_runs_students_read_own
on public.secure_grading_runs for select to authenticated
using (student_id = (select auth.uid()));

drop policy if exists secure_grading_runs_staff_read on public.secure_grading_runs;
create policy secure_grading_runs_staff_read
on public.secure_grading_runs for select to authenticated
using (public.is_kaveri_staff());

comment on table public.secure_grading_runs is
  'Immutable audit records produced by the server-side isolated coding grader. Hidden inputs and expected outputs are never stored in public_result.';
