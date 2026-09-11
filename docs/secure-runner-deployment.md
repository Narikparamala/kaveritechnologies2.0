# Secure Grading Runner — Production Deployment Guide

Scope: Kaveri LMS `secure-grade` Supabase edge function and its code-execution
runner. This document is the operations reference for deploying the runner for
production. It does not change grading code.

## Status summary

| Item | Status |
| --- | --- |
| secure-grade function (server-authoritative grading) | Implemented & verified |
| go-judge adapter (`GO_JUDGE_URL` + `GO_JUDGE_TOKEN`) | Implemented & verified locally |
| Judge0 adapter/fallback code | Implemented, kept intact, **not used** for Kaveri V1 |
| Judge0 on local Windows | Not used (incompatible isolation) — do not revisit |
| Production V1 runner | **go-judge on a dedicated Linux host** |

Verified locally with go-judge: sample input runs, custom input runs, hidden
final tests, assignment grading, coding-practice grading, and audit
persistence (`secure_grading_runs`). The runner never sees Supabase service
credentials and submitted secrets are never written to logs.

## Production architecture

```
Browser (student)                    Supabase cloud
─────────────────                    ──────────────
Coding/assignment UI                 secure-grade edge function
        │  (user JWT, HTTPS)                 │  HTTPS (Bearer runner token)
        └────────────────────────────────────┴──► go-judge HTTP service
                                                     │
                                                     └► container isolation, no public access
```

- The edge function is the only caller of the runner.
- The runner token is stored only as a Supabase function secret. It never
  appears in browser code, VITE variables, or the repository.
- The runner endpoint is private: firewalled to the Supabase edge egress IPs
  (or a private network/VPN) and terminated with TLS. No anonymous access.
- Student-facing errors are safe ("Secure grading is temporarily unavailable",
  "The secure runner is temporarily unavailable…"); raw runner errors are never
  surfaced to students.

## Environment contract

Configured in the Supabase project (function secrets / project settings):

| Variable | Meaning | Secret |
| --- | --- | --- |
| `GO_JUDGE_URL` | go-judge base URL (trailing slash optional) | no |
| `GO_JUDGE_TOKEN` | random token required by go-judge on every request | **yes** |
| `JUDGE0_URL` | Judge0 base URL (fallback only) | no |
| `JUDGE0_AUTHN_HEADER` / `JUDGE0_AUTHN_TOKEN` | Judge0 auth header (fallback only) | yes |
| `JUDGE0_AUTHZ_HEADER` / `JUDGE0_AUTHZ_TOKEN` | Judge0 authz header (fallback only) | yes |
| `SUPABASE_URL` | injected by Supabase at runtime | no |
| `SUPABASE_ANON_KEY` | injected by Supabase at runtime | no |
| `SUPABASE_SERVICE_ROLE_KEY` | injected by Supabase at runtime; used inside the function only | **yes** |
| `LMS_ALLOWED_ORIGINS` | comma-separated browser origins allowed by CORS | no |

Reference file: `supabase/functions/secure-grade/.env.example` (placeholders only).

Runner selection logic:
- `GO_JUDGE_URL` **and** `GO_JUDGE_TOKEN` set → go-judge.
- Only one of them set → `RUNNER_NOT_CONFIGURED` (503), surfaces as a safe
  student message.
- Neither set → Judge0 fallback path (if `JUDGE0_URL` is configured).

## Host requirements (go-judge)

- Dedicated Linux VM/container host, minimal surface, updated OS.
- Docker with CPU/memory/process/output limits configured per execution.
- No host filesystem access for user code; user code runs inside isolated
  sandboxes with fixed resource limits and wall-time limits.
- Network: allow HTTPS inbound from Supabase edge egress; restrict outbound
  from sandboxes (no general internet) so code cannot exfiltrate.
- Timeouts: edge function already applies submission timeouts; runner enforces
  wall-time, memory and output caps server-side.
- Restart policy: `restart: unless-stopped`; health check configured.
- Logging: log request IDs and outcomes only — never code submissions,
  answers, or tokens.

Suggested provision sequence (no secret values here):

1. Provision Linux host (e.g., 2 vCPU / 4 GB minimum; scale with load).
2. Install Docker + a TLS reverse proxy (Caddy/nginx) bound to the runner port.
3. Generate `GO_JUDGE_TOKEN` with `openssl rand -hex 32`; store it in the
   Supabase project secrets and in the runner's secret store. Never in Git.
4. Deploy go-judge container with the token; add limits and restart policy.
5. Restrict the endpoint to HTTPS + token auth; firewall everything else.
6. Set `GO_JUDGE_URL`, `GO_JUDGE_TOKEN`, `LMS_ALLOWED_ORIGINS` on the
   Supabase project and deploy the `secure-grade` function.
7. Run the smoke test below.

## Health / readiness check (operations)

There is no public health endpoint that leaks runner internals — by design.
Operators determine runner state from the function's existing, student-safe
contract:

| Symptom | Meaning |
| --- | --- |
| Coding page loads languages and a submission completes with `accepted` | Configured + healthy |
| Response `RUNNER_NOT_CONFIGURED` (503) | Not configured (unset or partial env) |
| Response `RUNNER_UNAVAILABLE` / `RUNNER_INVALID_RESPONSE` (502) or timeout (504) | Configured but unhealthy — runner down, token wrong, or limits hit |

Quick operator probe (with an admin user JWT, run from a whitelisted origin):

```
POST {function-url}/secure-grade
Authorization: Bearer <admin-user-jwt>
{"kind":"languages"}
```

- Healthy go-judge backend returns a payload containing the Python language
  entry (`id: 71`).
- `503`/`502` responses point at the rows above. Add uptime/alerting on the
  runner endpoint if desired; do not expose the runner URL or token to the UI.

## Smoke test (do after deployment)

Student account enrolled in a course with coding content:

1. Open a coding-practice question with final (hidden) test cases.
2. Run a sample input in the browser — status `accepted` (or a real verdict).
3. Run a custom input run.
4. Submit — hidden tests execute; score persists in the DB.
5. Submit an assignment answer that uses visible + hidden tests.
6. Confirm `secure_grading_runs` rows were written (audit trail).
7. Confirm the browser console never received hidden-test inputs/outputs.

## Rollback / disable procedure

- **Disable automatic secure grading** (safe): remove `GO_JUDGE_URL` and
  `GO_JUDGE_TOKEN` from the function secrets and redeploy. The function then
  returns `RUNNER_NOT_CONFIGURED` (503) and the UI keeps showing the safe
  "grading unavailable — your work remains available for faculty review"
  state. No code change required.
- **Full rollback of the runner host**: stop the go-judge container and follow
  the disable step above, or repoint `GO_JUDGE_URL` to a replacement host with
  the same token.
- Function code rollback: redeploy the previous `secure-grade` version from
  Git history.

## Judge0 status (be precise when communicating)

- Judge0 adapter: **implemented** in the function.
- Local Windows Judge0 runtime: **not used** (isolation requirements are not
  met on Windows; not being debugged again).
- Production V1: **go-judge**.
- Future: Judge0 may be deployed on a proper Linux environment if/when Kaveri
  needs broader language/runtime coverage. The adapter stays intact for that.

## Deployment order checklist (for the deployment run itself)

1. Provision Linux grading host + TLS proxy (this document's host section).
2. Deploy go-judge with generated token and limits; verify local health.
3. Add Supabase function secrets: `GO_JUDGE_URL`, `GO_JUDGE_TOKEN`,
   `LMS_ALLOWED_ORIGINS` (production origin).
4. Apply pending LOCAL-only migrations in order (see migrations dir).
5. Deploy `secure-grade` function.
6. Run the smoke test; verify audit rows.
7. If unhealthy: run the rollback/disable procedure.
