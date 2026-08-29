create or replace function public.qp_question_bank_guard_approval()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if not public.qp_is_super_admin() and new.approval_status <> 'draft' then
      raise exception 'Faculty may create Question Bank questions only as draft.';
    end if;
    if new.approval_status = 'approved' then
      if not public.qp_is_super_admin() then
        raise exception 'Only Super Admin can approve a Question Bank question.';
      end if;
      new.approved_by := auth.uid();
      new.approved_at := coalesce(new.approved_at, now());
    elsif not public.qp_is_super_admin() and (new.approved_by is not null or new.approved_at is not null) then
      raise exception 'Approval metadata is Super Admin controlled.';
    end if;
    return new;
  end if;

  if not public.qp_is_super_admin()
     and (new.approved_by is distinct from old.approved_by or new.approved_at is distinct from old.approved_at) then
    raise exception 'Approval metadata is Super Admin controlled.';
  end if;

  if new.approval_status is distinct from old.approval_status and new.approval_status = 'approved' then
    if not public.qp_is_super_admin() then
      raise exception 'Only Super Admin can approve a Question Bank question.';
    end if;
    new.approved_by := auth.uid();
    new.approved_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_qp_question_bank_guard_approval on public.qp_question_bank;
create trigger trg_qp_question_bank_guard_approval before insert or update on public.qp_question_bank
for each row execute function public.qp_question_bank_guard_approval();

create or replace function public.qp_papers_enforce_immutability()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_finalizing text;
begin
  if new.created_by is distinct from old.created_by then
    raise exception 'Paper creator cannot be changed.';
  end if;

  if old.status = 'draft' then
    if new.status = 'draft' then
      if new.current_version is distinct from old.current_version
         or new.finalized_by is distinct from old.finalized_by
         or new.finalized_at is distinct from old.finalized_at
         or new.archived_by is distinct from old.archived_by
         or new.archived_at is distinct from old.archived_at then
        raise exception 'Draft paper lifecycle/provenance fields cannot be edited directly.';
      end if;
      if auth.uid() is not null then new.updated_by := auth.uid(); end if;
      return new;
    end if;

    if new.status = 'finalized' then
      v_finalizing := current_setting('kaveri.qp_finalizing', true);
      if coalesce(v_finalizing, '') <> '1' then raise exception 'Use qp_finalize_paper() to finalize a paper.'; end if;
      if new.current_version <> old.current_version + 1
         or new.finalized_by is distinct from auth.uid()
         or new.finalized_at is null then
        raise exception 'Invalid finalize provenance/version metadata.';
      end if;
      if (to_jsonb(new) - array['status','current_version','finalized_by','finalized_at','updated_by','updated_at']::text[])
         is distinct from
         (to_jsonb(old) - array['status','current_version','finalized_by','finalized_at','updated_by','updated_at']::text[]) then
        raise exception 'Paper content cannot change during finalization.';
      end if;
      return new;
    end if;
    raise exception 'Invalid paper status transition from draft to %', new.status;
  end if;

  if old.status = 'finalized' then
    if new.status = 'archived' then
      new.archived_by := auth.uid();
      new.archived_at := now();
      new.updated_by := auth.uid();
      if (to_jsonb(new) - array['status','archived_by','archived_at','updated_by','updated_at']::text[])
         is distinct from
         (to_jsonb(old) - array['status','archived_by','archived_at','updated_by','updated_at']::text[]) then
        raise exception 'Finalized paper content/provenance is immutable. Use Create Revision instead.';
      end if;
      return new;
    end if;
    if new.status = 'finalized' then
      if (to_jsonb(new) - 'updated_at') is distinct from (to_jsonb(old) - 'updated_at') then
        raise exception 'Finalized paper is immutable. Use Create Revision instead.';
      end if;
      return new;
    end if;
    raise exception 'Invalid paper status transition from finalized to %', new.status;
  end if;

  if old.status = 'archived' then
    if new.status <> 'archived' then raise exception 'Archived papers cannot change status. Create a revision instead.'; end if;
    if (to_jsonb(new) - 'updated_at') is distinct from (to_jsonb(old) - 'updated_at') then
      raise exception 'Archived paper is immutable. Create a revision instead.';
    end if;
    return new;
  end if;

  raise exception 'Unknown paper status %', old.status;
end;
$$;

create or replace function public.qp_sets_enforce_immutability()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status public.qp_papers.status%type;
begin
  if tg_op <> 'INSERT' then
    select p.status into v_status from public.qp_papers p where p.id = old.paper_id for key share;
    if v_status is null or v_status <> 'draft' then
      raise exception 'Cannot modify sets of a finalized/archived or missing paper (paper id=%).', old.paper_id;
    end if;
  end if;
  if tg_op <> 'DELETE' and (tg_op = 'INSERT' or new.paper_id is distinct from old.paper_id) then
    select p.status into v_status from public.qp_papers p where p.id = new.paper_id for key share;
    if v_status is null or v_status <> 'draft' then
      raise exception 'Cannot attach a set to a finalized/archived or missing paper (paper id=%).', new.paper_id;
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create or replace function public.qp_paper_questions_enforce_immutability()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status public.qp_papers.status%type;
begin
  if tg_op <> 'INSERT' then
    select p.status into v_status
      from public.qp_sets s join public.qp_papers p on p.id=s.paper_id
      where s.id=old.set_id for key share of p;
    if v_status is null or v_status <> 'draft' then
      raise exception 'Cannot modify questions of a finalized/archived or missing paper (set id=%).', old.set_id;
    end if;
  end if;
  if tg_op <> 'DELETE' and (tg_op = 'INSERT' or new.set_id is distinct from old.set_id) then
    select p.status into v_status
      from public.qp_sets s join public.qp_papers p on p.id=s.paper_id
      where s.id=new.set_id for key share of p;
    if v_status is null or v_status <> 'draft' then
      raise exception 'Cannot attach a question to a finalized/archived or missing paper (set id=%).', new.set_id;
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create or replace function public.qp_question_assets_enforce_immutability()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status public.qp_papers.status%type;
begin
  if tg_op <> 'INSERT' and old.paper_question_id is not null then
    select p.status into v_status
      from public.qp_paper_questions pq
      join public.qp_sets s on s.id=pq.set_id
      join public.qp_papers p on p.id=s.paper_id
      where pq.id=old.paper_question_id for key share of p;
    if v_status is null or v_status <> 'draft' then
      raise exception 'Cannot modify an asset belonging to a finalized/archived or missing paper (paper_question_id=%).', old.paper_question_id;
    end if;
  end if;
  if tg_op <> 'DELETE' and new.paper_question_id is not null
     and (tg_op = 'INSERT' or new.paper_question_id is distinct from old.paper_question_id) then
    select p.status into v_status
      from public.qp_paper_questions pq
      join public.qp_sets s on s.id=pq.set_id
      join public.qp_papers p on p.id=s.paper_id
      where pq.id=new.paper_question_id for key share of p;
    if v_status is null or v_status <> 'draft' then
      raise exception 'Cannot attach an asset to a finalized/archived or missing paper (paper_question_id=%).', new.paper_question_id;
    end if;
  end if;
  if tg_op = 'UPDATE' and new.created_by is distinct from old.created_by then
    raise exception 'Asset creator cannot be changed.';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;;
