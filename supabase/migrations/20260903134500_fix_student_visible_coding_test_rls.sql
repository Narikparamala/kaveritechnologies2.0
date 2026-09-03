-- Kaveri LMS: restore student access to published visible coding test cases
-- without granting students SELECT access to coding_questions, which contains
-- staff-only fields such as reference_solution.

begin;

create or replace function public.is_published_coding_question(
  p_question_id uuid
)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1
    from public.coding_questions q
    where q.id = p_question_id
      and q.is_published = true
  );
$$;

revoke all on function public.is_published_coding_question(uuid) from public;
revoke all on function public.is_published_coding_question(uuid) from anon;
grant execute on function public.is_published_coding_question(uuid) to authenticated;

drop policy if exists coding_question_test_cases_students_visible_secure
  on public.coding_question_test_cases;

create policy coding_question_test_cases_students_visible_secure
on public.coding_question_test_cases
for select
to authenticated
using (
  is_hidden = false
  and public.is_published_coding_question(question_id)
);

comment on function public.is_published_coding_question(uuid) is
  'Security-definer publication check used by coding test-case RLS so students can read visible tests without access to coding_questions.reference_solution.';

commit;
