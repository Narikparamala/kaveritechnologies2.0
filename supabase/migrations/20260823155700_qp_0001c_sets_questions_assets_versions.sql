create table if not exists public.qp_sets (
  id uuid primary key default gen_random_uuid(),
  paper_id uuid not null references public.qp_papers(id) on delete cascade,
  label text not null,
  generation_method text not null default 'manual' check (generation_method in ('manual','duplicate','shuffle','shuffle_options','equivalent_replace','mixed')),
  source_set_id uuid references public.qp_sets(id) on delete set null,
  is_locked boolean not null default false,
  is_approved boolean not null default false,
  approved_by uuid references public.profiles(id) on delete set null,
  approved_at timestamptz,
  notes text,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (paper_id, label)
);
create index if not exists idx_qp_sets_paper on public.qp_sets(paper_id);
create trigger trg_qp_sets_updated_at before update on public.qp_sets
for each row execute function public.qp_set_updated_at();

create or replace function public.qp_sets_enforce_immutability()
returns trigger language plpgsql set search_path = '' as $$
declare
  v_paper_id public.qp_papers.id%type;
  v_status public.qp_papers.status%type;
begin
  v_paper_id := coalesce(new.paper_id, old.paper_id);
  select p.status into v_status from public.qp_papers p where p.id = v_paper_id;
  if v_status is not null and v_status <> 'draft' then
    raise exception 'Cannot modify sets of a finalized/archived paper (paper id=%, status=%). Use Create Revision instead.', v_paper_id, v_status;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
create trigger trg_qp_sets_immutability before insert or update or delete on public.qp_sets
for each row execute function public.qp_sets_enforce_immutability();

create table if not exists public.qp_paper_questions (
  id uuid primary key default gen_random_uuid(),
  set_id uuid not null references public.qp_sets(id) on delete cascade,
  question_bank_id uuid references public.qp_question_bank(id) on delete set null,
  order_index integer not null default 0,
  question_type text not null check (question_type in ('mcq','true_false','fill_blank','short_answer','long_answer','programming','predict_output','find_error','debug_code','explain_code','scenario','custom')),
  content jsonb not null default '{"nodes":[]}'::jsonb,
  mcq_options jsonb,
  correct_answer jsonb,
  answer_explanation text,
  eval_notes text,
  marks numeric(6,2) not null default 5,
  is_locked boolean not null default false,
  page_break_before boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_qp_paper_questions_set on public.qp_paper_questions(set_id);
create index if not exists idx_qp_paper_questions_bank on public.qp_paper_questions(question_bank_id);
create trigger trg_qp_paper_questions_updated_at before update on public.qp_paper_questions
for each row execute function public.qp_set_updated_at();

create or replace function public.qp_paper_questions_enforce_immutability()
returns trigger language plpgsql set search_path = '' as $$
declare
  v_set_id public.qp_sets.id%type;
  v_status public.qp_papers.status%type;
begin
  v_set_id := coalesce(new.set_id, old.set_id);
  select p.status into v_status
    from public.qp_sets s
    join public.qp_papers p on p.id = s.paper_id
    where s.id = v_set_id;
  if v_status is not null and v_status <> 'draft' then
    raise exception 'Cannot modify questions of a finalized/archived paper (set id=%, paper status=%). Use Create Revision instead.', v_set_id, v_status;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
create trigger trg_qp_paper_questions_immutability before insert or update or delete on public.qp_paper_questions
for each row execute function public.qp_paper_questions_enforce_immutability();

create table if not exists public.qp_question_assets (
  id uuid primary key default gen_random_uuid(),
  question_bank_id uuid references public.qp_question_bank(id) on delete cascade,
  paper_question_id uuid references public.qp_paper_questions(id) on delete cascade,
  storage_path text not null,
  file_name text,
  content_type text,
  size_bytes integer,
  width integer,
  height integer,
  caption text,
  align text default 'center' check (align in ('left','center','right')),
  order_index integer not null default 0,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint qp_question_assets_single_owner check ((question_bank_id is not null and paper_question_id is null) or (question_bank_id is null and paper_question_id is not null))
);
create index if not exists idx_qp_question_assets_bank on public.qp_question_assets(question_bank_id);
create index if not exists idx_qp_question_assets_pq on public.qp_question_assets(paper_question_id);

create or replace function public.qp_question_assets_enforce_immutability()
returns trigger language plpgsql set search_path = '' as $$
declare
  v_paper_question_id public.qp_paper_questions.id%type;
  v_status public.qp_papers.status%type;
begin
  v_paper_question_id := coalesce(new.paper_question_id, old.paper_question_id);
  if v_paper_question_id is null then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  select p.status into v_status
    from public.qp_paper_questions pq
    join public.qp_sets s on s.id = pq.set_id
    join public.qp_papers p on p.id = s.paper_id
    where pq.id = v_paper_question_id;
  if v_status is not null and v_status <> 'draft' then
    raise exception 'Cannot modify assets attached to a finalized/archived paper question (paper_question_id=%, paper status=%). Use Create Revision instead.', v_paper_question_id, v_status;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
create trigger trg_qp_question_assets_immutability before insert or update or delete on public.qp_question_assets
for each row execute function public.qp_question_assets_enforce_immutability();

create table if not exists public.qp_paper_versions (
  id uuid primary key default gen_random_uuid(),
  paper_id uuid not null references public.qp_papers(id) on delete cascade,
  version_number integer not null,
  snapshot jsonb not null,
  finalized_by uuid not null references public.profiles(id) on delete restrict,
  finalized_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (paper_id, version_number)
);
create index if not exists idx_qp_paper_versions_paper on public.qp_paper_versions(paper_id);;
