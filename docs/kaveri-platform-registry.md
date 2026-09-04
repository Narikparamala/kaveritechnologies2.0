# Kaveri Platform Registry

Central registry of every system that is part of the Kaveri Technologies platform.
This file is the source of truth for system ownership, hosting, identity and
data authority. Update it whenever a system's host, status or integration
changes. URLs listed here are the ones Kaveri actually uses — do not invent
deployment URLs.

## Platform principles

- **Identity authority:** Supabase Auth (`auth.users.id`) everywhere. No
  synchronized password databases, no parallel account stores.
- **Data authority:** RLS-protected Supabase tables are authoritative. Client
  code (LMS, satellite dashboards, VS Code) never receives service-role keys,
  grader tokens, or hidden tests.
- **Server-to-server:** satellite systems authenticate to the LMS with signed
  requests (HMAC + timestamp + idempotency) using secrets stored only on
  servers. See `docs/ecosystem-integration-design.md`.

---

## Kaveri Technologies Private Limited (legal / public identity)

| Field | Value |
|---|---|
| Legal entity | Kaveri Technologies Private Limited |
| Website | www.kaveritech.co.in |
| Email | kaveritech2022@gmail.com |
| Phone | +91 94900 67803 |
| Tirupati office | Flat No. 203, IInd Floor, Balaji Colony, Opp. Music College, Tirupati – 517 501 |
| Madanapalle office | D.NO: 4/2-20-14-4, Back Side Sidharth Theatre, Krishna Nagar, Madanapalle – 517325, Andhra Pradesh |

---

## 1. Main LMS / Learning Platform

| Field | Value |
|---|---|
| Product name | Kaveri Technologies Academy (learning product); legal identity Kaveri Technologies Private Limited |
| Repo | Narikparamala/kaveritechnologies2.0 |
| Owner | Kaveri Technologies |
| Host (public) | Main LMS is intended to be served at www.kaveritech.co.in (DNS not yet changed) |
| Production status | Not deployed — local/staging verification complete through local Supabase |
| Identity authority | Supabase Auth (same project as Coding Workspace) |
| Data authority | LMS Supabase schema: courses, lessons, enrollments, assignments, quizzes, coding practice, live classes, notifications, workshop bridge, secure grading |
| Integration status | Central notification outbox + email mailer (local verified); workshop bridge ingested; coding workspace consumes secure-grade for VS Code submissions (this branch) |
| Local dev project | Local Supabase instance mirroring the shared schema |

## 2. Coding Workspace

| Field | Value |
|---|---|
| Repo | Narikparamala/kaveri-coding-workspace |
| Apps | `apps/vscode-extension` (VS Code extension), `apps/dashboard` (web dashboard) |
| Owner | Kaveri Technologies |
| Host (dashboard) | https://kaveri-coding-dashboard.vercel.app |
| Production status | Live product (dashboard deployed); extension distributed via VS Code marketplace flow — no new Marketplace publication yet |
| Identity authority | Supabase Auth — same project as the LMS. Extension uses Google OAuth (PKCE), refresh tokens and session stored only in VS Code SecretStorage |
| Data authority | `coding_vscode_assignments`, `coding_vscode_test_cases`, `coding_vscode_submissions`, `coding_vscode_assignment_batches`, `coding_vscode_student_assignment_access`, batches, `batch_students` — RLS-locked; batch/student-release access model |
| Integration status | **VS Code submissions → LMS secure-grade → go-judge hidden-test grading → server-verified result** (this branch). Hidden tests never leave the server. Visible tests run locally in the extension only |
| Domain later | Optionally learn.kaveritech.co.in or a subpath of www.kaveritech.co.in — see deployment review |

## 3. Workshop Registration

| Field | Value |
|---|---|
| Repo | Narikparamala/kaveri-workshop-nextjs |
| Owner | Kaveri Technologies |
| Host | https://kaveri-workshop-nextjs.vercel.app |
| Backend | Google Apps Script + Google Sheets (still the registration/email source of truth for workshop confirmations) |
| Production status | Live |
| Identity authority | None (attendees may not have an LMS account). LMS linking happens only when the matching Supabase Auth email is verified |
| Data authority | Apps Script/Sheets (source) + LMS `workshops` / `workshop_registrations` (central bridge copy) |
| Integration status | Workshop Bridge V1 signed (HMAC + timestamp + idempotency) into LMS `integrations-workshop` edge function. Single email source: Apps Script confirmation remains; central outbox does not send workshop confirmations |
| Domain later | Learn/workshop subdomain decision pending |

## 4. Certificate Verification

| Field | Value |
|---|---|
| Project | Hatchable project `proj_sCp2hKOTU1QC` |
| Host | https://kaveri-certificate.hatchable.site |
| Owner | Kaveri Technologies |
| Production status | Live (Hatchable-hosted) |
| Identity authority | None — verification by certificate code |
| Data authority | Certificate records (Hatchable) |
| Integration status | Not yet integrated with LMS certificate issuance; certificates in LMS issue independently today |

## 5. Offline Question Paper / Examination

| Field | Value |
|---|---|
| Repo | Narikparamala/kaveri-question-paper-system |
| Owner | Kaveri Technologies |
| Host | Not deployed to a public URL yet (offline/local tool) |
| Production status | In use offline |
| Identity authority | None yet — faculty/student identities not yet linked |
| Data authority | Its own local store |
| Integration status | Not started. Planned: Faculty → Offline Exams → question-paper module → generate/print → record marks → show results on the student LMS profile. Shared references: `course_id`, `faculty_id`, `student_id`, `exam_id` |

---

## Shared Supabase project

The LMS and Coding Workspace share one Supabase project. Both codebases can
therefore hold schema/migrations for shared tables (`coding_vscode_*`,
`secure_grading_runs`, `workshops`, `notifications`, `profiles`).

**Operational rule:** no migration is ever applied to the shared production
project without an explicit, reviewed deployment step. During development all
migrations are applied to the local Supabase instance only and recorded in the
local `supabase_migrations` history.

## Integration health

| System | Webhook/endpoint | Secret location | Last verified |
|---|---|---|---|
| Workshop → LMS | `integrations-workshop` edge function | LMS vault / env `integrations.workshop.secret`; workshop app server env `KAVERI_PLATFORM_WORKSHOP_SECRET` | Workshop Bridge Final hardening |
| VS Code → LMS grading | LMS `secure-grade` edge function (kind `vscode`) | User JWT only; runner token stays server-side | Coding Workspace Integration V1 |
| Mailer | `notification-mailer` edge function | Vault / env | Email delivery readiness + final hardening |
