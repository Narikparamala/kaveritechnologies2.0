-- Kaveri LMS — production repair: secure_grading_runs vscode audit shape
--
-- Root cause (proven by the 2026-09-12 end-to-end grading drill): production
-- still carries the ORIGINAL source constraints from 20260829141907
-- (practice/assignment only). The committed widening migration
-- 20260905230100_secure_grading_runs_vscode_audit.sql was never applied to
-- production, so every secure-grade `kind: 'vscode'` save fails with
-- GRADING_STORAGE_ERROR when inserting the audit row
-- (check constraint `secure_grading_runs_source_kind_check` rejects 'vscode').
--
-- This migration replays the committed widening idempotently. No data changes.

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
