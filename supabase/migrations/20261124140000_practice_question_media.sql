-- =====================================================================
-- Practice media for coding questions (feature/practice-media, 2026-11-24)
-- =====================================================================
-- ADDITIVE ONLY. No existing column, row, policy, or RPC behaviour is
-- changed; only new nullable columns are added and one read-only RPC is
-- extended with those same new columns.
--
-- Context (audit 2026-11-24 §D): coding_questions had no media column and
-- CodingPracticePage had no "Example output" section. The screenshot's
-- "First and Last Digit — Example Output, 00:45, Unlisted video" is not
-- in HEAD, so this feature re-creates it: faculty attach one example
-- output media per question (uploaded gif/image/video in the existing
-- public course-content bucket, or a YouTube URL), students see it in a
-- new "Example output" section under Examples.
--
-- 1. Three nullable columns on coding_questions. Existing rows are
--    unaffected (all NULL = no section shown for students).
-- 2. get_student_coding_questions is CREATE OR REPLACE'd with the SAME
--    signature, grants, filters and ordering — the three new columns are
--    appended to its RETURNS TABLE and SELECT. This is required: the
--    student page reads questions only through this RPC (explicit column
--    list), so without this the media would never reach students. No
--    existing column is removed, renamed, or reordered.
-- 3. Seed "First and Last Digit" (guarded: only if no question with that
--    slug exists) with the CORRECTED reference solution — the screenshot
--    showed user-typed code `a = int(input()); print(a[0])`, which raises
--    TypeError because int is not subscriptable. Correct solution reads
--    the input as a string: s = input().strip(); print(s[0]); print(s[-1]).
--    One visible test case (1456 -> 1 / 6) and one hidden test case
--    (987 -> 9 / 7). No media URL is seeded: there is no video file in
--    the repo to attach; faculty attach one via the new UI.
--
-- Verification after applying (staging first):
--   1. information_schema: the three columns exist on coding_questions.
--   2. select count(*) from coding_questions where title =
--      'First and Last Digit' = 1; reference_solution starts with
--      's = input().strip()'; 2 test cases, 1 visible + 1 hidden.
--   3. select * from get_student_coding_questions(...) returns the new
--      columns (NULL for questions without media).
-- =====================================================================

alter table public.coding_questions
  add column if not exists example_media_url text,
  add column if not exists example_media_type text
    check (example_media_type in ('video', 'gif', 'image', 'youtube')),
  add column if not exists example_media_title text;

-- Student-facing read: same function, same contract, plus the 3 columns.
-- Copied verbatim from 20260903110000_judge0_multilanguage_workspace.sql
-- (the latest definition); only the RETURNS TABLE / SELECT gain columns.
-- CREATE OR REPLACE cannot change a return type (42P13), so the function
-- is dropped first and recreated identically apart from the new columns.
drop function if exists public.get_student_coding_questions(uuid);

create or replace function public.get_student_coding_questions(
  p_question_id uuid default null
)
returns table (
  id uuid,
  title text,
  slug text,
  problem_statement text,
  instructions text,
  input_format text,
  output_format text,
  constraints_text text,
  starter_code text,
  explanation text,
  hints text[],
  difficulty text,
  topic text,
  subtopic text,
  tags text[],
  company_tags text[],
  frequency_score integer,
  language text,
  default_marks integer,
  is_published boolean,
  example_media_url text,
  example_media_type text,
  example_media_title text
)
language sql
security definer
set search_path = ''
stable
as $$
  select
    q.id, q.title, q.slug, q.problem_statement, q.instructions,
    q.input_format, q.output_format, q.constraints_text, q.starter_code,
    q.explanation, q.hints, q.difficulty, q.topic, q.subtopic,
    q.tags, q.company_tags, q.frequency_score, q.language,
    q.default_marks, q.is_published,
    q.example_media_url, q.example_media_type, q.example_media_title
  from public.coding_questions q
  where auth.uid() is not null
    and q.is_published = true
    and (p_question_id is null or q.id = p_question_id)
  order by q.frequency_score desc, q.title asc;
$$;

revoke all on function public.get_student_coding_questions(uuid) from public;
revoke all on function public.get_student_coding_questions(uuid) from anon;
grant execute on function public.get_student_coding_questions(uuid) to authenticated;

-- Seed "First and Last Digit" — only if no question with this slug exists.
-- Deterministic ids follow the Aug 7 seed series (questions 21000000-...-0006,
-- test cases 31000000-...-0011/0012). is_published = true, like the other seeds.
insert into public.coding_questions (
  id, title, slug, problem_statement, input_format, output_format,
  constraints_text, starter_code, reference_solution, explanation, hints,
  difficulty, topic, subtopic, tags, company_tags, frequency_score,
  default_marks, source_type, is_published, created_by
)
select
  '21000000-0000-0000-0000-000000000006',
  'First and Last Digit',
  'first-and-last-digit',
  'Given a number as a string of digits, print its first digit on the first line and its last digit on the second line.',
  'A single line containing the number (a string of digits, no spaces).',
  'Print the first digit on the first line and the last digit on the second line.',
  '1 <= length of the number <= 1000. The number contains digits only.',
  E's = input()\n# Write your code below',
  E's = input().strip()\nprint(s[0])\nprint(s[-1])',
  'Read the input as a string (not an int — int is not subscriptable, so a[0] on an int raises TypeError). The first character is the first digit and the last character is the last digit.',
  array['Read the input as a string, not as an integer.', 'The first character s[0] is the first digit; s[-1] is the last digit.'],
  'easy', 'Strings', 'Indexing',
  array['strings', 'indexing'],
  array['TCS', 'Infosys', 'Wipro'], 85,
  10, 'original', true,
  null
where not exists (
  select 1 from public.coding_questions where slug = 'first-and-last-digit'
);

insert into public.coding_question_test_cases (
  id, question_id, input_data, expected_output, is_hidden, weight, order_index
)
select
  '31000000-0000-0000-0000-000000000011',
  q.id, '1456', E'1\n6', false, 1, 0
from public.coding_questions q
where q.slug = 'first-and-last-digit'
  and not exists (
    select 1 from public.coding_question_test_cases
    where id = '31000000-0000-0000-0000-000000000011'
  );

insert into public.coding_question_test_cases (
  id, question_id, input_data, expected_output, is_hidden, weight, order_index
)
select
  '31000000-0000-0000-0000-000000000012',
  q.id, '987', E'9\n7', true, 1, 1
from public.coding_questions q
where q.slug = 'first-and-last-digit'
  and not exists (
    select 1 from public.coding_question_test_cases
    where id = '31000000-0000-0000-0000-000000000012'
  );
