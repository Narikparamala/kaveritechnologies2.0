create table if not exists public.qp_question_embeddings (
  id uuid primary key default gen_random_uuid(),
  question_bank_id uuid not null references public.qp_question_bank(id) on delete cascade,
  embedding_model text not null,
  embedding_version integer not null default 1,
  embedding_dimensions integer not null,
  embedding extensions.vector(768),
  content_hash text not null,
  generated_at timestamptz not null default now(),
  unique (question_bank_id, embedding_model, embedding_version)
);
create index if not exists idx_qp_question_embeddings_bank on public.qp_question_embeddings(question_bank_id);

create table if not exists public.qp_papers (
  id uuid primary key default gen_random_uuid(),
  title text not null default 'Untitled Paper',
  exam_name text,
  course_id uuid references public.courses(id) on delete set null,
  custom_course_name text,
  subject text,
  topic text,
  batch_label text,
  exam_date date,
  duration_minutes integer,
  max_marks numeric(6,2),
  question_count integer not null default 5,
  marks_per_question numeric(6,2) not null default 5,
  set_labels text[] not null default array['A'],
  display_options jsonb not null default '{"show_faculty": true,"show_batch": true,"show_registration": true,"show_signature": true}'::jsonb,
  template_id uuid references public.qp_templates(id) on delete set null,
  status text not null default 'draft' check (status in ('draft','finalized','archived')),
  current_version integer not null default 0,
  created_by uuid not null references public.profiles(id) on delete restrict,
  updated_by uuid references public.profiles(id) on delete set null,
  finalized_by uuid references public.profiles(id) on delete restrict,
  finalized_at timestamptz,
  archived_by uuid references public.profiles(id) on delete restrict,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_qp_papers_created_by on public.qp_papers(created_by);
create index if not exists idx_qp_papers_status on public.qp_papers(status);
create index if not exists idx_qp_papers_course on public.qp_papers(course_id);
create index if not exists idx_qp_papers_exam_date on public.qp_papers(exam_date);
create trigger trg_qp_papers_updated_at before update on public.qp_papers
for each row execute function public.qp_set_updated_at();

create or replace function public.qp_papers_enforce_immutability()
returns trigger language plpgsql set search_path = '' as $$
begin
  if old.status <> 'draft' then
    if new.status = 'archived' and old.status = 'finalized' then
      if new.title is distinct from old.title
        or new.exam_name is distinct from old.exam_name
        or new.course_id is distinct from old.course_id
        or new.custom_course_name is distinct from old.custom_course_name
        or new.subject is distinct from old.subject
        or new.topic is distinct from old.topic
        or new.batch_label is distinct from old.batch_label
        or new.exam_date is distinct from old.exam_date
        or new.duration_minutes is distinct from old.duration_minutes
        or new.max_marks is distinct from old.max_marks
        or new.question_count is distinct from old.question_count
        or new.marks_per_question is distinct from old.marks_per_question
        or new.set_labels is distinct from old.set_labels
        or new.display_options is distinct from old.display_options
        or new.template_id is distinct from old.template_id
      then
        raise exception 'Finalized paper content is immutable. Use Create Revision instead.';
      end if;
      return new;
    elsif new.status = old.status then
      if row(new.title,new.exam_name,new.course_id,new.custom_course_name,new.subject,new.topic,new.batch_label,new.exam_date,new.duration_minutes,new.max_marks,new.question_count,new.marks_per_question,new.set_labels,new.display_options,new.template_id)
         is distinct from
         row(old.title,old.exam_name,old.course_id,old.custom_course_name,old.subject,old.topic,old.batch_label,old.exam_date,old.duration_minutes,old.max_marks,old.question_count,old.marks_per_question,old.set_labels,old.display_options,old.template_id)
      then
        raise exception 'Finalized/archived paper content is immutable. Use Create Revision instead.';
      end if;
      return new;
    else
      raise exception 'Invalid paper status transition from % to %', old.status, new.status;
    end if;
  end if;
  return new;
end;
$$;
create trigger trg_qp_papers_immutability before update on public.qp_papers
for each row execute function public.qp_papers_enforce_immutability();

create or replace function public.qp_papers_prevent_finalized_delete()
returns trigger language plpgsql set search_path = '' as $$
begin
  if old.status <> 'draft' then
    raise exception 'Finalized/archived papers cannot be deleted — history must remain reproducible (paper id=%, status=%). Use archive instead of delete.', old.id, old.status;
  end if;
  return old;
end;
$$;
create trigger trg_qp_papers_prevent_finalized_delete before delete on public.qp_papers
for each row execute function public.qp_papers_prevent_finalized_delete();;
