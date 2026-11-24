-- =====================================================================
-- User deletion requests (hard delete, feature/hard-delete-user)
-- =====================================================================
-- ADDITIVE ONLY. No existing table, column, policy, or RPC is dropped,
-- renamed, or weakened by this migration.
--
-- What this adds:
--   1. public.user_deletion_requests — a faculty member files a request
--      to delete a student from their own courses; a Super Admin
--      approves (which runs the same guarded delete as a direct delete,
--      via the admin-delete-user edge function) or rejects it. Faculty
--      can never delete directly. This is a NEW table on purpose:
--      widening faculty_work_requests.request_type would edit an
--      existing CHECK constraint.
--   2. RLS: Super Admins manage all requests; faculty see and file
--      only their own requests. The edge function uses the service-role
--      key and is not limited by these policies.
--
-- Verification after applying (staging first, with a backup):
--   1. user_deletion_requests exists with the columns below.
--   2. A faculty insert for their own student succeeds; an insert for
--      another faculty's student is rejected by the edge function
--      (the RLS insert policy only checks requested_by = auth.uid()).
--   3. No existing page or flow changes — nothing reads this table
--      until the new UI ships.
-- =====================================================================

create table if not exists public.user_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  requested_by uuid not null references public.profiles(id) on delete cascade,
  target_user_id uuid not null references public.profiles(id) on delete cascade,
  target_email text not null,
  target_name text,
  target_role text not null,
  reason text not null,
  ai_report text,
  export_summary jsonb not null default '{}'::jsonb,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.user_deletion_requests is
  'Faculty-filed requests to hard-delete a user. Approved requests are executed by the admin-delete-user edge function (auth.admin.deleteUser); rejected requests stay as a record. Faculty can never delete directly.';

create index if not exists user_deletion_requests_status_idx
  on public.user_deletion_requests (status, created_at desc);

create index if not exists user_deletion_requests_target_idx
  on public.user_deletion_requests (target_user_id, status);

drop trigger if exists update_user_deletion_requests_updated_at on public.user_deletion_requests;
create trigger update_user_deletion_requests_updated_at
  before update on public.user_deletion_requests
  for each row execute function update_updated_at_column();

alter table public.user_deletion_requests enable row level security;

-- Super Admins manage every request.
drop policy if exists user_deletion_requests_admin_all on public.user_deletion_requests;
create policy user_deletion_requests_admin_all
  on public.user_deletion_requests
  for all
  using (public.is_admin())
  with check (public.is_admin());

-- Faculty see only their own requests.
drop policy if exists user_deletion_requests_faculty_select_own on public.user_deletion_requests;
create policy user_deletion_requests_faculty_select_own
  on public.user_deletion_requests
  for select
  using (requested_by = (select auth.uid()));

-- Faculty file only their own requests.
drop policy if exists user_deletion_requests_faculty_insert_own on public.user_deletion_requests;
create policy user_deletion_requests_faculty_insert_own
  on public.user_deletion_requests
  for insert
  with check (requested_by = (select auth.uid()));
