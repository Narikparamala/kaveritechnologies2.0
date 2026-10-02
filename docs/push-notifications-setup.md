# Push Notifications (Firebase Cloud Messaging) — Setup & Verification

Web push for Kaveri Academy via FCM. **Cost: free** — FCM has no per-message
charges and no SMS-style limits. Students grant browser permission once; the
platform delivers through the existing central outbox.

This runbook takes the already-built pipeline from "code present" to "live in
production". Placeholder values live in `.env.example`.

## Architecture (already committed — nothing to write)

```
Browser (student/faculty)
  ├─ PushNotificationCard (Settings page) → Notification.requestPermission()
  ├─ src/services/push.ts → getToken(vapidKey) via /firebase-messaging-sw.js
  └─ token upserted into push_subscriptions (own-row RLS)

Business event → notifications table (bell)
  └─ trigger notifications_auto_push → kaveri_queue_push
       └─ notification_outbox (channel 'push', template 'push.generic')

pg_cron (every minute) → process_notification_outbox(50)
  └─ net.http_post → notification-push edge function
       headers: Authorization: Bearer <anon key>   (gateway pass, vault)
                X-Kaveri-Mailer-Token: <secret>    (real auth, vault)
  ├─ loads the outbox row (row = message authority; body only has outbox_id)
  ├─ loads recipient's active push_subscriptions
  ├─ FCM HTTP v1 (service-account JWT → OAuth token, cached)
  └─ resolve: sent (incl. 0 devices) | queued + backoff | failed
```

The same worker minute also drains the email channel through
`notification-mailer`, so fixing the driver fixes both.

## Current status (verified 2026-09-29)

| Piece | State |
|---|---|
| Client wiring (SDK, SW, settings card, push service) | ✅ committed; env vars set in `.env.local`; `generate-sw-config` prints `configured` |
| `push_subscriptions` table on prod | ✅ exists with RLS (anon select → 200 `[]`) |
| `notification-push` edge function on prod | ✅ deployed (responds 401 to unauthenticated calls) |
| DB driver (cron, `kaveri_queue_push`, trigger, vault) | ❓ artifacts from the earlier ops pass (`.freebuff/step1.sql`, `mailer-token.txt`) indicate applied — verify in Step 5/6 |
| `FCM_SERVICE_ACCOUNT_JSON` function secret | ❌ must be set (Step 4) |
| Vercel `VITE_*` env vars | ❌ must be added, then redeploy (Step 8) |

## Step 0 — Prerequisites

```bash
npm install                      # firebase SDK is already a dependency
npm i -g supabase                # if the CLI is not installed
supabase login
supabase link --project-ref atcncxckuokjarsxckwy
```

## Step 1 — Firebase console: VAPID key (you still need this)

1. Open https://console.firebase.google.com → project **kaveri-academy**
2. ⚙️ **Project settings → Cloud Messaging** tab
3. Under **Web Push certificates** → **Generate key pair**
4. Copy the public key (starts with `B...`, ~87 chars) — this is
   `VITE_FCM_VAPID_KEY` in Steps 3 and 8.

Without it `getToken()` cannot register devices; the settings card will
enable but never save a subscription.

## Step 2 — Firebase console: service account JSON (you still need this)

1. Same ⚙️ **Project settings → Service accounts** tab
2. **Generate new private key** → downloads a JSON file
3. Keep it out of git. It is only set as a Supabase function secret (Step 4).

This authorizes the `notification-push` edge function to send via FCM
HTTP v1 as the project.

## Step 3 — Local environment (.env.local)

Append (never overwrite your existing Supabase lines):

```bash
cat >> .env.local <<'EOF'

# --- Firebase Web Push (FCM) — public-by-design web config ---
VITE_FIREBASE_API_KEY=AIzaSyAzpMtg7tyNEW9__7NOmcBulYYRXGTnG3g
VITE_FIREBASE_AUTH_DOMAIN=kaveri-academy.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=kaveri-academy
VITE_FIREBASE_MESSAGING_SENDER_ID=341660072172
VITE_FIREBASE_APP_ID=1:341660072172:web:f9c470d1f068e28f918dc9

# Paste the key generated in Step 1:
VITE_FCM_VAPID_KEY=PASTE_VAPID_PUBLIC_KEY_HERE
EOF
```

Sanity-check the service-worker config picks it up:

```bash
node scripts/generate-sw-config.mjs
# expect: [generate-sw-config] firebase-config.js: configured
```

(`placeholder (keys missing)` means a var above is empty — recheck the file.
`public/firebase-config.js` is generated at build time and gitignored.)

## Step 4 — FCM service account on Supabase (server-side, never VITE_*)

The `notification-push` function reads the service account from the
`FCM_SERVICE_ACCOUNT_JSON` function secret, or — when that is unset — from
Supabase Vault (secret name `fcm_service_account_json`, database-encrypted).
Env secret keeps precedence. Pick **one** option:

**Option A — dashboard function secret (works today, no redeploy).**
Dashboard → Edge Functions → Secrets → Add new secret:
name `FCM_SERVICE_ACCOUNT_JSON`, value = the service-account JSON on a
single line (see Step 2 for the download). Also add `FCM_PROJECT_ID` =
`kaveri-academy` if not present. CLI equivalent of Option A:

```bash
# one-liner: strip newlines from the downloaded JSON, set as a secret
supabase secrets set FCM_SERVICE_ACCOUNT_JSON="$(tr -d '\n' < ~/Downloads/kaveri-academy-*.json)"
supabase secrets set FCM_PROJECT_ID=kaveri-academy
supabase secrets list   # both should appear
```

**Option B — Vault (recommended).** SQL editor:

```sql
select vault.create_secret(
  '<service-account JSON on one line>',
  'fcm_service_account_json'
);
```

Then redeploy so the running function picks up the Vault fallback:
`supabase functions deploy notification-push`.

Rotation runbook (leaked / expired keys): see
[Rotating the FCM service account](#rotating-the-fcm-service-account).

## Step 5 — Vault secrets for the DB worker

The every-minute worker authenticates to both edge functions with the SAME
shared token (`notification_mailer_token`) and routes through the gateway
with `supabase_anon_key`. Verify first, set only if missing:

```bash
supabase db query --linked \
  "select name from vault.decrypted_secrets where name in ('notification_mailer_token','supabase_anon_key');"
```

If either is missing, generate and set it:

```bash
openssl rand -hex 32          # this output is your mailer token
supabase db query --linked "select vault.create_secret('<64-hex-token>', 'notification_mailer_token');"
supabase db query --linked "select vault.create_secret('<VITE_SUPABASE_ANON_KEY>', 'supabase_anon_key');"
```

## Step 6 — DB driver (migration 20260929110000, idempotent — safe to re-run)

Verifies then applies `push_subscriptions` + outbox driver if not already on:

```bash
supabase db query --linked "select jobname, schedule, active from cron.job where jobname = 'process-notification-outbox';"
```

If the row is missing:

```bash
supabase db query --linked --file supabase/migrations/20260929110000_push_subscriptions_and_outbox_driver.sql
```

The migration creates the table + RLS, widens the outbox channel to `'push'`,
adds `kaveri_queue_push`, the auto-enqueue trigger, the `email_delivery` /
`push_delivery` settings rows, and the `* * * * *` cron schedule. Re-running
it is a no-op on an applied database.

## Step 7 — Deploy the edge functions

```bash
supabase functions deploy notification-push
supabase functions deploy notification-mailer   # if changed since last deploy
```

## Step 8 — Vercel (production build)

Add the six `VITE_` vars (Project → Settings → Environment Variables, all
environments):

| Variable | Value |
|---|---|
| `VITE_FIREBASE_API_KEY` | `AIzaSyAzpMtg7tyNEW9__7NOmcBulYYRXGTnG3g` |
| `VITE_FIREBASE_AUTH_DOMAIN` | `kaveri-academy.firebaseapp.com` |
| `VITE_FIREBASE_PROJECT_ID` | `kaveri-academy` |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | `341660072172` |
| `VITE_FIREBASE_APP_ID` | `1:341660072172:web:f9c470d1f068e28f918dc9` |
| `VITE_FCM_VAPID_KEY` | the Step 1 key |

Redeploy so the build-time step injects them into `firebase-config.js`.

## Step 9 — Verify end-to-end

**Local (dev server on 5173):**

1. `npm run dev` → sign in as a student
2. Settings → **Push notifications** card → **Enable** → accept the browser
   permission prompt → card should show the device as registered
3. Click **Send test** → bell entry now, OS notification within ~1 minute

**Production (SQL smoke test):**

```bash
supabase db query --linked "
  select channel, status, count(*)
  from public.notification_outbox
  group by 1, 2 order by 1;"
```

Then trigger one real notification (use any real `profiles.id`):

```sql
insert into public.notifications (user_id, title, message, type, action_url)
values ('<profile-uuid>', 'Push smoke test', 'FCM pipeline verification', 'system', '/notifications');
```

Within a minute there should be a `push` row and an `email` row in
`notification_outbox`, both resolving to `sent` (push resolves `sent` with
`provider_message_id = 'no-active-devices'` if that user has no registered
device — that is honest, not an error).

**Full check — push actually arrives on the device:** after Step 9-local the
signed-in browser is a registered device, so the SQL smoke test should pop a
real OS notification on it.

## Rotating the FCM service account

Service-account keys are bearer credentials for your whole Firebase project.
If one was ever pasted into chat, committed, or shared, treat it as burned:

1. **Firebase console** → kaveri-academy → Project settings → Service
   accounts. **Delete** the burned key (e.g. `65e0287a…`, created 30 Sep 2026),
   then **Generate new private key** for a fresh JSON. Pushes signed by a
   deleted key stop working — rotate first, reconfigure right after.
2. Put the new JSON on one line — PowerShell:
   `(Get-Content "$HOME\Downloads\kaveri-academy-*.json" -Raw) -replace "`r?`n", " " | Set-Clipboard`
3. Store it via Step 4 Option A (function secret) or Option B (Vault).
   `vault.create_secret` with an existing name updates the secret in place.
4. Redeploy `notification-push` if the value moved between storage types
   (env ↔ Vault); same-name secret updates are picked up on the next invocation.
5. **Never paste keys into chat, issues, or tickets.** Reference the key by
   its trailing id only.

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| Card says "Push is not configured yet" | A `VITE_FIREBASE_*` or `VITE_FCM_VAPID_KEY` missing → `node scripts/generate-sw-config.mjs` must print `configured` |
| Enable succeeds, no device saved | VAPID key missing/invalid → check DevTools console for `[push]` errors |
| Outbox rows resolve `skipped` with `PUSH_NOT_CONFIGURED` | Service account not set — Step 4 Option A (function secret) or Option B (Vault `fcm_service_account_json` + redeploy) |
| Rows stay `queued` forever | cron job missing (Step 6) or vault secrets missing (Step 5) — the worker can't POST without them |
| `401` from the function in worker logs | vault `notification_mailer_token` differs from what the worker sends → re-set it (Step 5) |
| FCM `404/410` on send | stale device token → the function revokes it automatically; user re-enables |
