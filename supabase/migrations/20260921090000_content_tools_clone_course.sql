-- Course clone: one RPC pair duplicates a course with chapters, lessons,
-- materials, and quizzes into a new course. Used by the "Clone" button on the
-- courses pages so a new batch never rebuilds content by hand.
--
-- Two passes by design:
--   clone_course creates an empty, unpublished shell course and returns its id
--   (unique slug derived from the chosen title).
--   clone_course_content copies all content into that shell. The shell is
--   identified structurally (created by the caller, unpublished, no chapters
--   yet), so re-running is rejected instead of duplicating content.
--
-- Security: SECURITY DEFINER + locked search_path; staff-only via is_admin()
-- OR is_faculty().

create or replace function public.clone_course(
  p_source_course_id uuid,
  p_course_title text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_source public.courses;
  v_new_id uuid;
  v_slug text;
  v_base_slug text;
  v_suffix integer := 1;
  v_title text;
begin
  if v_caller is null then
    raise exception 'CLONE_UNAUTHORIZED';
  end if;
  if not (public.is_admin() or public.is_faculty()) then
    raise exception 'CLONE_FORBIDDEN';
  end if;

  select * into v_source from public.courses where id = p_source_course_id;
  if not found then
    raise exception 'CLONE_SOURCE_NOT_FOUND';
  end if;

  v_title := btrim(coalesce(p_course_title, ''));
  if v_title = '' then
    v_title := 'Copy of ' || v_source.title;
  end if;
  if length(v_title) < 3 then
    raise exception 'CLONE_TITLE_TOO_SHORT';
  end if;

  -- Unique slug from the new title.
  v_base_slug := btrim(lower(regexp_replace(v_title, '[^a-zA-Z0-9]+', '-', 'g')), '-');
  if v_base_slug = '' then
    v_base_slug := 'course';
  end if;
  v_slug := v_base_slug;
  while exists (select 1 from public.courses c where c.slug = v_slug) loop
    v_suffix := v_suffix + 1;
    v_slug := v_base_slug || '-' || v_suffix::text;
  end loop;

  insert into public.courses (
    title, slug, short_description, description, thumbnail_url,
    difficulty, duration_hours, category,
    is_published, is_featured, price, certificate_eligible, created_by
  ) values (
    v_title, v_slug, v_source.short_description, v_source.description,
    v_source.thumbnail_url, v_source.difficulty, v_source.duration_hours,
    v_source.category, false, false, v_source.price,
    v_source.certificate_eligible, v_caller
  )
  returning id into v_new_id;

  return v_new_id;
end;
$$;

create or replace function public.clone_course_content(
  p_source_course_id uuid,
  p_new_course_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_created_by uuid;
  v_is_published boolean;
  v_new_chapter_id uuid;
  v_new_lesson_id uuid;
  v_new_quiz_id uuid;
  v_chapter record;
  v_lesson record;
  v_quiz record;
begin
  if v_caller is null then
    raise exception 'CLONE_UNAUTHORIZED';
  end if;
  if not (public.is_admin() or public.is_faculty()) then
    raise exception 'CLONE_FORBIDDEN';
  end if;

  select created_by, is_published into v_created_by, v_is_published
  from public.courses where id = p_new_course_id;
  if not found then
    raise exception 'CLONE_TARGET_NOT_FOUND';
  end if;

  -- Only clone into an empty, unpublished shell created by the caller.
  if v_created_by is distinct from v_caller or v_is_published then
    raise exception 'CLONE_TARGET_NOT_A_SHELL';
  end if;
  if exists (select 1 from public.chapters where course_id = p_new_course_id) then
    raise exception 'CLONE_ALREADY_DONE';
  end if;

  -- Lesson-attached quizzes, copied alongside their lesson.
  for v_chapter in
    select * from public.chapters
    where course_id = p_source_course_id
    order by order_index, created_at
  loop
    insert into public.chapters (course_id, title, description, order_index, is_published)
    values (p_new_course_id, v_chapter.title, v_chapter.description, v_chapter.order_index, v_chapter.is_published)
    returning id into v_new_chapter_id;

    for v_lesson in
      select * from public.lessons
      where chapter_id = v_chapter.id
      order by order_index, created_at
    loop
      insert into public.lessons (
        chapter_id, course_id, title, slug, video_url, notes_markdown, code_example,
        explanation, order_index, duration_minutes, is_published,
        is_free_preview, xp_reward, teaching_mode, enable_coding_playground,
        slides_url, notes_url, requires_previous_lesson_completion
      ) values (
        v_new_chapter_id, p_new_course_id, v_lesson.title,
        v_lesson.slug || '-c' || substr(md5(random()::text), 1, 6),
        v_lesson.video_url,
        v_lesson.notes_markdown, v_lesson.code_example, v_lesson.explanation,
        v_lesson.order_index, v_lesson.duration_minutes, v_lesson.is_published,
        v_lesson.is_free_preview, v_lesson.xp_reward, v_lesson.teaching_mode,
        v_lesson.enable_coding_playground, v_lesson.slides_url, v_lesson.notes_url,
        v_lesson.requires_previous_lesson_completion
      )
      returning id into v_new_lesson_id;

      insert into public.lesson_resources (
        lesson_id, title, description, content_text, external_url, file_url,
        file_type, resource_type, is_published, is_locked,
        unlock_after_session, order_index
      )
      select
        v_new_lesson_id, r.title, r.description, r.content_text, r.external_url,
        r.file_url, r.file_type, r.resource_type, r.is_published, r.is_locked,
        r.unlock_after_session, r.order_index
      from public.lesson_resources r
      where r.lesson_id = v_lesson.id
      order by r.order_index, r.created_at;

      for v_quiz in
        select * from public.quizzes
        where course_id = p_source_course_id and lesson_id = v_lesson.id
      loop
        insert into public.quizzes (
          course_id, lesson_id, title, description, pass_percentage,
          time_limit_minutes, xp_reward, is_published, show_answers, created_by
        ) values (
          p_new_course_id, v_new_lesson_id, v_quiz.title, v_quiz.description,
          v_quiz.pass_percentage, v_quiz.time_limit_minutes, v_quiz.xp_reward,
          v_quiz.is_published, v_quiz.show_answers, v_created_by
        )
        returning id into v_new_quiz_id;

        perform public.clone_quiz_body(v_quiz.id, v_new_quiz_id);
      end loop;
    end loop;
  end loop;

  -- Course-level quizzes (lesson_id null).
  for v_quiz in
    select * from public.quizzes
    where course_id = p_source_course_id and lesson_id is null
  loop
    insert into public.quizzes (
      course_id, lesson_id, title, description, pass_percentage,
      time_limit_minutes, xp_reward, is_published, show_answers, created_by
    ) values (
      p_new_course_id, null, v_quiz.title, v_quiz.description,
      v_quiz.pass_percentage, v_quiz.time_limit_minutes, v_quiz.xp_reward,
      v_quiz.is_published, v_quiz.show_answers, v_created_by
    )
    returning id into v_new_quiz_id;

    perform public.clone_quiz_body(v_quiz.id, v_new_quiz_id);
  end loop;

  -- Course-level faculty assignments carry over.
  insert into public.course_faculty (course_id, faculty_id)
  select p_new_course_id, cf.faculty_id
  from public.course_faculty cf
  where cf.course_id = p_source_course_id
  on conflict do nothing;
end;
$$;

-- Supabase grants EXECUTE to anon+authenticated on new functions by default;
-- restrict to authenticated (the functions themselves enforce staff-only).
revoke execute on function public.clone_course(uuid, text) from anon, authenticated, public;
revoke execute on function public.clone_course_content(uuid, uuid) from anon, authenticated, public;
revoke execute on function public.clone_quiz_body(uuid, uuid) from anon, authenticated, public;
grant execute on function public.clone_course(uuid, text), public.clone_course_content(uuid, uuid), public.clone_quiz_body(uuid, uuid) to authenticated;

-- Copies quiz questions + options from one quiz to another, matching by
-- order_index (unique per quiz).
create or replace function public.clone_quiz_body(
  p_from_quiz_id uuid,
  p_to_quiz_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.quiz_questions (quiz_id, question_text, question_type, explanation, order_index, points)
  select p_to_quiz_id, q.question_text, q.question_type, q.explanation, q.order_index, q.points
  from public.quiz_questions q
  where q.quiz_id = p_from_quiz_id
  order by q.order_index;

  insert into public.quiz_options (question_id, option_text, is_correct, order_index)
  select nq.id, o.option_text, o.is_correct, o.order_index
  from public.quiz_questions nq
  join public.quiz_questions oq
    on oq.quiz_id = p_from_quiz_id and oq.order_index = nq.order_index
  join public.quiz_options o on o.question_id = oq.id
  where nq.quiz_id = p_to_quiz_id
  order by nq.order_index, o.order_index;
end;
$$;
