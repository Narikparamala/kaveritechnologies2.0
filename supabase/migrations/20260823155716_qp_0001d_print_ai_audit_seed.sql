create table if not exists public.qp_print_history (
  id uuid primary key default gen_random_uuid(),
  paper_id uuid not null references public.qp_papers(id) on delete cascade,
  set_id uuid references public.qp_sets(id) on delete set null,
  doc_type text not null check (doc_type in ('student','answer_key')),
  action text not null check (action in ('print','download')),
  performed_by uuid not null references public.profiles(id) on delete restrict,
  performed_at timestamptz not null default now()
);
create index if not exists idx_qp_print_history_paper on public.qp_print_history(paper_id);
create index if not exists idx_qp_print_history_by on public.qp_print_history(performed_by);

create table if not exists public.qp_ai_settings (
  id smallint primary key default 1 check (id = 1),
  gateway_base_url text,
  enabled boolean not null default false,
  text_model text,
  embedding_model text,
  embedding_dimensions integer default 768,
  temperature numeric(3,2) default 0.7,
  context_limit integer default 4096,
  connection_last_tested_at timestamptz,
  connection_last_status text,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);
create trigger trg_qp_ai_settings_updated_at before update on public.qp_ai_settings
for each row execute function public.qp_set_updated_at();

create table if not exists public.qp_ai_generations (
  id uuid primary key default gen_random_uuid(),
  generation_type text not null check (generation_type in ('question','paper','set','answer_suggestion','improvement','review')),
  requested_by uuid not null references public.profiles(id) on delete restrict,
  related_paper_id uuid references public.qp_papers(id) on delete set null,
  related_question_bank_id uuid references public.qp_question_bank(id) on delete set null,
  input_params jsonb not null default '{}'::jsonb,
  output jsonb,
  model_used text,
  prompt_version text,
  status text not null default 'generated' check (status in ('generated','accepted_unchanged','accepted_edited','rejected','added_to_bank','used_in_final_paper','reused')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_qp_ai_generations_requested_by on public.qp_ai_generations(requested_by);
create index if not exists idx_qp_ai_generations_paper on public.qp_ai_generations(related_paper_id);
create index if not exists idx_qp_ai_generations_status on public.qp_ai_generations(status);
create trigger trg_qp_ai_generations_updated_at before update on public.qp_ai_generations
for each row execute function public.qp_set_updated_at();

create table if not exists public.qp_ai_feedback (
  id uuid primary key default gen_random_uuid(),
  generation_id uuid not null references public.qp_ai_generations(id) on delete cascade,
  faculty_rating integer check (faculty_rating between 1 and 5),
  feedback_text text,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);
create index if not exists idx_qp_ai_feedback_generation on public.qp_ai_feedback(generation_id);

create table if not exists public.qp_ai_evaluations (
  id uuid primary key default gen_random_uuid(),
  eval_case_name text not null,
  input_prompt text not null,
  expected_criteria text,
  model_used text,
  prompt_version text,
  actual_output text,
  human_rating integer check (human_rating between 1 and 5),
  rated_by uuid references public.profiles(id) on delete set null,
  run_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.qp_audit_log (
  id uuid primary key default gen_random_uuid(),
  table_name text not null,
  record_id uuid,
  action text not null,
  performed_by uuid not null references public.profiles(id) on delete restrict,
  performed_at timestamptz not null default now(),
  details jsonb
);
create index if not exists idx_qp_audit_log_table_record on public.qp_audit_log(table_name, record_id);

insert into public.qp_settings (key, value) values
  ('company', jsonb_build_object('name','Kaveri Technologies','use_text_wordmark',true,'logo_url',null,'footer_text','Kaveri Technologies — Question Paper Management System','contact_email',null,'contact_phone',null)),
  ('paper_defaults', jsonb_build_object('question_count',5,'marks_per_question',5,'duration_minutes',60,'max_marks',25,'margins_mm',jsonb_build_object('top',20,'bottom',20,'left',18,'right',18),'show_faculty',true,'show_batch',true,'show_registration',true,'show_signature',true)),
  ('template_defaults', jsonb_build_object('font_family','Times New Roman, serif','base_font_size_pt',12,'heading_font_size_pt',14))
on conflict (key) do nothing;

insert into public.qp_ai_settings (id, gateway_base_url, enabled, text_model, embedding_model, embedding_dimensions)
values (1, null, false, null, 'nomic-embed-text', 768)
on conflict (id) do nothing;;
