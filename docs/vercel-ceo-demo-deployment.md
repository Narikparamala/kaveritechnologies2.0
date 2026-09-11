# Kaveri LMS — CEO Demo Deployment to Vercel

Goal: deploy the current LMS (this branch) to Vercel as a working demo for the
CEO / HR review, using the existing **`kaveri-academy`** Vercel project.

**Scope:** deploy the frontend only. Do NOT deploy production Supabase
migrations, change DNS, or touch production OAuth credentials as part of this
step.

---

## 1. Prerequisite — the demo must point at a COMPLETE Supabase schema

The app reads `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` at build time
(`src/lib/supabase.ts`). Those are public client keys — safe to set in Vercel.

**Critical:** the schema must match this branch's migrations. The current
production Supabase project is known to have schema drift (an old migration
expects `public.lesson_progress`, which is missing remotely), so **do not**
point the demo at that project until the drift is repaired.

Choose one:

- **A. Local demo (recommended for today):** keep pointing at the local
  Supabase stack (`http://127.0.0.1:54321`) via a `.env` file and run
  `npm run dev` / `npm run preview`. No cloud deployment required.
- **B. Hosted demo:** create a NEW Supabase project (e.g. `kaveri-demo`),
  apply the FULL migration chain with `supabase db push --linked` (first
  review the remote migration history — see note below), enable the auth
  providers the demo uses, then set the Vercel env vars to that project.
- **C. After production repair:** once the production schema drift is fixed
  and reviewed, the demo may target the production project. Do not do this
  before that review.

> Migration-safety rule: never mark migrations as applied to bypass an error.
> If a migration fails on the remote project, diagnose the schema difference
> and write the smallest forward-only repair migration, reviewed before push.

## 2. Vercel configuration (already prepared in this branch)

| Setting | Value |
|---|---|
| Framework preset | Vite |
| Build command | `npm run build` |
| Output directory | `dist` |
| SPA rewrites | `vercel.json` (included — all routes → `/index.html`) |
| Node version | 20+ (Vercel default is fine) |

## 3. Env vars in the Vercel project (`kaveri-academy`)

| Variable | Value |
|---|---|
| `VITE_SUPABASE_URL` | `https://<project-ref>.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | the anon (publishable) key — public client config, NOT the service-role key |

Never set `SUPABASE_SERVICE_ROLE_KEY`, `GO_JUDGE_TOKEN`, or any integration
secret as a `VITE_` var — those never enter the browser bundle.

## 4. Demo seed checklist (after deployment)

For a convincing CEO/HR walkthrough the demo Supabase project needs:

1. Courses (3–4 real-looking Kaveri courses across Programming, Full Stack,
   Data / AI, Testing).
2. Faculty profile(s) with `role='faculty'` and `course_faculty` rows linking
   them to the courses.
3. Student profile(s) with **active `course_enrollments`**.
4. An **Offline Exam**: log in as faculty → Offline Exams → **New Exam**
   (title, course, date, duration, max marks) → save. The enrolled student
   sees it under Student → Offline Exams.
5. **Results**: faculty → Enter results (roster auto-loads from the course) →
   Save (private) → Publish. The student then sees only their own marks.
6. Optionally a **Question Paper sync** demo: finalize a paper in the QP app
   (locally) → signed webhook → exam appears centrally.

## 5. Auth notes for the hosted demo

- Email/password sign-up + login work out of the box if the Supabase project
  has email auth enabled.
- Google sign-in requires adding the Vercel app URL to the Google OAuth
  redirect allow-list and the Supabase redirect URLs (`Site URL` +
  `Redirect URLs` in Auth settings).
- First login: the user's `profiles` row must exist with the right role
  (seed via SQL or the dashboard).

## 6. Deploy steps

```bash
# 1) from the LMS repo root on branch bolt/continue-secure-grading
vercel link --project kaveri-academy      # or `vercel link` and choose it
vercel env add VITE_SUPABASE_URL production
vercel env add VITE_SUPABASE_ANON_KEY production
vercel --prod
```

Alternatively import the repo in the Vercel dashboard → project
`kaveri-academy` → add the two env vars → Deploy.

## 7. Post-deploy smoke checklist

- [ ] Public landing loads and shows Kaveri branding
- [ ] Faculty login → Offline Exams → New Exam → created
- [ ] Student login → sees the upcoming exam (metadata only, no questions)
- [ ] Faculty enters + publishes results
- [ ] Student sees own published result; another student does not
- [ ] No console 4xx/5xx on the demo pages used in the walkthrough