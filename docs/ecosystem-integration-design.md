# Kaveri Platform — Ecosystem Integration Design

Status: **DESIGN — pending ChatGPT review. No satellite repository has been modified.**

Repositories involved:

| Project | Repository | Role in the platform |
|---|---|---|
| Kaveri LMS / platform | `Narikparamala/kaveritechnologies2.0` | Single identity authority, courses, enrollments, assignments, secure grading, notifications |
| Workshop app | `Narikparamala/kaveri-workshop-nextjs` | Workshop registration + admin, Google Apps Script + Sheets |
| VS Code extension | `Narikparamala/kaveri-coding-workspace` | In-IDE coding assignments |
| Question-paper system | `Narikparamala/kaveri-question-paper-system` | Offline examination / paper generation |

Goal: make these **parts of ONE platform without merging codebases**. The LMS
is the hub; every other system integrates through server-to-server contracts.

---

## 1. Central identity

**Single identity authority: Supabase Auth.** No application ever synchronizes
passwords. Identity flows:

- LMS users already authenticate via Supabase Auth (`profiles.id` = `auth.users.id`).
- Satellite systems never create or store passwords.
- Matching across systems uses the **verified email** owned by a Supabase user
  (`profiles.email`), or — for external attendees with no LMS account — a
  stable external identity record.

### Shared reference vocabulary

Satellite systems reference LMS objects by their **LMS UUIDs** whenever the
object exists in the LMS:

```
user_id / student_id / faculty_id   → profiles.id
course_id                           → courses.id
assignment_id                       → assignments.id
live session id                     → live_sessions.id
quiz_id                             → quizzes.id
workshop_id                         → (new) workshops.id        [future]
exam_id                             → (new) offline_exams.id     [future]
```

Where a satellite owns the object (e.g., the workshop app owns a registration
form), the satellite sends **its own key plus the LMS key** so either side can
correlate:

```
{ "workshop_registration_id": "<app uuid>", "user_id": "<lms uuid|null>", ... }
```

## 2. Server-to-server authentication

- Every satellite holds a **per-satellite shared secret**, stored ONLY in
  server-side env / `supabase_vault` (never in satellite browser code, never
  in VS Code, never in Vite).
- LMS hosts **webhook ingestion endpoints** (Supabase Edge Functions).
  Satellite → LMS requests are **HMAC-signed** (not bearer-only):

```
POST https://<lms>/functions/v1/integrations/<source>
X-Kaveri-Timestamp: <unix epoch seconds>
X-Kaveri-Signature: <hex>
Idempotency-Key: <source>.<stable_event_uuid>

Signature = HMAC-SHA256( timestamp || "." || raw_body, per-satellite secret )
```

  1. Verify `X-Kaveri-Timestamp` is within a freshness/replay window
     (default ±5 minutes) and the signature **constant-time** compares
     (hash both sides, XOR) against the vault-stored per-satellite secret.
  2. Verify the **idempotency key** before mutating state.
  3. Write a row to `integration_audit_log` for every accepted call.
- All satellite → LMS writes are **webhooks (server → server)**. The LMS never
  exposes service-role credentials to any satellite browser.
- No public anonymous execution: unauthenticated webhook calls return 401 and
  are logged.

### Idempotency + audit (schema sketch — forward migration when approved)

```sql
-- app integration secrets live in supabase_vault, keyed per satellite:
--   integrations.workshop.secret, integrations.vscode.secret, ...
-- (vault is already enabled in the project)

create table public.integration_audit_log (
  id uuid primary key default gen_random_uuid(),
  source text not null,              -- 'workshop' | 'vscode' | 'question_paper' | 'lms'
  action text not null,              -- e.g. 'workshop.registration.upsert'
  idempotency_key text not null,     -- unique per action per source
  request_payload jsonb,
  response_code int,
  created_at timestamptz not null default now()
);
create unique index integration_audit_log_key_idx
  on public.integration_audit_log (source, action, idempotency_key);
-- RLS: no client policies — server-internal.
```

`integration_audit_log` is a **server-internal audit trail** (it is not
cryptographically chained/tamper-evident): it gives ops a replayable record of
every accepted call, and duplicate webhooks are harmless — an idempotency key
collision is answered with the original result (200 + `"duplicate": true`),
never a second mutation. If tamper-evidence is ever required, add a
hash-chain column in a later migration; nothing in V1 depends on it.

## 3. Central notification / email outbox (implemented — migration
   `20260905180000_central_notifications_outbox.sql`)

Already implemented in the LMS:

- `notification_events` — append-only event log written by SECURITY DEFINER
  functions only; **immutable** (a duplicate `dedupe_key` returns the original
  event id and never rewrites its payload).
- `notification_outbox` — durable email queue
  (`queued → sending → delivering → sent | failed | queued+backoff`;
  `skipped` when delivery is disabled) with `attempts`, `max_attempts`,
  exponential backoff via `next_attempt_at`, per-recipient `dedupe_key`
  idempotency, `provider_message_id` for safe provider ids, and **RLS disabled
  for clients** (no student can read queue contents).
- In-app notifications reuse the existing `notifications` table (own-rows RLS,
  aggregation key support).
- Enrollment events (`enrollment_request_created`, `enrollment_approved`,
  `enrollment_rejected`) are emitted **in the same transaction** as the
  business state change (trigger + inside the approve/reject RPCs). Email
  delivery is asynchronous; a delivery failure never rolls back enrollment.
- `process_notification_outbox()` drives delivery with modes:
  - `disabled` — local default; rows are durably queued then honestly marked
    `skipped` (ops requeues after configuring a provider).
  - `simulate_failure` — dev/diagnostic: first attempt fails transiently with
    backoff, retry succeeds (proves the retry machine without a provider).
  - `pg_net` — production path: the worker claims rows with
    `FOR UPDATE SKIP LOCKED` (concurrent workers can never deliver the same
    row twice), marks them `sending`, and POSTs them to the
    **`notification-mailer` Edge Function** via `pg_net`. The mailer verifies
    `X-Kaveri-Mailer-Token` (vault secret, constant-time), atomically claims
    the row (`delivering`), renders the approved template, calls the provider
    through an isolated adapter (`log` local / `resend` production), and
    resolves the row. Provider credentials live in `supabase_vault` / server
    env only — never in the browser.
- Ops health: `notification_delivery_health()` (service-role only) returns
  aggregate queue counts and oldest-queued age — never recipient data.
- Production scheduling (documented, not configured): a `pg_cron` job calls
  `process_notification_outbox()` every minute; see
  `docs/email-delivery-deployment.md` for the cron SQL, secrets and
  rollback/disable procedure.

Planned events reuse the same machinery (template keys reserved, not yet
wired): `live_session_scheduled`, `live_session_reminder`,
`live_session_recording_available`, `assignment_published`,
`assignment_graded`, `workshop_registered`, `workshop_reminder`,
`offline_exam_scheduled`, `offline_exam_result_published`,
`certificate_issued`.

### Email single-source rule

For any given recipient/event, exactly ONE system sends the email:

- Workshop V1: **Apps Script confirmation email remains the source** until the
  central outbox is wired to a production mailer and the workshop bridge is
  live; then the central service takes over. Never both at once (the bridge's
  idempotency key for the registration is the coordination point).

## 4. Workshop bridge (`kaveri-workshop-nextjs`)

Current workshop flow keeps working unchanged (registration → Apps Script →
Sheets). The bridge adds an **HMAC-signed webhook** after successful
registration:

```
Workshop app (server)
  → POST https://<lms>/functions/v1/integrations/workshop
      X-Kaveri-Timestamp: <unix epoch seconds>
      X-Kaveri-Signature: HMAC-SHA256(timestamp "." raw_body, workshop secret)
      Idempotency-Key: workshop.<app_registration_uuid>
      body: { app_registration_id, email, full_name, phone?,
              workshop_slug, workshop_date, status: 'registered', ... }
```

LMS side:

1. Verify timestamp freshness (replay window), signature (constant-time), and
   idempotency key; write `integration_audit_log`.
2. Match `email` to `profiles` **only when that email is verified in Supabase
   Auth** (a `profiles.email` string alone is not proof of ownership).
   - Verified match → link registration to `user_id` (attendee gets workshop
     status on their LMS profile).
   - No match → **retain as external attendee/lead**. Do NOT auto-create an
     auth account or password.
3. Emit `workshop_registered` event → central outbox (email handled per the
   single-source rule above).

Later (not forced now): Supabase becomes primary workshop data, Google Sheets
becomes an export/reporting mirror driven by a scheduled sync.

## 5. VS Code extension bridge (`kaveri-coding-workspace`)

The extension **consumes the existing LMS assignment backend** — no second
backend, no duplicate secure grading.

### Secure pairing

```
VS Code extension                     LMS
    │  "Connect to Kaveri"               │
    │  opens browser to LMS OAuth/pair   │
    │  ─────────────────────────────────►│  authenticated student approves
    │                                    │  "Allow this device?"
    │  ◄─────────────────────────────────│  short-lived scoped pair token
    │  exchange pair token for scoped    │  (server-side secret)
    │  session (stored in SecretStorage) │
```

Rules:

- The extension uses an **opaque, revocable device credential** minted by the
  LMS at pairing time. The LMS stores only the **SHA-256 hash** of the
  credential; the raw credential lives only in **VS Code SecretStorage**.
- Revocation: deleting the LMS-side credential row (from the LMS profile
  page) invalidates the device immediately — the server compares the SHA-256
  hash on every call.
- The credential is scoped (student + read-assignment + submit-scope), never
  the service-role key, never `GO_JUDGE_TOKEN`, never hidden tests, never
  passwords, and never the mailer/outbox token.

### Assignment flow

1. My Assignments → real LMS assignments (`assignments` where published &
   student enrolled; same RLS the web UI uses).
2. Open → creates a local workspace from the assignment's visible files.
3. Run → executes **visible tests only** locally (public test cases only —
   hidden tests never leave the server).
4. Submit → POSTs the solution to the **existing secure-grade submission RPC**
   (identical path to the web submit button).
5. Result → the existing LMS submission row + score; faculty sees it in the
   existing Faculty Submissions page — one submission pipeline for web and IDE.

### Extension must never see

service-role key · `GO_JUDGE_TOKEN` · hidden tests · another student's data ·
`notification_outbox`/`integration_audit_log` contents.

## 6. Offline question-paper bridge (`kaveri-question-paper-system`)

Offline exams stay logically separate from online assignments; the paper
module is not redesigned. Integration is limited to **shared references +
result import**:

- Launch from **Faculty Portal → Offline Exams**: faculty picks
  course/batch/topic; the module generates/prints the paper (existing app
  logic).
- Paper metadata returns to the LMS as `offline_exams` rows referencing
  `course_id`, `faculty_id`, and (when batch-based) the student list.
- After marking, faculty imports marks → LMS stores per-student `offline_exam`
  results and emits `offline_exam_result_published` → central outbox.
- The student's LMS profile gains an **Offline Exams** section showing
  schedule + published results (read-only RLS on the student's own rows).

## 7. Platform hub (navigation evolution — LMS only)

- **Admin**: Users · Admissions (enrollment requests) · Courses · Enrollments ·
  Workshops · Live Classes · Coding · Offline Exams · Certificates ·
  Notifications.
- **Faculty**: My Courses · Live Classes · Assignments · Quizzes · Coding ·
  Offline Exams · Workshops (their own) · Student Progress.
- **Student profile**: unified view of courses, progress/Journey, assignments,
  coding, quizzes, live classes, workshops, offline exam results, certificates.

Each module appears only when real data/access exists (empty states, not dead
links).

## 8. Security invariants (all phases)

1. Supabase Auth is the only identity/password authority.
2. No service-role key, no webhook secret, no runner token in any browser,
   Vite bundle, or VS Code storage.
3. Webhooks authenticated, idempotent, and audited.
4. RLS stays authoritative for all LMS data; server-internal tables
   (`notification_outbox`, `notification_events`, `kaveri_app_settings`,
   `integration_audit_log`) have no client policies.
5. Hidden tests and reference solutions never leave server grading paths.
6. Each bridge lands behind a ChatGPT-reviewed contract before any satellite
   repository changes.

## 9. Suggested sequence

1. **Now (LMS only, done):** central events + outbox + enrollment wiring.
2. ChatGPT reviews this design + the notification migration.
3. Workshop bridge: LMS webhook function + audit/idempotency tables + match
   external leads (small LMS migration), then workshop app sends webhook.
4. Offline exam link: shared references + result import (LMS + question-paper
   app changes reviewed together).
5. VS Code bridge: scoped pairing + assignment/submit endpoints; extension
   work follows the approved contract.
6. Defer: Sheets mirror-only migration, workshop email source flip, hub nav
   additions beyond what data supports.
