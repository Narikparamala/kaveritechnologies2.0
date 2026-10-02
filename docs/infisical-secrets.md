# Secrets with Infisical (replacing on-disk `.env`)

How this repository is wired so secrets live centrally in [Infisical](https://app.infisical.com)
and are injected into the process at runtime, instead of sitting in `.env` / `.env.local`.

Current status of the migration:

| Piece | State |
| --- | --- |
| `npm run dev` wrapped in `infisical run` | done (this repo) |
| `.infisical.json` (project link) | **pending** — created by `infisical init` after login |
| Infisical project + secrets imported | **pending** — needs an account and a browser session |
| Machine identity for CI/CD / Vercel / Supabase | **pending** — needs the project to exist first |

Until `infisical init` has run, `npm run dev` cannot resolve a project; use the
un-wrapped fallback `npm run dev:plain` in the meantime.

## 1. Environment variables this repo reads

Names only — no values are ever recorded here.

**Browser bundle (Vite `import.meta.env.*`, public by design — they ship to the client):**

`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_FIREBASE_API_KEY`,
`VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`,
`VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_FIREBASE_APP_ID`, `VITE_FCM_VAPID_KEY`,
`VITE_PREVIEW_ROLE` (optional local QA override).

**Build-time script** (`scripts/generate-sw-config.mjs` → `public/firebase-config.js`
for the push service worker): reads `process.env` **first**, then falls back to
`.env.local`. Infisical-injected variables therefore win over any local file.

**Supabase Edge Functions** (`Deno.env.get`, delivered from Supabase's own secret
store — not from a `.env` in this repo): `SUPABASE_URL`, `SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`, `FCM_SERVICE_ACCOUNT_JSON`, `FCM_PROJECT_ID`,
`MAILER_PROVIDER`, `RESEND_API_KEY`, `RESEND_FROM`, `LMS_PUBLIC_URL`,
`NOTIFICATION_MAILER_TOKEN`, `GEMINI_API_KEY`, `GO_JUDGE_URL`, `GO_JUDGE_TOKEN`,
`JUDGE0_URL`, `JUDGE0_AUTHN_HEADER`, `JUDGE0_AUTHN_TOKEN`, `JUDGE0_AUTHZ_HEADER`,
`JUDGE0_AUTHZ_TOKEN`, `KAVERI_EXECUTE_URL`, `KAVERI_EXECUTE_TOKEN`,
`KAVERI_LEAD_API_SECRET`, `KAVERI_QUESTION_PAPER_INTEGRATION_SECRET`,
`KAVERI_WORKSHOP_INTEGRATION_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
`LMS_ALLOWED_ORIGINS`.

`.env.example` remains the contract for which keys each environment must define;
its values are placeholders only. The runner's own copy lives in
`infrastructure/go-judge/.env.example`.

## 2. Delivery method per destination

| Destination | How Infisical delivers | Action |
| --- | --- | --- |
| Local dev (Windows/macOS, this machine) | Infisical CLI + `infisical run` | `npm run dev` (already wrapped) |
| Vercel (SPA build + `/api`) | Infisical Vercel integration / secret sync, injected at build time | keep Vercel env vars as the Vercel-side copy; do **not** wrap `npm run build`, the Vercel builder has no Infisical login |
| GitHub Actions (`.github/workflows/secure-grading-ci.yml`) | Infisical Secrets Action (OIDC preferred, Universal Auth fallback) | none needed today — that workflow runs `npm ci`, `npm run build` and `deno check` and requires **no** secrets |
| Supabase Edge Functions | Supabase secret store; keep it in sync from Infisical | see "Non-local environments" below |

## 3. Account and project

1. Sign up at <https://app.infisical.com>.
2. **Secrets Management → + Add New Project**, named after the service
   (for example `kaveri-academy`).
3. Every project starts with Development / Staging / Production. Open
   **Development** and drag-and-drop the local env file onto the Secrets Overview
   page (or use **Paste Secrets**) to import every key at once. Import `.env.local`
   and `.env`; drop duplicates and keep only the `VITE_*` / runner keys.
4. Never paste secret values into chat, issues, or PR descriptions.

## 4. Install the CLI and authenticate

Windows (this machine):

```powershell
winget install infisical        # or: scoop bucket add org https://github.com/Infisical/scoop-infisical.git; scoop install infisical
```

macOS / Linux:

```bash
brew install infisical/get-cli/infisical          # macOS/Linuxbrew
npm install -g @infisical/cli                     # any Node machine
```

Then:

```bash
infisical login          # opens the browser
infisical login -i       # WSL 2, Codespaces, or a remote SSH session with no browser
```

## 5. Link this codebase

From the repository root:

```bash
infisical init
```

Select the organization and project. This writes `.infisical.json`, which holds
local project settings only (no secret values) and is safe to commit. Committing
it means `infisical run` needs no `--projectId` flag for anyone who clones the repo.

## 6. Runtime injection (already wired)

`package.json`:

| Script | Command |
| --- | --- |
| `dev` | `infisical run --env=dev -- npm run dev:plain` |
| `dev:plain` | `node scripts/generate-sw-config.mjs && vite` (fallback, reads `.env.local`) |
| `build` | `node scripts/generate-sw-config.mjs && vite build` (no CLI dependency — used by Vercel/CI) |
| `build:infisical` | `infisical run --env=prod -- npm run build` (prod-parity local build) |

No application code changes: the app keeps reading `import.meta.env` / `process.env`
exactly as before.

Useful flags:

- `--watch` — restart the app when a secret changes in Infisical.
- `--path=/folder` / `--recursive` — only needed if secrets are organised into
  folders; by default `infisical run` injects root-level secrets only.
- `--command="cmd1 && cmd2"` — chain commands instead of the plain `--` form.

## 7. Non-local environments (CI/CD, Kubernetes, production)

Do not interactively log in there. Create a **machine identity**:

1. **Access Control → Machine Identities → Create**; add it to the project with a
   role scoped to the minimum environment it needs (Development only for CI, etc.).
2. Keep **Universal Auth** as its auth method (or swap to OIDC where the platform
   can issue an identity token) and add a client secret.
3. Store the client ID / client secret in the *platform's* secret store — GitHub
   Actions secrets, Vercel environment variables, Supabase secrets, k8s Secret —
   never in the repository and never in a local `.env`.

Non-interactive CLI auth: exchange the credentials for a short-lived access token
and export it as `INFISICAL_TOKEN`, or provide
`INFISICAL_UNIVERSAL_AUTH_CLIENT_ID`, `INFISICAL_UNIVERSAL_AUTH_CLIENT_SECRET`
and `INFISICAL_PROJECT_ID` to the CLI.

```bash
export INFISICAL_TOKEN=$(infisical login --method=universal-auth \
  --client-id="$INFISICAL_UNIVERSAL_AUTH_CLIENT_ID" \
  --client-secret="$INFISICAL_UNIVERSAL_AUTH_CLIENT_SECRET" --silent --plain)
```

GitHub Actions (only if that workflow ever needs secrets — OIDC variant, requires
`id-token: write`):

```yaml
permissions:
  id-token: write   # GitHub issues the OIDC token
  contents: read
steps:
  - uses: actions/checkout@v4
  - uses: Infisical/secrets-action@v1
    with:
      method: "oidc"
      identity-id: "<machine-identity-id>"   # public identifier, safe to commit
      project-slug: "<project-slug>"
      env-slug: "dev"
```

Supabase Edge Functions keep their secrets in Supabase's store. Either use
Infisical's Supabase secret sync, or push them once from Infisical:

```bash
infisical export --env=prod --format=dotenv > .env.sync   # then
supabase secrets set --env-file .env.sync                 # then delete the file
```

Delete the temporary file immediately; it exists only for the length of the push.

## 8. Verify it works

```bash
# 1. one known variable resolves — print the length, never the value
infisical run --env=dev -- node -e "console.log('VITE_SUPABASE_URL length:', (process.env.VITE_SUPABASE_URL || '').length)"

# 2. prove secrets are not coming from disk
mv .env.local .env.local.backup      # PowerShell: Rename-Item .env.local .env.local.backup
npm run dev                          # must still start, and the predev step must print
                                     # "[generate-sw-config] firebase-config.js: configured"
```

If the predev step prints `placeholder (keys missing)`, the values are still being
read from a local file or the Infisical environment is missing them. Restore the
backup with `mv .env.local.backup .env.local` (PowerShell: `Rename-Item .env.local.backup .env.local`).

## 9. Cleanup and leaks

- `.gitignore` already ignores `.env*` (with `!**/.env.example`), so `.env`,
  `.env.local` and a `.env.backup` copy can never be committed.
- Only `.env.example` files are tracked today; they contain placeholders.
- If a real secret was ever committed, **rotate it** — git history keeps it — and
  then scan for leaks: <https://infisical.com/docs/cli/scanning-overview>
  (`infisical scan`).

Docs used: <https://infisical.com/docs/cli/overview>,
<https://infisical.com/docs/documentation/platform/secrets-mgmt/quick-starts/deliver-first-secret>,
<https://infisical.com/docs/documentation/platform/identities/machine-identities>,
<https://infisical.com/docs/documentation/platform/identities/universal-auth>.
