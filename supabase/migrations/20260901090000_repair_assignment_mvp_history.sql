-- Preserve the legitimate incremental objects from the retired preview
-- bootstrap without restoring preview users or unrestricted RLS policies.

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.sync_assignment_publication()
returns trigger
language plpgsql
as $$
begin
  new.is_published = (new.status = 'published');
  return new;
end;
$$;

drop trigger if exists sync_assignment_publication_trigger
  on public.assignments;

create trigger sync_assignment_publication_trigger
before insert or update of status
on public.assignments
for each row
execute function public.sync_assignment_publication();

drop trigger if exists assignment_questions_updated_at
  on public.assignment_questions;

create trigger assignment_questions_updated_at
before update on public.assignment_questions
for each row
execute function public.set_updated_at();

drop trigger if exists assignment_test_cases_updated_at
  on public.assignment_test_cases;

create trigger assignment_test_cases_updated_at
before update on public.assignment_test_cases
for each row
execute function public.set_updated_at();

drop trigger if exists assignment_question_submissions_updated_at
  on public.assignment_question_submissions;

create trigger assignment_question_submissions_updated_at
before update on public.assignment_question_submissions
for each row
execute function public.set_updated_at();

create index if not exists assignments_course_idx
  on public.assignments(course_id);

create index if not exists assignment_questions_assignment_idx
  on public.assignment_questions(assignment_id, order_index);

create index if not exists assignment_test_cases_question_idx
  on public.assignment_test_cases(question_id, order_index);

create index if not exists assignment_submissions_assignment_idx
  on public.assignment_submissions(assignment_id);

create index if not exists assignment_submissions_student_idx
  on public.assignment_submissions(student_id);