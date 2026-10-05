-- ============================================================
-- Lesson-scoped coding practice (CCBP-style per-lesson steps)
--
-- coding_questions already attach to chapters (chapter_id +
-- chapter_order_index) for end-of-chapter practice. This adds a
-- parallel lesson attachment so faculty can place a "Coding
-- Practice" step BETWEEN lessons: lesson -> quiz/practice -> lesson.
-- The student lesson page stays content-only; the step opens a
-- dedicated question list that leads into the secure Monaco editor.
-- ============================================================

alter table public.coding_questions
  add column if not exists lesson_id uuid references public.lessons(id) on delete cascade,
  add column if not exists lesson_order_index integer;

create index if not exists coding_questions_lesson_id_idx
  on public.coding_questions (lesson_id);

-- Course-wide list of published coding questions with the caller's
-- solve state. Slices into per-lesson / previous-lesson sections in
-- the app. Staff see everything; students must be enrolled.
create or replace function public.get_course_coding_questions(p_course_id uuid)
returns table(
  id uuid,
  title text,
  difficulty text,
  default_marks integer,
  topic text,
  lesson_id uuid,
  lesson_order_index integer,
  chapter_id uuid,
  chapter_order_index integer,
  lesson_title text,
  lesson_order integer,
  chapter_order integer,
  lesson_title_sort text,
  solved boolean,
  attempts_count integer,
  passed_test_cases integer,
  total_test_cases integer
)
language sql
stable
security definer
set search_path to 'public'
as $$
  SELECT
    q.id,
    q.title,
    q.difficulty,
    q.default_marks,
    q.topic,
    q.lesson_id,
    q.lesson_order_index,
    q.chapter_id,
    q.chapter_order_index,
    l.title AS lesson_title,
    l.order_index AS lesson_order,
    ch.order_index AS chapter_order,
    l.title AS lesson_title_sort,
    (a.first_solved_at IS NOT NULL) AS solved,
    COALESCE(a.attempts_count, 0) AS attempts_count,
    COALESCE(a.passed_test_cases, 0) AS passed_test_cases,
    COALESCE(a.total_test_cases, 0) AS total_test_cases
  FROM public.coding_questions q
  LEFT JOIN public.lessons l ON l.id = q.lesson_id
  LEFT JOIN public.chapters ch ON ch.id = q.chapter_id
  LEFT JOIN public.coding_question_attempts a
    ON a.question_id = q.id
   AND a.student_id = auth.uid()
  WHERE (
      (ch.id IS NOT NULL AND ch.course_id = p_course_id AND ch.is_published = true)
      OR
      (q.lesson_id IS NOT NULL AND l.chapter_id IS NOT NULL
       AND EXISTS (
         SELECT 1 FROM public.chapters lc
         WHERE lc.id = l.chapter_id AND lc.course_id = p_course_id AND lc.is_published = true
       ))
    )
    AND q.is_published = true
    AND (
      public.is_kaveri_staff()
      OR public.is_student_enrolled(p_course_id)
    )
  ORDER BY
    ch.order_index NULLS LAST,
    l.order_index NULLS LAST,
    q.lesson_order_index NULLS LAST,
    q.chapter_order_index NULLS LAST,
    q.title ASC;
$$;

revoke execute on function public.get_course_coding_questions(uuid) from anon, public;
grant execute on function public.get_course_coding_questions(uuid) to authenticated;
