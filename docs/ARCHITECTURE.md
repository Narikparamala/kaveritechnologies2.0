# ARCHITECTURE.md — Kaveri Academy LMS

*Reconstructed 2026-11-12 from a fresh clone at HEAD `9054751`,
a verified local build/run, and a read-only Supabase check.
Counts are call-site counts in `src/` + `supabase/functions/`
unless stated as live-DB counts.*

## 1. System overview

```
User (browser)
  → Vercel SPA (React + Vite, vercel.json rewrites * → /index.html)
  → Supabase Auth + Postgres (RLS) + Storage
  → Supabase Edge Functions (Deno)
  → External: Gemini AI, go-judge / Judge0, Resend, Firebase FCM,
    Google Calendar/Meet, Canva, VS Code extension, workshop app
```

- **Repo:** `Narikparamala/kaveritechnologies2.0`, branch `main`
  auto-deploys to https://kaveri-academy.vercel.app
- **Live Supabase (2026-11-12):** org `kaveritechnologies`
  (`agecbvugrnyriezbccng`), project `kaveritechnologies`
  (`atcncxckuokjarsxckwy`), ap-south-1, ACTIVE_HEALTHY, Postgres 17,
  110 tables, 3,045 rows, all RLS enabled. Second project
  `Narikparamala's Project` (`eirflfuvrtvtfzrdsceu`) is INACTIVE —
  ignore it.
- **Local Supabase config:** `supabase/config.toml` project_id
  `kaverilmspracticeplayground` (local only).

## 2. Frontend

- **Entry:** `src/main.tsx` → `src/App.tsx` (394 lines)
- **Providers:** React Query (retry 1, staleTime 5 min) → Theme →
  Motion → Auth → Toast → BrowserRouter
- **Stack:** React 18.3.1, React Router 7.18.1, Vite 5.4.2,
  TypeScript 5.5.3 (strict), Tailwind 3.4.1, `@supabase/supabase-js`
  2.57.4, `@tanstack/react-query` 5.101.2, Monaco 0.52.2,
  Firebase 10.14.1, framer-motion 12.42.2, recharts 3.9.2,
  react-hook-form 7.81 + zod 4.4.3, ~14 Radix UI packages,
  lucide-react 0.344, date-fns 4.4.0, `qrcode.react` 4.2.0
- **Layout:** `src/pages/` 130 files — admin 34, faculty 35,
  student 27, workspace 9, public 11, auth 6, demo 12, shared 2
- `src/components/` 30, `src/services/` 20 files (4,776 LOC),
  `src/contexts/` 4 (`AuthContext` 385 lines, `DemoContext`,
  `MotionContext`, `ThemeContext`), `src/lib/` 9,
  `src/types/database.ts` 980 lines (manually maintained, admitted
  stale — regenerate with `supabase gen types`, do not hand-edit),
  `src/hooks/` **does not exist**
- **Supabase client:** `src/lib/supabase.ts` (17 lines) —
  `createClient(VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY)`,
  persistSession + autoRefreshToken, **untyped by design**; types
  applied via `as` casts at call sites.

### Routes (`src/App.tsx`)

- Public: `/`, `/courses`, `/courses/:slug`, `/u/:slug`,
  `/about`, `/contact`, `/pricing`, `/faq`, `/help`, `/privacy`,
  `/terms`
- Auth: `/login`, `/register`, `/forgot-password`,
  `/reset-password`, `/auth/redirect`, `/portal`,
  legacy alias `/developer-role`
- Demo: `/demo/student|faculty|admin` (mostly `ComingSoon` stubs
  except student demo)
- Student: `/student/*` (28 routes incl.
  `/student/course/:courseId` workspace, coding-practice,
  projects workspace)
- Faculty: `/faculty/*` (~35 routes)
- Admin: `/admin/*` (~35 routes)
- Fallback `*` → `/`

Every portal route is wrapped in `src/components/common/RoleGuard.tsx`.

### Roles & auth

- Roles from `profiles.role`: `student | faculty | super_admin`
- `super_admin` can preview faculty/student portals; faculty can
  preview student. Preview is **UI-only, never the DB role**
  (`AuthContext.tsx:72`).
- `VITE_PREVIEW_ROLE` lets local QA browse as a role without an
  account. **Never set in production.**
- Google OAuth role enforcement:
  `20260901102000_google_auth_role_enforcement.sql`

## 3. Database

- **Migrations:** 160 `.sql` files in `supabase/migrations/`
  (README says 152 — stale). First
  `20260708072337_01_initial_schema.sql` (1,260 lines, 28
  `CREATE TABLE`s), last `20261022100000_faculty_ai_connections.sql`.
  52 distinct tables created across migrations; live DB has 110
  (the rest arrived via later migrations/repairs).
- **Live counts (2026-11-12):** courses 3, lessons 100, chapters 24,
  coding_questions 90, coding_question_test_cases 280,
  lesson_resources 97, quizzes 20, quiz_questions 113,
  quiz_options 408, profiles 23, enrollments 23,
  coding_execution_requests 599.
- **Most-used tables in code** (by call count): `course_enrollments`
  42, `profiles` 38, `courses` 37, `coding_questions` 32,
  `course_faculty` 26, `assignments` 26, `lessons` 24,
  `live_sessions` 20, `batch_students` 19, `quizzes` 18,
  `coding_vscode_assignments` 17, `chapters` 17,
  `assignment_submissions` 17, `batches` 15, `session_attendance` 13,
  `projects` 12, `notifications` 11 — plus ~50 more (see AGENTS.md §4
  and the full audit in `kaveri-research-audit.md`).
- **RLS:** enabled on every table. Staff write policies were added
  in later migrations (e.g.
  `20260924100000_enable_rls_all_public_tables.sql`,
  `20260926120000_quiz_content_rls_lockdown.sql`). Several
  migrations are named "repair baseline schema drift" /
  "repair_missing_baseline_objects" — the cloud DB drifted from
  the files at least twice. Append-only; never edit an applied file.

### RPCs (29, used from the frontend)

`create_faculty_course`, `delete_course_with_content`,
`clone_course`, `clone_course_content`, `get_student_course_plan`,
`get_student_lesson_access`, `get_student_coding_questions`,
`get_course_coding_questions`, `get_chapter_coding_questions`,
`complete_lesson`, `submit_quiz_attempt`, `save_project_submission`,
`save_project_structure`, `review_project_submission`,
`approve/reject/cancel_enrollment_request`,
`admin_set_enrollment_access`, `admin_set_user_role`,
`admin_set_user_active`, `release_lesson_for_student`,
`release_lesson_to_absentees`, `revoke_lesson_release`,
`join_live_session`, `get_session_recording_status`,
`get_quiz_questions_staff`, `get_faculty_timetable`,
`get_public_profile`, `update_learning_streak`.

`create_faculty_course` is called exactly once
(`src/services/faculty.ts:913`). Admin Create Course bypasses it —
that is bug #43.

### Storage buckets

`project-submissions`, `profile-avatars`, `question-paper-assets`.
Only `project-submissions` is referenced from frontend code (3×);
the others exist via migrations / manual setup.

## 4. Edge functions (12 + `_shared/`)

| Function | Purpose |
|---|---|
| `secure-grade` | Secure coding grading (go-judge/Judge0). Only function invoked from the browser |
| `generate-questions` | Gemini: questions from content |
| `generate-from-slides` | Gemini: lessons from slides |
| `generate-mini-project` | Gemini: AI mini-projects |
| `faculty-ai-connections` | Per-faculty encrypted AI keys |
| `google-calendar-auth` | Google Calendar OAuth |
| `google-meet-create` | Google Meet creation |
| `resolve-canva-link` | Canva short-link resolution, server-side only |
| `notification-mailer` | Resend email via central outbox |
| `notification-push` | FCM web push via central outbox |
| `marketing-lead-ingest` | Lead capture webhook |
| `integrations-workshop` | Workshop app integration |
| `_shared/ai`, `_shared/mcp` | Shared AI helpers; MCP server incl. `mcp/kaveri-context/server.ts` |

## 5. Environment & secrets

**Browser (`VITE_*`, in `.env.example`):**

| Var | Required? |
|---|---|
| `VITE_SUPABASE_URL` | Yes — throws at import if missing |
| `VITE_SUPABASE_ANON_KEY` | Yes — throws at import if missing |
| `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_FIREBASE_APP_ID` | Optional (push idle without them) |
| `VITE_FCM_VAPID_KEY` | Optional |
| `VITE_PREVIEW_ROLE` | QA only, never production |

**Server-only (edge functions, `Deno.env.get`):**
`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`
(runtime-injected), `GEMINI_API_KEY`, `GO_JUDGE_URL`, `GO_JUDGE_TOKEN`,
`KAVERI_EXECUTE_URL`, `KAVERI_EXECUTE_TOKEN`, `JUDGE0_URL`,
`JUDGE0_AUTHN_*`, `JUDGE0_AUTHZ_*` (legacy), `RESEND_API_KEY`,
`RESEND_FROM`, `MAILER_PROVIDER` (fail-closed when unset),
`FCM_SERVICE_ACCOUNT_JSON`, `FCM_PROJECT_ID`, `LMS_PUBLIC_URL`,
`NOTIFICATION_MAILER_TOKEN`, `NOTIFICATION_PUSH_TOKEN`,
`KAVERI_WORKSHOP_INTEGRATION_SECRET`, `KAVERI_LEAD_API_SECRET`,
`LMS_ALLOWED_ORIGINS`, `AI_KEY_ENCRYPTION_SECRET`,
`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`.

Real values live in Infisical + Supabase Vault/function secrets.
`npm run dev` requires the Infisical CLI; `npm run dev:plain`
does not.

## 6. Features — file map

| Feature | Main files |
|---|---|
| Public site, courses, pricing, legal | `src/pages/public/*`, `PublicNav.tsx`, `Footer.tsx` |
| Auth + portal chooser + Google OAuth | `src/pages/auth/*`, `AuthContext.tsx`, `RoleGuard.tsx` |
| Courses / chapters / lessons, progression locks & releases | `src/services/courses.ts`, `lessons.ts`, `src/pages/student/workspace/CourseWorkspace.tsx`, `LessonContent.tsx`, RPCs `get_student_course_plan`, `get_student_lesson_access`, `release_lesson_*` |
| Quizzes | `src/pages/student/QuizzesPage.tsx`, `LessonPracticePage.tsx`, `FacultyQuizzesPage.tsx`, `QuizQuestionsManager.tsx`, RPC `submit_quiz_attempt` |
| Coding practice + secure grading | `CodingPracticePage.tsx`, `PlaygroundPage.tsx`, `SandboxPage.tsx`, `CodeEditor.tsx` (Monaco), `secureGrading.ts`, `pythonExecution.ts`, edge `secure-grade`, `infrastructure/go-judge/`, `api/execute.py`, `public/pyodide.worker.js` |
| Assignments | `AssignmentsPage.tsx`, `FacultyAssignmentBuilderPage.tsx`, `SubmissionsPage.tsx`, `CodingSubmissionsPage.tsx`, `src/services/assignments.ts` |
| Mini projects (AI-generated) | `MiniProjectManagerPage.tsx`, `ProjectWorkspacePage.tsx`, `MiniProjectsPage.tsx`, edge `generate-mini-project` |
| Live classes / batches / timetable / attendance | `FacultyLiveClassesPage.tsx`, `FacultyTimetablePage.tsx`, `FacultyBatchesPage.tsx`, `FacultySessionAttendancePage.tsx`, `LiveClassesPage.tsx`, `src/services/liveSessions.ts` (524 lines), RPCs `join_live_session`, `get_session_recording_status` |
| Enrollments & requests | `AdminEnrollmentPage.tsx`, `AdminEnrollmentRequestsPage.tsx`, `FacultyEnrollmentRequestsPage.tsx`, RPCs `approve/reject/cancel_enrollment_request` |
| Certificates, leaderboard, jobs | `CertificatesPage.tsx`, `LeaderboardPage.tsx`, `JobsPage.tsx`, `AdminCertificatesPage.tsx`, `AdminPlacementsPage.tsx` |
| Admin company ops | `src/pages/admin/*` (34), `companyManagement.ts` (432), `marketingLeads.ts`, `userAdministration.ts`, `platformSettings.ts`, edge `marketing-lead-ingest` |
| AI content import | `ContentImportPage.tsx`, `contentImport.ts` (916 lines), edges `generate-questions`, `generate-from-slides`, `generate-mini-project`, `faculty-ai-connections` |
| Notifications | `notifications.ts`, `push.ts`, `PushNotificationCard.tsx`, `firebase-messaging-sw.js`, edges `notification-push`, `notification-mailer` |
| Public student profiles | `PublicProfilePage.tsx` (`/u/:slug`), RPC `get_public_profile` |
| Demo mode | `src/pages/demo/**/*`, `src/data/demoData.ts`, `DemoContext.tsx` |
| VS Code extension / coding workspace | `src/lib/externalLinks.ts`, `docs/STUDENT_EXTENSION_GUIDE.md`, `docs/kaveri-platform-registry.md` |

**No payments:** no Razorpay/Stripe/UPI anywhere.

## 7. Other systems

- **CI:** `.github/workflows/secure-grading-ci.yml` — only CI file,
  triggers on PRs to `lms-stable` (not `main`, which auto-deploys).
  The two-branch model is undocumented; do not assume `lms-stable`
  is the deploy branch.
- **Scripts:** `scripts/` — 12 files, PS1 bring-up/verify, load
  tests, Python seeders (Windows-first).
- **Docs present:** `docs/` — 17 files (~2,763 lines), incl.
  `AI_CONNECTIONS`, `PLATFORM_MAINTENANCE_GUIDE`,
  `content-import-guide`, `infisical-secrets`,
  `kaveri-platform-registry`, `push-notifications-setup`,
  `qa-data-policy`, `secure-runner-deployment`,
  `implementation/isolated-coding-grader-v1`,
  `implementation/lms-platform-completion`.
- **Docs missing (before this pack):** `AGENTS.md`,
  `ARCHITECTURE.md`, `CHANGELOG.md`, `CONTRIBUTING.md`,
  `CODEOWNERS`, `SECURITY.md`, ADRs, PR/issue templates.

## 8. Verified run (2026-11-12)

- Node v24.22.1, npm 10.9.4. `pnpm`, Supabase CLI, Infisical CLI
  were not installed in the test VM.
- `npm ci` — 588 packages, 25 s, exit 0. `node_modules` 515 MB.
- `npm run build` — passes in 1 m 27 s, dist 16 MB, 288 assets.
  One warning: `CodeEditor` chunk 3,348.88 kB (Monaco) exceeds
  Vite's 1000 kB limit. `Browserslist: caniuse-lite is outdated`
  (non-fatal).
- `npm run typecheck` — zero errors.
- `npm run dev:plain` — ready in 614 ms at http://localhost:5173/,
  HTTP 200, correct title. `npm run dev` fails without Infisical.
- With dummy Supabase keys, landing page queries fail as expected
  (`LandingPage.tsx:60`, `supabase.from('courses')`) — shell
  renders, no data. Real Supabase project required for any
  data feature.
- `/tmp` on the test VM is a 512 MB tmpfs — cloning/installing
  there fails with `ENOSPC`. Clone into home/workspace instead.
