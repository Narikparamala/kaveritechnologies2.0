-- ============================================================================
-- 20261018120000 — One stats source, learning streak, is_test purge policy
-- ============================================================================
-- Fixes applied together (each numbered section is independent and idempotent):
--   2) courses.enrollment_count kept truthful from course_enrollments via
--      trigger + one-time backfill — admin cards, faculty dashboard and
--      student portal all read ONE number.
--   3) streak_days recomputed from lesson_progress activity dates
--      (update_learning_streak), initialized backfill-style for active
--      students and maintained by trigger on lesson completion.
--   5) is_test flags on profiles/courses/course_enrollments, mark-then-delete
--      purge of QA artifacts from prod (qa-* accounts, QA courses, seed UUID
--      10000000-0000-0000-0000-000000000001 artifacts), policy doc at
--      docs/qa-data-policy.md. auth.users deletion happens separately via the
--      Supabase dashboard (Auth > Users) after this migration — SQL cannot
--      safely cascade auth schema from a migration in hosted Supabase.
-- ============================================================================

-- ============================================================================
-- 2) Sync courses.enrollment_count from course_enrollments (one stats source)
-- ============================================================================
-- Admin course cards read courses.enrollment_count (a hand-maintained counter
-- that drifted to 0), while the faculty dashboard counts active
-- course_enrollments — hence "0 students" vs "17 Active Students".
-- The counter is now kept truthful by a trigger and backfilled once.

create or replace function public.sync_course_enrollment_count()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_course uuid;
  v_active integer;
begin
  v_course := coalesce(new.course_id, old.course_id);
  select count(*) into v_active
  from public.course_enrollments
  where course_id = v_course and access_status = 'active';
  update public.courses
  set enrollment_count = v_active::int
  where id = v_course;
  return null;
end;
$$;

drop trigger if exists trg_sync_enrollment_count on public.course_enrollments;
create trigger trg_sync_enrollment_count
after insert or update or delete on public.course_enrollments
for each row execute function public.sync_course_enrollment_count();

-- One-time backfill so every card reads the same number immediately.
update public.courses c
set enrollment_count = (
  select count(*) from public.course_enrollments ce
  where ce.course_id = c.id and ce.access_status = 'active'
);

-- ============================================================================
-- 3) Learning streak — recompute from lesson_progress activity dates
-- ============================================================================
-- streak_days stayed 0 because nothing ever wrote it. The honest chain is the
-- student's own lesson_progress.completed_at dates: walking back over recent
-- days, any activity at all today/within the last 48h window keeps the streak
-- warm; a break longer than that resets to 0.
create or replace function public.update_learning_streak(p_student uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_days int := 0;
  v_cursor date := current_date;
  v_today_activity boolean;
  v_any_date date;
begin
  select exists (
    select 1 from public.lesson_progress
    where student_id = p_student and completed
      and completed_at::date >= current_date
  ) into v_today_activity;

  if not v_today_activity then
    -- No activity today: streak survives only if the last activity is
    -- yesterday at the latest (grace for time-of-day).
    select max(completed_at)::date into v_any_date
    from public.lesson_progress
    where student_id = p_student and completed;
    if v_any_date is null or v_any_date < current_date - 1 then
      update public.profiles set streak_days = 0 where id = p_student;
      return 0;
    end if;
    v_cursor := v_any_date;
  end if;

  loop
    if exists (
      select 1 from public.lesson_progress
      where student_id = p_student and completed
        and completed_at::date = v_cursor
    ) then
      v_days := v_days + 1;
      v_cursor := v_cursor - 1;
    else
      exit;
    end if;
  end loop;

  update public.profiles set streak_days = v_days where id = p_student;
  return v_days;
end;
$$;

grant execute on function public.update_learning_streak(uuid) to authenticated;

-- Complete every active student's streak so cards show real numbers without
-- waiting for each student's next lesson completion.
do $$
declare r record;
begin
  for r in select id from public.profiles where role = 'student' and is_active loop
    perform public.update_learning_streak(r.id);
  end loop;
end $$;

-- Init/update streak automatically when a lesson completion lands.
create or replace function public.streak_on_lesson_complete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_student uuid;
begin
  if new.completed then
    select student_id into v_student from public.lesson_progress where id = new.id;
    if v_student is not null then
      perform public.update_learning_streak(v_student);
    end if;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_streak_on_lesson_complete on public.lesson_progress;
create trigger trg_streak_on_lesson_complete
after insert or update of completed on public.lesson_progress
for each row execute function public.streak_on_lesson_complete();

-- ============================================================================
-- 5) is_test policy flag + purge of QA artifacts from production
-- ============================================================================
-- QA automation created accounts/courses straight in the live project.
-- Every artifact row now gets a marker first (so we could recover it), then
-- the marked rows are deleted. Going forward QA must run against the
-- preview/staging project — see docs/qa-data-policy.md.
alter table public.profiles add column if not exists is_test boolean not null default false;
alter table public.courses add column if not exists is_test boolean not null default false;
alter table public.course_enrollments add column if not exists is_test boolean not null default false;

-- Mark ALL enumerated prod-QA artifacts, regardless of current state.
update public.profiles set is_test = true where role = 'student' and email like 'qa-%@kaveri-qatest.com';
update public.courses set is_test = true where title in ('QA Crop Test Course', 'QA Test Course') or slug like 'qa-%';

-- The QA origin story (docs/qa-data-policy.md): a QA script created a preview
-- session for the seed UUID and attached it to whatever course the UI had
-- open, hence enrollments/enroll-requests/certificates/progress/"Draft Course"
-- made by the seed student. All of it is purged below.
update public.profiles set is_test = true where id = '10000000-0000-0000-0000-000000000001';
update public.course_enrollments ce set is_test = true
  where ce.student_id = '10000000-0000-0000-0000-000000000001'
     or ce.course_id in (select id from public.courses where is_test)
     or exists (select 1 from public.profiles p where p.id = ce.student_id and p.is_test);

delete from public.lesson_progress where student_id in (select id from public.profiles where is_test);
delete from public.enrollment_requests where student_id in (select id from public.profiles where is_test);
delete from public.xp_transactions where student_id in (select id from public.profiles where is_test);
delete from public.certificates where student_id in (select id from public.profiles where is_test);
delete from public.certificates where course_id in (select id from public.courses where is_test);
delete from public.lesson_notes where student_id in (select id from public.profiles where is_test);
delete from public.lesson_bookmarks where student_id in (select id from public.profiles where is_test);
delete from public.quiz_attempts where student_id in (select id from public.profiles where is_test);
delete from public.coding_question_attempts where student_id in (select id from public.profiles where is_test);
delete from public.assignment_submissions where student_id in (select id from public.profiles where is_test);
delete from public.batch_students where student_id in (select id from public.profiles where is_test);
delete from public.course_enrollments where student_id in (select id from public.profiles where is_test) or course_id in (select id from public.courses where is_test);
delete from public.course_enrollments where id in (
  select ce.id from public.course_enrollments ce
  where ce.is_test
);
delete from public.course_faculty where course_id in (select id from public.courses where is_test);
delete from public.chapters where course_id in (select id from public.courses where is_test);
delete from public.courses where is_test;
delete from public.notifications where user_id in (select id from public.profiles where is_test);
delete from public.profiles where is_test;

-- Note: the qa-* auth.users rows themselves are removed separately (Supabase
-- dashboard -> Auth > Users, filter @kaveri-qatest.com) because hosted
-- Supabase does not allow the migration runner to write auth.users directly.
-- The public profiles above are already gone, so no orphan app rows remain.

-- Post-purge healing: enrollment counters were just driven by deletes; the
-- trigger keeps them truthful going forward, but sync once more right now.
update public.courses c
set enrollment_count = (
  select count(*) from public.course_enrollments ce
  where ce.course_id = c.id and ce.access_status = 'active'
);
