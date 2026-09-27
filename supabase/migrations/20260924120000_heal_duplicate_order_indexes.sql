-- ============================================================================
-- Heal duplicate lesson order_index values inside each chapter.
--
-- Root cause of "lesson won't move up/down" reports: createLesson used
-- count(existing rows) as the next order_index. After any deletion, new
-- lessons reused an index that already existed. Reordering swapped two rows
-- by their (equal) indexes, so the UPDATE matched both rows and nothing moved.
--
-- This migration renumbers every chapter's lessons 0..n-1 preserving the
-- current visible order (order_index, then created_at as tie-breaker, which
-- is the same order the UI shows). It also fixes chapter-level quiz rows that
-- share the same pattern via created_at.
-- ============================================================================

-- Lessons: renumber per chapter, stable order.
with ranked as (
  select id, row_number() over (partition by chapter_id order by order_index, created_at, id) - 1 as new_idx
  from public.lessons
  where chapter_id is not null
)
update public.lessons l
set order_index = r.new_idx
from ranked r
where l.id = r.id and l.order_index is distinct from r.new_idx;

-- Chapters: renumber per course, stable order (same duplicate risk).
with ranked as (
  select id, row_number() over (partition by course_id order by order_index, created_at, id) - 1 as new_idx
  from public.chapters
)
update public.chapters c
set order_index = r.new_idx
from ranked r
where c.id = r.id and c.order_index is distinct from r.new_idx;

-- Chapter-level coding questions: renumber per chapter.
with ranked as (
  select id, row_number() over (partition by chapter_id order by chapter_order_index nulls last, title, id) - 1 as new_idx
  from public.coding_questions
  where chapter_id is not null
)
update public.coding_questions q
set chapter_order_index = r.new_idx
from ranked r
where q.id = r.id and q.chapter_order_index is distinct from r.new_idx;
