# AGENTS.md — Kaveri Academy LMS

> **Read this file first, before you change anything.**
> This is the handover pack for any AI agent (or human) who picks up this
> project after the original 100-day build. The project was built over
> ~87 days (2 Aug – 28 Oct 2026, 196 commits) by many different AIs,
> with no agent log, no decision records, and no attribution in git
> history. This file reconstructs what those agents did, what must not
> break, and how to add features safely.
>
> **Rule 0: Upgrade, update, add — do not rewrite, rename, or remove
> existing features.** If a change would break a route, an RPC, an RLS
> policy, a migration, or grading integrity, stop and ask the owner.

## 1. What this is

Kaveri Academy LMS — a full-stack learning platform for Kaveri
Technologies Academy. Live at https://kaveri-academy.vercel.app
(auto-deploys from `main`).

- **Frontend:** React 18.3.1 + TypeScript 5.5.3 + Vite 5.4.2 + React
  Router 7.18.1 + Tailwind 3.4.1. ~55,749 LOC in `src/`, 130 pages.
- **Backend:** Supabase Postgres 17 — 160 migrations, 110 tables live
  (3,045 rows on 2026-11-12), RLS on every table, 29 RPCs used from
  the frontend, 12 edge functions.
- **Portals:** Super Admin (34 pages), Faculty (35), Student (27),
  plus public site (11), auth (6), demo (12).
- **Verified 2026-11-12:** `npm ci` (588 packages, 25 s), `npm run
  build` passes (1 m 27 s, dist 16 MB), `npm run typecheck` passes
  with zero errors, dev server serves the landing page (HTTP 200).
  With dummy Supabase keys the shell renders but no data loads —
  that is expected. See `FRESH-SETUP.md` in this pack.

## 2. How to work on this project (mandatory)

1. **Read `ARCHITECTURE.md` in this pack, then the repo `README.md`.**
   Do not rely on git log alone — it has no AI attribution.
2. **Never work directly on `main` for a feature/fix.** Create a
   branch, make the change, run the checks in §6, open a PR.
3. **Append-only migrations.** Never edit an applied migration.
   New DB change = new file `YYYYMMDDHHMMSS_name.sql`, in order.
   Never squash without a prod backup + a repair plan — the cloud DB
   has already drifted from the migration files twice (see §7).
4. **Additive first.** New page / service / RPC / edge function /
   table — new names, never repurpose an existing RPC's arguments
   or rename a table/route.
5. **Log your work.** After every task, append one entry to
   `AI-WORK-LOG.md` (template in this pack): date, agent/tool,
   goal, files changed, migrations added, what you verified, what
   you deliberately did NOT change. This is how the next agent
   knows what you did. The absence of this log is why this pack
   had to be reconstructed from git history.
6. **Ask before:** deleting a feature, weakening RLS, changing a
   route, changing an RPC signature, touching grading, touching
   auth/roles, editing history (migrations, git history), or
   publishing/deploying.

## 3. Architecture in 60 seconds

```
src/main.tsx → src/App.tsx (394 lines, all routes + RoleGuard)
  Providers: React Query → Theme → Motion → Auth → Toast → Router
  src/contexts/AuthContext.tsx — roles: student | faculty | super_admin
  src/lib/supabase.ts — UNtyped client, anon key only (17 lines)
  src/services/* — 20 files, 4,776 LOC (all Supabase calls live here)
  src/pages/admin|faculty|student|public|auth|demo|shared
  src/lib/company.ts — branding single source of truth (incomplete, see §8)
supabase/migrations/ — 160 files, first 20260708072337_01_initial_schema.sql
supabase/functions/ — 12 functions + _shared/ (ai, mcp)
api/execute.py — Vercel Python runner for code execution
infrastructure/go-judge/ — secure grading runner (Docker)
```

- **Auth:** Supabase Auth, email/password + Google OAuth.
  `AuthRedirectPage`, `PortalChooserPage`. Role comes from
  `profiles.role`. Preview-role is **UI-only** (`AuthContext.tsx:72`)
  — it never changes the DB role.
- **Data access:** frontend uses `supabase.from('<table>')` (~70
  tables) and `supabase.rpc('<name>')` (29 RPCs). Only **one**
  edge function is invoked from the browser: `secure-grade`
  (`src/services/secureGrading.ts`). Everything else is
  server-to-server, pg_cron, or webhooks.
- **Notifications:** central `notifications` outbox + pg_cron driver
  → `notification-mailer` (Resend) + `notification-push` (FCM).
  Mailer is fail-closed: if `MAILER_PROVIDER` is unset, it logs
  and does NOT send.

## 4. Do NOT break — invariants

These are deliberate decisions, not bugs. Do not "fix" them without
explicit owner approval + a migration + a test.

| # | Invariant | Why / where |
|---|---|---|
| 1 | 29 RPC names/signatures, esp. `create_faculty_course(p_payload)`, `get_student_course_plan`, `get_student_lesson_access`, `submit_quiz_attempt`, `complete_lesson`, `join_live_session`, `delete_course_with_content`, `clone_course*` | Frontend, VS Code extension, and workshop app depend on them |
| 2 | `profiles.role` enum `student \| faculty \| super_admin` | RoleGuard + RLS + OAuth enforcement depend on it |
| 3 | `course_faculty` is the join that makes a course visible to Faculty | GitHub issue #43 is the proof: admin bypassed the RPC, course vanished from Faculty portal |
| 4 | RLS: never weaken a policy to "fix" empty data | Correct fix is a staff write policy or an RPC. RLS holes were closed deliberately, repeatedly |
| 5 | Service-role key NEVER in the browser; `src/lib/supabase.ts` uses anon key only | Security boundary |
| 6 | Routes in `src/App.tsx` — incl. `/u/:slug`, `/student/course/:courseId` | Deep links in emails, Canva embeds, VS Code extension, workshop app |
| 7 | Grading: scores computed ONLY from actual stdout in `secure-grade`; never trust client-submitted scores | Grading integrity; go-judge token must never leak into executed student code |
| 8 | Lesson release gating: lessons unlock only on real joins / explicit release (`release_lesson_*`) | Deliberate product rule (PR #38, `20261008120000_release_only_on_join.sql`) |
| 9 | Migrations append-only, filename order | Drift already happened twice; re-ordering/squashing breaks prod |
| 10 | Canva short-link resolution stays server-side (`resolve-canva-link`) | Client-side fabrication was a real bug (#19) |
| 11 | `#auth_handoff=<refresh_token>` fragment in `src/lib/externalLinks.ts` | Do NOT "fix" by moving the token to a query param or shared localStorage |
| 12 | `VITE_PREVIEW_ROLE` must NEVER be set in production | Lets local QA browse as a role without an account |
| 13 | Notification mailer/push service tokens (`NOTIFICATION_*_TOKEN`) | Service-to-service auth; do not remove or expose |

## 5. Known bugs — do not re-introduce, fix deliberately

- **#43 (open, 2026-10-21):** `src/pages/admin/AdminCoursesPage.tsx:27`
  does `supabase.from('courses').insert(...)` directly, bypassing
  `create_faculty_course` (`src/services/faculty.ts:913`). Fix: route
  admin creation through the same RPC.
- **#44 (open, 2026-10-27):** `src/pages/faculty/LessonEditorTabs.tsx:180-187`
  hardcodes `done={false}` for Topics & Subtopics, Add Recording,
  Materials — even when content exists. Fix: compute from
  `lesson_topics` / `lesson_subtopics`, `lesson_resources`, and
  `video_url` / live-session presence.
- **Fragile seams (from history):** RPC column contracts
  (`get_student_course_plan` crashed with 42804 once), RLS policies,
  lesson/release gating, Google token refresh, recorded-video
  derivation. Test these three areas after any change near them.

## 6. Verification checklist (run before every PR)

```bash
npm ci
npm run typecheck   # must pass, zero errors
npm run build       # must pass; note the 3.3 MB Monaco chunk warning — known, do not "fix" by removing the editor
npm run lint
# Then, with real Supabase env (see FRESH-SETUP.md):
npm run dev:plain   # NOT npm run dev — that needs Infisical CLI
# Smoke test: landing page loads, login works, one course opens,
# one lesson completes, one quiz submits, one coding question grades.
```

There is **no test suite** (no test script, no test files except
`supabase/functions/marketing-lead-ingest/index.test.ts`). Do not
claim tests pass. If you add a feature, add at least a manual
smoke-test note in your PR and in `AI-WORK-LOG.md`.

## 7. Reconstructed history — what the previous AIs did

No agent log exists. This is reconstructed from git history
(196 commits, 2026-08-02 → 2026-10-28) and code, 2026-11-12.
Treat it as best-effort, not gospel — re-verify by reading code.

- **Origin:** Bolt.new (`bolt.new/~/sb1-iwdwyk7x` badge in README).
  27 commits mention `bolt`; branch `bolt/continue-secure-grading`
  dominates PRs #8–#42.
- **2026-09-03 — contamination / reset event:** branches
  `archive/bolt-contaminated-2026-09-03`,
  `handoff/bolt-2026-09-03`,
  `archive/main-before-lms-normalization-2026-09-03`,
  `snapshot/pre-reset` exist. No post-mortem was written. If you
  find duplicated or contradictory code from this period, do not
  assume it is intentional — check the live DB behaviour first.
- **Secure grading:** built around go-judge + Judge0, then a Vercel
  Python runner (`api/execute.py`) replaced Docker for some paths.
  Both runners are still referenced in code/secrets. Do not remove
  one until you prove the other covers every grading path.
- **Offline exams (`qp_*` migrations, Aug 23):** later partially
  reversed ("remove Offline Exams", `b8be9dd`). Do not resurrect
  `qp_*` tables without checking what was reversed and why.
- **Notifications:** moved to a central outbox + pg_cron driver
  (Sep 2026). Do not go back to direct sends from page code.
- **RLS:** hardened repeatedly (`e9b541a`, `acfeb29`,
  `20260926120000_quiz_content_rls_lockdown.sql`). See invariant 4.
- **HEAD (2026-10-28, `9054751`):** a WIP commit — "wip: save local
  changes before machine reset (LMS pages, services, supabase
  functions)". The tip is an unpolished checkpoint, not a release.
- **What is NOT in git:** which AI did what, which migrations
  already ran in prod vs only locally, which "fixes" were reverted,
  why Infisical was chosen over `.env`, why go-judge over Judge0,
  what the `lms-stable` branch is for (CI only runs on PRs to
  `lms-stable`, yet `main` auto-deploys — undocumented two-branch
  model). **If you learn an answer to any of these, write it in
  `AI-WORK-LOG.md` / `ARCHITECTURE.md` — do not leave it in chat.**

## 8. Branding / customisation seam (incomplete — see REBRAND-GUIDE.md)

Intended single source: `src/lib/company.ts` (51 lines). In reality
"Kaveri" appears in ~35 files under `src/` + `index.html` + `public/`,
~90 migration files, mailer templates, and AI prompts. Logo is
`public/assets/images/WhatsApp_Image_2026-06-16_at_10.34.22.jpeg`.
Colours in `tailwind.config.js` ("Lumina Academic": indigo `#004B8D`,
gold `#FFD700`). **Never edit historical migrations to rebrand.**
Follow `REBRAND-GUIDE.md` — it lists every file to touch.

## 9. Environment & secrets

- Browser (required): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
  — `src/lib/supabase.ts` throws at import if either is missing.
- Browser (optional): Firebase `VITE_FIREBASE_*` (5 vars),
  `VITE_FCM_VAPID_KEY`, `VITE_PREVIEW_ROLE` (QA only).
- Server-only (edge functions, `Deno.env.get`): `GEMINI_API_KEY`,
  `GO_JUDGE_URL/TOKEN`, `KAVERI_EXECUTE_URL/TOKEN`, `RESEND_API_KEY`,
  `RESEND_FROM`, `FCM_SERVICE_ACCOUNT_JSON`, `AI_KEY_ENCRYPTION_SECRET`,
  `GOOGLE_CLIENT_ID/SECRET`, `NOTIFICATION_MAILER_TOKEN`,
  `NOTIFICATION_PUSH_TOKEN`, `KAVERI_WORKSHOP_INTEGRATION_SECRET`,
  `KAVERI_LEAD_API_SECRET`, `LMS_ALLOWED_ORIGINS`, and others —
  full list in `ARCHITECTURE.md` §5 and README §6.
- Real values live in **Infisical + Supabase Vault/function
  secrets**, not in the repo. `.env.example` documents only the
  browser side. Never commit a real secret. Never paste one in chat.

## 10. Safe extension points (additive, low risk)

- New page under an existing portal layout + route in `src/App.tsx`
  + `RoleGuard` role (follow the lazy-load pattern).
- New service module in `src/services/*` + new RPC (new migration,
  new name).
- New edge function in `supabase/functions/*` — copy an existing
  `index.ts` header/secret pattern; add its secrets to
  `.env.example` + README §6.
- New table: new migration + RLS (deny-by-default, then grant) +
  regenerate types with `supabase gen types` (do not hand-edit
  `src/types/database.ts` — it is already admitted stale).
- Demo data: `src/data/demoData.ts` is fully isolated from real
  data — safe to extend for showcases.
- Docs: adding `ARCHITECTURE.md`, `CHANGELOG.md`, or this file
  requires no code changes and is the highest-value additive work.

## 11. What this project does NOT have

- No payments (no Razorpay/Stripe/UPI). Paid gating = enrollment /
  access flags. `CourseDetailPage.tsx` collects a free-text
  `paymentRef` on enrollment only.
- No test suite. No `.nvmrc` / `engines` pin (CI uses Node 22;
  verified locally on Node 24.22.1). Package name is still the
  Vite starter name (`vite-react-typescript-starter`, `0.0.0`).
- `pnpm-lock.yaml` **and** `package-lock.json` are both committed.
  Use `npm ci` (verified). Do not switch lockfiles casually.
- `src/hooks/` does not exist. Windows-first local scripts (`.ps1`).

---
*Handover pack created 2026-11-12 from a fresh clone at HEAD `9054751`
+ a verified local build/run + live Supabase read-only verification
(org `kaveritechnologies`, project `atcncxckuokjarsxckwy`, 110 tables).
Copy this file to the repo root as `AGENTS.md` to make it live.*
