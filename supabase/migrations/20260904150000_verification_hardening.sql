-- ============================================================
-- Verification hardening (ChatGPT review round)
--
-- P0-1  open-rule authority parity: student_lesson_access must
--       treat unlock_rule='open' as available regardless of
--       previous-lesson completion (same as the plan RPC).
-- P0-2  lesson_releases direct-INSERT hardening: the row's lesson
--       must belong to the row's course, and the student must be
--       actively enrolled in that course.
-- P0-3  activity_requirement_satisfied becomes an internal helper
--       (no direct authenticated execution -> no cross-student
--       probe surface).
-- P0-5  quiz RLS: questions/options readable only by admin,
--       course faculty, or actively-enrolled students of
--       published quizzes; answer columns (is_correct,
--       correct_answer_text, explanation) stripped from the
--       authenticated role at the column level; staff reads via
--       SECURITY DEFINER RPC; student attempts graded server-side.
-- P1-1  get_student_course_plan extended with per-lesson
--       activities (resources/live/quiz/assignment/practice)
--       derived from real DB rows, plus gate fields.
-- ============================================================

begin;

-- ------------------------------------------------------------------
-- P0-1: open rule parity in student_lesson_access
-- ------------------------------------------------------------------
create or replace function public.student_lesson_access(p_lesson_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_course_id uuid;
  v_unlock_rule text;
  v_req_type text;
  v_req_id uuid;
  v_prev_id uuid;
begin
  if v_uid is null then
    return 'locked';
  end if;

  select l.course_id, l.unlock_rule, l.requires_activity_type, l.requires_activity_id
    into v_course_id, v_unlock_rule, v_req_type, v_req_id
  from public.lessons l
  join public.courses c on c.id = l.course_id
  where l.id = p_lesson_id and l.is_published and c.is_published;

  if v_course_id is null then
    return 'locked';
  end if;

  if not exists (
    select 1 from public.course_enrollments ce
    where ce.course_id = v_course_id
      and ce.student_id = v_uid
      and ce.access_status = 'active'
  ) then
    return 'locked';
  end if;

  if exists (
    select 1 from public.lesson_progress lp
    where lp.lesson_id = p_lesson_id and lp.student_id = v_uid and lp.completed
  ) then
    return 'completed';
  end if;

  if exists (
    select 1 from public.lesson_releases lr
    where lr.lesson_id = p_lesson_id and lr.student_id = v_uid
  ) then
    return 'available';
  end if;

  -- open: published + active enrollment is enough (backward compatible)
  if v_unlock_rule = 'open' then
    return 'available';
  end if;

  if v_unlock_rule = 'gated'
     and (v_req_id is null or not public.activity_requirement_satisfied(v_req_type, v_req_id, v_uid)) then
    return 'locked';
  end if;

  -- sequential (or gated whose activity is satisfied): previous published lesson must be completed
  select prev.id into v_prev_id
  from (
    select l.id,
           row_number() over (order by c.order_index, l.order_index) as rn
    from public.lessons l
    join public.chapters c on c.id = l.chapter_id
    where l.course_id = v_course_id and l.is_published and c.is_published
  ) cur
  join (
    select l.id,
           row_number() over (order by c.order_index, l.order_index) as rn
    from public.lessons l
    join public.chapters c on c.id = l.chapter_id
    where l.course_id = v_course_id and l.is_published and c.is_published
  ) prev on prev.rn = cur.rn - 1
  where cur.id = p_lesson_id;

  if v_prev_id is not null and not exists (
    select 1 from public.lesson_progress lp
    where lp.lesson_id = v_prev_id and lp.student_id = v_uid and lp.completed
  ) then
    return 'locked';
  end if;

  return 'available';
end;
$$;

-- ------------------------------------------------------------------
-- P0-2: lesson_releases direct-INSERT hardening (course consistency
--       + legitimate enrollment). RPC path already validates both.
-- ------------------------------------------------------------------
drop policy if exists lesson_releases_insert on public.lesson_releases;
create policy lesson_releases_insert on public.lesson_releases
  for insert to authenticated
  with check (
    is_admin()
    or (
      exists (
        select 1 from public.course_faculty cf
        where cf.course_id = lesson_releases.course_id
          and cf.faculty_id = auth.uid()
      )
      and exists (
        select 1 from public.lessons l
        where l.id = lesson_releases.lesson_id
          and l.course_id = lesson_releases.course_id
      )
      and exists (
        select 1 from public.course_enrollments ce
        where ce.course_id = lesson_releases.course_id
          and ce.student_id = lesson_releases.student_id
          and ce.access_status = 'active'
      )
    )
  );

-- ------------------------------------------------------------------
-- P0-3: activity_requirement_satisfied is an internal helper only.
--       Direct execution is revoked; the SECURITY DEFINER progression
--       functions (owned by the migration runner) keep calling it.
-- ------------------------------------------------------------------
revoke all on function public.activity_requirement_satisfied(text, uuid, uuid) from public;
revoke execute on function public.activity_requirement_satisfied(text, uuid, uuid) from authenticated;

revoke all on function public.student_lesson_access(uuid) from public;
grant execute on function public.student_lesson_access(uuid) to authenticated;

revoke all on function public.get_student_course_plan(uuid, uuid) from public;
grant execute on function public.get_student_course_plan(uuid, uuid) to authenticated;

revoke all on function public.get_student_lesson_access(uuid) from public;
grant execute on function public.get_student_lesson_access(uuid) to authenticated;

-- ------------------------------------------------------------------
-- P0-5: quiz RLS — questions/options only for admin, course faculty,
--       or actively-enrolled students of published quizzes.
-- ------------------------------------------------------------------
drop policy if exists quiz_questions_select on public.quiz_questions;
create policy quiz_questions_select on public.quiz_questions
  for select to authenticated
  using (
    is_admin()
    or exists (
      select 1 from public.quizzes q
      join public.course_faculty cf on cf.course_id = q.course_id
      where q.id = quiz_questions.quiz_id and cf.faculty_id = auth.uid()
    )
    or (
      exists (
        select 1 from public.quizzes q
        where q.id = quiz_questions.quiz_id
          and q.is_published
          and exists (
            select 1 from public.course_enrollments ce
            where ce.course_id = q.course_id
              and ce.student_id = auth.uid()
              and ce.access_status = 'active'
          )
      )
    )
  );

drop policy if exists quiz_options_select on public.quiz_options;
create policy quiz_options_select on public.quiz_options
  for select to authenticated
  using (
    is_admin()
    or exists (
      select 1 from public.quiz_questions qq
      join public.quizzes q on q.id = qq.quiz_id
      join public.course_faculty cf on cf.course_id = q.course_id
      where qq.id = quiz_options.question_id and cf.faculty_id = auth.uid()
    )
    or (
      exists (
        select 1 from public.quiz_questions qq
        join public.quizzes q on q.id = qq.quiz_id
        where qq.id = quiz_options.question_id
          and q.is_published
          and exists (
            select 1 from public.course_enrollments ce
            where ce.course_id = q.course_id
              and ce.student_id = auth.uid()
              and ce.access_status = 'active'
          )
      )
    )
  );

-- P0-5: published quiz rows must not leak to non-enrolled students.
--       Students may read a published quiz only with an active
--       enrollment in its course. Faculty/admin keep full access.
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
    )
  );

-- ------------------------------------------------------------------
-- P0-5: answer privacy at the column level. The authenticated role
--       (students AND faculty via REST) can no longer select answer
--       columns directly. Staff read answers through the SECURITY
--       DEFINER RPC below; students never receive them at all.
-- ------------------------------------------------------------------
revoke select on public.quiz_options from authenticated;
grant select (id, question_id, option_text, order_index) on public.quiz_options to authenticated;

revoke select on public.quiz_questions from authenticated;
grant select (
  id, quiz_id, question_text, question_type, order_index, points,
  created_at, difficulty, code_snippet, image_url, enable_playground,
  time_limit_seconds
) on public.quiz_questions to authenticated;

-- ------------------------------------------------------------------
-- P0-5: staff RPC — full question data incl. answers, authorized to
--       admin / faculty of the quiz's course (used by the faculty
--       quiz builder and faculty practice mode).
-- ------------------------------------------------------------------
create or replace function public.get_quiz_questions_staff(p_quiz_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_course_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  select q.course_id into v_course_id
  from public.quizzes q
  where q.id = p_quiz_id;

  if v_course_id is null then
    raise exception 'Quiz not found.' using errcode = 'P0002';
  end if;

  if not (public.is_admin() or public.faculty_can_access_course(v_course_id)) then
    raise exception 'Not authorized to view quiz answers.' using errcode = '42501';
  end if;

  return (
    select coalesce(jsonb_agg(
      jsonb_build_object(
        'id', qq.id,
        'quiz_id', qq.quiz_id,
        'question_text', qq.question_text,
        'question_type', qq.question_type,
        'explanation', qq.explanation,
        'order_index', qq.order_index,
        'points', qq.points,
        'created_at', qq.created_at,
        'difficulty', qq.difficulty,
        'code_snippet', qq.code_snippet,
        'image_url', qq.image_url,
        'enable_playground', qq.enable_playground,
        'correct_answer_text', qq.correct_answer_text,
        'time_limit_seconds', qq.time_limit_seconds,
        'options', coalesce((
          select jsonb_agg(
            jsonb_build_object(
              'id', o.id,
              'question_id', o.question_id,
              'option_text', o.option_text,
              'is_correct', o.is_correct,
              'order_index', o.order_index
            ) order by o.order_index
          )
          from public.quiz_options o
          where o.question_id = qq.id
        ), '[]'::jsonb)
      ) order by qq.order_index
    ), '[]'::jsonb)
    from public.quiz_questions qq
    where qq.quiz_id = p_quiz_id
  );
end;
$$;

-- ------------------------------------------------------------------
-- P0-5: student RPC — questions + options WITHOUT any answer data.
-- ------------------------------------------------------------------
create or replace function public.get_quiz_questions_for_student(p_quiz_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_course_id uuid;
begin
  if v_uid is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  select q.course_id into v_course_id
  from public.quizzes q
  where q.id = p_quiz_id and q.is_published;

  if v_course_id is null then
    raise exception 'Published quiz not found.' using errcode = 'P0002';
  end if;

  if not (public.is_admin() or public.faculty_can_access_course(v_course_id)) then
    if not exists (
      select 1 from public.course_enrollments ce
      where ce.course_id = v_course_id
        and ce.student_id = v_uid
        and ce.access_status = 'active'
    ) then
      raise exception 'An active enrollment in this course is required.' using errcode = '42501';
    end if;
  end if;

  return (
    select coalesce(jsonb_agg(
      jsonb_build_object(
        'id', qq.id,
        'quiz_id', qq.quiz_id,
        'question_text', qq.question_text,
        'question_type', qq.question_type,
        'explanation', null,
        'order_index', qq.order_index,
        'points', qq.points,
        'created_at', qq.created_at,
        'difficulty', qq.difficulty,
        'code_snippet', qq.code_snippet,
        'image_url', qq.image_url,
        'enable_playground', qq.enable_playground,
        'correct_answer_text', null,
        'time_limit_seconds', qq.time_limit_seconds,
        'options', coalesce((
          select jsonb_agg(
            jsonb_build_object(
              'id', o.id,
              'question_id', o.question_id,
              'option_text', o.option_text,
              'is_correct', false,
              'order_index', o.order_index
            ) order by o.order_index
          )
          from public.quiz_options o
          where o.question_id = qq.id
        ), '[]'::jsonb)
      ) order by qq.order_index
    ), '[]'::jsonb)
    from public.quiz_questions qq
    where qq.quiz_id = p_quiz_id
  );
end;
$$;

-- ------------------------------------------------------------------
-- P0-5: server-side grading + attempt persistence. The browser never
--       sees is_correct/correct_answer_text; the authoritative score
--       is computed here against the real answer data.
-- ------------------------------------------------------------------
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

  select qz.course_id, qz.pass_percentage, qz.xp_reward
    into v_course_id, v_pass_pct, v_xp_reward
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
    'xp_reward', case when v_passed then coalesce(v_xp_reward, 0) else 0 end
  );
end;
$$;

-- ------------------------------------------------------------------
-- P1-1: plan RPC extension — per-lesson activities + gate fields.
--       Activities derive from real DB rows (resources, live
--       sessions, quizzes, assignments, practice questions). Locked
--       lesson resources are hidden from the student's own view.
-- ------------------------------------------------------------------
-- The return type changes, so the old function (and its SQL-language
-- dependent get_student_lesson_access) must be dropped and rebuilt.
drop function if exists public.get_student_course_plan(uuid, uuid) cascade;

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
  )
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
  order by c.order_index, l.order_index;
end;
$$;

-- get_student_lesson_access was dropped by the cascade above; rebuild it.
create or replace function public.get_student_lesson_access(p_lesson_id uuid)
returns table (access text, reason text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.access, p.reason
  from public.lessons l
  join public.get_student_course_plan(l.course_id) p on p.lesson_id = l.id
  where l.id = p_lesson_id
  limit 1;
$$;

-- ------------------------------------------------------------------
-- grants for the new RPCs (internal helper stays revoked)
-- ------------------------------------------------------------------
revoke all on function public.get_quiz_questions_staff(uuid) from public;
grant execute on function public.get_quiz_questions_staff(uuid) to authenticated;

revoke all on function public.get_quiz_questions_for_student(uuid) from public;
grant execute on function public.get_quiz_questions_for_student(uuid) to authenticated;

revoke all on function public.submit_quiz_attempt(uuid, jsonb, integer) from public;
grant execute on function public.submit_quiz_attempt(uuid, jsonb, integer) to authenticated;

commit;