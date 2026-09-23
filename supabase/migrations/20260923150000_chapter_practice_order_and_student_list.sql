-- Chapter coding-practice ordering + student-facing chapter question list.
--
-- Follow-up to 20260923090000: chapters hold coding practice steps, so
-- faculty need per-chapter ordering and students need a chapter-scoped,
-- enrollment-gated read (coding_questions RLS is staff-only by design;
-- students read through RPCs).

ALTER TABLE public.coding_questions
  ADD COLUMN IF NOT EXISTS chapter_order_index integer;

CREATE INDEX IF NOT EXISTS idx_coding_questions_chapter_order
  ON public.coding_questions(chapter_id, chapter_order_index)
  WHERE chapter_id IS NOT NULL;

-- Chapter's coding questions for students: requires the caller to be staff
-- or actively enrolled in the chapter's course. Mirrors the access model of
-- get_student_coding_questions (published only, no reference_solution).
CREATE OR REPLACE FUNCTION public.get_chapter_coding_questions(p_chapter_id uuid)
RETURNS TABLE (
  id uuid,
  title text,
  difficulty text,
  default_marks integer,
  chapter_order_index integer,
  topic text
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT q.id, q.title, q.difficulty, q.default_marks, q.chapter_order_index, q.topic
  FROM public.coding_questions q
  JOIN public.chapters ch ON ch.id = q.chapter_id
  WHERE q.chapter_id = p_chapter_id
    AND q.is_published = true
    AND (
      public.is_kaveri_staff()
      OR public.is_student_enrolled(ch.course_id)
    )
  ORDER BY q.chapter_order_index NULLS LAST, q.title ASC;
$$;

REVOKE ALL ON FUNCTION public.get_chapter_coding_questions(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.get_chapter_coding_questions(uuid) TO authenticated;
