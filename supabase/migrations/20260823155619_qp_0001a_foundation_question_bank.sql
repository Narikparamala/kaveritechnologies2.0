create extension if not exists pgcrypto with schema extensions;
create extension if not exists vector with schema extensions;
grant usage on schema extensions to authenticated;

create or replace function public.qp_is_super_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role = 'super_admin'
      and p.is_active = true
  );
$$;

create or replace function public.qp_is_active_faculty_or_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role in ('faculty','super_admin')
      and p.is_active = true
  );
$$;

create or replace function public.qp_set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.qp_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);
create trigger trg_qp_settings_updated_at before update on public.qp_settings
for each row execute function public.qp_set_updated_at();

create table if not exists public.qp_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  is_default boolean not null default false,
  layout_config jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_qp_templates_updated_at before update on public.qp_templates
for each row execute function public.qp_set_updated_at();

create table if not exists public.qp_question_bank (
  id uuid primary key default gen_random_uuid(),
  question_type text not null check (question_type in ('mcq','true_false','fill_blank','short_answer','long_answer','programming','predict_output','find_error','debug_code','explain_code','scenario','custom')),
  course_id uuid references public.courses(id) on delete set null,
  custom_course_name text,
  topic text,
  difficulty text not null default 'medium' check (difficulty in ('easy','medium','hard')),
  marks numeric(6,2) not null default 5,
  content jsonb not null default '{"nodes":[]}'::jsonb,
  content_plain_text text not null default '',
  mcq_options jsonb,
  correct_answer jsonb,
  answer_explanation text,
  eval_notes text,
  tags text[] not null default '{}'::text[],
  is_ai_generated boolean not null default false,
  approval_status text not null default 'draft' check (approval_status in ('draft','approved','retired')),
  approved_by uuid references public.profiles(id) on delete set null,
  approved_at timestamptz,
  times_used integer not null default 0,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  search_vector tsvector
);
create index if not exists idx_qp_question_bank_course on public.qp_question_bank(course_id);
create index if not exists idx_qp_question_bank_topic on public.qp_question_bank(topic);
create index if not exists idx_qp_question_bank_difficulty on public.qp_question_bank(difficulty);
create index if not exists idx_qp_question_bank_status on public.qp_question_bank(approval_status);
create index if not exists idx_qp_question_bank_created_by on public.qp_question_bank(created_by);
create index if not exists idx_qp_question_bank_tags on public.qp_question_bank using gin(tags);
create index if not exists idx_qp_question_bank_search on public.qp_question_bank using gin(search_vector);
create trigger trg_qp_question_bank_updated_at before update on public.qp_question_bank
for each row execute function public.qp_set_updated_at();

create or replace function public.qp_question_bank_update_search_vector()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.search_vector :=
    setweight(to_tsvector('simple', coalesce(new.topic, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(new.content_plain_text, '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(array_to_string(new.tags, ' '), '')), 'C');
  return new;
end;
$$;
create trigger trg_qp_question_bank_search_vector before insert or update on public.qp_question_bank
for each row execute function public.qp_question_bank_update_search_vector();

create or replace function public.qp_question_bank_guard_approval()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.approval_status is distinct from old.approval_status
     and new.approval_status = 'approved'
     and not public.qp_is_super_admin() then
    raise exception 'Only Super Admin can approve a Question Bank question.';
  end if;
  return new;
end;
$$;
create trigger trg_qp_question_bank_guard_approval before update on public.qp_question_bank
for each row execute function public.qp_question_bank_guard_approval();;
