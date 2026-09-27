-- Kaveri LMS — Offline Exams / Question Paper integration (forward, LOCAL only)
--
-- Central model for OFFLINE exams. Papers and their confidential content stay
-- inside the Question Paper System (qp_* tables). The LMS stores metadata +
-- linkage only, plus the offline result record that faculty evaluate privately
-- and publish later.
--
-- Contract highlights:
--   * offline_exams.external_source + external_paper_id identify a paper from
--     the Question Paper System ("kaveri_question_paper"). Stable IDs only.
--   * students never see draft/cancelled exams and never see any question
--     content (the LMS does not store paper content at all).
--   * offline_exam_results: unique per (exam, student). Marks are 'evaluated'
--     (private) until the exam is published ('published'), at which point the
--     student may read only their own row. Published rows are immutable.
--   * ingest_offline_exam is the satellite (service-role) entry point.
--   * save_offline_exam_results / publish_offline_exam_results are the
--     authorized faculty/admin result-entry paths (choice B of the design:
--     results are entered in the LMS; the Question Paper System generates and
--     prints papers only).

-- ---------------------------------------------------------------------------
-- offline_exams
-- ---------------------------------------------------------------------------
create table if not exists public.offline_exams (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  course_id uuid references public.courses(id) on delete set null,
  batch_label text,
  external_source text not null default 'kaveri_question_paper',
  external_paper_id text,
  external_set_id text,
  exam_date date,
  start_time time,
  duration_minutes integer,
  max_marks numeric(8,2),
  status text not null default 'scheduled'
    check (status in ('draft','scheduled','conducted','results_pending','results_published','cancelled')),
  student_instructions text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (external_source, external_paper_id)
);

create index if not exists idx_offline_exams_course on public.offline_exams(course_id);
create index if not exists idx_offline_exams_date on public.offline_exams(exam_date);
create index if not exists idx_offline_exams_status on public.offline_exams(status);

-- ---------------------------------------------------------------------------
-- offline_exam_results
-- ---------------------------------------------------------------------------
create table if not exists public.offline_exam_results (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references public.offline_exams(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  marks_obtained numeric(8,2),
  remarks text,
  status text not null default 'evaluated'
    check (status in ('evaluated','published')),
  evaluated_by uuid references public.profiles(id) on delete set null,
  evaluated_at timestamptz not null default now(),
  published_at timestamptz,
  published_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (exam_id, student_id)
);

create index if not exists idx_offline_exam_results_exam on public.offline_exam_results(exam_id);
create index if not exists idx_offline_exam_results_student on public.offline_exam_results(student_id);

-- ---------------------------------------------------------------------------
-- Authorization helpers
-- ---------------------------------------------------------------------------
create or replace function public.offline_exam_manageable(p_exam_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
      from public.offline_exams e
     where e.id = p_exam_id
       and (public.is_admin()
            or (e.course_id is not null and public.is_faculty_for_course(e.course_id)))
  );
$$;

create or replace function public.offline_exam_course_writable(p_course_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select public.is_admin()
         or (p_course_id is not null and public.is_faculty_for_course(p_course_id));
$$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.offline_exams enable row level security;
alter table public.offline_exam_results enable row level security;

-- Students may see only non-draft/non-cancelled exam METADATA (no content is
-- stored here at all). Their result rows are gated separately.
drop policy if exists offline_exams_student_read on public.offline_exams;
create policy offline_exams_student_read on public.offline_exams
  for select to authenticated
  using (status not in ('draft','cancelled'));

drop policy if exists offline_exams_staff_read on public.offline_exams;
create policy offline_exams_staff_read on public.offline_exams
  for select to authenticated
  using (is_kaveri_staff());

drop policy if exists offline_exams_faculty_insert on public.offline_exams;
create policy offline_exams_faculty_insert on public.offline_exams
  for insert to authenticated
  with check (offline_exam_course_writable(course_id));

drop policy if exists offline_exams_staff_update on public.offline_exams;
create policy offline_exams_staff_update on public.offline_exams
  for update to authenticated
  using (is_kaveri_staff())
  with check (is_admin() or offline_exam_manageable(id));

drop policy if exists offline_exams_admin_delete on public.offline_exams;
create policy offline_exams_admin_delete on public.offline_exams
  for delete to authenticated
  using (is_admin());

-- Results: staff (faculty of the exam course or admins) manage rows; students
-- read ONLY their own published rows after the exam is published.
drop policy if exists offline_results_staff_read on public.offline_exam_results;
create policy offline_results_staff_read on public.offline_exam_results
  for select to authenticated
  using (is_kaveri_staff());

drop policy if exists offline_results_student_read_published on public.offline_exam_results;
create policy offline_results_student_read_published on public.offline_exam_results
  for select to authenticated
  using (
    student_id = auth.uid()
    and status = 'published'
    and exists (
      select 1 from public.offline_exams e
      where e.id = offline_exam_results.exam_id
        and e.status = 'results_published'
    )
  );

drop policy if exists offline_results_staff_insert on public.offline_exam_results;
create policy offline_results_staff_insert on public.offline_exam_results
  for insert to authenticated
  with check (offline_exam_manageable(exam_id));

drop policy if exists offline_results_staff_update on public.offline_exam_results;
create policy offline_results_staff_update on public.offline_exam_results
  for update to authenticated
  using (is_kaveri_staff())
  with check (offline_exam_manageable(exam_id));

-- ---------------------------------------------------------------------------
-- Guards
-- ---------------------------------------------------------------------------
-- Published results are immutable (except by the service role / runner paths).
create or replace function public.offline_exam_results_guard()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if (tg_op = 'UPDATE' and old.status = 'published')
     and (auth.role() is distinct from 'service_role') then
    raise exception 'Published offline exam results are locked';
  end if;
  if tg_op = 'INSERT' then
    new.status := 'evaluated';
    new.published_at := null;
    new.published_by := null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_offline_exam_results_guard on public.offline_exam_results;
create trigger trg_offline_exam_results_guard
  before insert or update on public.offline_exam_results
  for each row execute function public.offline_exam_results_guard();

create or replace function public.offline_exam_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_offline_exams_updated_at on public.offline_exams;
create trigger trg_offline_exams_updated_at
  before update on public.offline_exams
  for each row execute function public.offline_exam_set_updated_at();

drop trigger if exists trg_offline_results_updated_at on public.offline_exam_results;
create trigger trg_offline_results_updated_at
  before update on public.offline_exam_results
  for each row execute function public.offline_exam_set_updated_at();

-- ---------------------------------------------------------------------------
-- ingest_offline_exam — satellite/service-role entry point
-- ---------------------------------------------------------------------------
create or replace function public.ingest_offline_exam(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_ext_source text := coalesce(p_payload->>'external_source', 'kaveri_question_paper');
  v_ext_paper  text := nullif(p_payload->>'external_paper_id', '');
  v_course_id  uuid;
  v_title      text;
  v_status     text;
  v_existing   public.offline_exams%rowtype;
  v_now        timestamptz := now();
  v_event_id   uuid;
begin
  if v_ext_paper is null then
    raise exception 'external_paper_id is required';
  end if;

  v_title := nullif(p_payload->>'title', '');
  if v_title is null then
    raise exception 'exam title is required';
  end if;

  begin
    v_course_id := nullif(p_payload->>'course_id', '')::uuid;
  exception when others then
    v_course_id := null;
  end;

  -- Question Paper System status -> LMS exam status. Only finalized papers are
  -- real exams; archived papers cancel an existing exam and are otherwise
  -- ignored so draft paper events never leak into the LMS.
  v_status := lower(coalesce(p_payload->>'status', 'scheduled'));
  if v_status = 'finalized' then v_status := 'scheduled';
  elsif v_status = 'archived' then v_status := 'cancelled';
  end if;
  if v_status not in ('draft','scheduled','conducted','results_pending','results_published','cancelled') then
    raise exception 'unsupported exam status';
  end if;

  select * into v_existing
    from public.offline_exams
   where external_source = v_ext_source and external_paper_id = v_ext_paper
   for update;

  if v_existing.id is not null then
    if v_status = 'draft' then
      return jsonb_build_object('action','ignored_draft','exam_id', v_existing.id);
    end if;
    update public.offline_exams
       set title = v_title,
           course_id = coalesce(v_course_id, v_existing.course_id),
           batch_label = coalesce(nullif(p_payload->>'batch_label',''), v_existing.batch_label),
           external_set_id = coalesce(nullif(p_payload->>'external_set_id',''), v_existing.external_set_id),
           exam_date = coalesce((p_payload->>'exam_date')::date, v_existing.exam_date),
           start_time = coalesce((p_payload->>'start_time')::time, v_existing.start_time),
           duration_minutes = coalesce((p_payload->>'duration_minutes')::int, v_existing.duration_minutes),
           max_marks = coalesce((p_payload->>'max_marks')::numeric(8,2), v_existing.max_marks),
           student_instructions = coalesce(nullif(p_payload->>'student_instructions',''), v_existing.student_instructions),
           status = case
                      when v_existing.status in ('results_published','cancelled') then v_existing.status
                      else v_status
                    end
     where id = v_existing.id;
    return jsonb_build_object('action','updated','exam_id', v_existing.id, 'status', v_status);
  end if;

  if v_status in ('draft','cancelled') then
    -- Nothing to create: cancelled/draft-only papers are not exams.
    return jsonb_build_object('action','ignored_'||v_status,'exam_id', null::uuid);
  end if;

  insert into public.offline_exams (
    title, course_id, batch_label, external_source, external_paper_id,
    external_set_id, exam_date, start_time, duration_minutes, max_marks,
    student_instructions, status, created_by
  ) values (
    v_title, v_course_id, nullif(p_payload->>'batch_label',''), v_ext_source, v_ext_paper,
    nullif(p_payload->>'external_set_id',''),
    (p_payload->>'exam_date')::date,
    (p_payload->>'start_time')::time,
    (p_payload->>'duration_minutes')::int,
    (p_payload->>'max_marks')::numeric(8,2),
    nullif(p_payload->>'student_instructions',''),
    v_status,
    auth.uid()
  )
  returning id into v_existing.id;

  select record_notification_event(
    'offline_exam_scheduled',
    auth.uid(),
    null,
    'offline_exam',
    v_existing.id,
    jsonb_build_object('title', v_title, 'external_paper_id', v_ext_paper, 'exam_date', p_payload->>'exam_date'),
    'offline_exam_scheduled:' || v_ext_source || ':' || v_ext_paper
  ) into v_event_id;

  return jsonb_build_object('action','created','exam_id', v_existing.id, 'status', v_status);
end;
$$;

revoke execute on function public.ingest_offline_exam(jsonb) from public, anon, authenticated;
grant execute on function public.ingest_offline_exam(jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- save_offline_exam_results — authorized faculty/admin mark entry (private)
-- ---------------------------------------------------------------------------
create or replace function public.save_offline_exam_results(p_exam_id uuid, p_results jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_exam public.offline_exams%rowtype;
  v_item jsonb;
  v_student uuid;
  v_marks numeric(8,2);
  v_remarks text;
  v_count int := 0;
  v_idx int := 0;
  v_enrolled boolean;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select * into v_exam from public.offline_exams where id = p_exam_id for update;
  if not found then raise exception 'Exam not found'; end if;
  if not public.offline_exam_manageable(p_exam_id) then
    raise exception 'OFFLINE_EXAM_FORBIDDEN';
  end if;
  if v_exam.status in ('results_published','draft','cancelled') then
    raise exception 'Exam is not open for result entry';
  end if;
  if jsonb_typeof(p_results) <> 'array' then
    raise exception 'results must be an array';
  end if;

  -- Validate the whole batch first so a bad row never leaves partial state.
  for v_item in select * from jsonb_array_elements(p_results) loop
    v_idx := v_idx + 1;
    v_student := (v_item->>'student_id')::uuid;
    v_marks := (v_item->>'marks_obtained')::numeric(8,2);
    if v_student is null or not exists (select 1 from public.profiles where id = v_student) then
      raise exception 'Invalid student at index %', v_idx - 1;
    end if;
    if v_marks is null or v_marks < 0 or (v_exam.max_marks is not null and v_marks > v_exam.max_marks) then
      raise exception 'Invalid marks at index %', v_idx - 1;
    end if;
    if v_exam.course_id is not null then
      select exists (
        select 1 from public.course_enrollments ce
        where ce.student_id = v_student and ce.course_id = v_exam.course_id
          and ce.access_status = 'active'
      ) into v_enrolled;
      if not v_enrolled then
        raise exception 'Student at index % is not actively enrolled in this exam course', v_idx - 1;
      end if;
    end if;
  end loop;

  for v_item in select * from jsonb_array_elements(p_results) loop
    v_student := (v_item->>'student_id')::uuid;
    v_marks := (v_item->>'marks_obtained')::numeric(8,2);
    v_remarks := nullif(v_item->>'remarks', '');
    insert into public.offline_exam_results (exam_id, student_id, marks_obtained, remarks, evaluated_by, evaluated_at)
    values (p_exam_id, v_student, v_marks, v_remarks, auth.uid(), now())
    on conflict (exam_id, student_id) do update
      set marks_obtained = excluded.marks_obtained,
          remarks = excluded.remarks,
          evaluated_by = excluded.evaluated_by,
          evaluated_at = excluded.evaluated_at;
    v_count := v_count + 1;
  end loop;

  if v_exam.status = 'scheduled' or v_exam.status = 'conducted' then
    update public.offline_exams set status = 'results_pending' where id = p_exam_id;
  end if;

  return jsonb_build_object('saved', v_count, 'exam_status', 'results_pending');
end;
$$;

revoke execute on function public.save_offline_exam_results(uuid, jsonb) from public, anon;
grant execute on function public.save_offline_exam_results(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- publish_offline_exam_results — faculty/admin publication
-- ---------------------------------------------------------------------------
create or replace function public.publish_offline_exam_results(p_exam_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_exam public.offline_exams%rowtype;
  v_student uuid;
  v_published int := 0;
  v_event_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select * into v_exam from public.offline_exams where id = p_exam_id for update;
  if not found then raise exception 'Exam not found'; end if;
  if not public.offline_exam_manageable(p_exam_id) then
    raise exception 'OFFLINE_EXAM_FORBIDDEN';
  end if;
  if v_exam.status in ('results_published','cancelled','draft') then
    raise exception 'Exam is not open for publication';
  end if;

  update public.offline_exam_results
     set status = 'published', published_at = now(), published_by = auth.uid()
   where exam_id = p_exam_id and status = 'evaluated';

  get diagnostics v_published = row_count;

  if v_published = 0 then
    raise exception 'No evaluated results to publish';
  end if;

  update public.offline_exams set status = 'results_published' where id = p_exam_id;

  for v_student in
    select r.student_id from public.offline_exam_results r
     where r.exam_id = p_exam_id and r.status = 'published'
  loop
    perform public.kaveri_notify(
      v_student,
      'Offline exam result published',
      'Your result for "' || v_exam.title || '" is now available.',
      'exam',
      p_exam_id,
      'offline_exam',
      '/student/offline-exams'
    );
  end loop;

  select record_notification_event(
    'offline_exam_result_published',
    auth.uid(),
    null,
    'offline_exam',
    p_exam_id,
    jsonb_build_object('title', v_exam.title, 'published', v_published),
    'offline_exam_result_published:' || p_exam_id::text
  ) into v_event_id;

  return jsonb_build_object('published', v_published, 'exam_status', 'results_published');
end;
$$;

revoke execute on function public.publish_offline_exam_results(uuid) from public, anon;
grant execute on function public.publish_offline_exam_results(uuid) to authenticated;

comment on table public.offline_exams is
  'Central offline-exam metadata. Question content never leaves the Question Paper System.';
comment on table public.offline_exam_results is
  'Offline result records. Students may read only their own published rows.';
