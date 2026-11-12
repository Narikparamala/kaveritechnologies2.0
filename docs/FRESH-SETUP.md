# FRESH-SETUP.md — Run Kaveri Academy as a new user

*Verified 2026-11-12 on Node v24.22.1 / npm 10.9.4. The shell
runs in ~10 minutes. Real data needs a real Supabase backend.*

## A. Shell only (10 minutes, no account needed)

Use this to prove the build works and to see the UI. No courses,
no login, no data will work — that is expected.

```bash
# 1. Clone — do NOT clone into /tmp on small machines.
#    /tmp here was a 512 MB tmpfs and filled up with ENOSPC errors.
git clone https://github.com/Narikparamala/kaveritechnologies2.0.git
cd kaveritechnologies2.0

# 2. Install (588 packages, ~25 s, node_modules ~515 MB)
npm ci

# 3. Env — dummy values only, never real keys
cp .env.example .env.local
# Fill .env.local with placeholders:
#   VITE_SUPABASE_URL=https://placeholder.supabase.co
#   VITE_SUPABASE_ANON_KEY=placeholder-anon-key-dummy-value
# Firebase vars are optional; leave the placeholders from .env.example.

# 4. Check it builds and typechecks
npm run typecheck   # zero errors expected
npm run build       # ~1 m 27 s, dist ~16 MB
# Known warning only: CodeEditor chunk 3,348 kB (Monaco) > 1000 kB.

# 5. Run it — use dev:plain, NOT dev
npm run dev:plain   # ready in ~600 ms at http://localhost:5173/
# npm run dev wraps in `infisical run` and fails without Infisical CLI.
curl -s http://localhost:5173/  # HTTP 200, title "Kaveri Technologies Academy — IT Training Platform"
```

What you will see: landing page shell, routing, static pages.
What will fail: course listings, login, anything backed by the
database (`LandingPage.tsx:60` queries `supabase.from('courses')`
and gets nothing from a placeholder host).

## B. Real run (needs a Supabase project)

1. **Create a Supabase project** (any region; Kaveri prod is
   ap-south-1, Postgres 17). Note its URL + anon key.
2. **Apply migrations in filename order** — 160 files in
   `supabase/migrations/`, first
   `20260708072337_01_initial_schema.sql`, last
   `20261022100000_faculty_ai_connections.sql`. There is no
   single "bootstrap new tenant" script yet; apply them
   deliberately and in order (see README §9). Do not reorder
   or squash.
3. **Create storage buckets:** `project-submissions`,
   `profile-avatars`, `question-paper-assets` (partly in
   migrations, partly manual — verify all three exist).
4. **Deploy the 12 edge functions** in `supabase/functions/`
   and set their secrets (full list in `ARCHITECTURE.md` §5):
   Gemini, go-judge, Resend, FCM, Google, notification tokens,
   workshop/lead secrets, `AI_KEY_ENCRYPTION_SECRET`.
   Mailer is fail-closed: without `MAILER_PROVIDER` it logs
   and does not send.
5. **Configure pg_cron** for the notifications outbox driver
   (migrations `20260905180000_central_notifications_outbox.sql`,
   `20260929110000_push_subscriptions_and_outbox_driver.sql`).
6. **Enable Google OAuth** + Meet/Calendar redirect URIs.
7. **Firebase project** + VAPID key + service account, for push.
8. **Seed data:** prod seed is
   `20260708072637_02_seed_data.sql` (172 lines, Kaveri-specific).
   For a fresh tenant, create your own seed users/courses, or
   create the first `super_admin` in Supabase Auth and set
   `profiles.role = 'super_admin'` for that user.
9. **Put real values in `.env.local`:**
   `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, Firebase vars.
10. **Run:** `npm run dev:plain`, then smoke-test: landing →
    login → one course opens → one lesson completes → one quiz
    submits → one coding question grades.

## C. Test accounts

There are **no documented seed credentials** — test accounts
"come from the team". For local QA without an account, use:

```
VITE_PREVIEW_ROLE=student   # or faculty — in .env.local only, never production
```

Demo mode: `/demo/student|faculty|admin`, demo data in
`src/data/demoData.ts` (`kiran.demo@`, `priya.demo@`,
`admin.demo@kaveritechacademy.in`).

## D. Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `ENOSPC: no space left on device` on install/build | `/tmp` too small. Clone/install in home/workspace, free `/tmp` |
| `npm run dev` fails | Infisical CLI not installed. Use `npm run dev:plain` |
| `Missing Supabase environment variables` | `.env.local` missing `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` — even dummy values are required to import the app |
| Landing loads, courses empty | Dummy/placeholder Supabase URL, or migrations not applied |
| Login fails | Google OAuth redirect URIs not configured, or user has no `profiles` row / role |
| Push notifications silent | Firebase vars / VAPID / service account missing — push stays idle by design |
| Emails never arrive | `MAILER_PROVIDER` / `RESEND_API_KEY` unset — mailer is fail-closed by design |

## E. Deploy (Vercel)

`main` auto-deploys to Vercel. Set the same `VITE_*` vars in
Vercel project settings. Note: Muse's Vercel API access was
blocked (403 for team `narikparamalas-projects`) on 2026-11-12
even after reconnect — the live site itself loads fine, only
API access to the team is blocked. Grant the integration access
to the team/project in the Vercel dashboard if API access is needed.
