-- Kaveri LMS Phase 1 coding security containment.
-- Removes temporary preview access and makes faculty review authoritative
-- until an isolated server-side runner is available.

-- Temporary preview policies must not coexist with restrictive policies:
-- permissive PostgreSQL policies are combined with OR.
drop policy if exists preview_assignments on public.assignments;
drop policy if exists preview_assignment_questions on public.assignment_questions;
drop policy if exists preview_assignment_test_cases on public.assignment_test_cases;
drop policy if exists preview_assignment_submissions on public.assignment_submissions;
drop policy if exists preview_question_submissions on public.assignment_question_submissions;
drop policy if exists preview_coding_questions_all on public.coding_questions;
drop policy if exists preview_coding_question_test_cases_all on public.coding_question_test_cases;
drop policy if exists preview_coding_question_attempts_all on public.coding_question_attempts;

-- Anonymous users must not access authenticated learning or grading data.
revoke all on table public.assignments from anon;
revoke all on table public.assignment_questions from anon;
revoke all on table public.assignment_test_cases from anon;
revoke all on table public.assignment_submissions from anon;
revoke all on table public.assignment_question_submissions from anon;
revoke all on table public.coding_questions from anon;
revoke all on table public.coding_question_test_cases from anon;
revoke all on table public.coding_question_attempts from anon;

-- Authenticated users still require an applicable RLS policy for every row.
revoke all on table public.assignments from authenticated;
revoke all on table public.assignment_questions from authenticated;
revoke all on table public.assignment_test_cases from authenticated;
revoke all on table public.assignment_submissions from authenticated;
revoke all on table public.assignment_question_submissions from authenticated;
revoke all on table public.coding_questions from authenticated;
revoke all on table public.coding_question_test_cases from authenticated;
revoke all on table public.coding_question_attempts from authenticated;

grant select, insert, update, delete on table public.assignments to authenticated;
grant select, insert, update, delete on table public.assignment_questions to authenticated;
grant select, insert, update, delete on table public.assignment_test_cases to authenticated;
grant select, insert, update, delete on table public.assignment_submissions to authenticated;
grant select, insert, update, delete on table public.assignment_question_submissions to authenticated;
grant select, insert, update, delete on table public.coding_questions to authenticated;
grant select, insert, update, delete on table public.coding_question_test_cases to authenticated;
grant select, insert, update, delete on table public.coding_question_attempts to authenticated;

alter table public.assignments enable row level security;
alter table public.assignment_questions enable row level security;
alter table public.assignment_test_cases enable row level security;
alter table public.assignment_submissions enable row level security;
alter table public.assignment_question_submissions enable row level security;
alter table public.coding_questions enable row level security;
alter table public.coding_question_test_cases enable row level security;
alter table public.coding_question_attempts enable row level security;

-- Assignments
drop policy if exists assignments_staff_all_secure on public.assignments;
create policy assignments_staff_all_secure
on public.assignments for all to authenticated
using (public.is_kaveri_staff())
with check (public.is_kaveri_staff());

drop policy if exists assignments_students_read_enrolled_secure on public.assignments;
create policy assignments_students_read_enrolled_secure
on public.assignments for select to authenticated
using (
  is_published = true
  and exists (
    select 1 from public.course_enrollments ce
    where ce.course_id = assignments.course_id
      and ce.student_id = auth.uid()
      and ce.access_status = 'active'
  )
);

-- Assignment questions
drop policy if exists assignment_questions_staff_all_secure on public.assignment_questions;
create policy assignment_questions_staff_all_secure
on public.assignment_questions for all to authenticated
using (
  exists (
    select 1 from public.assignments a
    where a.id = assignment_questions.assignment_id
      and public.is_kaveri_staff()
  )
)
with check (
  exists (
    select 1 from public.assignments a
    where a.id = assignment_questions.assignment_id
      and public.is_kaveri_staff()
  )
);

drop policy if exists assignment_questions_students_read_secure on public.assignment_questions;
create policy assignment_questions_students_read_secure
on public.assignment_questions for select to authenticated
using (
  exists (
    select 1
    from public.assignments a
    join public.course_enrollments ce on ce.course_id = a.course_id
    where a.id = assignment_questions.assignment_id
      and a.is_published = true
      and ce.student_id = auth.uid()
      and ce.access_status = 'active'
  )
);

-- Assignment test cases: students can receive visible cases only.
drop policy if exists "Faculty can manage test cases" on public.assignment_test_cases;
drop policy if exists "Students can read visible test cases" on public.assignment_test_cases;
drop policy if exists assignment_test_cases_staff_all_secure on public.assignment_test_cases;
create policy assignment_test_cases_staff_all_secure
on public.assignment_test_cases for all to authenticated
using (public.is_kaveri_staff())
with check (public.is_kaveri_staff());

drop policy if exists assignment_test_cases_students_visible_secure on public.assignment_test_cases;
create policy assignment_test_cases_students_visible_secure
on public.assignment_test_cases for select to authenticated
using (
  is_hidden = false
  and exists (
    select 1
    from public.assignments a
    join public.course_enrollments ce on ce.course_id = a.course_id
    where a.id = assignment_test_cases.assignment_id
      and a.is_published = true
      and ce.student_id = auth.uid()
      and ce.access_status = 'active'
  )
);

-- Assignment submissions: students may submit their own work but cannot
-- manufacture grades, reviewers or feedback.
drop policy if exists assignment_submissions_staff_read_secure on public.assignment_submissions;
create policy assignment_submissions_staff_read_secure
on public.assignment_submissions for select to authenticated
using (public.is_kaveri_staff());

drop policy if exists assignment_submissions_staff_update_secure on public.assignment_submissions;
create policy assignment_submissions_staff_update_secure
on public.assignment_submissions for update to authenticated
using (public.is_kaveri_staff())
with check (public.is_kaveri_staff());

drop policy if exists assignment_submissions_students_read_own_secure on public.assignment_submissions;
create policy assignment_submissions_students_read_own_secure
on public.assignment_submissions for select to authenticated
using (student_id = auth.uid());

drop policy if exists assignment_submissions_students_insert_own_secure on public.assignment_submissions;
create policy assignment_submissions_students_insert_own_secure
on public.assignment_submissions for insert to authenticated
with check (
  student_id = auth.uid()
  and status = 'draft'
  and score is null and feedback is null
  and graded_by is null and graded_at is null
  and exists (
    select 1
    from public.assignments a
    join public.course_enrollments ce on ce.course_id = a.course_id
    where a.id = assignment_submissions.assignment_id
      and a.is_published = true
      and ce.student_id = auth.uid()
      and ce.access_status = 'active'
  )
);

drop policy if exists assignment_submissions_students_update_own_secure on public.assignment_submissions;
create policy assignment_submissions_students_update_own_secure
on public.assignment_submissions for update to authenticated
using (student_id = auth.uid() and status in ('draft', 'submitted'))
with check (
  student_id = auth.uid()
  and status in ('draft', 'submitted')
  and score is null and feedback is null
  and graded_by is null and graded_at is null
);

-- Per-question submission rows.
drop policy if exists "Students can manage their own question submissions" on public.assignment_question_submissions;
drop policy if exists "Faculty can read and grade question submissions" on public.assignment_question_submissions;
drop policy if exists "Faculty can update marks and feedback" on public.assignment_question_submissions;

drop policy if exists assignment_question_submissions_staff_all_secure on public.assignment_question_submissions;
create policy assignment_question_submissions_staff_all_secure
on public.assignment_question_submissions for all to authenticated
using (public.is_kaveri_staff())
with check (public.is_kaveri_staff());

drop policy if exists assignment_question_submissions_students_read_own_secure on public.assignment_question_submissions;
create policy assignment_question_submissions_students_read_own_secure
on public.assignment_question_submissions for select to authenticated
using (
  exists (
    select 1 from public.assignment_submissions s
    where s.id = assignment_question_submissions.submission_id
      and s.student_id = auth.uid()
  )
);

drop policy if exists assignment_question_submissions_students_insert_own_secure on public.assignment_question_submissions;
create policy assignment_question_submissions_students_insert_own_secure
on public.assignment_question_submissions for insert to authenticated
with check (
  marks_awarded is null and feedback is null
  and exists (
    select 1 from public.assignment_submissions s
    where s.id = assignment_question_submissions.submission_id
      and s.student_id = auth.uid()
      and s.status = 'draft'
  )
);

drop policy if exists assignment_question_submissions_students_update_own_secure on public.assignment_question_submissions;
create policy assignment_question_submissions_students_update_own_secure
on public.assignment_question_submissions for update to authenticated
using (
  exists (
    select 1 from public.assignment_submissions s
    where s.id = assignment_question_submissions.submission_id
      and s.student_id = auth.uid()
      and s.status = 'draft'
  )
)
with check (
  marks_awarded is null and feedback is null
  and exists (
    select 1 from public.assignment_submissions s
    where s.id = assignment_question_submissions.submission_id
      and s.student_id = auth.uid()
      and s.status = 'draft'
  )
);

-- Question bank: only staff can query the base table, which contains the
-- reference solution. Students use the safe RPC below.
drop policy if exists coding_questions_staff_all_secure on public.coding_questions;
create policy coding_questions_staff_all_secure
on public.coding_questions for all to authenticated
using (public.is_kaveri_staff())
with check (public.is_kaveri_staff());

drop policy if exists coding_question_test_cases_staff_all_secure on public.coding_question_test_cases;
create policy coding_question_test_cases_staff_all_secure
on public.coding_question_test_cases for all to authenticated
using (public.is_kaveri_staff())
with check (public.is_kaveri_staff());

drop policy if exists coding_question_test_cases_students_visible_secure on public.coding_question_test_cases;
create policy coding_question_test_cases_students_visible_secure
on public.coding_question_test_cases for select to authenticated
using (
  is_hidden = false
  and exists (
    select 1 from public.coding_questions q
    where q.id = coding_question_test_cases.question_id
      and q.is_published = true
  )
);

-- Practice attempts are provisional. A browser user cannot claim verified
-- solved status or verified test totals.
drop policy if exists coding_question_attempts_staff_all_secure on public.coding_question_attempts;
create policy coding_question_attempts_staff_all_secure
on public.coding_question_attempts for all to authenticated
using (public.is_kaveri_staff())
with check (public.is_kaveri_staff());

drop policy if exists coding_question_attempts_students_read_own_secure on public.coding_question_attempts;
create policy coding_question_attempts_students_read_own_secure
on public.coding_question_attempts for select to authenticated
using (student_id = auth.uid());

drop policy if exists coding_question_attempts_students_insert_own_secure on public.coding_question_attempts;
create policy coding_question_attempts_students_insert_own_secure
on public.coding_question_attempts for insert to authenticated
with check (
  student_id = auth.uid()
  and status in ('started', 'attempted')
  and passed_test_cases = 0 and total_test_cases = 0
  and first_solved_at is null
);

drop policy if exists coding_question_attempts_students_update_own_secure on public.coding_question_attempts;
create policy coding_question_attempts_students_update_own_secure
on public.coding_question_attempts for update to authenticated
using (student_id = auth.uid() and status in ('started', 'attempted'))
with check (
  student_id = auth.uid()
  and status in ('started', 'attempted')
  and passed_test_cases = 0 and total_test_cases = 0
  and first_solved_at is null
);

-- Safe student projection deliberately excludes reference_solution,
-- created_by and other staff-only fields.
create or replace function public.get_student_coding_questions(
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
    q.tags, q.company_tags, q.frequency_score, q.default_marks,
    q.is_published
  from public.coding_questions q
  where auth.uid() is not null
    and q.is_published = true
    and (p_question_id is null or q.id = p_question_id)
  order by q.frequency_score desc, q.title asc;
$$;

revoke all on function public.get_student_coding_questions(uuid) from public;
revoke all on function public.get_student_coding_questions(uuid) from anon;
grant execute on function public.get_student_coding_questions(uuid) to authenticated;
