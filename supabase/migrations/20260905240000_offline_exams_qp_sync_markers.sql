-- Kaveri LMS — Question Paper system durable sync markers (forward, LOCAL only)
--
-- The Question Paper system (Cloudflare Worker) and the LMS share this
-- Supabase project. When a paper is finalized/archived inside the QP app the
-- Worker writes a durable marker row here (faculty/admin JWT, RLS-scoped) and
-- then posts a signed webhook to the LMS Edge Function
-- (integrations-question-paper). If the webhook is down the marker stays
-- 'pending' and the QP app's admin reconciliation retries it later, so an exam
-- record is never lost because the LMS was unavailable.
--
-- The stored payload is SAFE METADATA ONLY (title, course/batch references,
-- dates, marks). Question content, answer keys and paper sets never leave the
-- Question Paper system and are never stored in this table.

create table if not exists public.qp_platform_sync (
  id uuid primary key default gen_random_uuid(),
  paper_id uuid not null references public.qp_papers(id) on delete cascade,
  action text not null default 'offline_exam.upsert'
    check (action in ('offline_exam.upsert')),
  status text not null default 'pending'
    check (status in ('pending','synced','failed')),
  payload jsonb not null default '{}'::jsonb,
  idempotency_key text,
  attempts integer not null default 0,
  last_attempt_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (paper_id, action)
);

create index if not exists idx_qp_platform_sync_status on public.qp_platform_sync(status);
create index if not exists idx_qp_platform_sync_paper on public.qp_platform_sync(paper_id);

-- Faculty (own papers) / admins manage markers; nobody else can see them.
alter table public.qp_platform_sync enable row level security;

drop policy if exists qp_platform_sync_select on public.qp_platform_sync;
create policy qp_platform_sync_select on public.qp_platform_sync
  for select to authenticated
  using (qp_is_active_faculty_or_admin());

drop policy if exists qp_platform_sync_insert on public.qp_platform_sync;
create policy qp_platform_sync_insert on public.qp_platform_sync
  for insert to authenticated
  with check (qp_is_active_faculty_or_admin());

drop policy if exists qp_platform_sync_update on public.qp_platform_sync;
create policy qp_platform_sync_update on public.qp_platform_sync
  for update to authenticated
  using (qp_is_active_faculty_or_admin())
  with check (qp_is_active_faculty_or_admin());

comment on table public.qp_platform_sync is
  'Durable Question Paper → LMS offline-exam sync markers. Safe metadata only; '
  'question content never leaves the Question Paper system.';
