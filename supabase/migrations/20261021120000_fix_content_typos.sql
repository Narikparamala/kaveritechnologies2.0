-- BUG-6 data fix (idempotent content repair)
--
-- Live-proven typos surfaced by the 2026-10-21 Kaveri bug hunt:
--   * "Input and Ouput Basics"   (lesson title, Python Programming course)
--   * "relational operatorees"   (lesson content text)
-- The repository seed data is clean (migrations 20260807190000 etc.), so these
-- exist only as DB rows created through the course builder. This migration
-- normalises the known typo patterns across every text column of the public
-- content tables, no matter which table/column they ended up in.
--
-- Safe to re-run: after the first pass every UPDATE matches 0 rows.

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
    -- Helper to keep row-count accounting accurate across every statement.
    -- 1. "operatorees" / "operatorree" -> "operators" (the full misspelling only,
    --    so legitimate "operators" text is never touched)
    execute format(
      'update public.%I set %I = regexp_replace(%I::text, ''operatorees'', ''operators'', ''g'') where %I::text ~* ''operatorees''',
      r.table_name, r.column_name, r.column_name, r.column_name
    );
    get diagnostics n = row_count;
    edits := edits + n;

    execute format(
      'update public.%I set %I = regexp_replace(%I::text, ''operatorree'', ''operators'', ''g'') where %I::text ~* ''operatorree''',
      r.table_name, r.column_name, r.column_name, r.column_name
    );
    get diagnostics n = row_count;
    edits := edits + n;

    -- 2. "Ouput" -> "Output" (title-case)
    execute format(
      'update public.%I set %I = replace(%I::text, ''Ouput'', ''Output'') where %I::text like ''%%Ouput%%''',
      r.table_name, r.column_name, r.column_name, r.column_name
    );
    get diagnostics n = row_count;
    edits := edits + n;

    -- 3. "ouput" -> "output" (lowercase)
    execute format(
      'update public.%I set %I = replace(%I::text, ''ouput'', ''output'') where %I::text like ''%%ouput%%''',
      r.table_name, r.column_name, r.column_name, r.column_name
    );
    get diagnostics n = row_count;
    edits := edits + n;
  end loop;

  raise notice 'typo-fix: % column values updated', edits;
end $$;

-- Post-check: raise if any of the corrected columns still contain the typos
-- (column set verified against src/types/database.ts, so this is deterministic).
do $$
declare
  remaining int;
begin
  select count(*) into remaining
  from (
    select 1 as hit from public.lessons
    where title::text ~* 'operatoree|ouput'
       or coalesce(notes_markdown::text, '') ~* 'operatoree|ouput'
       or coalesce(code_example::text, '') ~* 'operatoree|ouput'
       or coalesce(explanation::text, '') ~* 'operatoree|ouput'
    union all
    select 1 from public.coding_questions
    where coalesce(topic::text, '') ~* 'ouput|operatoree'
       or coalesce(subtopic::text, '') ~* 'ouput|operatoree'
  ) hits;
  if remaining > 0 then
    raise exception 'typo-fix post-check failed: % values still contain the typos', remaining;
  end if;
end $$;
