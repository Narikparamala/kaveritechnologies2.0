# Kaveri Platform — Email Delivery (Production)

Central business email delivery for the Kaveri LMS. Companion to
`docs/ecosystem-integration-design.md`; implements the real delivery layer
behind the central outbox (migration `20260905190000_email_delivery_hardening.sql`).

## Scope

**In this pipeline:** platform/business transactional email —
enrollment request/approval/rejection today; live-class, assignment, workshop,
exam, certificate events later. All events are written to
`notification_events` (append-only, immutable) and `notification_outbox`
(durable queue) **in the same transaction** as the business state change.

**NOT in this pipeline:** Supabase Auth email (confirmation, forgot/reset
password, email change). Those remain Supabase Auth + configured production
SMTP. Never route them through this outbox.

## Architecture

```
Business transaction (enrollment RPC / trigger)
  └─ notification_events (immutable event log)
  └─ notification_outbox (queued row, per-recipient dedupe_key)

pg_cron (every minute)                      [scheduler, see below]
  └─ process_notification_outbox(batch)     [SECURITY DEFINER, service_role only]
       ├─ FOR UPDATE SKIP LOCKED claim      (concurrent workers never double-deliver)
       ├─ queued → sending                  (attempts+1, self-heal after 10 min)
       └─ net.http_post → notification-mailer Edge Function
            headers:
              Authorization: Bearer <anon key>      (gateway pass — public)
              X-Kaveri-Mailer-Token: <secret>       (real auth — vault, constant-time)

notification-mailer (Supabase Edge Function)
  ├─ verify X-Kaveri-Mailer-Token (vault or env, constant-time compare)
  ├─ load the outbox ROW (message authority: template/recipient/payload/
  │    dedupe all come from the DB row, never from the HTTP body)
  ├─ already sent → 200 duplicate (idempotent)
  ├─ atomic claim: sending → delivering (second concurrent call → duplicate)
  ├─ render approved template from the DB row (_shared/templates.ts)
  ├─ provider adapter (_shared/provider.ts): log | resend — FAILS CLOSED
  │    (missing/unknown MAILER_PROVIDER → PROVIDER_NOT_CONFIGURED, no send)
  └─ resolve row: sent | failed | queued + backoff (honours Retry-After)
       (never stores raw provider errors or secrets; only safe codes)
```

The mailer accepts essentially `{ "outbox_id": "<uuid>" }` — the body is a
reference, not content. A tampered body can never change the destination or
content of an email.

Delivery is **at-least-once**: a crash between provider success and row
resolution can cause a retry, but the provider idempotency key
(`dedupe_key:delivery:<generation>` — Resend `Idempotency-Key`) makes
duplicate sends harmless. `delivery_generation` starts at 0 and is bumped
only by `force_resend_notification_outbox()`, so an explicit forced resend is
a NEW delivery in the provider's eyes while ordinary retries keep the same
generation and stay deduplicated. Default operations never resend a `sent`
row; the only resend path is the explicit ops function, which writes a
`force_resend_audit` entry (with the new generation) into the row payload.

If the provider accepts the message but the DB row cannot be updated, the
mailer returns 500 (RESOLVE_FAILED) — it never pretends the state is
resolved. The row stays `delivering`, is reclaimed later, and the unchanged
provider idempotency key prevents a duplicate email.

## State machine

| From | To | Trigger |
|---|---|---|
| queued | sending | worker claims (attempts+1) |
| sending | delivering | mailer atomic claim |
| delivering | sent | provider success (`sent_at`, `provider_message_id`) |
| delivering | queued + backoff | transient provider failure — 5xx, 408, 425, 429 (Retry-After honoured when present, else exponential backoff); last_error = safe code |
| delivering | failed | permanent provider rejection |
| queued/sending/delivering | failed | attempts >= max_attempts (worker cleanup, `MAX_ATTEMPTS_EXCEEDED`) |
| queued/sending/delivering | skipped | worker in `disabled` mode |
| skipped/failed | queued | `requeue_notification_outbox()` (safe requeue — never `sent`) |
| sent/failed/skipped | queued | `force_resend_notification_outbox()` (explicit, audited) |

## Required secrets (server-side only)

Never in Vite/browser/Git. Supabase Vault is already enabled.

| Secret (vault name) | What | Notes |
|---|---|---|
| `notification_mailer_token` | shared mailer auth token | `openssl rand -hex 32`; read by the DB worker and by the mailer (`get_server_secret` RPC / `NOTIFICATION_MAILER_TOKEN` env) |
| `supabase_anon_key` | gateway pass JWT for the functions gateway | public key; the DB worker attaches it as `Authorization: Bearer` so the edge-runtime JWT gateway routes the request. Real auth is the mailer token. |
| `mailer_provider` | provider name fallback | only read when `MAILER_PROVIDER` env is unset (e.g. local dev): `log` or `resend`. Missing/unknown → fail closed. |

Provider credentials live in **function secrets** (not vault) because they are
consumed by the Edge Function runtime:

| Function secret | When |
|---|---|
| `MAILER_PROVIDER` | **required in production** — explicitly `resend` (or `log` for a local mock). Unset/unknown anywhere → the mailer fails closed (`PROVIDER_NOT_CONFIGURED`) and nothing is marked sent |
| `RESEND_API_KEY` | only when `MAILER_PROVIDER=resend` |
| `RESEND_FROM` | sender address for Resend |
| `LMS_PUBLIC_URL` | absolute link base rendered into templates (e.g. `https://www.kaveritech.co.in`) |
| `NOTIFICATION_MAILER_TOKEN` | optional — overrides vault lookup if set |

## Scheduler (pg_cron) — production config, do not run yet

Enable the extension (already available in the Supabase image) and schedule
the worker once a minute:

```sql
create extension if not exists pg_cron;

select cron.schedule(
  'notification-outbox-every-minute',
  '* * * * *',
  $$select public.process_notification_outbox(25)$$
);
```

Verify it ran and is healthy:

```sql
select jobid, jobname, last_run, last_status
from cron.job_run_details
where jobname = 'notification-outbox-every-minute'
order by start_time desc limit 5;

select public.notification_delivery_health();  -- service_role only
```

## Enabling production delivery

1. Create the vault secrets above (`notification_mailer_token`,
   `supabase_anon_key`) with strong random values.
2. Set the function secrets (`MAILER_PROVIDER=resend`, `RESEND_API_KEY`,
   `RESEND_FROM`, `LMS_PUBLIC_URL`) on the deployed `notification-mailer`
   function.
3. Point the worker at the function:

```sql
update public.kaveri_app_settings
set value = jsonb_build_object(
  'mode', 'pg_net',
  'mailer_url', 'https://<project-ref>.functions.supabase.co/notification-mailer'
)
where key = 'email_delivery';
```

4. Schedule pg_cron (above).
5. Smoke test: create a real enrollment request in a QA course, approve it,
   then run `select public.notification_delivery_health();` and confirm the
   student row is `sent` with a `provider_message_id`.

## Rollback / disable procedure

**Disable delivery (keep queueing):** switch mode back to `disabled`; the
worker marks due rows `skipped` without sending, and nothing is lost:

```sql
update public.kaveri_app_settings
set value = '{"mode":"disabled"}'::jsonb
where key = 'email_delivery';
```

**Pause without touching rows:** unschedule the cron job:

```sql
select cron.unschedule('notification-outbox-every-minute');
```

**Replay after a fix:** `requeue_notification_outbox()` moves `skipped`/
`failed` rows back to `queued` (never `sent`). For a deliberate resend of an
already-sent message, use `force_resend_notification_outbox(id)` — it
resets the row, **bumps `delivery_generation`** (so the provider treats it as
a new delivery), and records `force_resend_audit` with actor/from-status/
timestamp/generation.

**Full stop:** disable delivery + unschedule cron + (optionally) remove
`mailer_url`. Outbox rows stay durable and can be replayed later.

## Health

`notification_delivery_health()` (service-role only) returns:

- mode + `mailer_configured`
- queued / sending / delivering / failed / skipped counts
- sent in the last 1h / 24h
- oldest queued age in seconds
- total events recorded

It never exposes recipient addresses or payloads — it is safe for admin
dashboards. A future Admin → Notification Delivery Health view can render it
without schema changes.

## Local QA (mock provider)

- `MAILER_PROVIDER=log` (default): the mailer renders the template and logs
  it; outbox rows resolve to `sent` with a `log-<uuid>` provider id. No
  external service involved.
- Payload-driven failure simulation (LOCAL QA ONLY): enqueue a row whose
  payload contains `"dev_fail_mode": "transient"` or `"permanent"` and the
  log provider simulates the corresponding provider outcome, exercising the
  real retry/fail path end-to-end (worker → pg_net → mailer → outbox).
- Local dev provider: set the vault secret `mailer_provider` to `log` (env
  wins if `MAILER_PROVIDER` is set on the function).

## Verified locally (this migration)

Request-created/approved/rejected emails all delivered end-to-end through
pg_net + the mailer (log provider). Event immutability, safe requeue,
transient→backoff→retry→sent, permanent→failed, dedupe (one email), two
concurrent workers (one claim), duplicate mailer call (no resend), and client
isolation (students cannot read the queue/event log/settings or call the
worker/health/secret RPCs) all pass. See the verification hardening report
for exact commands and results.