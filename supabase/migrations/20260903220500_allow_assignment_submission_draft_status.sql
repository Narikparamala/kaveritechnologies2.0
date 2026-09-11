-- Kaveri LMS: align assignment submission status constraint with the
-- student autosave/submission state machine.
--
-- The application and RLS policies use `draft` while a student is editing,
-- then transition to `submitted`, with grading/review using the existing
-- `graded`, `returned`, and `resubmitted` states.

begin;

alter table public.assignment_submissions
  drop constraint if exists assignment_submissions_status_check;

alter table public.assignment_submissions
  add constraint assignment_submissions_status_check
  check (
    status in (
      'draft',
      'submitted',
      'graded',
      'returned',
      'resubmitted'
    )
  );

commit;
