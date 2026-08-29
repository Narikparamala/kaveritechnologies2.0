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
    select p.status into v_status from public.qp_papers p where p.id=old.paper_id for key share;
    if v_status is null then
      if tg_op='DELETE' then return old; end if;
      raise exception 'Cannot modify a set whose parent paper is missing (paper id=%).', old.paper_id;
    end if;
    if v_status <> 'draft' then
      raise exception 'Cannot modify sets of a finalized/archived paper (paper id=%, status=%).', old.paper_id, v_status;
    end if;
  end if;
  if tg_op <> 'DELETE' and (tg_op='INSERT' or new.paper_id is distinct from old.paper_id) then
    select p.status into v_status from public.qp_papers p where p.id=new.paper_id for key share;
    if v_status is null or v_status <> 'draft' then
      raise exception 'Cannot attach a set to a finalized/archived or missing paper (paper id=%).', new.paper_id;
    end if;
  end if;
  if tg_op='DELETE' then return old; end if;
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
    select p.status into v_status from public.qp_sets s join public.qp_papers p on p.id=s.paper_id where s.id=old.set_id for key share of p;
    if v_status is null then
      if tg_op='DELETE' then return old; end if;
      raise exception 'Cannot modify a question whose parent set/paper is missing (set id=%).', old.set_id;
    end if;
    if v_status <> 'draft' then
      raise exception 'Cannot modify questions of a finalized/archived paper (set id=%, status=%).', old.set_id, v_status;
    end if;
  end if;
  if tg_op <> 'DELETE' and (tg_op='INSERT' or new.set_id is distinct from old.set_id) then
    select p.status into v_status from public.qp_sets s join public.qp_papers p on p.id=s.paper_id where s.id=new.set_id for key share of p;
    if v_status is null or v_status <> 'draft' then
      raise exception 'Cannot attach a question to a finalized/archived or missing paper (set id=%).', new.set_id;
    end if;
  end if;
  if tg_op='DELETE' then return old; end if;
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
      where pq.id=old.paper_question_id
      for key share of p;
    if v_status is null then
      if tg_op='DELETE' then return old; end if;
      raise exception 'Cannot modify an asset whose parent question/paper is missing (paper_question_id=%).', old.paper_question_id;
    end if;
    if v_status <> 'draft' then
      raise exception 'Cannot modify an asset belonging to a finalized/archived paper (paper_question_id=%, status=%).', old.paper_question_id, v_status;
    end if;
  end if;
  if tg_op <> 'DELETE' and new.paper_question_id is not null and (tg_op='INSERT' or new.paper_question_id is distinct from old.paper_question_id) then
    select p.status into v_status
      from public.qp_paper_questions pq
      join public.qp_sets s on s.id=pq.set_id
      join public.qp_papers p on p.id=s.paper_id
      where pq.id=new.paper_question_id
      for key share of p;
    if v_status is null or v_status <> 'draft' then
      raise exception 'Cannot attach an asset to a finalized/archived or missing paper (paper_question_id=%).', new.paper_question_id;
    end if;
  end if;
  if tg_op='UPDATE' and new.created_by is distinct from old.created_by then
    raise exception 'Asset creator cannot be changed.';
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;;
