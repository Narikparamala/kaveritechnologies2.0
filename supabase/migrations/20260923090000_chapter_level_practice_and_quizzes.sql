-- Chapter-level coding practice & quizzes (CCBP-style course flow).
--
-- Lets a quiz or a coding question belong to a chapter directly, so faculty
-- can build "MCQ Practice" / "Coding Practice" steps inside a chapter, not
-- only inside lessons. Additive: lesson-scoped quizzes and practice keep
-- working unchanged (lesson_id stays authoritative when set).

ALTER TABLE public.quizzes
  ADD COLUMN IF NOT EXISTS chapter_id uuid REFERENCES public.chapters(id) ON DELETE CASCADE;

ALTER TABLE public.coding_questions
  ADD COLUMN IF NOT EXISTS chapter_id uuid REFERENCES public.chapters(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_quizzes_chapter ON public.quizzes(chapter_id) WHERE chapter_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_coding_questions_chapter ON public.coding_questions(chapter_id) WHERE chapter_id IS NOT NULL;
