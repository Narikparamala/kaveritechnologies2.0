# Platform Maintenance Guide — Kaveri Technologies Academy

A practical playbook for keeping the platform healthy so faculty teach happily and students learn happily.

## 1. Daily habits (5 minutes)

| Check | Where | Healthy looks like |
|---|---|---|
| Error spike? | Vercel → Deployments → Runtime Logs | No repeated 500s |
| Logins working? | Sign in once yourself | Login < 3 s |
| New enrollment requests | Faculty → Enrollment Requests | Handled same day |
| Live class links | Faculty → Live Classes | Today's sessions have working links |
| Student submissions piling up? | Faculty → Submissions | Oldest ungraded < 3 days |

## 2. Weekly habits (30 minutes)

1. **Review quiz + coding practice analytics** — Faculty → Quizzes shows attempt counts; a quiz with a 0% pass rate usually means a broken question, not weak students. Open the quiz, check the correct answers are actually marked.
2. **Check the question bank for duplicates** — Faculty → Question Bank; duplicate titles with "(copy)" suffixes can be cleaned up.
3. **Storage growth** — Supabase Dashboard → Storage. The three buckets (`project-submissions`, `profile-avatars`, `question-paper-assets`) should stay in the free-tier comfortable zone; oversized submissions usually mean someone is uploading videos — set expectations with faculty.
4. **Database size** — Supabase Dashboard → Database → Usage. If approaching the plan limit, archive old quiz attempts (`quiz_attempts` grows fastest).
5. **Backups** — Supabase Dashboard → Database → Backups. Confirm a recent daily backup exists. For extra safety, run `npx supabase db dump --linked -f backups/weekly-$(date +%F).sql` and keep the file somewhere safe.

## 3. Monthly habits

- **Rotate the admin password** and re-share credentials only with real staff (this protects the Super Admin account used for everything).
- **Review profiles with staff roles** — SQL: `select email, role from public.profiles where role in ('faculty','super_admin') order by role;` — remove people who left.
- **Check RLS is still on for every table**: any table where `rowsecurity = false` is a finding.
  ```sql
  select relname, relrowsecurity from pg_class join pg_namespace n on n.oid = relnamespace
  where nspname = 'public' and relkind = 'r' order by relrowsecurity, relname;
  ```
- **Try a fresh student account end-to-end** — enroll in a course, take a quiz, submit a coding practice. Broken student flows are invisible in admin analytics; only a fresh test account catches them.
- **Review Vercel usage** — bandwidth + function invocations; spikes usually trace to the bundled Monaco editor chunk or heavy images.

## 4. Content freshness (auto-update setting)

The platform has an **Auto-Update Content** setting under **Admin → Platform Settings**. When enabled, the home dashboard shows a "New technologies" news feed so the academy's content keeps pace with the industry. How to operate it:

- Toggle it on/off in Admin → Platform Settings → Content Updates. Changes apply instantly for all logged-in users (no redeploy needed).
- The feed uses a small curated set of technology items (Python ecosystem, AI tooling, web frameworks, cloud, security). If you want different topics, edit `src/services/platformSettings.ts` (`TECH_NEWS_SEED`) — no database change needed.
- If the feed fails to load (e.g. offline), the dashboard silently hides it — never blocks the page.

## 5. When something breaks

| Symptom | First thing to check | Likely fix |
|---|---|---|
| Faculty can't log in | Supabase → Auth → Users (user exists? email confirmed?) | Resend confirmation / reset password |
| Student sees "Access Denied" in builder | Faculty not assigned to course | Add the faculty row in `course_faculty` (or sign in as Super Admin) |
| Quiz won't publish | Quiz has 0 questions, or a True/False question missing options | Open the quiz, add/fix questions, publish again |
| Uploads fail | Bucket policies + file size (supabase/storage policies in SQL editor) | Re-apply storage policy; ask user to upload smaller file |
| Pages blank after deploy | Vercel build log | Usually a missing dependency — sync `pnpm-lock.yaml` (see below) |
| Slow for everyone | Supabase status page + Vercel status | Platform outage; wait |

## 6. Deploying changes the right way

1. Changes go through a Pull Request (never push to `main` directly).
2. **Vercel builds with pnpm** — if `package.json` changed, run `pnpm install` locally so `pnpm-lock.yaml` updates, and commit it. A stale lockfile is the #1 cause of failed deploys.
3. Supabase schema changes must be SQL migration files in `supabase/migrations/` (named `YYYYMMDDHHMMSS_description.sql`), applied with `npx supabase db push --linked` — never edit production tables by hand.
4. After merging, open the live site and click through the changed feature before announcing it.

## 7. Keeping students and faculty happy

- **Respond to enrollment requests daily** — the queue is the first touch a new student has with the academy.
- **Announce new content** — after adding chapters/quizzes, message the batch. Content nobody knows about might as well not exist.
- **Watch the pass rate on published quizzes** — 70% default pass percentage is sensible; if most students fail, fix teaching or the quiz, not the percentage.
- **Keep chapters small** — 4–8 lessons per chapter reads better than 20 and loads faster on phones, where most students will be.

## 8. Emergency contacts & runbooks

- Supabase project: `atcncxckuokjarsxckwy` (linked via `npx supabase` CLI in this repo)
- Production: https://kaveri-academy.vercel.app (Vercel project: kaveritechnologies2.0)
- Rollback: Vercel → Deployments → … → "Promote to Production" on the last good deployment.
