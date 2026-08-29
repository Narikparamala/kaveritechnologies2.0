alter table public.coding_vscode_submissions
  add column if not exists teacher_score numeric(8,2),
  add column if not exists teacher_feedback text,
  add column if not exists review_status text not null default 'unreviewed',
  add column if not exists reviewed_at timestamptz,
  add column if not exists reviewed_by uuid references auth.users(id) on delete set null;

alter table public.coding_vscode_submissions
  drop constraint if exists coding_vscode_submissions_review_status_check;

alter table public.coding_vscode_submissions
  add constraint coding_vscode_submissions_review_status_check
  check (review_status in ('unreviewed','reviewed','needs_changes'));

alter table public.coding_vscode_submissions
  drop constraint if exists coding_vscode_submissions_teacher_score_check;

alter table public.coding_vscode_submissions
  add constraint coding_vscode_submissions_teacher_score_check
  check (teacher_score is null or teacher_score >= 0);;
