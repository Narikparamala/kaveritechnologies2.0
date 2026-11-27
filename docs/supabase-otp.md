# Supabase OTP — email + phone one-time codes

Added 2026-11-24, branch `feature/supabase-otp` (DRAFT PR — see AI-WORK-LOG).
Additive only: password login, Google OAuth, and the email magic-link
password reset are **unchanged**. No migration, no new edge function, no
new DB table, no secrets in the repo. No Firebase Phone Auth was built.

## What was added

| File | What it is |
|---|---|
| `src/services/otpAuth.ts` (new) | All Supabase Auth OTP calls + friendly error mapping + phone normalisation. |
| `src/components/auth/OtpLoginForm.tsx` (new) | Email-code / SMS-code sign-in form (login) and email-code sign-up form (register). |
| `src/components/settings/PhoneVerificationCard.tsx` (new) | Optional phone verification for a signed-in student (Settings page). |
| `src/pages/auth/LoginPage.tsx` | One toggle button under the password form: "Sign in with an email or SMS code instead". Password form + Google button untouched. |
| `src/pages/auth/RegisterPage.tsx` | One toggle button under the sign-up form: "Create account with an email code instead". Password form + Google button untouched. |
| `src/pages/student/SettingsPage.tsx` | `<PhoneVerificationCard />` inserted before the Danger Zone. Nothing else changed. |

## Email OTP (primary — works today, no provider setup)

1. Login page → "Sign in with an email or SMS code instead" → Email code tab.
2. User enters their email → `supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: false, emailRedirectTo: <origin>/auth/redirect } })`.
3. Supabase Auth sends the email via the same mailer that already sends
   confirmation / password-reset emails.
4. User types the 6-digit code → `supabase.auth.verifyOtp({ email, token, type: 'email' })`.
5. On success the app navigates to `/auth/redirect`; the existing
   `AuthContext` `onAuthStateChange` listener picks up the new session and
   loads the profile exactly as password login does.

Details / edge cases:
- **Code vs magic link:** whether the email contains a 6-digit code or a
  sign-in link depends on the Supabase dashboard email template
  (Dashboard → Authentication → Templates → "Magic Link"). If the template
  contains `{{ .Token }}`, the user gets a code; otherwise they get a link.
  The UI tells the user both work — type the code, or click the link.
  To guarantee codes, an admin should edit that template to include
  `{{ .Token }}` (dashboard-only change, no code).
- **Login never creates an account:** `shouldCreateUser: false`, so a
  typo'd email fails with "No account exists…" instead of silently
  creating one.
- **Register:** the same form with `shouldCreateUser: true` and the full
  name collected first and passed as user metadata (`data: { full_name }`)
  so the profile trigger can pick it up. Register is email-only — a phone
  sign-up would create an account with no name.
- **Errors:** wrong/expired code, resend with a 60-second cooldown, and
  rate limiting (429) all show plain-English messages
  (`friendlyOtpError` in `src/services/otpAuth.ts`).
- **No new env vars.** Email OTP uses the project's existing Supabase Auth
  mailer settings.

## Phone OTP (wired, dashboard-gated — does NOT work yet)

1. Login page → OTP form → SMS code tab, or Settings → Phone Verification.
2. Login: `signInWithOtp({ phone, options: { shouldCreateUser: false } })`
   then `verifyOtp({ phone, token, type: 'sms' })`.
3. Settings (signed-in user linking a number): `updateUser({ phone })`
   sends the SMS code, then `verifyOtp({ phone, token, type: 'phone_change' })`.
   Supabase Auth records `phone_confirmed_at` itself; the verified number
   lands in the existing `profiles.phone` column.
4. Phone numbers are normalised to E.164 in `normalizePhoneNumber`
   (a bare 10-digit Indian number is assumed `+91`).

**Why it will fail today — and what to do about it:**
Phone OTP needs an SMS provider enabled in the Supabase dashboard. Until
then every phone request fails cleanly with a plain-English message in
the UI ("Phone sign-in is not set up yet…"), and email-code sign-in keeps
working. No Firebase Phone Auth, no Twilio keys in code.

Dashboard setup (admin, in the Supabase dashboard — no values belong in
the repo):
1. Open the project → **Authentication → Providers → Phone** → enable it.
2. Under SMS provider, choose **Twilio** and enter the Twilio credentials:
   **Account SID**, **Auth Token**, and a **Twilio phone number / Message
   Service SID** as the sender. (These are Twilio dashboard values; get
   them from https://console.twilio.com — do not paste them in chat, code,
   or docs.)
3. Save, then re-test: Settings → Phone Verification → send a code.
4. Optional hardening later: enable "Confirm phone" / phone-confirmation
   settings in Auth → Providers if the project wants phone numbers
   confirmed at sign-up.

**Do NOT** build Firebase Phone Auth for this — auth already lives in
Supabase and Firebase here is FCM push only (`src/lib/firebaseConfig.ts`).

## What deliberately did NOT change

- `src/contexts/AuthContext.tsx` — `signIn` (password), `signUp`, Google
  OAuth path, and the password reset flow (`ForgotPasswordPage` /
  `resetPasswordForEmail`) are untouched. OTP success reuses the existing
  session/profile flow via `onAuthStateChange`.
- No migration: `profiles.phone` already exists, and Supabase Auth tracks
  phone verification (`phone_confirmed_at`) itself, so no
  `phone_verified` flag column was needed.
- No new edge function: the OTP calls are direct Supabase Auth client
  calls, which need no server code.
- No phone number is ever required: the Settings card is optional and
  login still works with password / Google / email code.

## Staging verification (STAGING ONLY — `kaveri-academy-staging`)

Recorded 2026-11-24 night (23:45–00:10 IST); full entry in AI-WORK-LOG.
Test account (staging only): `narikparamala+otp-test-20261124@gmail.com`
(a Gmail plus-address; mail lands in the user's inbox, account is
staging-only, `is_test` NOT set — created by `signUp` at 18:15:19Z,
id `7185d5a0-…`). Test password kept in `/tmp` only, deleted after the run.

- **Staging project:** `vrzydtqcatgkfhifuchk`, ACTIVE_HEALTHY (verified via
  Management API before testing).
- **Email OTP request:** BLOCKED at first by the Supabase Auth mailer rate
  limit, not by the new code. First OTP request at 18:15Z → HTTP 429
  `over_email_send_rate_limit` "only request this after 54 seconds"
  (per-address resend cooldown, because the sign-up confirmation email had
  just been sent); retries at 18:17Z and later → HTTP 429
  `over_email_send_rate_limit` "email rate limit exceeded". A password-reset
  (`/auth/v1/recover`) probe returned the same 429, proving ALL Supabase
  Auth emails on staging were rate-limited at that point (project-level
  bucket, likely exhausted by today's earlier staging auth tests) — not
  OTP-specific. **The bucket refilled ~35 min later: a retry at 18:50Z
  returned HTTP 200 `{}` and the OTP email arrived in Gmail at 00:20:06 IST
  (25 Nov), from Supabase Auth, subject "Your sign-in link".**
- **Magic link, not a code (template finding):** the OTP email's body is
  "Your sign-in link — Follow the link below to sign in. This link expires
  shortly and can only be used once." — the default Supabase template sends
  a MAGIC LINK, no 6-digit code. The sign-in link itself is held as a Gmail
  credential reference (`[credential:07e7481a-6fbf-4037-ab15-8b083c581e66]`,
  message `1a20ee4d392fb49f`) for the parent to click/verify in the morning
  via the browser — the code path (`verifyOtp` with a typed code) therefore
  remains UNTESTED on staging until an admin edits the Auth "Magic Link"
  template to include `{{ .Token }}` (dashboard-only change). The UI already
  tells users both work (type the code, or click the link), so the shipped
  UI is correct for either template. `signInWithOtp` sending + delivery on
  staging is PROVEN; code-entry verification is NOT yet proven.
- **Mailer delivers on staging (proven):** the sign-up confirmation email
  arrived in Gmail at 23:45:22 IST from `Supabase Auth
  <noreply@mail.app.supabase.io>`, subject "Confirm your email address".
  Its template is likewise LINK-based (no 6-digit code;
  `redirect_to=http://localhost:3000`).
- **Email confirmation via the link:** fetching the confirmation link
  returned HTTP 303 to `http://localhost:3000/#access_token=…` — the
  email was confirmed server-side.
- **Password login (test-account anomaly, NOT a code regression):**
  password sign-in before confirmation correctly failed 400
  `email_not_confirmed`; after the confirmation link it fails 400
  `invalid_credentials` (retried 5×, incl. a Python request with the
  password read from the file it was written to at sign-up — the password
  string is clean, 22 chars, and the request was still failing at 00:20 IST
  after the OTP email arrived). Cause unknown: the test account's password
  may not have been stored as expected, or confirmation did not take
  effect as the 303 suggested. The password-login code path is
  byte-for-byte unchanged from `main` (no diff in `AuthContext.tsx` or
  `signInWithPassword`), so this is a staging test-account anomaly, not
  something this PR changed — but it must be re-tested after the OTP
  magic-link sign-in (which also confirms the account) before the PR is
  merged. If it still fails then, investigate the staging account rather
  than this PR's code.
- **Phone OTP (expected failure — PASS as a fail-clean check):**
  `signInWithOtp({ phone: '+919999999999' })` → HTTP 400
  `phone_provider_disabled` "Unsupported phone provider". The UI maps
  this to the plain-English Twilio-not-configured message.
  Phone OTP is NOT claimed working.
- **Wrong-code error (PASS):** `verifyOtp` with token `000000` →
  HTTP 403 `otp_expired` "Token has expired or is invalid" — maps to the
  wrong/expired-code message in the UI.
- **Password login still works / Google untouched / reset untouched:**
  password login — see anomaly above (code unchanged, re-test pending);
  Google login path — code-level only (the Google button and its
  `signInWithOAuth` call are unmodified in the diff, no live Google
  sign-in run); reset-password flow — code-level only
  (`ForgotPasswordPage` unmodified in the diff).

## Still needed (owner, in the morning)

- Merge approval for the DRAFT PR (do not merge without it).
- Vercel preview click-through of the OTP toggle on Login / Register and
  the Settings phone card.
- Twilio dashboard keys (Account SID, Auth Token, sender number) if phone
  OTP is wanted — see "Phone OTP" above.
- Optional: edit the Auth "Magic Link" email template to include
  `{{ .Token }}` so email OTP is always a 6-digit code, not a link.
