-- Kaveri LMS — secure_grading_runs audit constraints for VS Code submissions
-- (forward, LOCAL only; companion to 20260905230000_coding_vscode_secure_grading.sql)
--
-- The vscode grading path records its isolated-runner audit in
-- secure_grading_runs with source_kind='vscode' and the nullable
-- coding_vscode_submission_id added by the companion migration. The original
-- source-kind checks only admitted practice/assignment shapes, so relax them
-- to admit exactly one vscode shape (coding_vscode_submission_id present,
-- no other source references).

alter table public.secure_grading_runs
  drop constraint if exists secure_grading_runs_source_kind_check;
alter table public.secure_grading_runs
  drop constraint if exists secure_grading_runs_source_check;

alter table public.secure_grading_runs
  add constraint secure_grading_runs_source_kind_check
  check (source_kind = any (array['practice'::text, 'assignment'::text, 'vscode'::text]));

alter table public.secure_grading_runs
  add constraint secure_grading_runs_source_check
  check (
    (source_kind = 'practice'::text and coding_question_id is not null
      and assignment_submission_id is null and assignment_question_submission_id is null
      and coding_vscode_submission_id is null)
    or (source_kind = 'assignment'::text and coding_question_id is null
      and assignment_submission_id is not null and assignment_question_submission_id is not null
      and coding_vscode_submission_id is null)
    or (source_kind = 'vscode'::text and coding_question_id is null
      and assignment_submission_id is null and assignment_question_submission_id is null
      and coding_vscode_submission_id is not null)
  );

create index if not exists secure_grading_runs_vscode_submission_idx
  on public.secure_grading_runs (coding_vscode_submission_id)
  where coding_vscode_submission_id is not null;
