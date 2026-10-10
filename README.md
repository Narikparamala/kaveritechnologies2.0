[![Open in Bolt](https://bolt.new/static/open-in-bolt.svg)](https://bolt.new/~/sb1-iwdwyk7x)

# Kaveri Academy LMS

A full-stack Learning Management System for **Kaveri Technologies Academy** — three portals (Super Admin, Faculty, Student) on one React SPA backed by Supabase. This document lets a new developer go from `git clone` to running the platform locally, and explains exactly what works on localhost, what needs extra setup, and how to test each portal.

**Live production app** (auto-deploys from `main`): https://kaveri-academy.vercel.app

---

## 1. What the platform does

| Area | Highlights |
|---|---|
| **Courses & lessons** | Markdown/video lessons, chapters, free-preview lessons, locked content gated by progression mode (course-wide or per-lesson) and `lesson_releases` |
| **Assessments** | Quizzes (auto-graded, attempts tracked), knowledge-check quizzes inside lessons, timed exams |
| **Coding practice** | Monaco editor in-browser, server-authoritative grading via the `secure-grade` edge function + an isolated go-judge execution runner; scores computed only from actual stdout |
| **Assignments** | Multi-question assignment builder (MCQ + written + attached question-bank items), file/text submissions, graded feedback |
| **Mini projects** | AI-generated project briefs (Gemini), concept gates, submissions with reflection |
| **Batch live classes** | Admin owns batch weekly slots; faculty schedules classes inside slots from a day-view timetable; batch membership = auto registration; the student **Join** button opens Google Meet and auto-marks attendance; an unlocking session releases its lesson to attendees |
| **Enrollment & batches** | Enrollment requests, course/batch assignment flows, batch students & trainers management |
| **Push notifications** | Firebase Cloud Messaging web push driven by a central `notifications` outbox + `pg_cron` worker |
| **Email** | Resend-backed mailer edge function (fail-closed when no key configured) |
| **AI content import** | Faculty paste raw content → Gemini structures it into lessons/quizzes/assignments/coding questions with a preview-and-attach flow |
| **Company ops (admin)** | Leads pipeline with follow-ups, placements, performance reviews, payroll preview, platform settings, announcements |

**Auth model**: Supabase Auth (email/password + Google OAuth). Three portal roles — `student`, `faculty`, `super_admin` — every table is protected with Row Level Security; the browser only ever holds the public anon key.

---

## 2. Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 18, TypeScript, Vite 5, React Router 7, Tailwind CSS 3 (+ Typography plugin), lucide-react icons, framer-motion, recharts, @monaco-editor/react, react-hook-form + zod, @tanstack/react-query |
| Backend | **Supabase** — Postgres (152 SQL migrations), Row Level Security on every table, Auth, Storage buckets (`project-submissions`, `profile-avatars`, `question-paper-assets`), 11 Edge Functions (Deno), pg_cron + pg_net scheduled jobs, Vault-backed function secrets |
| Code execution | go-judge execution runner (Docker) called by the `secure-grade` edge function; Oracle Cloud runner supported for remote grading (see `docs/ORACLE_CLOUD_RUNNER_MIGRATION.md`) |
| Notifications | Firebase Web Push (FCM HTTP v1) + Resend transactional email |
| AI | Google Gemini API (content import, question/mini-project generation edge functions) |
| Tooling | ESLint 9, TypeScript strict, pnpm workspace config, PowerShell platform scripts, Python seed/maintenance scripts |
| Hosting | Vercel (frontend, auto-deploy from `main`), Supabase cloud (DB + functions) |

Language breakdown (GitHub): TypeScript 68%, PL/pgSQL 29%, Python/PowerShell/JS a few percent.

---

## 3. Repository map

```
src/
  pages/
    admin/        Super Admin portal (batches, courses, users, leads, live classes, sessions…)
    faculty/      Faculty portal (timetable, live classes, students, grading, content import…)
    student/      Student portal (workspace, courses, quizzes, coding, certificates…)
    demo/         Public demo pages (no auth)
    auth/         Login / register / portal chooser / redirects
    shared/       Project workspace shared by portals
  services/       Typed Supabase query layer (one module per domain)
  components/     Layout (DashboardLayout, Sidebar, RoleGuard) + UI primitives
  contexts/       AuthContext: profile, roles, portal preview switching
  types/          database.ts — generated-style types (some newer columns untyped)
supabase/
  migrations/     152 ordered SQL migrations (schema, RLS policies, functions, triggers)
  functions/      11 edge functions (secure-grade, notification-push, notification-mailer,
                  generate-*, google-meet/calendar, resolve-canva-link, marketing-lead-ingest,
                  integrations-workshop)
  config.toml     Local Supabase CLI config (project: kaverilmspracticeplayground)
scripts/          PowerShell platform bring-up scripts, load tests, Python seeders  docs/             10+ deep-dive runbooks (maintenance, push, email, Infisical, secure runner…)
```

**Deep-dive docs** (read these when you touch the subsystem):

- [docs/PLATFORM_MAINTENANCE_GUIDE.md](docs/PLATFORM_MAINTENANCE_GUIDE.md) — daily/weekly/monthly ops playbook
- [docs/infisical-secrets.md](docs/infisical-secrets.md) — how secrets are injected at runtime
- [docs/push-notifications-setup.md](docs/push-notifications-setup.md) — FCM push pipeline
- [docs/email-delivery-deployment.md](docs/email-delivery-deployment.md) — Resend email pipeline
- [docs/secure-runner-deployment.md](docs/secure-runner-deployment.md) — secure code grading architecture
- [docs/ORACLE_CLOUD_RUNNER_MIGRATION.md](docs/ORACLE_CLOUD_RUNNER_MIGRATION.md) — remote grading runner
- [docs/content-import-guide.md](docs/content-import-guide.md) — AI content import
- [docs/STUDENT_EXTENSION_GUIDE.md](docs/STUDENT_EXTENSION_GUIDE.md) — VS Code extension for students
- [docs/vercel-ceo-demo-deployment.md](docs/vercel-ceo-demo-deployment.md) — demo deploy
- [docs/kaveri-platform-registry.md](docs/kaveri-platform-registry.md) — platform registry
- [docs/ecosystem-integration-design.md](docs/ecosystem-integration-design.md) — integration design

---

## 4. Quickstart (two paths)

### Path A — Fast: cloud Supabase, 5 minutes

Works on Windows, macOS, Linux. Uses the production Supabase project (read-only-ish: your writes are real writes, be sensible).

```bash
git clone https://github.com/Narikparamala/kaveritechnologies2.0.git
cd kaveritechnologies2.0
npm install            # pnpm also works (pnpm-lock.yaml is committed)
cp .env.example .env.local
```

Fill `.env.local` with at minimum (values available from the team):
```ini
VITE_SUPABASE_URL=https://<project>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon key>
```

The Firebase block is optional — the app runs fine without push notifications; leave the placeholders or remove them.

```bash
npm run dev:plain
```
Open **http://localhost:5173**. Log in with a real staff/student account (the team can provide one) or explore the public demo pages as an anonymous visitor.

> **Why `dev:plain`?** `npm run dev` wraps the dev server in `infisical run` to fetch secrets from the team's Infisical project. That requires an Infisical CLI login tied to our workspace — not set up for external machines (see [docs/infisical-secrets.md](docs/infisical-secrets.md) for the full story). For onboarding, `dev:plain` + `.env.local` is the intended path.

### Path B — Full local platform (Windows, Docker)

Brings up the **entire platform offline**: local Postgres + Auth + Storage, local Studio, the go-judge grading container, and the dev server. No cloud account needed.

Prerequisites: **Docker Desktop**, **Node 18+**, **Supabase CLI**, **PowerShell**.

```powershell
powershell -ExecutionPolicy Bypass -File scripts/start-local-platform.ps1
```

The script:
1. Starts Docker Desktop if it isn't running
2. Runs `npx supabase start` — local Supabase at `127.0.0.1:54321`, Studio at `127.0.0.1:54323`
3. Applies all 152 migrations into the fresh local DB
4. Starts the secure-grading runner (see `scripts/start-local-secure-grading.ps1`)
5. Launches `npm run dev` in a second PowerShell window (requires Infisical — for onboarding run `npm run dev:plain` manually in step 5's place)
6. Opens http://localhost:5173 and prints a summary

Other endpoints printed by the script when it finishes:

| Service | URL |
|---|---|
| LMS (Vite) | http://localhost:5173 |
| Supabase API | http://127.0.0.1:54321 |
| Supabase Studio | http://127.0.0.1:54323 |
| go-judge (grading) | http://127.0.0.1:2358 |

Verifications afterward: `powershell -File scripts/verify-local-platform.ps1`.

---

## 5. What works on localhost, what doesn't

**✅ Works fully once the app is running (Path A or B):**

- All three portals, every page and workflow
- Courses, lessons, chapters, progression locks & releases
- Quizzes, exams, assignments, mini projects, certificates
- Batch management, enrollments, roster management
- My Timetable schedule-slot modeling, class scheduling, attendance grid, join/auto-attendance, lesson auto-release to attendees
- Question bank, announcements, support records
- RLS-protected data access with the anon key (the browser respects the same policies the API does)
- Secure coding grader (Path B with Docker; path A needs the cloud runner URL)

**⚠️ Works but needs one-off setup (keys/secrets):**

| Feature | What's needed |
|---|---|
| Web push notifications | Firebase web app config + VAPID key in `.env.local`; edge functions deployed with `FCM_SERVICE_ACCOUNT_JSON` |
| Email | `RESEND_API_KEY` + `MAILER_PROVIDER=resend` as function secrets (docs/email-delivery-deployment.md) |
| AI content import | `GEMINI_API_KEY` as a function secret |
| Google Meet / Calendar one-click create | Faculty must OAuth-connect their Google account; needs redirect URIs configured in Google Cloud Console |
| `npm run dev` (Infisical-wrapped) | Infisical CLI logged in to our workspace |

**❌ Plain-localhost limits:**

- Google OAuth / Meet redirects need a public HTTPS host — the **production** app handles those; local logins should use email+password
- Push/email delivery only actually *sends* from a deployed environment with cron + function secrets configured (bg jobs are `pg_cron` in the Supabase project)
- Seed content in a fresh local DB (migration `20260708072637_02_seed_data.sql`) differs from production data

---

## 6. Environment variables

Full annotated list lives in [.env.example](.env.example). Summary:

**Browser (Vite `VITE_*`) — these are public-by-design; never put server secrets here:**

| Var | Purpose |
|---|---|
| `VITE_SUPABASE_URL` | Supabase project URL (required) |
| `VITE_SUPABASE_ANON_KEY` | Staging/public anon key, RLS-guarded (required) |
| `VITE_FIREBASE_*` + `VITE_FCM_VAPID_KEY` | Web push identification (optional) |
| `VITE_PREVIEW_ROLE` | Local QA shortcut: view the app as `student` or `faculty` without an account |

**Server-only (Supabase edge-function secrets / Vault — never in the browser bundle):**

`FCM_SERVICE_ACCOUNT_JSON`, `FCM_PROJECT_ID`, `MAILER_PROVIDER`, `RESEND_API_KEY`, `RESEND_FROM`, `LMS_PUBLIC_URL`, `NOTIFICATION_MAILER_TOKEN`, `NOTIFICATION_PUSH_TOKEN`, `GEMINI_API_KEY`, `GO_JUDGE_URL`, `GO_JUDGE_TOKEN`, `KAVERI_EXECUTE_URL`, `KAVERI_EXECUTE_TOKEN`, `KAVERI_WORKSHOP_INTEGRATION_SECRET`, `LMS_ALLOWED_ORIGINS`, plus the standards `SUPABASE_URL` / `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` injected by the Supabase runtime.

Set these via `supabase secrets set NAME=value` or the Supabase Vault (see each doc above for the recommended mechanism per function).

---

## 7. 30-minute testing checklist for reviewers

Run `npm run dev:plain`, then:

**Sanity gates (2 min)**
```bash
npm run typecheck     # TypeScript strict — must pass
npm run lint          # ESLint
npm run build         # Vite production build
```

**Public site (3 min)** — landing page, browse demo courses, open a free-preview lesson.

**Super Admin portal (8 min)** — log in with an admin account:
1. Dashboard → platform overview cards
2. Courses → open a course → Lessons tab → add/edit a lesson
3. Batches → open "Batch - 2" → Schedule tab → add a weekly slot → Students tab
4. Live Classes → see the remaining scheduled/completed sessions
5. Users / Leads / Placements / Announcements — all CRUD pages

**Faculty portal (8 min)** — either log in as faculty or (as admin) use the portal-preview switch ("You are in the Faculty portal"):
1. **My Batches & Work** → batch cards, "Plan teaching work"
2. **My Timetable** → day navigation → **Schedule class** (batch dropdown, date/time prefill) → attendance grid on a scheduled class
3. **Live Classes** → schedule/manage Google Meet sessions, view attendance
4. Question Bank → create a question → Content Import → the AI-assisted flow (needs GEMINI key, will show a friendly error without it)

**Student portal (9 min)** — log in as a student (or preview):
1. Dashboard → open an enrolled course → lesson progression (locked → unlocked as you complete)
2. Take a quiz (auto-graded) and a coding practice (Monaco editor; grading requires the runner)
3. Submit an assignment; view certificate after completion
4. **Batch live class** — if a class is scheduled within the next 10 minutes, the "Next class" banner appears; the **Join** button opens Meet and auto-marks attendance

---

## 8. Scripts & commands

| Command | What it does |
|---|---|
| `npm run dev:plain` | **Start dev server on :5173** (no Infisical). Regenerates the push service-worker config first. |
| `npm run dev` | Same, wrapped in `infisical run --env=dev` (requires Infisical login). |
| `npm run build` | Production Vite build (also regenerates the service-worker config). |
| `npm run build:infisical` | Build with prod secrets injected from Infisical. |
| `npm run preview` | Serve the production build locally. |
| `npm run typecheck` | `tsc --noEmit` strict type check. |
| `npm run lint` | ESLint across the repo. |

PowerShell helpers:

| Script | Purpose |
|---|---|
| `scripts/start-local-platform.ps1` | Full local bring-up (Docker + Supabase + grading + dev server) |
| `scripts/start-local-secure-grading.ps1` | Just the go-judge grading runner + secure-grade function |
| `scripts/verify-local-platform.ps1` | Post-bring-up health checks |
| `scripts/oracle-runner-setup.sh` | Provision the remote grading runner (Oracle Cloud) |
| `scripts/load-test-*.mjs` | K6-style load tests against local API/live classes |

---

## 9. Deployment (how changes reach production)

- **Frontend** → push/merge to `main` → Vercel auto-deploys to https://kaveri-academy.vercel.app. PRs get their own Vercel preview deployment as a check.
- **Database** → SQL files in `supabase/migrations/` are applied to the cloud project deliberately (via Supabase Management API or CLI); they're **not** auto-run on deploy. Keep the `YYYYMMDDHHMMSS_name.sql` ordering convention.
- **Edge functions** → `supabase functions deploy <name>` from the repo root, then set secrets with `supabase secrets set`.
- **Ongoing ops** → follow [docs/PLATFORM_MAINTENANCE_GUIDE.md](docs/PLATFORM_MAINTENANCE_GUIDE.md) (backups, RLS audit, usage checks, content freshness).

---

## 10. Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `npm run dev` fails immediately, mentions Infisical | CLI not logged in on your machine — use `npm run dev:plain` with `.env.local` |
| Blank page, console shows Supabase 401/`Invalid API key` | `.env.local` missing or wrong `VITE_SUPABASE_*` values |
| Reachable app but every query returns empty / permission denied | Data exists in the cloud project but the anon key rows are RLS-protected; use a real account, not `VITE_PREVIEW_ROLE` browsing with stale local data |
| Coding editor says "grading unavailable" | go-judge container isn't running — start Docker, run `scripts/start-local-secure-grading.ps1` (or point `KAVERI_EXECUTE_URL` at the cloud runner) |
| `supabase start` fails / ports in use | Another Supabase local project is running; run `npx supabase stop` or change ports in `supabase/config.toml` |
| Port 5173 already in use | `npm run dev:plain -- --port 5174` |
| Google Sign-in button does nothing locally | Expected — OAuth redirect URIs are registered for the production domain; use email+password locally |
| Some newer features show type errors in `types/database.ts` | A few newer columns aren't in the generated types yet; code uses narrow `unknown` casts deliberately — run `npx supabase gen types` to refresh if you need |

---

## 11. Status & roadmap notes

- Current milestone: **batch live classes** — admin-owned batch slots, faculty scheduling inside slots, auto-attendance on join, attendance-gated lesson releases (recently shipped to production).
- In review: release-gating of lessons to **real joins only** (PR #38) and the timetable batch-picker fix (PR #39).
- Known gaps: generated DB types slightly stale; some admin pages still assume single-company tenancy; push/email require production edge-function secrets.

For anything deeper, the `docs/` folder is the source of truth — start with [docs/PLATFORM_MAINTENANCE_GUIDE.md](docs/PLATFORM_MAINTENANCE_GUIDE.md).
