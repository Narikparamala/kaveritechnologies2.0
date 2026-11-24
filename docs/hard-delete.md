# Hard delete — students, faculty, admins

Added 2026-11-24 (`feature/hard-delete-user`). Additive only: no existing
page, RPC, policy, or flow was changed — only new code was added.

## What it does

A Super Admin can permanently delete a student, faculty member, or admin
from **Student Management**, **Faculty Management**, or **Users &
Permissions** (a new Delete button next to the existing buttons). The
delete removes the account completely:

- the login (`auth.users` row) — deleting it cascades to the profile
  and every CASCADE dependent: enrolments, lesson progress/notes/
  bookmarks, assignment/quiz/project submissions, certificates,
  achievements, XP, coding attempts, enrolment requests, batch
  memberships, attendance, support records, faculty employment/
  compensation/reviews, saved AI connections, push subscriptions, and
  **payment orders + transactions**.
- avatar / project files in the `profile-avatars` and
  `project-submissions` buckets.

A faculty member cannot delete directly. On **My Students** they get a
**Request Delete** button: the same export + reason + AI report flow,
but it files a request in `user_deletion_requests` for a Super Admin to
approve or reject on **Users & Permissions**. Approving runs the same
guarded delete.

## Before the delete: download + reason report

The confirm modal forces the order: preview → download → reason → report
→ type-the-email confirm.

1. **Preview** — counts of everything that will vanish, and any
   RESTRICT blockers (teaching-work rows, question papers the person
   created/finalised, paper versions, print/AI/audit rows). A blocked
   delete fails closed and names the blockers.
2. **Download** — one click downloads the full record (JSON) plus a
   readable summary (text): profile, enrolments, progress, submissions,
   XP, certificates, payment orders/transactions, support records, and
   more. **This file is the retained record** — payment records are
   deleted with the account (owner decision 2026-11-24), nothing
   anonymised is kept in the database. The admin may explicitly skip
   the download instead.
3. **Reason + AI report** — the admin/faculty types the reason in plain
   words; **Draft with AI** turns it into a short, polite notice for
   the student (who, what was removed, why, what to do if it was a
   mistake). It reuses the platform Gemini path (the staff member's own
   AI connection first, platform `GEMINI_API_KEY` fallback). If no AI
   key is configured it falls back to a ready-made template — the AI
   never blocks the flow. The report is fully editable in the modal,
   or the admin can type it directly.

## Guards (all fail closed)

- Only a Super Admin can delete. Faculty may only act on students
  enrolled in their own courses.
- Self-delete is rejected; deleting the last active Super Admin is
  rejected; the synthetic Preview Student (`00000000-…-0001`, a
  hardcoded demo profile, not a DB row) is rejected.
- Every delete writes an `activity_logs` row (`user_hard_deleted`)
  with the reason, report, and counts, before the account is removed.
- No bulk delete. Test/QA accounts (`is_test`) are flagged in the modal.

## Files

- Edge function: `supabase/functions/admin-delete-user/index.ts`
  (`verify_jwt = false` in `supabase/config.toml`; the JWT is verified
  inside, like the payment functions). Actions: `preview`, `export`,
  `generate-report`, `delete`, `request`, `list-requests`,
  `review-request`.
- Migration: `supabase/migrations/20261124120000_user_deletion_requests.sql`
  (new table only, RLS: Super Admin all, faculty own rows).
- Frontend: `src/services/userDeletion.ts`,
  `src/components/admin/DeleteUserModal.tsx`; Delete buttons wired
  into `AdminStudentManagementPage`, `AdminFacultyManagementPage`,
  `UsersPage` (plus the pending-requests review section), and
  `FacultyStudentsPage` (request only).
- No new secrets. The function uses only the injected Supabase keys
  and the existing Gemini path.

## Staging verification (do this before any prod use)

1. Deploy the function + apply the migration to **staging only**.
2. Delete a test student with enrolments/submissions/XP/certificates/
   payments → deletes cleanly, export contained the payment records.
3. Delete a faculty member with question-paper/teaching rows → blocked
   with the blockers named; after cleanup it deletes.
4. Self-delete, last-Super-Admin delete, and Preview Student delete
   are all rejected.
5. A deleted user cannot sign back in (auth row is gone).
6. A faculty request appears in Users & Permissions; approve deletes,
   reject leaves the account untouched.
7. With no AI key configured, the report falls back to the template
   and stays editable.

Production: do not enable until the staging checks above pass and the
owner approves. The migration and function must be applied/deployed
to prod deliberately, like the payment functions were.
