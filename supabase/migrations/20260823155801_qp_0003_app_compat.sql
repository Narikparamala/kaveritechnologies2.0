alter table public.qp_sets add column if not exists order_index integer not null default 0;

alter table public.qp_paper_questions
  add column if not exists content_plain_text text not null default '',
  add column if not exists difficulty text not null default 'medium',
  add column if not exists topic_label text,
  add column if not exists answer_status text not null default 'none';

alter table public.qp_question_bank
  add column if not exists title text,
  add column if not exists answer_status text not null default 'none',
  add column if not exists last_used_at timestamptz;

alter table public.qp_question_bank drop constraint if exists qp_question_bank_difficulty_check;
alter table public.qp_question_bank add constraint qp_question_bank_difficulty_check check (difficulty in ('beginner','easy','medium','hard','advanced'));

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'qp_paper_questions_difficulty_check' and conrelid = 'public.qp_paper_questions'::regclass) then
    alter table public.qp_paper_questions add constraint qp_paper_questions_difficulty_check check (difficulty in ('beginner','easy','medium','hard','advanced'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'qp_paper_questions_answer_status_check' and conrelid = 'public.qp_paper_questions'::regclass) then
    alter table public.qp_paper_questions add constraint qp_paper_questions_answer_status_check check (answer_status in ('none','ai_suggested','faculty_verified'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'qp_question_bank_answer_status_check' and conrelid = 'public.qp_question_bank'::regclass) then
    alter table public.qp_question_bank add constraint qp_question_bank_answer_status_check check (answer_status in ('none','ai_suggested','faculty_verified'));
  end if;
end
$$;

alter table public.qp_question_assets add column if not exists display_width_pct integer not null default 100;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'qp_question_assets_display_width_pct_check' and conrelid = 'public.qp_question_assets'::regclass) then
    alter table public.qp_question_assets add constraint qp_question_assets_display_width_pct_check check (display_width_pct between 10 and 100);
  end if;
end
$$;

create index if not exists idx_qp_sets_order on public.qp_sets(paper_id, order_index);
create index if not exists idx_qp_paper_questions_order on public.qp_paper_questions(set_id, order_index);;
