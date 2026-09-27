# Content Import — Faculty Guide

Bulk-create coding questions, quizzes, and lessons from one CSV instead of
adding rows one by one. Found in the Faculty and Admin portals under
**Content Import**.

Every coding question is **auto-validated by execution**: the platform runs
your reference solution against your test cases through the secure grading
runner *before* import. A question with wrong tests is refused with the real
output shown — broken questions cannot reach students.

---

## 1. The three tabs

| Tab | What one CSV produces | Imported as |
|---|---|---|
| **Coding Questions** | A full question bank, each question execution-validated | Published or draft (your `publish` column) |
| **Quizzes** | MCQ / true-false / short-answer quizzes, grouped by `quiz_title` | Always **drafts** — you review then publish |
| **Lessons + Slides** | Chapters, lessons, Canva/YouTube slide materials | Published or draft; Canva short links are resolved server-side, students never see raw links |

Download the matching **Template** button on each tab, fill it, then
**Validate & preview** (questions) or **Import** (quizzes/lessons).

---

## 2. Questions CSV — column reference

One row = one question. ✅ = required.

| Column | Req | Notes |
|---|---|---|
| `title` | ✅ | Question name, e.g. `Largest of Three Numbers` |
| `topic` | | Syllabus unit — `Python Basics`, `Loops`, `Functions`… groups the bank |
| `subtopic` | | Finer grain — `if-else`, `for-loop`, `slicing` |
| `difficulty` | | exactly `easy` / `medium` / `hard` |
| `marks` | | Default 10 |
| `publish` | | `yes` = live for students, `no` = draft |
| `problem_statement` | ✅ | The full text students read |
| `input_format` | | e.g. `Three lines, each one integer` |
| `output_format` | | e.g. `One integer` |
| `starter_code` | | What students start from (comments are fine) |
| `reference_solution` | ✅ | **Your** working Python — it gets executed! |
| `explanation` | | Shown after students solve it |
| `hints` | | Separated by `\|` → `Compare pairs first\|max() shortcut` |
| `test_input_1..10` | ✅ (1 min) | stdin for test N — **one line per `input()` call** |
| `test_expected_1..10` | ✅ | **Exactly** what `print()` must output |
| `test_hidden_1..10` | | `no` for test 1 (the sample students see), `yes` for hidden tests |
| `test_weight_1..10` | | Score weight, default 1 |

You can define up to 10 tests per question (`test_input_3` … `test_input_10`
etc.). Recommended: 1 visible + 1–2 hidden.

---

## 3. The six rules (they prevent every common error)

1. **Any cell containing code, commas, or multiple lines → wrap it in double
   quotes.** Reference solutions and multiline test inputs always need quotes.
2. **`test_expected` = raw print output.** No `Output:` label, no prompt text.
   Two printed lines = two lines inside the quoted cell.
3. **`test_input` = one line per `input()` call.** Count the `input()` calls
   in your solution — that is how many lines the test cell needs.
4. **Never use prompts.** `input("Enter num: ")` prints the prompt and breaks
   output matching. Always plain `input()`.
5. **Test 1 visible, tests 2+ hidden.** Students only ever see test 1.
6. **Trust the validator.** A refused row shows the actual output your
   solution produced. Usually your `test_expected` cell was wrong, not the
   code — fix the expected cell and re-validate.

---

## 4. Verified working example

This exact CSV was imported end-to-end through the real validator: both rows
passed 2/2 tests by execution, landed in the database with 2 tests each
(1 hidden), and were then removed. Copy it, import it, then replace the rows
with your own.

```csv
title,topic,subtopic,difficulty,marks,publish,problem_statement,input_format,output_format,starter_code,reference_solution,explanation,hints,test_input_1,test_expected_1,test_hidden_1,test_weight_1,test_input_2,test_expected_2,test_hidden_2,test_weight_2
"Largest of Three Numbers","Conditionals","if-else","easy",10,yes,"Read three integers, one per line, and print the largest.","Three lines, each one integer","One integer",,"a = int(input())
b = int(input())
c = int(input())
print(max(a, b, c))","max() compares all three at once","Compare two first|max() does it in one go","4
9
2","9","no",1,"-1
-7
-3","-1","yes",1
"Even or Odd","Conditionals","modulo","easy",10,yes,"Read one integer and print Even or Odd.","One integer","Even or Odd",,"n = int(input())
print(""Even"" if n % 2 == 0 else ""Odd"")","Modulo 2 checks divisibility","What does % return?","7","Odd","no",1,"0","Even","yes",1
```

Things this example demonstrates:

- **Multiline quoted cells** — `reference_solution` and `test_input_1` span
  real newlines inside the quotes. In a text editor, just type them across
  lines. Row 1's test input is three lines because the solution calls
  `input()` three times.
- **Escaped quotes** — `""Even""` is how a double quote appears *inside* a
  quoted cell.
- **One-line input for one-line solutions** — row 2 has single-value test
  cells (`"7"`) because its solution calls `input()` once.
- **Negative numbers** — no special handling, just `"-1\n-7\n-3"` as three
  literal lines in the quoted cell.

---

## 5. Quizzes CSV — quick reference

| Column | Req | Notes |
|---|---|---|
| `quiz_title` | ✅ | Rows with the same title join the same quiz |
| `question_text` | ✅ | |
| `question_type` | | `mcq` / `true_false` / `short_answer` |
| `option_a..d` | mcq | At least two options; `short_answer` puts the answer in `option_a` (graded case-insensitively) |
| `correct_option` | | `a`/`b`/`c`/`d` for MCQ; for `true_false`, `a` = True |
| `explanation` | | Shown after the quiz |
| `points` | | Default 1 |

Example row:

```csv
quiz_title,question_text,question_type,option_a,option_b,option_c,option_d,correct_option,explanation,points
"Python Basics Check","What does print() do?","mcq","Prints to the screen","Deletes a file","Saves a file","Restarts Python",a,"Basic output function",1
```

---

## 6. Lessons + Slides CSV — quick reference

| Column | Notes |
|---|---|
| `chapter` / `chapter_order` | Chapter title and position; chapters are created or reused by title |
| `lesson_title` / `lesson_order` | ✅ title required |
| `canva_link` | Canva share or short link — resolved to the secure embed form automatically |
| `youtube_link` | Any YouTube URL form — normalized to an embed |
| `notes_markdown` | Lesson notes |
| `duration_minutes` | Default 10 |
| `teaching_mode` | `recorded_video` or `live_class` |
| `publish` | `yes` / `no` |

Example row:

```csv
chapter,chapter_order,lesson_title,lesson_order,canva_link,youtube_link,notes_markdown,duration_minutes,teaching_mode,publish
"Week 1: Variables",1,What is a Variable,1,,https://www.youtube.com/watch?v=rfscVS0vtbw,"A variable is a named box for a value",15,recorded_video,yes
```

> **Faculty scoping:** you can import into courses you are assigned to. If
> chapter creation fails with a permissions error, ask your admin to assign
> you to the course (Course Assignments page).

**Student safety note:** slide/video links are stored as embed URLs —
students watch lessons inside the platform and never see a copyable Canva or
YouTube link.

---

## 7. The easy way: Google Sheets workflow

1. Download the **Template** for your tab → open in Google Sheets
   (File → Import).
2. Fill one row per item. For multi-line code or test input, press
   **Ctrl+Enter** inside the cell to add a newline.
3. File → Download → **Comma-separated values (.csv)** — Sheets adds all
   quoting and escaping for you.
4. Content Import → **Upload file** (or paste) → **Validate & preview** →
   **Import N validated questions**.

Excel works the same way with **Alt+Enter** for newlines.

---

## 8. Reading validation results

| Result | Meaning | Action |
|---|---|---|
| ✅ `2/2 tests passed by execution` | Solution ran and output matched | Import |
| ❌ `Test failed (accepted). Got: 10` | Clean run but output ≠ expected | Fix the `test_expected` cell |
| ❌ `Test failed (runtime_error) … Traceback` | Solution crashed on that input | Fix code or fix the test input (missing lines?) |
| ❌ `Missing reference_solution` | Cannot auto-validate | Add your working code |

Refused rows stay behind after import so you can fix just those and re-run.

---

*Last verified against production: 2026-09-21 (both example rows validated
2/2 and imported successfully).*
