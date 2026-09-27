-- Kaveri LMS — production repair: secure_grading_runs vscode FK delete action
--
-- Defect (proven by the 2026-09-15 mini-project grading drill): deleting a
-- coding_vscode_submissions row fails with check-constraint violation 23514 on
-- secure_grading_runs_source_check. The FK added by 20260905230000 uses
-- ON DELETE SET NULL, but 20260905230100's source_check requires
-- coding_vscode_submission_id IS NOT NULL for source_kind='vscode' rows — so
-- the CASCADE's SET NULL write re-validates the check and always fails.
-- Student-account deletion is equally blocked (profiles cascade to
-- submissions). Every sibling FK on this table already uses CASCADE; audit
-- rows for a deleted submission are meaningless. Align the action:
-- no data changes, idempotent.

alter table public.secure_grading_runs
  drop constraint if exists secure_grading_runs_coding_vscode_submission_id_fkey;

alter table public.secure_grading_runs
  add constraint secure_grading_runs_coding_vscode_submission_id_fkey
  foreign key (coding_vscode_submission_id)
  references public.coding_vscode_submissions (id)
  on delete cascade;
