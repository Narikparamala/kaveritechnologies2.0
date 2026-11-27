# Practice media — example output video / GIF / image for coding questions

Added 2026-11-24 (`feature/practice-media`). Additive only: no existing
page, RPC, policy, route, or grading flow was changed — only new columns,
one extended read-only RPC, new UI sections, and a seed were added.

## What it does

A faculty member can attach **one example-output media** to any coding
question — an uploaded GIF / image / video, or a YouTube URL — and students
see it in a new **"Example output"** section on the practice page, under
the existing Examples (visible test cases).

- **Faculty** — Question Bank editor, new Section 5 "Example Output
  Media": paste a media URL (YouTube link or file URL; the type is
  auto-detected) or upload a file (GIF, PNG, JPG, WebP, MP4, WebM, up to
  100 MB). Uploads go to the existing public `course-content` bucket
  under `questions/{question id}/...`. A "Example media" badge shows on
  questions that have media in the bank list.
- **Students** — `CodingPracticePage` renders the new section only when
  the question has media: `<video controls>` for uploaded video, `<img>`
  for GIF/image, the existing `VideoEmbed` YouTube player for YouTube
  URLs. Questions without media render exactly as before — nothing new
  appears, no errors.
- **Storage** — three nullable columns on `coding_questions`:
  `example_media_url text`, `example_media_type text` (CHECK in
  `'video' | 'gif' | 'image' | 'youtube'`), `example_media_title text`.
  Existing rows are unaffected (all NULL). Media files are public by URL,
  like lesson resources — acceptable for example output, by design.

## Why the student RPC changed

The student page reads questions only through
`get_student_coding_questions(uuid)` (explicit column list, no
`reference_solution`). The migration therefore `CREATE OR REPLACE`s that
function with the **same signature, grants, filters and ordering**, adding
only the three new columns to its RETURNS TABLE and SELECT. No existing
column was removed, renamed, or reordered.

## "First and Last Digit"

The screenshot's "First and Last Digit — Example Output, 00:45, Unlisted
video" was not in HEAD (no seed, no video section), so the question is
seeded by the migration (guarded — only if no question with slug
`first-and-last-digit` exists) with the **corrected** reference solution:

```python
s = input().strip()
print(s[0])
print(s[-1])
```

The screenshot showed user-typed code `a = int(input()); print(a[0])`,
which raises `TypeError` because `int` is not subscriptable — that was
user-typed editor code, not a stored bug. The seed also adds one visible
test case (input `1456` → output `1` / `6`) and one hidden test case
(input `987` → output `9` / `7`). No media URL is seeded: there is no
video file in the repo to attach; faculty attach one via the new UI.

## Files

- `supabase/migrations/20261124140000_practice_question_media.sql` —
  columns + RPC extension + guarded seed.
- `src/lib/questionMedia.ts` (new) — media-type detection, file
  validation mirroring the bucket whitelist (GIF/PNG/JPG/WebP, MP4/WebM,
  100 MB cap).
- `src/services/fileUpload.ts` — new `uploadQuestionMedia(questionId,
  file)` beside `uploadLessonFile`, same bucket.
- `src/pages/faculty/FacultyQuestionBankPage.tsx` — new Section 5 in the
  editor + media badge in the list. Save stores the three columns.
- `src/pages/student/ExampleOutputMedia.tsx` (new) — the render component.
- `src/pages/student/CodingPracticePage.tsx` — type extended + one
  `<ExampleOutputMedia>` line under Examples. Nothing else touched.

## Staging verification

See AI-WORK-LOG.md entry 2026-11-24 "Practice media for coding
questions". Staging only (`kaveri-academy-staging`,
`vrzydtqcatgkfhifuchk`): migration applied, columns + seed verified,
gif/image + video uploaded through the new helper path and a YouTube URL
set on another question, each confirmed stored and returned by the
student RPC; questions without media unchanged. Nothing applied to prod.

## Follow-ups (not done)

- No video file exists in the repo for First and Last Digit — a faculty
  member still needs to record/upload the 00:45 example-output video (or
  paste its unlisted YouTube URL) via the new editor section.
- Live click-through of the faculty upload + student render in a Vercel
  preview was not possible from this session — needs the owner in the
  morning (see AI-WORK-LOG entry).
- `src/types/database.ts` was NOT hand-edited (per AGENTS.md §10 — it is
  admitted stale; the new columns live in the page/service types, which
  use the untyped client).
