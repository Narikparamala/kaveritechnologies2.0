-- ============================================================================
-- DRAFT / NOT APPLIED — deduplicate coding_questions (read the notes first)
-- ----------------------------------------------------------------------------
-- Apply on staging first, verify the practice list, then production, with
-- a backup. Nothing in this file DELETES a row: duplicates are hidden by
-- setting is_published = false, so attempts, test cases and history stay
-- in the database and any row can be re-published. This is deliberate:
-- several duplicate copies already have student attempts on them.
--
-- EVIDENCE (read-only SELECTs, live DB, 2026-11-12):
--   * 90 coding_questions; 11 titles appear more than once (23 rows).
--   * The practice list comes from get_student_coding_questions(), which
--     returns every is_published question with no dedupe — so every
--     duplicate row shows up twice (or three times) in the UI. This is a
--     DATA problem, not a rendering fan-out: no join in the page can
--     multiply rows, the RPC selects from coding_questions directly.
--   * Origin: the Aug 7 seed rows (ids 21000000-0000-...) were re-imported
--     by later content imports — a systematic double-import on 2026-09-22
--     (pairs created ~4 seconds apart) and AI-generated imports on
--     2026-10-17 / 2026-10-27.
--
-- WHY "keep the earliest per title" was NOT used literally:
--   Some same-title copies are DIFFERENT variants, not duplicates — they
--   have different chapter_id / lesson_id, different problem statements,
--   different test cases, and real student attempts:
--     - "Add Two Numbers": seed copy (unlinked, 2 test cases, 3 attempts)
--       vs 2026-10-27 copy linked to a chapter+lesson (0 test cases,
--       0 attempts) — see section 2.
--     - "Even or Odd", "Count Vowels", "Reverse the Digits": seed copy
--       vs a later copy linked to a different lesson, each with attempts.
--       Both copies are in use; hiding the later one would remove work
--       students already did. LEFT ALONE — content team to decide whether
--       these are intentional variants (different lessons) or not.
--   Section 1 below therefore unpublishes only TRUE duplicates: same
--   title AND same chapter_id AND same lesson_id. For each, the earliest
--   created copy stays published; the later copy is hidden.
--
-- SECTION 1 — true duplicates (7 rows hidden, 7 kept):
--   1. "Access Second Element"  hide f72acd13-df27-4910-b830-8a2e4ec2326b
--      (2026-09-22, 3 test cases, 1 attempt) — keep 753202a0-569c-4b78-a7af-e92af1217f76
--      (same day, 4 seconds earlier, identical problem statement).
--   2. "List Concatenation"     hide 65427c06-7168-4fe5-b372-446f6d4df709
--      keep d1354281-2e09-45ec-a7c5-0b15238cffe6 (both 3 test cases, 1 attempt).
--   3. "List Extended Slicing"  hide 4ed083e1-261e-42bd-bd2e-8fbe423d11ce
--      keep 56425f9e-67d2-4b19-8804-97c683dd71cf (both 3 test cases, 1 attempt).
--   4. "List Repetition"        hide 22d1da8b-69d5-430e-a4cf-c2303da99efb
--      keep b90bc719-457d-465e-9ed6-805408cd9794 (both 3 test cases, 1 attempt).
--   5. "String to Character List" hide 1bedb2f9-707e-4dc1-b50a-2cd277dee562
--      keep 4a881fa5-d79d-49ab-973c-3d09321a85a0 (both 3 test cases, 1 attempt).
--   6. "Update List Element (Mutability)" hide 02d9d65c-655e-4b43-9e62-1023e4f973f2
--      keep 75beeed3-b2ee-40b0-81b8-395c59b9804b (both 3 test cases, 1 attempt).
--   7. "Reverse a String"       hide ed77dcfa-b6eb-4bb0-a9ef-453bc6dc4df4
--      (2026-10-17, 3 test cases, 0 attempts) — keep 21000000-0000-0000-0000-000000000004
--      (seed, 2 test cases, 2 attempts). The third copy, 044603cf-bebe-4fa8-a170-0837cd011c1d,
--      is linked to a chapter+lesson and is handled in section 2, not here.
--
-- SECTION 2 — ungradeable copies (2 rows hidden, content decision):
--   8. "Add Two Numbers"        hide 982e4183-13c9-4f89-9fc1-a1fb262c42b0
--      (2026-10-27, chapter+lesson linked, 0 test cases, 0 attempts).
--   9. "Reverse a String"       hide 044603cf-bebe-4fa8-a170-0837cd011c1d
--      (2026-10-27, chapter+lesson linked, 0 test cases, 0 attempts).
--   With 0 test cases secure grading cannot grade these — a student opening
--   one gets a question that can never pass. If the content team would
--   rather ADD test cases to these two and re-publish them, delete this
--   section before applying and add the test cases instead.
--
-- SECTION 3 — prevention: a partial unique index so two PUBLISHED rows can
--   never again share (title, chapter_id, lesson_id). Same title in a
--   different chapter/lesson is still allowed; unpublished rows are exempt.
--   (Postgres 15+ NULLS NOT DISTINCT treats two NULL link columns as equal,
--   which is exactly the Sep 22 double-import shape.)
-- ============================================================================

-- Section 1 + 2: hide (do not delete) the 9 duplicate / ungradeable rows.
-- Explicit ids on purpose: the reviewer can verify each one against the
-- evidence above. Idempotent: only rows still published are touched.
update public.coding_questions
set is_published = false
where id in (
  'f72acd13-df27-4910-b830-8a2e4ec2326b', -- Access Second Element (dup)
  '65427c06-7168-4fe5-b372-446f6d4df709', -- List Concatenation (dup)
  '4ed083e1-261e-42bd-bd2e-8fbe423d11ce', -- List Extended Slicing (dup)
  '22d1da8b-69d5-430e-a4cf-c2303da99efb', -- List Repetition (dup)
  '1bedb2f9-707e-4dc1-b50a-2cd277dee562', -- String to Character List (dup)
  '02d9d65c-655e-4b43-9e62-1023e4f973f2', -- Update List Element (dup)
  'ed77dcfa-b6eb-4bb0-a9ef-453bc6dc4df4', -- Reverse a String (dup)
  '982e4183-13c9-4f89-9fc1-a1fb262c42b0', -- Add Two Numbers (0 test cases)
  '044603cf-bebe-4fa8-a170-0837cd011c1d'  -- Reverse a String (0 test cases)
)
and is_published = true;

-- Post-check: no published duplicate (title, chapter, lesson) may remain.
do $$
declare
  remaining int;
begin
  select count(*) into remaining
  from (
    select 1
    from public.coding_questions
    where is_published = true
    group by title, chapter_id, lesson_id
    having count(*) > 1
  ) dupes;
  if remaining > 0 then
    raise exception 'coding-question dedupe post-check failed: % duplicate keys still published', remaining;
  end if;
end $$;

-- Section 3: prevent recurrence (published rows only).
create unique index if not exists coding_questions_published_title_link_key
  on public.coding_questions (lower(title), chapter_id, lesson_id)
  nulls not distinct
  where is_published;
