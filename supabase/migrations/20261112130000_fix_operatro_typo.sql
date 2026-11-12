-- ============================================================================
-- Typo fix, follow-up to 20261021120000_fix_content_typos.sql (NOT APPLIED)
-- ----------------------------------------------------------------------------
-- DRAFT / NOT APPLIED — apply on staging first, then production, with a
-- backup. Do not edit 20261021120000; that file is history.
--
-- The 2026-11-12 admin smoke test found a third live typo that the earlier
-- migration does NOT cover:
--   * "find relation operatro" — quizzes.title, id
--     c6eaee5d-e2a7-4504-9da7-b11fd9370bce (Python Fundamentals course,
--     created 2026-08-08, seed era)
-- "operatro" is "operator" with the last two letters transposed
-- (o-p-e-r-a-t-r-o). It is NOT a substring of the correct word "operator"
-- (o-p-e-r-a-t-o-r), so a plain replace can never touch legitimate text.
--
-- Already covered by 20261021120000 (apply that file first — it is still
-- unapplied on live as of 2026-11-12):
--   * "relational operatorees" -> "operators"
--   * "Input and Ouput Basics" -> "Input and Output Basics"
--     (lessons.title, id ee446122-e939-418d-8014-0c8c9e07cf17)
--
-- The repo seed data is clean (no "operatro" in src/, scripts/ or any
-- migration), so this typo exists only as a DB row created through the
-- course/quiz builder. Nothing in code reintroduces it.
--
-- Safe to re-run: after the first pass every UPDATE matches 0 rows.
-- ============================================================================

do $$
declare
  r         record;
  n         int := 0;
  edits     int := 0;
begin
  for r in
    select col.table_schema, col.table_name, col.column_name
    from information_schema.columns col
    where col.table_schema = 'public'
      and col.data_type in ('text', 'character varying')
      and col.table_name in (
        'courses', 'chapters', 'lessons', 'quizzes', 'quiz_questions',
        'coding_questions', 'assignments', 'mini_projects', 'lesson_resources'
      )
  loop
    -- "operatro" -> "operator" (lowercase, the live quiz title)
    execute format(
      'update public.%I set %I = replace(%I::text, ''operatro'', ''operator'') where %I::text like ''%%operatro%%''',
      r.table_name, r.column_name, r.column_name, r.column_name
    );
    get diagnostics n = row_count;
    edits := edits + n;

    -- "Operatro" -> "Operator" (title-case, same transposition)
    execute format(
      'update public.%I set %I = replace(%I::text, ''Operatro'', ''Operator'') where %I::text like ''%%Operatro%%''',
      r.table_name, r.column_name, r.column_name, r.column_name
    );
    get diagnostics n = row_count;
    edits := edits + n;
  end loop;

  raise notice 'operatro typo-fix: % column values updated', edits;
end $$;

-- Post-check: raise if the typo survives anywhere in the content tables.
-- (The 20261021120000 post-check only covers lessons + coding_questions,
-- so this one also covers quizzes.title, where the live instance sits.)
do $$
declare
  remaining int;
begin
  select count(*) into remaining
  from (
    select 1 as hit from public.quizzes
    where title::text ~* 'operatro'
    union all
    select 1 from public.lessons
    where title::text ~* 'operatro'
    union all
    select 1 from public.coding_questions
    where title::text ~* 'operatro'
       or coalesce(topic::text, '') ~* 'operatro'
       or coalesce(subtopic::text, '') ~* 'operatro'
  ) hits;
  if remaining > 0 then
    raise exception 'operatro typo-fix post-check failed: % values still contain the typo', remaining;
  end if;
end $$;
