# Branding Settings

Admin → Platform Settings → **Branding** section. Lets a company change the
academy's display name, tagline, contact email/phone, website, logo,
favicon, legal display name, and (stored, not yet fully applied) primary
colour — without editing code. Additive only: nothing that existed before
changed behaviour.

## What was added

| Piece | File |
|---|---|
| Table `public.company_settings` (one row, singleton) + RLS + seed row | `supabase/migrations/20261124150000_company_settings.sql` |
| Service: fetch/save, defaults from `company.ts` | `src/services/companyBranding.ts` |
| Hook: read with fallback + title/favicon/`--brand-primary` side effects | `src/hooks/useCompanyBranding.ts` |
| Upload helper `uploadBrandingFile('logo' \| 'favicon', file)` | `src/services/fileUpload.ts` (new function) |
| Logo reads the hook (same layout, same default rendering) | `src/components/ui/Logo.tsx` |
| Branding section in Platform Settings | `src/pages/admin/PlatformSettingsPage.tsx` (new section only) |

## How it works

- **Single row.** `company_settings` enforces exactly one row via a
  `singleton boolean UNIQUE` constraint. `saveCompanyBranding()` updates
  the existing row or inserts it if missing.
- **Fallback first.** `useCompanyBranding()` returns the DB row merged
  over `DEFAULT_BRANDING` (today's hardcoded `src/lib/company.ts`
  values). If the table is empty or unreachable, every page renders
  exactly as before — the logo file, the "Kaveri Technologies / Academy"
  text, and the static `index.html` title/favicon are the defaults.
- **Logo.** `Logo.tsx` now takes its image URL and display name from the
  hook. The default display name `Kaveri Technologies Academy` still
  renders as two lines, "Kaveri Technologies" / "Academy". Any other
  name ending in "Academy" splits the same way; any other name renders
  on one line. Layout, sizes, and classes are unchanged.
- **Title + favicon.** When a DB row exists, the hook sets
  `document.title` to `<display name> — IT Training Platform` and swaps
  the favicon link to the stored favicon URL. `index.html` itself is
  untouched (static fallback).
- **Uploads.** Logo/favicon upload reuses the existing `course-content`
  bucket via `fileUpload.ts` (same pattern as lesson/question uploads),
  under `branding/logo/…` and `branding/favicon/…`, returning a public
  URL. Only PNG/JPG/GIF/WebP, 5 MB max — SVG is deliberately excluded
  by the bucket (publicly served SVG can embed scripts) and `.ico` is
  not in the bucket's MIME list (use PNG for the favicon). A URL can
  also be pasted directly instead of uploading.
- **RLS.** Public read (anon + authenticated — the name/logo appear on
  public pages, same as `platform_settings` today). Writes are Super
  Admin only (`public.is_admin()`).

## What it deliberately does NOT do

- **Legal name ≠ company rename.** The "Legal entity name (display
  only)" field changes only the name shown on legal pages. It does not
  change the registered entity (Kaveri Technologies Pvt Ltd); that waits
  for the owner's new-company decision. The UI says so next to the field.
- **Contact email ≠ account email.** The contact email field is the
  display email shown on public pages. It is never used for sign-in or
  account creation. (`kaveritech2022@gmail.com` remains forbidden for
  new accounts.)
- **Primary colour is stored, not yet a recolour.** The value is saved
  and exposed as the `--brand-primary` CSS variable (the hook sets it on
  `document.documentElement`). But the app's colours are Tailwind
  classes (`bg-primary-600` etc.) compiled at build time, and nothing
  in `src/` reads `var(--brand-primary)` today — so setting a colour
  does **not** recolour the app yet. The UI and this doc say so plainly
  rather than faking it.
- **"Kaveri" in 33 files is untouched.** Only `Logo.tsx` reads the DB.
  The other hardcoded brand strings (footers, legal pages, emails) still
  read `company.ts` — pointing them at the hook is a later, larger pass.

## Content Auto Update toggle (audit fix, same PR)

`content_auto_update` used to render as a plain text input showing
`false`. It now renders as an Enabled/Disabled select, exactly like the
existing `maintenance_mode` select. Stored values are unchanged
(`'true'` / `'false'`); only the control changed. This is why the trends
feed was off in prod: the stored value is `false`, not the seed/default
`true`.

## Colours follow-up (not built here)

Full runtime recolouring needs a CSS-variable layer: define
`--brand-*` variables for every Tailwind brand token, switch the
components that must recolour to `var(--brand-*)` (or generate the
Tailwind palette from the variables at runtime), and keep the build-time
defaults as fallback. That touches many components, so it is a separate
change — the `primary_color` column and the `--brand-primary` hook point
are already in place for it.

## Staging verification (done 2026-11-24 night)

Staging only (`kaveri-academy-staging`, `vrzydtqcatgkfhifuchk`). No prod
changes.

1. Migration `20261124150000` applied to staging via `apply_migration`
   (`{"success":true}`); table exists with all 15 columns, RLS on,
   policies `company_settings_public_select` (SELECT) +
   `company_settings_admin_all` (ALL, `is_admin()`), exactly 1 seed row
   with the `company.ts` values.
2. Public read: anon `GET /rest/v1/company_settings` → HTTP 200, 1 row,
   `display_name: "Kaveri Technologies Academy"`. Anon update → 401,
   anon storage upload → 400 (both fail closed).
3. Settings edit through the real client path (test Super Admin
   `branding-test-admin@kaveri-qatest.com`, `is_test=true`, created for
   this test and deleted afterwards): logo upload to
   `course-content/branding/logo/1795541770171_test-logo.jpg` → HTTP
   200; `PATCH company_settings` (display name, tagline, logo URL) →
   HTTP 204; anon read-back → HTTP 200 with
   `display_name: "Kaveri Academy (Staging Test)"`,
   `tagline: "Staging test tagline — branding verification"`, and the
   uploaded logo URL; public `GET` of the logo URL → HTTP 200
   `image/jpeg`.
4. Fallback: row deleted on staging → anon read returns `[]` (HTTP
   200), which is exactly the condition where `getCompanyBranding()`
   returns null and `useCompanyBranding()` falls back to the
   `company.ts` defaults. Row then re-seeded; final state is 1 row
   with the original values, 0 test profiles, 0 `branding/` objects.
5. `npm run typecheck` zero errors, `npm run build` passes (1m 30s,
   known Monaco chunk warning only), `eslint` 0 errors on the 5
   touched files.

Two staging gotchas found while verifying (both staging-test-only, no
product impact — worth knowing for the next agent):
- Staging Auth signup is rate-limited (`over_email_send_rate_limit`,
  429), so the test admin was seeded via SQL instead of signup.
- A SQL-seeded `auth.users` row must have non-NULL `confirmation_token`
  (and `recovery_token`, `email_change_token_new`, `email_change`):
  GoTrue's user scan fails with `converting NULL to string is
  unsupported` → sign-in 500. Also, `profiles.role` cannot be changed
  by plain SQL — the `protect_profile_authorization_fields()` trigger
  requires `is_admin()`; it works by setting
  `request.jwt.claim.sub` to an existing active Super Admin id in the
  same statement batch.
- Storage `remove()` is `DELETE /object/<bucket>` with
  `{prefixes: [...]}`, not `POST /object/<bucket>/remove` (that
  uploads an object literally named `remove`) and not
  `DELETE /object/<bucket>/<path>` (400).

Not verified by this PR (needs the user in the morning): a live
click-through of the Branding section in a Vercel preview deployment
(no live browser was available in this session), and the colours
follow-up above.
