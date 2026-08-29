create or replace function public.qp_finalize_paper(p_paper_id uuid)
returns table(version_id uuid, version_number integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_paper public.qp_papers%rowtype;
  v_snapshot jsonb;
  v_version_id uuid;
  v_version_number integer;
  v_finalized_at timestamptz := now();
  v_course_context jsonb := 'null'::jsonb;
  v_faculty_context jsonb := 'null'::jsonb;
  v_company_context jsonb := '{}'::jsonb;
  v_template_context jsonb := '{}'::jsonb;
begin
  if v_uid is null or not public.qp_is_active_faculty_or_admin() then
    raise exception 'Active faculty or Super Admin access required.';
  end if;

  select p.* into v_paper from public.qp_papers p where p.id=p_paper_id for update;
  if not found then raise exception 'Paper not found.'; end if;
  if not public.qp_is_super_admin() and v_paper.created_by <> v_uid then raise exception 'You do not have access to finalize this paper.'; end if;
  if v_paper.status <> 'draft' then raise exception 'Only draft papers can be finalized.'; end if;
  if not exists (select 1 from public.qp_sets s where s.paper_id=p_paper_id) then raise exception 'Paper has no sets.'; end if;
  if exists (
    select 1 from public.qp_sets s where s.paper_id=p_paper_id
      and not exists (select 1 from public.qp_paper_questions q where q.set_id=s.id)
  ) then raise exception 'Every set must contain at least one question.'; end if;
  if exists (
    select 1 from public.qp_paper_questions q join public.qp_sets s on s.id=q.set_id
    where s.paper_id=p_paper_id and btrim(coalesce(q.content_plain_text,''))=''
  ) then raise exception 'Paper contains an empty question.'; end if;
  if exists (
    select 1 from public.qp_paper_questions q join public.qp_sets s on s.id=q.set_id
    where s.paper_id=p_paper_id and q.question_type='mcq'
      and jsonb_array_length(coalesce(q.mcq_options,'[]'::jsonb)) < 2
  ) then raise exception 'Every MCQ must contain at least two options.'; end if;
  if exists (
    select 1 from public.qp_paper_questions q join public.qp_sets s on s.id=q.set_id
    where s.paper_id=p_paper_id and q.question_type='mcq'
      and not exists (
        select 1 from jsonb_array_elements(coalesce(q.mcq_options,'[]'::jsonb)) opt
        where opt->>'is_correct'='true'
      )
  ) then raise exception 'Every MCQ must have at least one correct option.'; end if;

  if v_paper.course_id is not null then
    select jsonb_build_object('id',c.id,'title',c.title) into v_course_context
    from public.courses c where c.id=v_paper.course_id;
    v_course_context := coalesce(v_course_context,'null'::jsonb);
  end if;

  select jsonb_build_object('id',p.id,'full_name',p.full_name,'email',p.email)
    into v_faculty_context from public.profiles p where p.id=v_paper.created_by;
  v_faculty_context := coalesce(v_faculty_context,'null'::jsonb);

  select coalesce(s.value,'{}'::jsonb) into v_company_context
    from public.qp_settings s where s.key='company';
  v_company_context := coalesce(v_company_context,'{}'::jsonb);

  select coalesce(s.value,'{}'::jsonb) into v_template_context
    from public.qp_settings s where s.key='template_defaults';
  v_template_context := coalesce(v_template_context,'{}'::jsonb);

  v_version_number := coalesce(v_paper.current_version,0)+1;

  select jsonb_build_object(
    'paper', to_jsonb(v_paper) || jsonb_build_object('status','finalized','current_version',v_version_number,'finalized_by',v_uid,'finalized_at',v_finalized_at),
    'display_context', jsonb_build_object('course',v_course_context,'faculty',v_faculty_context,'company',v_company_context,'template',v_template_context),
    'sets', coalesce((
      select jsonb_agg(
        to_jsonb(s) || jsonb_build_object(
          'questions', coalesce((
            select jsonb_agg(
              to_jsonb(q) || jsonb_build_object(
                'assets', coalesce((
                  select jsonb_agg(to_jsonb(a) order by a.order_index,a.created_at,a.id)
                  from public.qp_question_assets a where a.paper_question_id=q.id
                ),'[]'::jsonb)
              ) order by q.order_index,q.created_at,q.id
            ) from public.qp_paper_questions q where q.set_id=s.id
          ),'[]'::jsonb)
        ) order by s.order_index,s.created_at,s.id
      ) from public.qp_sets s where s.paper_id=p_paper_id
    ),'[]'::jsonb),
    'snapshot_at',v_finalized_at
  ) into v_snapshot;

  insert into public.qp_paper_versions (paper_id,version_number,snapshot,finalized_by,finalized_at)
  values (p_paper_id,v_version_number,v_snapshot,v_uid,v_finalized_at)
  returning id into v_version_id;

  perform set_config('kaveri.qp_finalizing','1',true);

  update public.qp_papers set
    status='finalized',
    current_version=v_version_number,
    finalized_by=v_uid,
    finalized_at=v_finalized_at,
    updated_by=v_uid
  where id=p_paper_id;

  return query select v_version_id,v_version_number;
end;
$$;

revoke all on function public.qp_finalize_paper(uuid) from public;
grant execute on function public.qp_finalize_paper(uuid) to authenticated;;
