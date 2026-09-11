-- ============================================================
-- Phase 2: Live session recordings + legacy mvp policy cleanup
-- ============================================================
-- 1. session_resources gains the 'recording' resource type so a recording
--    (Google Drive / YouTube unlisted / external HTTPS link) stays attached
--    to the same live session and uses the existing per-resource lock RLS.
-- 2. get_session_recording_status(): safe metadata-only state for enrolled
--    students ('none' | 'pending' | 'available') WITHOUT exposing locked
--    recording URLs.
-- 3. Drop the nine legacy *_mvp_access ALL(true) policies. Every affected
--    table already has proper per-command restricted policies, so this only
--    removes a blanket override; it never weakens RLS.

begin;

-- ------------------------------------------------------------------
-- 1. session_resources: add 'recording' resource type
-- ------------------------------------------------------------------
alter table public.session_resources
  drop constraint if exists session_resources_resource_type_check;

alter table public.session_resources
  add constraint session_resources_resource_type_check
    check (resource_type in (
      'slides', 'notes', 'practice_questions', 'code_example',
      'quiz', 'assignment', 'downloadable', 'recording'
    ));

-- ------------------------------------------------------------------
-- 2. recording status helper (enrolled students only; metadata only)
-- ------------------------------------------------------------------
create or replace function public.get_session_recording_status(p_session_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_course_id uuid;
  v_total int;
  v_unlocked int;
  v_student uuid := auth.uid();
begin
  if v_student is null then
    return null;
  end if;

  select course_id into v_course_id
  from public.live_sessions
  where id = p_session_id;

  if v_course_id is null then
    return null;
  end if;

  -- Enrolled, active students (and staff/admin) only. Returning null for
  -- anyone else avoids leaking whether the session/recording exists.
  if not (public.is_admin()
          or exists (
            select 1 from public.course_faculty cf
            where cf.course_id = v_course_id and cf.faculty_id = v_student
          )
          or exists (
            select 1 from public.course_enrollments ce
            where ce.course_id = v_course_id
              and ce.student_id = v_student
              and ce.access_status = 'active'
          )) then
    return null;
  end if;

  select count(*) into v_total
  from public.session_resources sr
  where sr.session_id = p_session_id
    and sr.resource_type = 'recording';

  if v_total = 0 then
    return 'none';
  end if;

  select count(*) into v_unlocked
  from public.session_resources sr
  where sr.session_id = p_session_id
    and sr.resource_type = 'recording'
    and sr.is_locked = false;

  if v_unlocked > 0 then
    return 'available';
  end if;

  return 'pending';
end;
$$;

revoke all on function public.get_session_recording_status(uuid) from public;
grant execute on function public.get_session_recording_status(uuid) to authenticated;

-- ------------------------------------------------------------------
-- 3. Drop legacy *_mvp_access ALL(true) policies. Restricted policies
--    already exist on every one of these tables.
-- ------------------------------------------------------------------
drop policy if exists quizzes_mvp_access on public.quizzes;
drop policy if exists quiz_questions_mvp_access on public.quiz_questions;
drop policy if exists quiz_options_mvp_access on public.quiz_options;
drop policy if exists live_sessions_mvp_access on public.live_sessions;
drop policy if exists session_attendance_mvp_access on public.session_attendance;
drop policy if exists lesson_topics_mvp_access on public.lesson_topics;
drop policy if exists lesson_subtopics_mvp_access on public.lesson_subtopics;
drop policy if exists lesson_practice_questions_mvp_access on public.lesson_practice_questions;
drop policy if exists lesson_file_uploads_mvp_access on public.lesson_file_uploads;

-- ------------------------------------------------------------------
-- 3b. session_attendance: dropping the mvp ALL(true) policy exposed that
-- the student join path upserts their own 'registered' row. Allow a
-- student to insert/update ONLY their own row while it stays in
-- 'registered' state; marking 'attended'/'absent'/'excused' remains
-- exclusive to faculty/admin.
-- ------------------------------------------------------------------
drop policy if exists session_attendance_update on public.session_attendance;
create policy session_attendance_update on public.session_attendance
  for update to authenticated
  using (
    is_admin()
    or student_id = auth.uid() and attendance_status = 'registered'
    or exists (
      select 1 from public.live_sessions ls
      join public.course_faculty cf on cf.course_id = ls.course_id
      where ls.id = session_attendance.session_id and cf.faculty_id = auth.uid()
    )
  )
  with check (
    is_admin()
    or student_id = auth.uid() and attendance_status = 'registered'
    or exists (
      select 1 from public.live_sessions ls
      join public.course_faculty cf on cf.course_id = ls.course_id
      where ls.id = session_attendance.session_id and cf.faculty_id = auth.uid()
    )
  );

commit;
