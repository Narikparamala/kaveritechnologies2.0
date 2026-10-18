# QA data policy — why prod must stay clean

_Incident (Oct 2026): QA automation signed up `qa-e2e-*@kaveri-qatest.com`
accounts and a preview session for seed UUID
`10000000-0000-0000-0000-000000000001` directly against the **production**
Supabase project. Test enrollments, enrollment requests, XP grants,
certificates and a "Draft/QA" course leaked into the live student/faculty
portal and skewed dashboard counts ("0 students" vs "17 Active Students")._

## Policy

1. **QA and seeding run against the disposable preview project only.**
   Never point a QA script, E2E run, or seeding script at the production
   Supabase URL or the production Vercel deployment. Environment selection is
   controlled by `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` in the
   environment (preview env file) — check it before launching a run.
2. **Every QA identity is marked.** QA-created auth accounts use emails ending
   `@kaveri-qatest.com`, and rows carry `is_test = true`
   (`profiles.is_test`, `courses.is_test`, `course_enrollments.is_test` were
   added by migration `20261018120000_stats_streak_and_course_plan.sql`).
   Anything without the flag is treated as real user data and must never be
   bulk-deleted.
3. **The one-time purge ran inside the same migration as policy:
   `supabase/migrations/20261018120000_stats_streak_and_course_plan.sql`** —
   it marks every enumerated artifact with `is_test` *before* deleting, so a
   future recovery is at least theoretically possible from the migration
   history. Do not add further ad-hoc delete scripts for prod.
4. **New test data in prod is treated as an incident.** If QA data appears in
   prod again: stop the run, mark the rows `is_test`, then follow the same
   mark-then-delete pattern inside a dated migration (never a live console
   delete), and file the culprit script.

## Ops checklist for QA authors

- [ ] Target URL in the script is the **preview project** (not
      `atcncxckuokjarsxckwy`).
- [ ] All created accounts use `qa-*@kaveri-qatest.com` emails.
- [ ] Rows created are tagged `is_test = true` at the insert site where the
      script writes SQL directly.
- [ ] No script touches `public.profiles` of real student/faculty users.
