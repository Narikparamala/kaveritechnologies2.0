-- Kaveri LMS — offline exams product completion (forward, LOCAL only)
--
-- Adds the faculty/admin CREATE path (manual exam scheduling independent of
-- the Question Paper webhook — the demo path and the fallback when the QP
-- app is offline) and a complete activity audit trail for the exam and
-- result lifecycle.
--
--   create_offline_exam(...):
--     - server-authoritative creation; status starts 'scheduled'
--     - faculty may create only for courses they are assigned to; admins
--       may create for any course or a course-less platform-level exam
--     - optional external_paper_id linkage is validated against duplicates
--       (an exam already synced for that paper cannot be duplicated)
--     - records the offline_exam_scheduled notification event and an
--       activity_logs entry
--
--   Audit triggers (AFTER, so they see final values):
--     - offline_exam_results: every saved/updated/published result row
--     - offline_exams: every status transition (e.g. scheduled -> pending)
--     Written as activity_logs(user_id = acting auth user).

-- ---------------------------------------------------------------------------
-- create_offline_exam
-- ---------------------------------------------------------------------------
create or replace function public.create_offline_exam(
  p_title text,
  p_course_id uuid default null,
  p_batch_label text default null,
  p_exam_date date default null,
  p_start_time time default null,
  p_duration_minutes integer default null,
  p_max_marks numeric default null,
  p_student_instructions text default null,
  p_external_paper_id text default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_exam_id uuid;
  v_title text := nullif(trim(p_title), '');
  v_event_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  if v_title is null then raise exception 'Exam title is required'; end if;
  if p_duration_minutes is not null and (p_duration_minutes <= 0 or p_duration_minutes > 600) then
    raise exception 'Duration must be between 1 and 600 minutes';
  end if;
  if p_max_marks is not null and (p_max_marks < 0 or p_max_marks > 10000) then
    raise exception 'Max marks must be between 0 and 10000';
  end if;

  -- Authorization: course-less exams are admin-only; course exams require
  -- course manageability (admin or the course's assigned faculty).
  if p_course_id is null then
    if not public.is_admin() then
      raise exception 'OFFLINE_EXAM_FORBIDDEN';
    end if;
  else
    if not public.offline_exam_course_writable(p_course_id) then
      raise exception 'OFFLINE_EXAM_FORBIDDEN';
    end if;
  end if;

  -- Linkage guard: one exam per external paper (prevents duplicates from a
  -- later webhook replay or a manual double-entry).
  if p_external_paper_id is not null then
    if exists (
      select 1 from public.offline_exams
      where external_source = 'kaveri_question_paper'
        and external_paper_id = p_external_paper_id
    ) then
      raise exception 'OFFLINE_EXAM_ALREADY_LINKED';
    end if;
  end if;

  insert into public.offline_exams (
    title, course_id, batch_label, exam_date, start_time, duration_minutes,
    max_marks, student_instructions, external_source, external_paper_id,
    status, created_by
  ) values (
    v_title, p_course_id, nullif(trim(coalesce(p_batch_label, '')), ''),
    p_exam_date, p_start_time, p_duration_minutes, p_max_marks,
    nullif(trim(coalesce(p_student_instructions, '')), ''),
    'kaveri_question_paper', p_external_paper_id, 'scheduled', auth.uid()
  ) returning id into v_exam_id;

  select record_notification_event(
    'offline_exam_scheduled',
    auth.uid(),
    null,
    'offline_exam',
    v_exam_id,
    jsonb_build_object(
      'title', v_title,
      'course_id', p_course_id,
      'exam_date', p_exam_date,
      'manual', true
    ),
    'offline_exam_scheduled:manual:' || v_exam_id::text
  ) into v_event_id;

  insert into public.activity_logs (user_id, action, entity_type, entity_id, metadata)
  values (
    auth.uid(),
    'offline_exam_created',
    'offline_exam',
    v_exam_id,
    jsonb_build_object(
      'title', v_title,
      'course_id', p_course_id,
      'batch_label', p_batch_label,
      'exam_date', p_exam_date,
      'start_time', p_start_time,
      'duration_minutes', p_duration_minutes,
      'max_marks', p_max_marks,
      'external_paper_id', p_external_paper_id
    )
  );

  return jsonb_build_object(
    'exam_id', v_exam_id,
    'status', 'scheduled',
    'event_id', v_event_id
  );
end;
$$;

revoke execute on function public.create_offline_exam(text, uuid, text, date, time, integer, numeric, text, text) from public, anon;
grant execute on function public.create_offline_exam(text, uuid, text, date, time, integer, numeric, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Audit triggers
-- ---------------------------------------------------------------------------
create or replace function public.offline_exam_results_audit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.activity_logs (user_id, action, entity_type, entity_id, metadata)
  values (
    auth.uid(),
    case
      when tg_op = 'INSERT' then 'offline_exam_result_saved'
      when new.status = 'published' and old.status = 'evaluated' then 'offline_exam_result_published'
      else 'offline_exam_result_updated'
    end,
    'offline_exam',
    new.exam_id,
    jsonb_build_object(
      'student_id', new.student_id,
      'marks_obtained', new.marks_obtained,
      'status', new.status,
      'published_at', new.published_at
    )
  );
  return new;
end;
$$;

drop trigger if exists trg_offline_exam_results_audit on public.offline_exam_results;
create trigger trg_offline_exam_results_audit
  after insert or update on public.offline_exam_results
  for each row execute function public.offline_exam_results_audit();

create or replace function public.offline_exams_status_audit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.status is distinct from old.status then
    insert into public.activity_logs (user_id, action, entity_type, entity_id, metadata)
    values (
      auth.uid(),
      'offline_exam_status_changed',
      'offline_exam',
      new.id,
      jsonb_build_object('from', old.status, 'to', new.status)
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_offline_exams_status_audit on public.offline_exams;
create trigger trg_offline_exams_status_audit
  after update on public.offline_exams
  for each row execute function public.offline_exams_status_audit();