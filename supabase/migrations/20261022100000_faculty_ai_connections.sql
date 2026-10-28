-- BYO AI keys for content generation (per-faculty provider connections).
--
-- Each faculty stores their own provider API key ENCRYPTED AT REST (AES-256-
-- GCM, key lives only in the Edge Function runtime via AI_KEY_ENCRYPTION_SECRET).
-- The plaintext key is never selectable from SQL and never leaves the server.
--
-- This file is idempotent: safe to re-run.

create extension if not exists pgcrypto;

-- ============================================================
-- faculty_ai_connections
-- ============================================================
create table if not exists public.faculty_ai_connections (
  id uuid primary key default gen_random_uuid(),
  faculty_id uuid NOT NULL references public.profiles(id) on delete cascade,
  provider text NOT NULL check (provider in ('google','openai','anthropic','groq','openrouter','custom')),
  model text NOT NULL default 'gpt-4o-mini',
  base_url text,
  label text,
  api_key_encrypted text NOT NULL,
  is_default boolean NOT NULL default false,
  last_tested_at timestamptz,
  last_test_ok boolean,
  created_at timestamptz NOT NULL default now(),
  updated_at timestamptz NOT NULL default now()
);

comment on table public.faculty_ai_connections is
  'Per-faculty BYO AI provider connections. api_key_encrypted is AES-256-GCM ciphertext '
  '(v1:iv:tag ct format) resolved only inside Edge Functions — never exposed to the client.';

create unique index if not exists faculty_ai_connections_one_default_idx
  on public.faculty_ai_connections (faculty_id) where is_default;

create index if not exists faculty_ai_connections_faculty_idx
  on public.faculty_ai_connections (faculty_id, updated_at desc);

drop trigger if exists faculty_ai_connections_set_updated_at on public.faculty_ai_connections;
create trigger faculty_ai_connections_set_updated_at
  before update on public.faculty_ai_connections
  for each row execute function update_updated_at_column();

-- ------------------------------------------------------------
-- RLS: a user may only touch their OWN connections. Plaintext
-- keys cannot leak through SELECT anyway (columns are ciphertext),
-- INSERT/UPDATE go through the encrypted path too (ciphertext written
-- by the client's own session is still only decryptable with the
-- server-side secret). Enforce ownership regardless.
-- ------------------------------------------------------------
alter table public.faculty_ai_connections enable row level security;

drop policy if exists faculty_ai_connections_select_own on public.faculty_ai_connections;
create policy faculty_ai_connections_select_own on public.faculty_ai_connections
  for select using (faculty_id = (select auth.uid()));

drop policy if exists faculty_ai_connections_insert_own on public.faculty_ai_connections;
create policy faculty_ai_connections_insert_own on public.faculty_ai_connections
  for insert with check (faculty_id = (select auth.uid()));

drop policy if exists faculty_ai_connections_update_own on public.faculty_ai_connections;
create policy faculty_ai_connections_update_own on public.faculty_ai_connections
  for update using (faculty_id = (select auth.uid()))
  with check (faculty_id = (select auth.uid()));

drop policy if exists faculty_ai_connections_delete_own on public.faculty_ai_connections;
create policy faculty_ai_connections_delete_own on public.faculty_ai_connections
  for delete using (faculty_id = (select auth.uid()));

-- Keep exactly one default per faculty even across concurrent upserts when a
-- new default arrives: demote the previous one.
create or replace function public.faculty_ai_connections_demote_default()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if NEW.is_default then
    update public.faculty_ai_connections
       set is_default = false
     where faculty_id = NEW.faculty_id
       and is_default
       and id <> NEW.id;
  end if;
  return null;
end;
$$;

drop trigger if exists faculty_ai_connections_default_demote on public.faculty_ai_connections;
create trigger faculty_ai_connections_default_demote
  after insert or update of is_default on public.faculty_ai_connections
  for each row
  when (NEW.is_default)
  execute function public.faculty_ai_connections_demote_default();

-- ============================================================
-- ai_generation_logs (observability for BYO AI usage; no keys/prompts here)
-- ============================================================
create table if not exists public.ai_generation_logs (
  id uuid primary key default gen_random_uuid(),
  faculty_id uuid NOT NULL references public.profiles(id) on delete cascade,
  kind text NOT NULL check (kind in ('questions','mini_project','assignment','slides','test')),
  connection_id uuid references public.faculty_ai_connections(id) on delete set null,
  provider text,
  model text,
  status text NOT NULL check (status in ('success','error')),
  error_message text,
  topic text,
  course_id uuid,
  lesson_id uuid,
  tool_rounds integer,
  duration_ms integer,
  output_chars integer,
  created_at timestamptz NOT NULL default now()
);

create index if not exists ai_generation_logs_faculty_idx
  on public.ai_generation_logs (faculty_id, created_at desc);

alter table public.ai_generation_logs enable row level security;

-- Faculty can read their own usage; only the platform service role writes logs
-- (edge functions use elevated writes through service-role... we instead write
-- with the caller's JWT and allow "own insert", keeping the pipeline simple and
-- auditable; log rows contain no secrets).
drop policy if exists ai_generation_logs_select_own on public.ai_generation_logs;
create policy ai_generation_logs_select_own on public.ai_generation_logs
  for select using (faculty_id = (select auth.uid()));

drop policy if exists ai_generation_logs_insert_own on public.ai_generation_logs;
create policy ai_generation_logs_insert_own on public.ai_generation_logs
  for insert with check (faculty_id = (select auth.uid()));
