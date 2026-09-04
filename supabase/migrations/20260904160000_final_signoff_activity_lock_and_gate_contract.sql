-- ============================================================================
-- KAVERI LMS — FINAL SIGNOFF CONTRACT
-- ----------------------------------------------------------------------------
-- P0-1  Parent lesson lock propagates to child activities.
--       A quiz / assignment / live session bound (lesson_id) to a lesson the
--       student has not unlocked must not be usable through REST or the
--       student RPCs.  EXCEPTION (no circular locks): the activity that is
--       itself the required gate of a locked lesson in the same course stays
--       reachable so the student can satisfy it.
-- P0-3  Published assignment metadata is readable by students only with an
--       active enrollment in the assignment's course.
-- P1    submit_quiz_attempt returns xp_awarded (actual granted) alongside
--       xp_reward (configured) so retakes never claim XP that was not granted.
--       Direct REST fabrication of passing quiz attempts is closed.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Shared server-side authority: may the student use an activity that is bound
-- to a lesson?  Course-level activities (lesson_id NULL) are governed purely
-- by enrollment.  Lesson-bound activities follow the parent lesson's access,
-- with a gate exemption so a required activity that unlocks a lesson is never
-- locked behind that same lesson.
-- ----------------------------------------------------------------------------
create or replace function public.student_activity_unlocked(
  p_lesson_id uuid,
  p_activity_type text,
  p_activity_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_access text;
  v_course_id uuid;
begin
  if v_uid is null then
    return false;
  end if;

  if p_lesson_id is null then
    -- Course-level activity: enrollment governs access.
    return true;
  end if;

  v_access := public.student_lesson_access(p_lesson_id);
  if v_access in ('available', 'completed') then
    return true;
  end if;

  -- Parent lesson is locked.  Keep the activity reachable only when it is the
  -- required gate of some published lesson in the same course (the very key
  -- that unlocks progression), so gates can never be circularly locked.
  select l.course_id into v_course_id
  from public.lessons l
  where l.id = p_lesson_id;

  return v_course_id is not null and exists (
    select 1
    from public.lessons l
    where l.course_id = v_course_id
      and l.is_published
      and l.requires_activity_type = p_activity_type
      and l.requires_activity_id = p_activity_id
  );
end;
$$;

revoke execute on function public.student_activity_unlocked(uuid, text, uuid) from public, anon;
grant execute on function public.student_activity_unlocked(uuid, text, uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- QUIZZES — student read requires active enrollment AND a usable parent lesson
-- (gate-exempt).  Faculty/admin unchanged.
-- ----------------------------------------------------------------------------
drop policy if exists quizzes_select on public.quizzes;
create policy quizzes_select on public.quizzes
  for select to authenticated
  using (
    is_admin()
    or faculty_can_access_course(course_id)
    or (
      is_published
      and exists (
        select 1 from public.course_enrollments ce
        where ce.course_id = quizzes.course_id
          and ce.student_id = auth.uid()
          and ce.access_status = 'active'
      )
      and public.student_activity_unlocked(lesson_id, 'quiz', id)
    )
  );

-- ----------------------------------------------------------------------------
-- ASSIGNMENTS — metadata select contract.  Students see a published
-- assignment only with an active enrollment and a usable parent lesson
-- (gate-exempt).  This replaces the old is_published-OR policy that leaked
-- published metadata to every authenticated user, plus the now-redundant
-- enrolled-only duplicate.
-- ----------------------------------------------------------------------------
drop policy if exists assignments_select on public.assignments;
drop policy if exists assignments_students_read_enrolled_secure on public.assignments;
create policy assignments_select on public.assignments
  for select to authenticated
  using (
    is_admin()
    or faculty_can_access_course(course_id)
    or (
      is_published
      and exists (
        select 1 from public.course_enrollments ce
        where ce.course_id = assignments.course_id
          and ce.student_id = auth.uid()
          and ce.access_status = 'active'
      )
      and public.student_activity_unlocked(lesson_id, 'assignment', id)
    )
  );

-- Draft-insert path must also respect the parent lesson: a student may only
-- open a draft for an assignment that is published, course-enrolled, and whose
-- bound lesson is usable (gate-exempt).  This also closes the legacy
-- student-own-only insert that ignored is_published entirely.
drop policy if exists submissions_insert on public.assignment_submissions;
create policy submissions_insert on public.assignment_submissions
  for insert to authenticated
  with check (
    is_admin()
    or (
      student_id = auth.uid()
      and exists (
        select 1 from public.assignments a
        join public.course_enrollments ce on ce.course_id = a.course_id
        where a.id = assignment_submissions.assignment_id
          and a.is_published
          and ce.student_id = auth.uid()
          and ce.access_status = 'active'
          and public.student_activity_unlocked(a.lesson_id, 'assignment', a.id)
      )
    )
  );

drop policy if exists assignment_submissions_students_insert_own_secure on public.assignment_submissions;
create policy assignment_submissions_students_insert_own_secure on public.assignment_submissions
  for insert to authenticated
  with check (
    student_id = auth.uid()
    and status = 'draft'
    and score is null
    and feedback is null
    and graded_by is null
    and graded_at is null
    and exists (
      select 1 from public.assignments a
      join public.course_enrollments ce on ce.course_id = a.course_id
      where a.id = assignment_submissions.assignment_id
        and a.is_published
        and ce.student_id = auth.uid()
        and ce.access_status = 'active'
        and public.student_activity_unlocked(a.lesson_id, 'assignment', a.id)
    )
  );

-- ----------------------------------------------------------------------------
-- LIVE SESSIONS — enrolled students see a session only when its bound lesson
-- is usable.  Joining/registration follows the same rule, so a hidden session
-- cannot be joined by direct table writes.
-- ----------------------------------------------------------------------------
drop policy if exists live_sessions_select on public.live_sessions;
create policy live_sessions_select on public.live_sessions
  for select to authenticated
  using (
    is_admin()
    or exists (
      select 1 from public.course_faculty cf
      where cf.course_id = live_sessions.course_id
        and cf.faculty_id = auth.uid()
    )
    or (
      exists (
        select 1 from public.course_enrollments ce
        where ce.course_id = live_sessions.course_id
          and ce.student_id = auth.uid()
          and ce.access_status = 'active'
      )
      and public.student_activity_unlocked(lesson_id, 'live', id)
    )
  );

drop policy if exists session_attendance_insert on public.session_attendance;
create policy session_attendance_insert on public.session_attendance
  for insert to authenticated
  with check (
    is_admin()
    or exists (
      select 1 from public.live_sessions ls
      join public.course_faculty cf on cf.course_id = ls.course_id
      where ls.id = session_attendance.session_id
        and cf.faculty_id = auth.uid()
    )
    or (
      student_id = auth.uid()
      and exists (
        select 1 from public.live_sessions ls
        join public.course_enrollments ce on ce.course_id = ls.course_id
        where ls.id = session_attendance.session_id
          and ce.student_id = auth.uid()
          and ce.access_status = 'active'
          and public.student_activity_unlocked(ls.lesson_id, 'live', ls.id)
      )
    )
  );

drop policy if exists session_attendance_update on public.session_attendance;
create policy session_attendance_update on public.session_attendance
  for update to authenticated
  using (
    is_admin()
    or (
      student_id = auth.uid()
      and attendance_status = 'registered'
      and exists (
        select 1 from public.live_sessions ls
        join public.course_enrollments ce on ce.course_id = ls.course_id
        where ls.id = session_attendance.session_id
          and ce.student_id = auth.uid()
          and ce.access_status = 'active'
          and public.student_activity_unlocked(ls.lesson_id, 'live', ls.id)
      )
    )
    or exists (
      select 1 from public.live_sessions ls
      join public.course_faculty cf on cf.course_id = ls.course_id
      where ls.id = session_attendance.session_id
        and cf.faculty_id = auth.uid()
    )
  )
  with check (
    is_admin()
    or (
      student_id = auth.uid()
      and attendance_status = 'registered'
      and exists (
        select 1 from public.live_sessions ls
        join public.course_enrollments ce on ce.course_id = ls.course_id
        where ls.id = session_attendance.session_id
          and ce.student_id = auth.uid()
          and ce.access_status = 'active'
          and public.student_activity_unlocked(ls.lesson_id, 'live', ls.id)
      )
    )
    or exists (
      select 1 from public.live_sessions ls
      join public.course_faculty cf on cf.course_id = ls.course_id
      where ls.id = session_attendance.session_id
        and cf.faculty_id = auth.uid()
    )
  );

-- ----------------------------------------------------------------------------
-- QUIZ ATTEMPTS — a passing attempt is authoritative server state produced by
-- submit_quiz_attempt (SECURITY DEFINER).  Direct REST inserts may only open a
-- starter attempt (no score / pass verdict), closing fabrication of a passing
-- quiz-gate state through the table API.
-- ----------------------------------------------------------------------------
drop policy if exists quiz_attempts_insert on public.quiz_attempts;
create policy quiz_attempts_insert on public.quiz_attempts
  for insert to authenticated
  with check (
    is_admin()
    or (
      student_id = auth.uid()
      and score is null
      and passed is null
      and completed_at is null
      and exists (
        select 1 from public.quizzes q
        join public.course_enrollments ce on ce.course_id = q.course_id
        where q.id = quiz_attempts.quiz_id
          and q.is_published
          and ce.student_id = auth.uid()
          and ce.access_status = 'active'
          and public.student_activity_unlocked(q.lesson_id, 'quiz', q.id)
      )
    )
  );

-- ----------------------------------------------------------------------------
-- STUDENT QUIZ RPCS — the quiz's bound lesson must be usable before the
-- student may load questions or submit an attempt (gate-exempt).
-- ----------------------------------------------------------------------------
-- The first version returned jsonb; a table-typed return is clearer for the
-- PostgREST client and safe to swap because nothing depends on this function.
drop function if exists public.get_quiz_questions_for_student(uuid);

create or replace function public.get_quiz_questions_for_student(p_quiz_id uuid)
returns table (
  id uuid,
  quiz_id uuid,
  question_text text,
  question_type text,
  order_index integer,
  points integer,
  created_at timestamptz,
  difficulty text,
  code_snippet text,
  image_url text,
  enable_playground boolean,
  time_limit_seconds integer,
  options jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_course_id uuid;
  v_lesson_id uuid;
begin
  if v_uid is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  select q.course_id, q.lesson_id into v_course_id, v_lesson_id
  from public.quizzes q
  where q.id = p_quiz_id and q.is_published;

  if v_course_id is null then
    raise exception 'Published quiz not found.' using errcode = 'P0002';
  end if;

  if not exists (
    select 1 from public.course_enrollments ce
    where ce.course_id = v_course_id
      and ce.student_id = v_uid
      and ce.access_status = 'active'
  ) then
    raise exception 'An active enrollment in this course is required.' using errcode = '42501';
  end if;

  if not public.student_activity_unlocked(v_lesson_id, 'quiz', p_quiz_id) then
    raise exception 'This quiz unlocks with its lesson.' using errcode = '42501';
  end if;

  return query
  select
    qq.id,
    qq.quiz_id,
    qq.question_text,
    qq.question_type,
    qq.order_index,
    qq.points,
    qq.created_at,
    qq.difficulty,
    qq.code_snippet,
    qq.image_url,
    qq.enable_playground,
    qq.time_limit_seconds,
    coalesce((
      select jsonb_agg(
        jsonb_build_object('id', o.id, 'option_text', o.option_text, 'order_index', o.order_index)
        order by o.order_index
      )
      from public.quiz_options o
      where o.question_id = qq.id
    ), '[]'::jsonb) as options
  from public.quiz_questions qq
  where qq.quiz_id = p_quiz_id
  order by qq.order_index;
end;
$$;

-- submit_quiz_attempt is recreated below with (a) the bound-lesson guard and
-- (b) an xp_awarded field that reports the XP actually granted this attempt.

-- ----------------------------------------------------------------------------
-- P0-1: the course-plan RPC keeps activity metadata truthful for locked
-- lessons — child activities of a locked lesson are reported 'locked' unless
-- they are the gate that unlocks the lesson.
-- ----------------------------------------------------------------------------
create or replace function public.get_student_course_plan(
  p_course_id uuid,
  p_student_id uuid default null
)
returns table (
  lesson_id uuid,
  chapter_id uuid,
  course_id uuid,
  title text,
  slug text,
  teaching_mode text,
  enable_coding_playground boolean,
  duration_minutes integer,
  xp_reward integer,
  order_index integer,
  is_free_preview boolean,
  chapter_title text,
  chapter_order_index integer,
  access text,
  reason text,
  is_released boolean,
  requires_activity_type text,
  requires_activity_id uuid,
  requires_activity_title text,
  activities jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := coalesce(p_student_id, auth.uid());
  v_caller uuid := auth.uid();
begin
  if v_caller is null then
    return;
  end if;

  -- staff viewing another student: caller must be admin or faculty of this course
  if p_student_id is not null and p_student_id <> v_caller then
    if not (public.is_admin() or public.faculty_can_access_course(p_course_id)) then
      raise exception 'Not authorized to view this student''s course plan.' using errcode = '42501';
    end if;
  elsif not (public.is_admin() or public.faculty_can_access_course(p_course_id)) then
    -- self-service: caller must be actively enrolled
    if not exists (
      select 1 from public.course_enrollments ce
      where ce.course_id = p_course_id and ce.student_id = v_caller and ce.access_status = 'active'
    ) then
      return;
    end if;
  end if;

  return query
  with ordered as (
    select l.id,
           row_number() over (order by c.order_index, l.order_index) as rn
    from public.lessons l
    join public.chapters c on c.id = l.chapter_id
    where l.course_id = p_course_id and l.is_published and c.is_published
  ),
  base as (
  select
    l.id as lesson_id,
    l.chapter_id,
    l.course_id,
    l.title,
    l.slug,
    l.teaching_mode,
    l.enable_coding_playground,
    l.duration_minutes,
    l.xp_reward,
    l.order_index,
    l.is_free_preview,
    c.title as chapter_title,
    c.order_index as chapter_order_index,
    case
      when lp.id is not null then 'completed'
      when lr.id is not null then 'available'
      when l.unlock_rule = 'open' then 'available'
      when l.unlock_rule = 'gated'
           and (l.requires_activity_id is null
                or not public.activity_requirement_satisfied(l.requires_activity_type, l.requires_activity_id, v_uid))
        then 'locked'
      when prev.id is not null and prev_lp.id is null then 'locked'
      else 'available'
    end as access,
    case
      when lp.id is not null then 'Completed'
      when lr.id is not null then 'Released by faculty or admin'
      when l.unlock_rule = 'open' then ''
      when l.unlock_rule = 'gated'
           and (l.requires_activity_id is null
                or not public.activity_requirement_satisfied(l.requires_activity_type, l.requires_activity_id, v_uid))
        then 'Complete the required ' || l.requires_activity_type
             || coalesce(' "' || (
                  case l.requires_activity_type
                    when 'assignment' then (select a.title from public.assignments a where a.id = l.requires_activity_id)
                    when 'quiz' then (select q.title from public.quizzes q where q.id = l.requires_activity_id)
                    when 'coding' then (select cq.title from public.coding_questions cq where cq.id = l.requires_activity_id)
                  end
                ) || '"', '') || ' to unlock this lesson'
      when prev.id is not null and prev_lp.id is null then 'Complete "' || prev_l.title || '" first'
      else ''
    end as reason,
    lr.id is not null as is_released,
    l.requires_activity_type,
    l.requires_activity_id,
    case l.requires_activity_type
      when 'assignment' then (select a.title from public.assignments a where a.id = l.requires_activity_id)
      when 'quiz' then (select q.title from public.quizzes q where q.id = l.requires_activity_id)
      when 'coding' then (select cq.title from public.coding_questions cq where cq.id = l.requires_activity_id)
    end as requires_activity_title,
    coalesce((
      select jsonb_agg(act order by act->>'sort')
      from (
        select jsonb_build_object(
                 'sort', '01',
                 'kind', r.resource_type,
                 'title', r.title,
                 'state', case
                            when lp.id is not null then 'completed'
                            when r.is_locked is not true then 'available'
                            else 'locked'
                          end
               ) as act
        from public.lesson_resources r
        where r.lesson_id = l.id
          and r.is_published
          and (r.is_locked is not true or (p_student_id is not null and p_student_id <> v_caller))
        union all
        select jsonb_build_object(
                 'sort', '02',
                 'kind', 'live',
                 'title', ls.title,
                 'session_id', ls.id,
                 'state', case
                            when ls.status = 'cancelled' then 'cancelled'
                            when ls.status = 'completed' then 'completed'
                            when ls.status = 'live'
                                 or (now() >= ls.session_date
                                     and now() <= ls.session_date + (ls.duration_minutes || ' minutes')::interval)
                              then 'live_now'
                            else 'upcoming'
                          end,
                 'recording', case
                                when ls.status = 'completed' then coalesce((
                                  select case
                                    when count(*) filter (where sr.is_locked is not true) > 0 then 'available'
                                    when count(*) filter (where sr.is_locked) > 0 then 'locked'
                                    else 'none'
                                  end
                                  from public.session_resources sr
                                  where sr.session_id = ls.id
                                    and sr.resource_type = 'recording'
                                ), 'none')
                                else 'none'
                              end,
                 'date', to_char(ls.session_date, 'Mon DD, YYYY')
               ) as act
        from public.live_sessions ls
        where ls.lesson_id = l.id
        union all
        select jsonb_build_object(
                 'sort', '03',
                 'kind', 'quiz',
                 'title', q.title,
                 'quiz_id', q.id,
                 'state', case
                            when exists (
                              select 1 from public.quiz_attempts qa
                              where qa.quiz_id = q.id and qa.student_id = v_uid and qa.completed_at is not null
                            ) then 'completed'
                            else 'available'
                          end
               ) as act
        from public.quizzes q
        where q.lesson_id = l.id and q.is_published
        union all
        select jsonb_build_object(
                 'sort', '04',
                 'kind', 'assignment',
                 'title', a.title,
                 'assignment_id', a.id,
                 'state', coalesce((
                   select s.status
                   from public.assignment_submissions s
                   where s.assignment_id = a.id and s.student_id = v_uid
                   order by s.submitted_at desc nulls last
                   limit 1
                 ), 'available')
               ) as act
        from public.assignments a
        where a.lesson_id = l.id and a.is_published
        union all
        select jsonb_build_object(
                 'sort', '05',
                 'kind', 'practice',
                 'title', 'Practice Questions',
                 'count', count(*),
                 'state', case when lp.id is not null then 'completed' else 'available' end
               ) as act
        from public.lesson_practice_questions pq
        where pq.lesson_id = l.id
        having count(*) > 0
      ) acts
    ), '[]'::jsonb) as activities
  from public.lessons l
  join public.chapters c on c.id = l.chapter_id
  left join public.lesson_releases lr on lr.lesson_id = l.id and lr.student_id = v_uid
  left join public.lesson_progress lp on lp.lesson_id = l.id and lp.student_id = v_uid and lp.completed
  left join ordered cur on cur.id = l.id
  left join ordered prev on prev.rn = cur.rn - 1
  left join public.lessons prev_l on prev_l.id = prev.id
  left join public.lesson_progress prev_lp on prev_lp.lesson_id = prev.id and prev_lp.student_id = v_uid and prev_lp.completed
  where l.course_id = p_course_id and l.is_published and c.is_published
  )
  select
    b.lesson_id,
    b.chapter_id,
    b.course_id,
    b.title,
    b.slug,
    b.teaching_mode,
    b.enable_coding_playground,
    b.duration_minutes,
    b.xp_reward,
    b.order_index,
    b.is_free_preview,
    b.chapter_title,
    b.chapter_order_index,
    b.access,
    b.reason,
    b.is_released,
    b.requires_activity_type,
    b.requires_activity_id,
    b.requires_activity_title,
    case
      when b.access = 'locked' then coalesce((
        select jsonb_agg(
                 case
                   when (b.requires_activity_type = 'quiz' and el ->> 'kind' = 'quiz' and el ->> 'quiz_id' = b.requires_activity_id::text)
                     or (b.requires_activity_type = 'assignment' and el ->> 'kind' = 'assignment' and el ->> 'assignment_id' = b.requires_activity_id::text)
                     then el
                   else jsonb_set(el, '{state}', '"locked"'::jsonb)
                 end
                 order by el ->> 'sort')
        from jsonb_array_elements(b.activities) el
      ), '[]'::jsonb)
      else b.activities
    end as activities
  from base b
  order by b.chapter_order_index, b.order_index;
end;
$$;

-- ----------------------------------------------------------------------------
-- QUIZ SUBMIT — parent-lesson guard + truthful XP award report.
-- xp_awarded = XP actually granted by THIS attempt (configured reward on the
-- first pass, 0 on later passing retakes).  The one-time award rule and the
-- advisory lock that serializes passes are preserved.
-- ----------------------------------------------------------------------------
create or replace function public.submit_quiz_attempt(
  p_quiz_id uuid,
  p_answers jsonb,
  p_time_taken_seconds integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_course_id uuid;
  v_lesson_id uuid;
  v_pass_pct integer;
  v_xp_reward integer;
  v_total numeric := 0;
  v_earned numeric := 0;
  v_pct numeric := 0;
  v_attempt_id uuid;
  v_passed boolean;
  v_was_passed boolean;
  qr record;
  ans jsonb;
  v_selected jsonb;
  v_correct_ids jsonb;
begin
  if v_uid is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.profiles p
    where p.id = v_uid and p.role = 'student' and p.is_active
  ) then
    raise exception 'Only an active student may submit a quiz.' using errcode = '42501';
  end if;

  select qz.course_id, qz.lesson_id, qz.pass_percentage, qz.xp_reward
    into v_course_id, v_lesson_id, v_pass_pct, v_xp_reward
  from public.quizzes qz
  where qz.id = p_quiz_id and qz.is_published;

  if v_course_id is null then
    raise exception 'Published quiz not found.' using errcode = 'P0002';
  end if;

  if not exists (
    select 1 from public.course_enrollments ce
    where ce.course_id = v_course_id
      and ce.student_id = v_uid
      and ce.access_status = 'active'
  ) then
    raise exception 'An active enrollment in this course is required.' using errcode = '42501';
  end if;

  if not public.student_activity_unlocked(v_lesson_id, 'quiz', p_quiz_id) then
    raise exception 'This quiz unlocks with its lesson.' using errcode = '42501';
  end if;

  for qr in
    select qq.id, qq.question_type, qq.points, qq.correct_answer_text,
           coalesce((
             select jsonb_agg(
               jsonb_build_object('id', o.id, 'is_correct', o.is_correct)
               order by o.order_index
             )
             from public.quiz_options o
             where o.question_id = qq.id
           ), '[]'::jsonb) as options
    from public.quiz_questions qq
    where qq.quiz_id = p_quiz_id
    order by qq.order_index
  loop
    v_total := v_total + qr.points;
    ans := p_answers -> qr.id::text;

    if qr.question_type in ('fill_in_blank', 'code_output') then
      if lower(trim(coalesce(ans->>'text', ''))) = lower(trim(coalesce(qr.correct_answer_text, ''))) then
        v_earned := v_earned + qr.points;
      end if;
    elsif qr.question_type <> 'coding' then
      -- mcq / true_false / multiple_select: exact set match.
      -- Compare option-id strings on both sides: qr.options holds
      -- jsonb objects, so project elem->>'id' before ordering.
      select coalesce(jsonb_agg(elem->>'id' order by elem->>'id'), '[]'::jsonb)
        into v_correct_ids
      from jsonb_array_elements(qr.options) elem
      where (elem->>'is_correct')::boolean;

      select coalesce(jsonb_agg(elem order by elem), '[]'::jsonb)
        into v_selected
      from jsonb_array_elements_text(coalesce(ans->'selected', '[]'::jsonb)) elem;

      if v_correct_ids = v_selected then
        v_earned := v_earned + qr.points;
      end if;
    end if;
    -- 'coding' questions are manually graded: no automatic points
  end loop;

  if v_total > 0 then
    v_pct := round((v_earned / v_total) * 100, 2);
  end if;
  v_passed := v_pct >= coalesce(v_pass_pct, 70);

  -- Award the advertised XP at most once per passed quiz (mirrors the
  -- trusted lesson-completion XP path). Serialize on student+quiz so
  -- parallel submits cannot double-grant.
  if v_passed and coalesce(v_xp_reward, 0) > 0 then
    perform pg_advisory_xact_lock(hashtextextended(v_uid::text || ':' || p_quiz_id::text, 0));
  end if;

  select exists (
    select 1 from public.quiz_attempts qp
    where qp.quiz_id = p_quiz_id
      and qp.student_id = v_uid
      and qp.passed
  ) into v_was_passed;

  insert into public.quiz_attempts (
    quiz_id, student_id, score, max_score, passed,
    time_taken_seconds, completed_at
  )
  values (
    p_quiz_id, v_uid, v_pct, v_total::integer,
    v_passed,
    p_time_taken_seconds, now()
  )
  returning id into v_attempt_id;

  if v_passed and not v_was_passed and coalesce(v_xp_reward, 0) > 0 then
    insert into public.xp_transactions (student_id, amount, reason, reference_id, reference_type)
    select v_uid, qz2.xp_reward, 'Passed quiz: ' || qz2.title, qz2.id, 'quiz'
    from public.quizzes qz2
    where qz2.id = p_quiz_id;

    update public.profiles
    set xp_points = xp_points + coalesce(v_xp_reward, 0),
        level = floor(sqrt(greatest(xp_points + coalesce(v_xp_reward, 0), 0)::numeric / 100))::integer + 1,
        updated_at = now()
    where id = v_uid;
  end if;

  return jsonb_build_object(
    'attempt_id', v_attempt_id,
    'score', v_pct,
    'max_score', v_total::integer,
    'passed', v_passed,
    'xp_reward', case when v_passed then coalesce(v_xp_reward, 0) else 0 end,
    'xp_awarded', case when v_passed and not v_was_passed then coalesce(v_xp_reward, 0) else 0 end
  );
end;
$$;
