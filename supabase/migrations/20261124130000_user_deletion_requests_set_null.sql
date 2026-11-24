-- =====================================================================
-- User deletion requests: keep the request row after approval
-- (hard delete, feature/hard-delete-user — D2 fix, 2026-11-24)
-- =====================================================================
-- ADDITIVE ONLY. The original 20261124120000 migration is NOT edited.
--
-- Problem: user_deletion_requests.target_user_id (and requested_by)
-- referenced profiles(id) ON DELETE CASCADE. Approving a request
-- deletes the target profile, which deleted the request row itself —
-- the admin could no longer see what was approved, by whom, or why
-- (only the activity_logs row survived).
--
-- Fix: change both FKs to ON DELETE SET NULL, keeping the request row
-- + reason/report as the record. SET NULL requires the columns to be
-- nullable, so the NOT NULL constraints are dropped too; the edge
-- function still always sets both columns on insert, and the request
-- keeps target_email / target_name / target_role (denormalised) so it
-- stays meaningful after the target is gone. reviewed_by was already
-- ON DELETE SET NULL.
--
-- Verification after applying (staging first):
--   1. Approve a faculty request on staging; the request row must
--      still exist afterwards with status approved, reviewed_by,
--      reason and ai_report intact, and target_user_id NULL.
--   2. Reject path and direct deletes are unaffected.
-- =====================================================================

alter table public.user_deletion_requests
  alter column target_user_id drop not null,
  alter column requested_by drop not null;

alter table public.user_deletion_requests
  drop constraint if exists user_deletion_requests_target_user_id_fkey,
  add constraint user_deletion_requests_target_user_id_fkey
    foreign key (target_user_id) references public.profiles(id) on delete set null;

alter table public.user_deletion_requests
  drop constraint if exists user_deletion_requests_requested_by_fkey,
  add constraint user_deletion_requests_requested_by_fkey
    foreign key (requested_by) references public.profiles(id) on delete set null;
