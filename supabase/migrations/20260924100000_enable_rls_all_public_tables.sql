-- ============================================================================
-- SECURITY FIX: enable Row Level Security on every public table that had it
-- disabled. With RLS off, Postgres ignores all policies, so any anonymous
-- visitor could read student quiz scores, edit quiz attempts, read payroll
-- history, flip platform settings, and read the email outbox.
--
-- Tables with existing policies: RLS activation makes those policies
-- authoritative (no policy text is changed here).
--
-- Tables with NO policies (kaveri_app_settings, notification_events,
-- notification_outbox) are internal system tables: they get deny-all default
-- access for anon/authenticated. Server-side code (service role / edge
-- functions) bypasses RLS and continues to work unchanged.
--
-- Verified before applying: every client query against the affected tables
-- runs behind authentication (courses/jobs/workshop pages all require login).
-- Public landing pages use dedicated public views/RPCs, not these tables.
-- ============================================================================

-- 1) Activate RLS where policies already exist -------------------------------
alter table public.platform_settings            enable row level security;
alter table public.quiz_attempts                enable row level security;
alter table public.quiz_answers                 enable row level security;
alter table public.enrollment_requests          enable row level security;
alter table public.offline_exams                enable row level security;
alter table public.offline_exam_results         enable row level security;
alter table public.offline_exam_students        enable row level security;
alter table public.achievements                 enable row level security;
alter table public.activity_logs                enable row level security;
alter table public.user_achievements            enable row level security;
alter table public.faculty_compensation_history enable row level security;
alter table public.faculty_employment           enable row level security;
alter table public.faculty_performance_reviews  enable row level security;
alter table public.lesson_bookmarks             enable row level security;
alter table public.lesson_notes                 enable row level security;
alter table public.saved_code_snippets          enable row level security;
alter table public.session_resources            enable row level security;
alter table public.student_support_records      enable row level security;
alter table public.workshops                    enable row level security;
alter table public.workshop_registrations       enable row level security;
alter table public.hiring_companies             enable row level security;
alter table public.job_postings                 enable row level security;
alter table public.job_applications             enable row level security;
alter table public.qp_platform_sync             enable row level security;

-- 2) Internal tables with no policies: RLS on + deny-all default policies ----
alter table public.kaveri_app_settings  enable row level security;
alter table public.notification_events  enable row level security;
alter table public.notification_outbox  enable row level security;

drop policy if exists internal_deny_all_read  on public.kaveri_app_settings;
drop policy if exists internal_deny_all_write on public.kaveri_app_settings;
create policy internal_deny_all_read  on public.kaveri_app_settings for select to anon, authenticated using (false);
create policy internal_deny_all_write on public.kaveri_app_settings for all    to anon, authenticated using (false) with check (false);

drop policy if exists internal_deny_all_read  on public.notification_events;
drop policy if exists internal_deny_all_write on public.notification_events;
create policy internal_deny_all_read  on public.notification_events for select to anon, authenticated using (false);
create policy internal_deny_all_write on public.notification_events for all    to anon, authenticated using (false) with check (false);

drop policy if exists internal_deny_all_read  on public.notification_outbox;
drop policy if exists internal_deny_all_write on public.notification_outbox;
create policy internal_deny_all_read  on public.notification_outbox for select to anon, authenticated using (false);
create policy internal_deny_all_write on public.notification_outbox for all    to anon, authenticated using (false) with check (false);
