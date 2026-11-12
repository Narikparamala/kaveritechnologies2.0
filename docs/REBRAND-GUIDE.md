# REBRAND-GUIDE.md — Rename Kaveri Academy for your own company

*Goal: a new user forks this repo, renames it for their company,
and changes branding in ONE place as far as possible — without
breaking any feature, route, RPC, or migration.*

> **Golden rule: never edit historical migrations to rebrand.**
> Migrations are history. A `kaveri` string inside
> `supabase/migrations/*.sql` stays there forever. Only change
> live code, config, and templates.

## 1. Before you start — collect these

- [ ] New company legal name, brand name, short name
- [ ] Tagline (one line)
- [ ] Website domain, support email, phone, office address(es)
- [ ] Logo file (PNG/SVG, square + wide) — replace the WhatsApp photo
- [ ] Brand colours: primary, dark, accent/gold (hex codes)
- [ ] Fonts (or keep Plus Jakarta Sans / Inter / JetBrains Mono)
- [ ] Sender email + domain for Resend (`RESEND_FROM`)
- [ ] Your Supabase project URL + anon key (see `FRESH-SETUP.md`)
- [ ] Your Vercel project / custom domain (optional)

## 2. The central branding file (change first)

**`src/lib/company.ts`** (51 lines) — the intended single source:

```ts
// Change these values only — most public pages import them.
legalName, brandName, tagline, website, email, phone, offices
```

After editing it, run:

```bash
grep -ri "kaveri" src/ index.html public/ supabase/functions/_shared/ supabase/functions/notification-mailer/
```

That grep is the real checklist. On 2026-11-12 it hit ~35 files
in `src/` + `index.html` + `public/`, plus mailer/AI code.
Work through the list below — do not assume `company.ts` covered it.

## 3. File-by-file checklist

### Must change

| File | What to change |
|---|---|
| `src/lib/company.ts` | Legal/brand name, tagline, website, email, phone, offices |
| `index.html:4-11` | `<title>`, meta description, og:title, og:image, favicon link |
| `public/assets/images/WhatsApp_Image_2026-06-16_at_10.34.22.jpeg` | **Delete and replace.** Put your logo at `public/assets/images/logo.png` (and `logo-white.png` if needed), update every reference |
| `src/components/ui/Logo.tsx:20-30` | Logo image path + hardcoded "Kaveri Technologies / Academy" text — make it read from `company.ts` |
| `tailwind.config.js:12-48` | Brand tokens: primary `#004B8D` / `#003465`, gold `#FFD700` — replace with your palette. Keep the token *names*, change the *values*, so components do not break |
| `src/lib/externalLinks.ts` | `kaveri-coding-dashboard.vercel.app`, `kaveri-workshop-nextjs.vercel.app`, `vscode://kaveritechnologies.kaveri-coding`, `www.kaveritech.co.in`, `kaveri-academy.vercel.app/contact`, `wa.me` link — point at YOUR apps/domains, or remove the links you do not have |
| `supabase/functions/notification-mailer/_shared/company.ts`, `templates.ts`, `provider.ts` | Mailer brand strings live in edge-function code, not env. Update name, sender, footer, links. Then redeploy the function |
| `supabase/functions/_shared/mcp/kaveri-context/server.ts`, `supabase/functions/_shared/ai/*` | "Kaveri" baked into MCP server name + AI prompts. Rename the server/context to your brand, keep the tool names |
| `src/data/demoData.ts` | Demo names, demo emails (`*.kaveritechacademy.in`), demo company references |
| `src/pages/public/HelpPage.tsx` | 14 matches, incl. line 174: hardcoded `C:\Users\<your-name>\Documents\Kaveri Coding\...` path — rewrite for your product |
| `src/pages/public/CourseDetailPage.tsx` | 8 matches |
| `src/pages/public/LandingPage.tsx` | 4 matches |
| `src/pages/student/StudentDashboard.tsx` | 4 matches |
| `src/services/push.ts` | 3 matches (push notification branding) |
| `package.json` | `name: "vite-react-typescript-starter"`, `version: "0.0.0"` — rename to your project, e.g. `"my-academy-lms"`, `"1.0.0"` |
| `README.md` | Title, badge, live URL, company references. Update "152 migrations" to **160** while you are there |
| `vercel.json` / Vercel project | Project name, domain. The SPA rewrite (`* → /index.html`) stays as-is |
| `supabase/config.toml` | Local `project_id` (`kaverilmspracticeplayground`) — rename to your local project id |

### Change carefully (functional, not just cosmetic)

| File / area | Note |
|---|---|
| `src/lib/externalLinks.ts:buildCodingDashboardUrl` | Puts the Supabase refresh token in a URL fragment (`#auth_handoff=<refresh_token>`). If you rename the coding-dashboard domain, keep the fragment mechanism — do NOT move the token to a query param |
| Demo accounts | `kiran.demo@`, `priya.demo@`, `admin.demo@kaveritechacademy.in`, `preview@kaveri.academy`, `+91 98765 00001/2` — replace with your demo accounts, or keep the pattern with your domain |
| Seed data | `supabase/migrations/20260708072637_02_seed_data.sql` (172 lines) — seed emails/names are Kaveri-specific. For a fresh tenant, write your own seed (see `FRESH-SETUP.md`) |
| `platform_settings` + admin pages | README §11: several admin pages "still assume single-company tenancy". Rebranding the name does NOT make it multi-tenant. One company = one deployment |

### Do NOT change

- `supabase/migrations/*.sql` — historical, append-only
- Route paths in `src/App.tsx` (`/u/:slug`, `/student/course/:courseId`, etc.)
- RPC names, table names, `profiles.role` values
- `src/lib/supabase.ts` auth mechanism (anon key only)
- Anything in `AGENTS.md` §4 (invariants)

## 4. Make rebranding one place next time (recommended follow-up)

The current seam is incomplete — that is why this guide is long.
The proper fix, as a separate PR after the rename, is:

1. Create `src/lib/brand.ts` (or extend `company.ts`) exporting:
   `brandName, shortName, legalName, tagline, website, email,
   phone, addresses, logoUrl, logoWhiteUrl, primaryColor,
   primaryDark, accentColor`.
2. Make `Logo.tsx`, `index.html` (via Vite env / build step),
   mailer `_shared/company.ts`, and AI prompts read from it
   (mailer/AI read from env vars where possible:
   `BRAND_NAME`, `BRAND_EMAIL`, `BRAND_WEBSITE`).
3. Move colours to CSS variables in `tailwind.config.js` that read
   the same tokens.
4. After that PR, a future rename is: edit `company.ts` + logo
   files + env vars, then grep to confirm zero `kaveri` hits in
   `src/`, `index.html`, `public/`, `supabase/functions/`.

Do NOT do this refactor in the same PR as the rename — rename
first (mechanical, verifiable by grep), refactor second (so a
regression is easy to blame).

## 5. Verify the rename

```bash
# 1. No brand leaks in live code (migrations excluded on purpose)
grep -ri "kaveri" src/ index.html public/ supabase/functions/ \
  && echo "STILL HAS KAVERI — see list above" || echo "CLEAN"

# 2. App still builds and typechecks
npm run typecheck && npm run build

# 3. Run it and click through (see FRESH-SETUP.md)
npm run dev:plain
# Check: landing page, logo, title, footer, login page,
# one course page, one email template preview (if you redeployed the mailer)

# 4. Check the live site after deploy
# Title, favicon, og:image, footer email/phone, "About" page
```

## 6. What renaming does NOT do

- It does not create multi-tenancy. One deployment = one company.
- It does not change the database, your Supabase project ref,
  or existing user data. Existing users keep their accounts.
- It does not fix bugs #43 / #44. Fix those separately (see AGENTS.md §5).
- It does not remove the Bolt origin or the 2026-09-03 history.
  That history stays in git — which is correct.

---
*Checklist verified against a fresh clone, 2026-11-12. If a file
listed here has moved, grep for `kaveri` / `Kaveri` / `kaveritech`
and update this guide — then log it in `AI-WORK-LOG.md`.*
