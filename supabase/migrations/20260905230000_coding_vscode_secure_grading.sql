-- Kaveri LMS — Coding Workspace secure grading (forward, LOCAL only)
--
-- Contract:
--   * coding_vscode_submissions gains server-authoritative verified_* fields.
--     Only the secure-grade server path (service_role) or staff may set them.
--     Ordinary authenticated clients are never allowed to write them.
--   * secure_grading_runs gains coding_vscode_submission_id so VS Code
--     submissions share the same isolated-runner audit trail as practice and
--     assignment grading.
--   * Local visible-test counts (visible_tests_passed/provisional_visible_score)
--     remain non-authoritative student feedback. Final marks come from the
--     verified_* fields computed by secure-grade against hidden server tests.

alter table public.coding_vscode_submissions
  add column if not exists verification_status text,
  add column if not exists verified_passed integer,
  add column if not exists verified_total integer,
  add column if not exists verified_score numeric(8,2),
  add column if not exists verified_at timestamp with time zone,
  add column if not exists verified_summary text,
  add column if not exists verification_error text,
  add column if not exists verified_result jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'coding_vscode_submissions_verification_status_check'
      and conrelid = 'public.coding_vscode_submissions'::regclass
  ) then
    alter table public.coding_vscode_submissions
      add constraint coding_vscode_submissions_verification_status_check
      check (verification_status is null or verification_status in ('pending', 'verified', 'error'));
  end if;
end $$;

-- Audit linkage: one VS Code submission may have exactly one grading run today,
-- but the FK is left nullable/SET NULL so legacy and staff-created rows fit.
alter table public.secure_grading_runs
  add column if not exists coding_vscode_submission_id uuid
  references public.coding_vscode_submissions(id) on delete set null;

-- ---------------------------------------------------------------------------
-- Client-write guard
-- ---------------------------------------------------------------------------
-- Students may insert their own submission rows (code + visible-test feedback),
-- but they must never be able to set server-authoritative or teacher-owned
-- fields, even by crafting a direct REST insert. This trigger neutralizes any
-- such attempt before RLS/check constraints see it. service_role (the
-- secure-grade server path) and staff are exempt.
create or replace function public.coding_vscode_submissions_guard()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if (auth.role() is distinct from 'service_role' and not public.is_kaveri_staff()) then
    -- Server-authoritative verified fields: server path only.
    new.verification_status := null;
    new.verified_passed := null;
    new.verified_total := null;
    new.verified_score := null;
    new.verified_at := null;
    new.verified_summary := null;
    new.verification_error := null;
    new.verified_result := null;
    -- Teacher-owned review fields: staff only.
    new.teacher_score := null;
    new.teacher_feedback := null;
    new.reviewed_by := null;
    new.reviewed_at := null;
    new.review_status := 'unreviewed';
    -- A student-created attempt always starts in the submitted state.
    if (tg_op = 'INSERT') then
      new.status := 'submitted';
      new.submitted_at := now();
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists coding_vscode_submissions_guard_trigger
  on public.coding_vscode_submissions;

create trigger coding_vscode_submissions_guard_trigger
  before insert or update on public.coding_vscode_submissions
  for each row execute function public.coding_vscode_submissions_guard();

-- Convenience view of the authoritative result for student-facing reads is not
-- needed: the verified_* columns are part of the row the student already reads.
