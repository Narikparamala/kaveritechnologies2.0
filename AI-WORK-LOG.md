# AI-WORK-LOG.md — Agent work log (start using this now)

> **Why this file exists:** this project was built over ~100 days
> by many AIs with no log at all. The next agent had to reconstruct
> everything from git history. Do not repeat that.
>
> **Rule: every agent, every task, one entry below — before you
> close the task.** A task without a log entry is not finished.
> Copy the template for each new entry. Newest first.

## Template (copy this)

```markdown
### YYYY-MM-DD — <short title>
- **Agent / tool:** <e.g. Muse, Bolt, Cursor, ChatGPT — name it>
- **Goal (user's words):** <what the user asked for>
- **What I changed:**
  - <file(s) + what changed, in one line each>
  - Migrations added: <filenames, or "none">
  - Edge functions changed: <names, or "none">
  - Secrets/env added: <names only, never values>
- **What I verified:**
  - <commands run + result, e.g. `npm run typecheck` — pass>
  - <manual smoke test + result>
- **What I deliberately did NOT change (and why):**
  - <e.g. did not touch RLS / routes / RPC signatures / grading>
- **Known risks / follow-ups:**
  - <anything the next agent should check>
- **Branch / PR:** <branch name, PR link or "not pushed yet">
```

---

## Reconstructed history (before this log existed)

*Best-effort reconstruction, 2026-11-12. See `AGENTS.md` §7 for detail.*

### 2026-08-02 — Project started in Bolt.new
- **Agent / tool:** Bolt.new (badge `bolt.new/~/sb1-iwdwyk7x` in README)
- **Goal:** Build Kaveri Academy LMS
- **What happened:** Initial Vite + React + Supabase scaffold.
  No agent log was kept.

### 2026-08 — 2026-10 — Main build (196 commits)
- **Agent / tool:** Mostly Bolt (`bolt/continue-secure-grading`,
  PRs #8–#42), plus other unnamed AIs. All commits under the
  human identity Narik Paramala.
- **What was built:** 3 portals, 160 migrations, 29 RPCs,
  12 edge functions, secure grading (go-judge), AI content import,
  notifications outbox, live classes, enrolments, certificates, jobs.
- **What was NOT recorded:** which AI did what, which migrations
  had already run in prod, which fixes were reverted, why
  Infisical / go-judge / Vercel Python runner were chosen.

### 2026-09-03 — Contamination / reset event (no post-mortem)
- **Evidence:** branches `archive/bolt-contaminated-2026-09-03`,
  `handoff/bolt-2026-09-03`,
  `archive/main-before-lms-normalization-2026-09-03`,
  `snapshot/pre-reset`.
- **Follow-up for the next agent:** if you find duplicated or
  contradictory code from this period, verify against live DB
  behaviour before assuming it is intentional.

### 2026-10-21 / 2026-10-27 — Open bugs filed
- **#43:** Admin Create Course bypasses `create_faculty_course` RPC.
- **#44:** Faculty lesson checklist hardcodes `done={false}`.
- Both confirmed in code on 2026-11-12. Still open at pack creation.

### 2026-10-28 — HEAD `9054751` (WIP checkpoint)
- "wip: save local changes before machine reset (LMS pages,
  services, supabase functions)". Unpolished tip, not a release.

### 2026-11-12 — Handover pack created (Muse)
- **Agent / tool:** Muse
- **Goal (user's words):** "Run the full app, I want to make this
  project very useful, customisable so everybody can reuse it …
  when some user use this project and assign a goal to his agent
  and agent have to get full understanding of whole project …
  without changing or modifying anything any feature just upgrading,
  updating add new features … people can rename for their own company"
- **What I changed:**
  - Created this pack (not yet copied into the repo — see below):
    `AGENTS.md`, `ARCHITECTURE.md`, `REBRAND-GUIDE.md`,
    `FRESH-SETUP.md`, `AI-WORK-LOG.md` (this file)
  - Research audit saved as `kaveri-research-audit.md`
  - Migrations added: none. Edge functions changed: none.
    App code changed: none.
- **What I verified:**
  - Fresh clone at HEAD `9054751`, `git status` clean
  - `npm ci` — 588 packages, 25 s, exit 0
  - `npm run build` — pass, 1 m 27 s, dist 16 MB
  - `npm run typecheck` — zero errors
  - `npm run dev:plain` — HTTP 200, correct title; dummy
    Supabase keys fail as expected (shell renders, no data)
  - Supabase read-only: org `kaveritechnologies`, project
    `atcncxckuokjarsxckwy`, 110 tables, 3,045 rows, all RLS on
  - GitHub issues #43 / #44 confirmed in code
- **What I deliberately did NOT change (and why):**
  - No repo code, no migrations, no pushes — user approval
    needed before the pack is copied into the repo / PR'd
  - No real secrets used; dummy env values only for the run
- **Known risks / follow-ups:**
  - Copy this pack into the repo root (`AGENTS.md`,
    `ARCHITECTURE.md`, etc.) via a PR, or it will not be
    found by the next agent
  - Fix #43 / #44 as separate PRs
  - `lms-stable` vs `main` branch model is still undocumented
  - Vercel API access still 403 for team
    `narikparamalas-projects` after reconnect (live site is fine)
- **Branch / PR:** `docs/handover-pack`, PR #45 — https://github.com/Narikparamala/kaveritechnologies2.0/pull/45, commit 3a3be6f546fc8f4df7c386eb126f112313edea08

---

### 2026-11-14 — Quiz-submit gate merged (PR #50)
- **Agent / tool:** Muse
- **Goal (user's words):** "complete your incomplete work" — merge the
  quiz-submit-gate PR whose staging smoke tests had passed
- **What I changed:**
  - `supabase/migrations/20261112140000_quiz_submit_lesson_completion_gate.sql`
    — redefines `submit_quiz_attempt` with the same lesson-completion
    check as PR #46's fetch gate (same `lesson_progress.completed`
    check, same exceptions for course-level quizzes and the quiz that
    IS its own lesson's gate activity, same error
    `Complete the lesson to unlock this quiz.`). No signature,
    return-shape, or XP-rule change. `CREATE OR REPLACE` preserves grants.
  - Migrations added: the one above. Edge functions changed: none.
  - Secrets/env added: none.
- **What I verified:**
  - `npm run typecheck` pass, `npm run lint` 0 errors / 581 warnings
    (baseline), `npm run build` pass (2026-11-13)
  - Staging: migration applied (165/165), all 4 smoke tests PASS —
    uncompleted-lesson submit rejected, completed-lesson submit passes
    with XP 10 exactly once, gate-quiz and course-level quiz submit
  - Merged 2026-11-14, merge commit
    `b4022bb59976831308fd951632b8bd31cecac674`; Vercel auto-deploys
    from `main`
  - Vercel team access restored the same morning: user disconnected
    and reconnected Vercel after granting access, `list_projects`
    now returns `kaveri-academy` and the team; production deployment
    verified READY at merged main `52640035`
- **What I deliberately did NOT change (and why):**
  - No other RPC, RLS policy, route, or grading rule touched
  - Migration NOT applied to production — needs backup + explicit go
- **Known risks / follow-ups:**
  - Apply `20261112140000` (and the other pending migrations) to prod
    only after a backup, in filename order
  - `AI-WORK-LOG.md` entries for PRs #46/#47/#49 were added in the
    same session, in a separate docs PR
- **Branch / PR:** `fix/quiz-submit-gate`, PR #50 — https://github.com/Narikparamala/kaveritechnologies2.0/pull/50

### 2026-11-12 — Cashfree sandbox payments (PR #49)
- **Agent / tool:** Muse
- **Goal (user's words):** faculty create courses but there is no way
  to accept payments; free India payments first (Cashfree, PhonePe,
  BharatUPI), Stripe/international later
- **What I changed:**
  - `supabase/migrations/20261112150000_cashfree_payments.sql` —
    `payment_orders` + `payment_transactions` tables (gateway-agnostic;
    RLS: students see only their own orders), `grant_paid_enrollment`
    RPC (SECURITY DEFINER, idempotent), `create_faculty_course`
    redefined only to accept `price`, `courses.price >= 0` guard
  - New edge function `supabase/functions/cashfree-payments/index.ts`
    — `create-order` (price read server-side, never from client) +
    webhook (HMAC-SHA256 verify + server-side re-verification,
    idempotent on `cf_payment_id`); fail-closed 503 when unconfigured
  - `src/lib/payments.ts` — reusable seam (provider/currency from env,
    INR default); price fields in CourseBuilder / FacultyCourses /
    AdminCourses; "Pay now" on CourseDetailPage for approval-required
    courses with price > 0
  - Secrets/env added: names only — `CASHFREE_TEST_APP_ID`,
    `CASHFREE_TEST_SECRET_KEY` (test values NOT yet set anywhere)
- **What I verified:**
  - `npm run typecheck` pass, `npm run lint` 0 errors, `npm run build` pass
  - Staging (2026-11-13): migration applied; edge function deployed
    (ACTIVE v1); live probe returns 503 CONFIGURATION_ERROR as designed
    (no secret set); `grant_paid_enrollment` idempotent
    (paid→enrolled, replay→already_enrolled, pending→ORDER_NOT_PAID)
  - Test API key pair exists on the user's pre-existing Cashfree
    merchant account ("Kaveri Academy", Test Environment); secret can
    be viewed again from the dashboard API Keys page
- **What I deliberately did NOT change (and why):**
  - Free-enrol path and manual PhonePe-reference flow untouched
  - `enrollments_insert_hardened` RLS policy untouched — price only
    affects `approval_required` courses
  - Single academy account; no automatic faculty split at checkout
    (faculty share paid later, percentage undecided)
  - No production activation, no KYC, nothing registered as
    "Kaveri Technologies Pvt Ltd" (user resigned; new entity TBD)
- **Known risks / follow-ups:**
  - Still needed: reveal test secret into staging function secrets
    (Secure Vault only, never chat), whitelist test domain in
    Cashfree dashboard, sandbox end-to-end payment test
  - `src/types/database.ts` still lacks `'paid_gateway'` in the
    `enrollment_source` union — regen with `supabase gen types`,
    do not hand-edit
  - Migration + edge function NOT on prod; AGENTS.md §11 still says
    "No payments" — now stale, update it
- **Branch / PR:** `feat/payments-cashfree-v2`, PR #49 — https://github.com/Narikparamala/kaveritechnologies2.0/pull/49, merge `52640035`; supersedes closed PR #48 (`feat/payments-cashfree`)

### 2026-11-12 — Discrepancy round 2 (PR #47)
- **Agent / tool:** Muse
- **Goal (user's words):** "solve it" — fix the discrepancies found in
  the admin smoke test (dashboard count, typos, duplicate questions)
- **What I changed:**
  - Dashboard user count fixed in code (was students+faculty=22,
    now +super_admin=23; verified by live SQL)
  - Draft migration `20261112130000_fix_operatro_typo.sql` — fixes
    "operatro" (the other two typos were already covered by existing
    unapplied migration `20261021120000`)
  - Draft migration `20261112130100_deduplicate_coding_questions.sql`
    — unpublishes (never deletes) 9 duplicate rows from the
    double-import; keeps distinct variants for the content team;
    adds a partial unique index
  - Migrations added: the two above. Edge functions changed: none.
- **What I verified:**
  - `npm run typecheck` pass, `npm run lint` 0 errors, `npm run build` pass
  - Rebased onto merged main after PR #46 (1 trivial conflict in
    `context.ts`, kept main's version), re-verified, re-pushed
  - Staging (2026-11-13): both migrations applied; 0 rows with
    'operatro'
- **What I deliberately did NOT change (and why):**
  - No rows deleted — unpublish only, content team decides
  - Python Fundamentals missing from faculty preview is NOT a bug
    (it has a `course_faculty` row for Preview Student; preview
    correctly scopes to the viewer's courses)
  - Recordings are a content gap (0/100 lessons have `video_url`),
    not a code bug — no code change
- **Known risks / follow-ups:**
  - Draft migrations NOT applied to prod — staging + backup first
  - Content decisions still open: upload recordings for the 6
    completed sessions, and assign Python Fundamentals to a real
    faculty member or delete it as a test course
- **Branch / PR:** `fix/discrepancy-round-2`, PR #47 — https://github.com/Narikparamala/kaveritechnologies2.0/pull/47, merge `2db897ec`

### 2026-11-12 — Health P1 fixes (PR #46)
- **Agent / tool:** Muse
- **Goal (user's words):** "solve all" — fix the P1s from the health audit
- **What I changed:**
  - Issue #43: `AdminCoursesPage.handleCreate` now calls the
    `create_faculty_course` RPC instead of a direct insert, so the
    course gets its `course_faculty` row and appears in Faculty portal
  - Issue #44: lesson Content Checklist computed lazily via
    `getLessonTopics` / `getLessonMaterials` / `getLessonLiveSessions`
    instead of hardcoded `done={false}`
  - Quiz lesson-lock: `QuizzesPage` `practiceMode` requires a staff
    role; new migration `20261112120000_quiz_lesson_completion_gate.sql`
    adds a lesson-completion check to `get_quiz_questions_for_student`
  - `togglePublish` now checks `error` instead of toasting success
    unconditionally; `CourseBuilderPage` chapter-practice swap errors
    captured/thrown
  - Preview guard: `scripts/check-preview-role.mjs` wired into
    `npm run build` only; `.env.example` warns never in production
  - Demo wiring: 14 faculty + 18 admin demo routes wired in `src/App.tsx`
  - Lint error fixed (`let scopedLessonId` → `const` in
    `supabase/functions/_shared/ai/context.ts`)
  - Migrations added: `20261112120000_quiz_lesson_completion_gate.sql`.
    Edge functions changed: none (shared helper only).
- **What I verified:**
  - `npm run typecheck` pass, `npm run lint` 0 errors / 581 warnings
    (baseline), `npm run build` pass
  - Staging (2026-11-13): migration applied; fetch gate verified live
- **What I deliberately did NOT change (and why):**
  - Did not touch RLS policies, RPC signatures (except the fetch-gate
    check inside `get_quiz_questions_for_student`), routes, or grading
  - Same unchecked-swap pattern NOT fixed at
    `LessonEditorTabs.tsx:711-712` and `CourseBuilderPage.tsx:1470-1471`
  - `submit_quiz_attempt` still used the availability-only gate —
    follow-up, fixed by PR #50
- **Known risks / follow-ups:**
  - Chapter-practice swap: a failed second update can leave the first
    half applied — true atomicity needs an RPC
  - Migration NOT applied to prod (staging only)
- **Branch / PR:** `fix/health-p1-bugs`, PR #46 — https://github.com/Narikparamala/kaveritechnologies2.0/pull/46, merge `6fbb415b`

## New entries go above this line (newest first)
