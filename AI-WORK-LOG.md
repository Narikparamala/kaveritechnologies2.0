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

### 2026-11-14 — Multi-gateway payments v2: Razorpay, Stripe, PayPal (settings-driven)
- **Agent / tool:** Muse (subagent)
- **Goal (user's words):** "It's better platform automatically completes all things" — after being told Cashfree is not yet usable by end users and Stripe/Razorpay/PayPal are not built yet; build multi-gateway payments with automatic setup after keys are pasted, reusable and customisable
- **What I changed:**
  - New edge functions `razorpay-payments`, `stripe-payments`, `paypal-payments` (each ~600-700 lines) mirroring `cashfree-payments`: create-order reads price server-side, signature-verified webhook, server-side re-verification, idempotent grant via the existing `grant_paid_enrollment` RPC. No new order tables — all reuse `payment_orders` / `payment_transactions` (the `cf_order_id` / `cf_payment_id` columns are generic gateway-assigned ids, names are historical).
  - `src/lib/payments.ts` rewritten as a provider registry (cashfree, razorpay, stripe, paypal) — backward compatible: `createPaymentOrder` / `startCashfreeCheckout` / `formatPrice` keep their signatures. New: `resolveActiveGateway()` (reads `gateway_settings`, falls back to env default), `probeGatewayStatus()`, `startRazorpayCheckout` (Checkout.js modal), `startRedirectCheckout` (Stripe/PayPal), `startCheckoutForCourse`.
  - New Admin Payment Settings page `src/pages/admin/AdminPaymentSettingsPage.tsx` at `/admin/payments` (super_admin via parent RoleGuard): live status per gateway (probed), active-gateway picker, sandbox/live mode, currency, per-gateway setup steps + webhook URLs + fees. Cashfree mode select is disabled — the v1 function reads test secrets only; its live activation is a separate step.
  - `CourseDetailPage.tsx` `handlePayNow` now uses generic `startCheckoutForCourse`; the fee shows the active gateway's currency and label. Manual PhonePe-reference flow untouched.
  - Migrations added: `20261114120000_payment_gateway_settings.sql` — new `gateway_settings` table (non-secret config only; exactly one active gateway via partial unique index; RLS admin-all + authenticated select-active), seed rows (cashfree active/sandbox/INR, others inactive).
  - Edge functions changed: three new (above); `supabase/config.toml` gained three `[functions.*]` sections, all `verify_jwt = false` like cashfree-payments.
  - Secrets/env added: names only, in `.env.example` and the settings page — `RAZORPAY_TEST_KEY_ID/SECRET/WEBHOOK_SECRET`, `RAZORPAY_KEY_ID/SECRET/WEBHOOK_SECRET` (live), `STRIPE_TEST_SECRET_KEY/WEBHOOK_SECRET`, `STRIPE_SECRET_KEY/WEBHOOK_SECRET` (live), `PAYPAL_TEST_CLIENT_ID/SECRET/WEBHOOK_ID`, `PAYPAL_CLIENT_ID/SECRET/WEBHOOK_ID` (live), `LMS_PUBLIC_URL` (Stripe/PayPal). No real secret set anywhere.
  - Docs: `docs/payments-multi-gateway.md` (research note + setup steps + owner checklist); `AGENTS.md` §11 fixed (stale "No payments" line).
  - Mode is real for the new gateways: `gateway_settings.mode` picks which secret names the function reads; without the table each function falls back to sandbox + its default currency (INR/INR/USD).
  - Research (official docs only, 2026-11-14): Razorpay Orders API + Checkout.js, HMAC hex webhook, fulfil on `payment.captured` only, 2% + GST, UPI test `success@razorpay`; Stripe Checkout Sessions + redirect, `Stripe-Signature` `t.v1` HMAC, 2% domestic / 3% international India, **invite-only for new Indian businesses**; PayPal Orders v2 + OAuth2, postback webhook verification, 4.40% + fixed fee, **India international-only, no domestic INR**.
- **What I verified:**
  - `npm run typecheck` pass (zero errors — fixed 4 real type errors
    in the first run: DB mode `'live'` vs `PaymentMode 'production'`
    mapping, a `Promise | null` narrowing, and a missing
    `GatewayStatus` export), `npm run lint` 0 errors / 581 warnings
    (baseline — one new warning found and fixed), `npm run build`
    pass (1m 27s, same as baseline; Monaco chunk warning is known)
  - Edge functions: standalone `tsc` only (no Deno in the VM). Only
    errors are the same untyped-`createClient` artifacts the deployed
    cashfree-payments function already shows (no new error classes).
    One real bug caught by it and fixed: `PAYPAL_LIVE_BASE_URL` was
    referenced but never defined.
  - Staging (2026-11-14): migration `20261114120000` applied to
    staging only (4 seed rows, exactly one active: cashfree /
    sandbox / INR); all three functions deployed to staging only
    (razorpay-payments, stripe-payments, paypal-payments — all ACTIVE
    v1, verify_jwt=false) and probed live: create-order without auth
    returns 503 CONFIGURATION_ERROR with the correct secret names
    (fail-closed, no secrets set yet), webhook GET returns 405.
- **What I deliberately did NOT change (and why):**
  - Did not touch the Cashfree flow, RLS policies, RPC signatures, routes, or grading (additive only, per AGENTS.md Rule 0)
  - Did not create merchant accounts, do KYC, or set any real secrets anywhere
  - Did not apply the migration to prod, deploy to prod, or set prod secrets — production untouched
  - `src/types/database.ts` not hand-edited (needs `supabase gen types` regen; the `gateway_settings` table is not in it yet — the page uses the untyped client, like `PlatformSettingsPage`)
- **Known risks / follow-ups:**
  - Owner still needs: test keys per gateway, sandbox E2E test per gateway, Cashfree whitelist approval (pending), Stripe invite (India), PayPal international-only limit
  - Production activation waits for the new-entity decision (user resigned from Kaveri Technologies) and the faculty share % decision
  - `courses.price` is a single number; the active gateway's currency applies — PayPal is USD-only for Indian merchants
- **Branch / PR:** `feat/payments-multi-gateway`, PR #52 — https://github.com/Narikparamala/kaveritechnologies2.0/pull/52, commit `c5394c22` (log entry updated with the PR number + staging results in a second push to the same branch)

- **2026-11-24 — Hard delete for students / faculty / admins (Muse, feature/hard-delete-user, DRAFT PR #53 — not merged, https://github.com/Narikparamala/kaveritechnologies2.0/pull/53)**
- **Goal:** Super Admin hard-deletes any student/faculty/admin fully (profile + login + all data, incl. payment records); faculty can file a deletion request with the same export + AI reason-report flow, never delete directly. Additive only, per AGENTS.md Rule 0 and the owner's explicit "do not change existing code" instruction. User decisions 2026-11-24: delete payment records with the student (no anonymised DB record — the pre-delete download is the retained record); download all student-related data + AI-generated editable reason report, sendable to the student; faculty can do this too (as a request).
- **What I changed/added:**
  - New edge function `supabase/functions/admin-delete-user/index.ts` (actions: preview, export, generate-report, delete, request, list-requests, review-request). Service-role client calls `auth.admin.deleteUser()`; `verify_jwt = false` in `supabase/config.toml` with the JWT verified inside, like the payment functions. Guards: Super Admin only to delete; faculty only for students in their own courses; self-delete / last active Super Admin / Preview Student (`00000000-…-0001`) rejected; RESTRICT pre-check (faculty_teaching_work, qp_* created_by/finalized_by/performed_by) fails closed naming the blockers; storage cleanup for `profile-avatars` + `project-submissions`; `activity_logs` audit row (`user_hard_deleted`) written before deleting. AI report reuses the shared `runGeneration` Gemini path (faculty's own AI connection first, platform `GEMINI_API_KEY` fallback) with a deterministic template fallback when no AI key exists — AI never blocks the flow.
  - New migration `20261124120000_user_deletion_requests.sql` — new table only (RLS: Super Admin all, faculty own rows). `faculty_work_requests` was deliberately NOT widened.
  - New frontend: `src/services/userDeletion.ts`, `src/components/admin/DeleteUserModal.tsx` (preview counts → download export → reason → AI draft, editable → type-email confirm), `docs/hard-delete.md`.
  - Additive insertions only in existing files: Delete button + modal in `AdminStudentManagementPage`, `AdminFacultyManagementPage`, `UsersPage` (plus a pending faculty-requests review section), and a Request Delete button + modal in `FacultyStudentsPage`. The only removed lines in the whole diff are 3 import lines that were extended. `src/types/database.ts` was NOT hand-edited (per AGENTS.md §10 — the new request type lives in the service, which uses the untyped client).
- **What I verified:**
  - `npm ci`, `npm run typecheck` pass (zero errors), `npm run lint` 0 errors on the touched files (one new warning found and fixed), `npm run build` passes. Edge function: esbuild TS parse passes (no Deno in the VM, so no Deno typecheck — same limitation as the payment functions).
  - Staging: BLOCKED — kaveri-academy-staging (`vrzydtqcatgkfhifuchk`) is INACTIVE/paused; `list_tables` returns "Database is possibly not accessible at the moment". Migration + function deployment and live delete tests cannot run until the project is resumed (owner resumes it in the Supabase dashboard; `restore_project` exists in the MCP catalogue but is not in the connector's ALLOWED_TOOLS and was not run without authorisation). See docs/hard-delete.md § Staging verification. Nothing applied to prod.
- **What I deliberately did NOT change (and why):**
  - No existing page, button, RPC, RLS policy, route, or grading path touched; no FK altered (RESTRICT rows block instead); no `profiles_delete` policy recreated; no Firebase added (AI report uses the existing Gemini path); no secrets added (function uses only injected Supabase keys + existing Gemini path).
- **Known risks / follow-ups:**
  - A faculty member with question-paper/teaching rows cannot be deleted until those rows are cleaned/reassigned — the modal says so, but there is no in-UI cleanup yet.
  - If `GEMINI_API_KEY` is unset on staging and no faculty AI connection exists, the report falls back to the template (by design).
  - Prod enablement needs the staging checklist in docs/hard-delete.md to pass first + owner approval.

- **2026-11-24 — Hard-delete D1/D2/D3 fixes (Muse, feature/hard-delete-user, DRAFT PR #53 — not merged)**
- **Goal:** Fix the two merge-blocking defects found by staging verification (report `~/workspace/goals/kaveri-academy-health-check-and-bug-fixes/files/hard-delete-staging-verification-2026-11-24.md` §5) plus the latency note, without changing any existing feature/behaviour.
- **What I changed/added:**
  - D1 (export): rewrote `EXPORT_SPECS` in `supabase/functions/admin-delete-user/index.ts` — every select/order verified column-by-column against `information_schema` on staging (`vrzydtqcatgkfhifuchk`): certificates `certificate_uid`/`issued_at`, assignment_submissions `score`/`submitted_at`/`updated_at`, quiz_attempts `max_score`/`completed_at`/`started_at`, project_submissions `submitted_at`/`updated_at`, user_achievements `earned_at`, batch_students `enrolled_at`/`status`, session_attendance `attendance_status`, payment_transactions `received_at`, course_enrollments/course_faculty explicit columns (both have no `created_at`). Course titles now come from one `courses` lookup instead of the failing `course:courses(title)` embed. A failed section now returns `{unavailable: true, error: <message>}` and is listed in a top-level `exportErrors` array — payment_transactions previously swallowed its error entirely and returned `[]`.
  - D2 (request row): new append-only migration `20261124130000_user_deletion_requests_set_null.sql` — `target_user_id` and `requested_by` FKs changed CASCADE → SET NULL (NOT NULL dropped, which SET NULL requires); `reviewed_by` was already SET NULL. Original `20261124120000` migration NOT edited. Code order fixed: `handleDelete` and `handleReviewRequest` now mark the request approved BEFORE the delete (new helpers `markRequestApproved`/`revertRequestToPending`) and revert it to pending if the delete fails.
  - D3 (latency): `collectCounts`, `collectBlockers`, and the export section fetches now run concurrently (`Promise.all`); the payment-orders lookup starts before the counts are awaited.
  - Docs: `docs/hard-delete.md` updated with the D1/D2/D3 fixes.
- **What I verified:** `npm run typecheck` zero errors, `npm run build` passes, `eslint` on touched files 0 errors, esbuild TS parse of the edge function passes (no Deno in the VM). Pushed to `feature/hard-delete-user` (snapshot `7b9d92fb`, local `d5355c0`; plain `git push` has no credentials in this VM — snapshot push via the GitHub connector, sync record updated). New migration `20261124130000` applied to staging only (FKs verified SET NULL); edge function redeployed to staging only (v2 ACTIVE). Staging re-test with fresh `hd2-*` test accounts: **(a) export PASS** — HTTP 200 in 7.0 s (was 40 s), `exportErrors: []`, zero unavailable sections, payment_transactions present (1 row, was `[]`); **(b) approve-request PASS** — request row survives approval with status/reviewer/reason/report intact and `target_user_id` NULL, target fully deleted, sign-in 400. D1 + D2 blockers cleared; D3 latency improved (export 40→7 s). Full evidence in the staging verification report §10. Nothing applied to prod.
- **What I deliberately did NOT change:** no existing page, button, RPC, RLS policy, route, or grading path touched; the original migration file untouched; `faculty_work_requests` still not widened; no secrets set.

- **2026-11-24 — Practice media for coding questions (Muse, feature/practice-media, DRAFT PR — not merged yet)**
- **Goal:** Faculty attach one example-output media (uploaded GIF/image/video or YouTube URL) to a coding question; students see a new "Example output" section under Examples on the practice page. First of three features (practice media, then branding, then OTP/connectors). Additive only, per AGENTS.md Rule 0 and the owner's "do not change existing code" instruction. Seed the corrected First and Last Digit question if not already seeded.
- **What I changed/added:**
  - New migration `20261124140000_practice_question_media.sql` — three nullable columns on `coding_questions` (`example_media_url`, `example_media_type` CHECK in 'video'|'gif'|'image'|'youtube', `example_media_title`); `get_student_coding_questions` dropped + recreated with the SAME signature/grants/filters/ordering plus the three columns appended to RETURNS TABLE + SELECT (CREATE OR REPLACE alone fails with 42P13 on a return-type change — the drop was added to the migration before applying); guarded seed of "First and Last Digit" (id `21000000-…-0006`, only if slug `first-and-last-digit` absent) with the CORRECTED reference solution `s = input().strip(); print(s[0]); print(s[-1])` — the screenshot's `a = int(input()); print(a[0])` was user-typed editor code, not a stored bug (int is not subscriptable) — plus visible test 1456 → 1/6 and hidden test 987 → 9/7.
  - New `src/lib/questionMedia.ts` — media-type detection (YouTube via `detectEmbed`, else file extension), file validation mirroring the `course-content` bucket whitelist (GIF/PNG/JPG/WebP, MP4/WebM, 100 MB cap).
  - `src/services/fileUpload.ts` — new `uploadQuestionMedia(questionId, file)` beside `uploadLessonFile`, same `course-content` bucket, path `questions/{id}/…`, returns public URL + media type.
  - `src/pages/faculty/FacultyQuestionBankPage.tsx` — new Section 5 "Example Output Media" in the editor (URL input with auto-detect, type select, title, file upload with preview, remove) + "Example media" badge in the list. Save stores the three columns. Upload of a new (unsaved) question saves a draft first, same pattern as adding a test case.
  - New `src/pages/student/ExampleOutputMedia.tsx` — renders nothing when no media; `<video controls>` for video, `<img>` for gif/image, `VideoEmbed` for YouTube. `src/pages/student/CodingPracticePage.tsx` — type extended + one `<ExampleOutputMedia>` line under Examples. Docs: `docs/practice-media.md`.
- **What I verified:** `npm run typecheck` zero errors, `npm run build` passes (1m 28s), `eslint` on the 5 touched files 0 errors (2 pre-existing react-hooks warnings on untouched lines). Diff is purely additive: +148 lines, 0 deletions across the 3 modified files. Local render check (esbuild + react-dom/server): gif → `<img>`, video → `<video controls>`, YouTube → VideoEmbed thumbnail player, no media → empty string. Validation unit checks: gif/mp4 accepted, PDF rejected, >100 MB rejected, URL detection correct for YouTube/gif/mp4, null for PDF.
  - Staging (`kaveri-academy-staging`, `vrzydtqcatgkfhifuchk`, ACTIVE_HEALTHY) — migration applied (`{"success":true}`); columns verified in `information_schema` (3, nullable text); seed verified: exactly 1 "First and Last Digit" row, corrected reference solution, 2 test cases (visible 1456 → 1/6, hidden 987 → 9/7); CHECK constraint verified (setting type 'pdf' fails 23514, row unchanged). Upload path exercised end-to-end as staging faculty `hd2-faculty` (password reset via SQL to a fresh random value, kept in `/tmp/pm_pw.txt` only; signup was blocked — `kaveri-qatest.com` rejected as invalid email and the Gmail attempt hit the 429 email rate limit): GIF upload HTTP 200 to `questions/21000000-…-0006/…_pm-test.gif`, MP4 upload HTTP 200 to `questions/21000000-…-0001/…_pm-test.mp4`; media saved on 3 questions via the same PostgREST PATCH the faculty page uses (First and Last Digit = gif, Add Two Numbers = video, Even or Odd = YouTube `https://www.youtube.com/watch?v=dQw4w9WgXcQ`); public file URLs return HTTP 200 with the exact byte sizes (43 / 8979); the student RPC `get_student_coding_questions` (called as the signed-in user) returns all 6 questions with the new columns populated for the 3 media questions and NULL for the other 3 — the 3 no-media questions are unchanged. Nothing applied to prod.
- **What I deliberately did NOT change (and why):** no existing field, button, section, test-case UI, route, RLS policy, or grading path touched; the Examples/test UI is byte-identical apart from the one inserted component line below it; no existing RPC column removed/renamed/reordered (the student RPC gains only appended columns — required, because the page reads questions only through it); `src/types/database.ts` NOT hand-edited (per AGENTS.md §10); no bucket policy changed (uploads stay staff-only, public-read); no secrets set; no prod changes, no merge.
- **Known risks / follow-ups:**
  - No video file exists in the repo for First and Last Digit — a faculty member still needs to record/upload the 00:45 example-output video (or paste its unlisted YouTube URL) via the new editor section; the staging GIF/MP4 are 1×1px / 2s test-pattern placeholders, not real example output.
  - Live click-through of the faculty upload + student render in a Vercel preview was not possible from this session (no live-browser access) — needs the owner in the morning: open the draft PR's Vercel preview, upload media in the Question Bank editor, check the "Example output" section on the practice page.
  - The staging `hd2-faculty` password was reset during verification (new random value in `/tmp/pm_pw.txt`, deleted with the VM's /tmp eventually — rotate it if the account is reused).
  - The YouTube URL used for the Even or Odd staging test is a format-valid placeholder video, not Kaveri content.
- **Branch / PR:** `feature/practice-media`, local commit `6b2f081` — ready to push, **DRAFT PR NOT YET OPENED**. The GitHub write approval (list_branches call, approval `connector-attempt-e526757b2a09c2eb91d4910b6a21805e221877b0302b5477560fab62e046eb1e`) **timed out unanswered while the user slept, so no branch/push/PR was created** — per the task instructions it was NOT retried. Morning step (one tap): approve the GitHub write card, then push `feature/practice-media` (8 files, snapshot push of the local commit) and open a DRAFT PR to `main` (do not merge, no prod changes). Prod untouched.

## New entries go above this line (newest first)
