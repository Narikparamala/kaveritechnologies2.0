# Kaveri LMS platform completion contract

## Goal

Turn the current LMS from a broad, partially verified implementation into a
production-ready academy platform with reliable Student, Faculty, and Super
Admin workflows.

## Source state

- Base branch: `lms-stable` at `f17b64c`
- Working branch: `security/google-auth-role-enforcement`
- Existing local work: `20260901102000_google_auth_role_enforcement.sql`
- Secure grader: draft PR #5 is integrated into this local delivery. It remains
  unverified until `scripts/start-local-secure-grading.ps1` passes against the
  local private runner.

## Audit findings

- The Vite production bundle builds, but TypeScript reports 172 errors and
  ESLint reports 425 errors plus 52 warnings.
- `AuthProvider` and `RoleGuard` call React hooks conditionally in preview mode.
- the OAuth redirect attempts to upsert a profile from the browser, while the
  new database policy correctly revokes browser profile inserts.
- Admin role changes still write `profiles.role` directly instead of using the
  protected admin RPC.
- inactive accounts are not blocked by the client route guard.
- `/admin/roles` and `/admin/storage` are exposed as Coming Soon routes.
- lesson completion, XP, course progress, and certificate issuance are split
  across client writes and are not one atomic, idempotent server operation.
- the project has no durable architecture/testing handoff in the repository.

## Current implementation checkpoint

Completed in the `security/google-auth-role-enforcement` delivery:

- Phase 1 identity and role controls implemented in application and migration
- real Super Admin Users & Permissions workflow implemented
- inactive-account and missing-profile states implemented
- Phase 2 atomic lesson completion and server-owned rewards implemented
- invalid nested PostgREST queries and compile-time data mismatches corrected
- TypeScript: 172 errors reduced to zero
- ESLint: 425 errors reduced to zero blocking errors; legacy warnings remain
- production bundle and whitespace checks passing

Still required before the platform can be called production complete:

- replay both new migrations and run `scripts/verify-local-platform.ps1`
- run the authenticated private-runner and Edge Function verification script
- verify quiz scoring and remaining role workflows end to end
- perform desktop/mobile browser smoke testing against local Supabase
- verify certificate rendering/public verification/revocation
- production environment, OAuth redirect and deployment verification

## Delivery phases

### Phase 1: identity and role foundation

- trigger-only profile provisioning for Google/password accounts
- no browser profile identity insert or upsert
- active-account enforcement in route guards and database helpers
- protected Super Admin role/status RPCs used by every admin UI/service
- real Users & Permissions page; no duplicate Coming Soon roles route
- no exposed unfinished storage route in the production navigation

### Phase 2: learning integrity

- atomic, idempotent lesson completion RPC
- server-owned XP, level, enrollment progress, and certificate issuance
- remove direct student writes to authoritative progress/reward fields
- refresh/relogin persistence verification

### Phase 3: assessment workflows

- faculty assignment/question/test builder
- student run/custom-input/submit/history flow
- faculty submission review and override flow
- isolated hidden-test grading through the private runner from draft PR #5
- quiz attempts and scoring verified server-side

### Phase 4: remaining academy operations

- projects/workspaces and faculty review
- courses/chapters/lessons, batches, live classes, attendance, announcements
- student/faculty/admin dashboards based on authoritative data
- certificate issuance, printable artifact, public verification, and revocation
- placements and notification flows

### Phase 5: release gate

- zero TypeScript errors
- zero ESLint errors (legacy warnings documented and reduced separately)
- production build
- clean migration replay against local Supabase
- Student/Faculty/Super Admin happy-path and denial-path checks
- desktop/mobile browser smoke tests
- environment/OAuth/deployment verification

## Acceptance criteria for Phase 1

1. A newly authenticated user receives a student profile only through the
   database auth trigger.
2. A missing profile shows a recoverable support state; the browser never
   creates or chooses an identity/role.
3. An inactive account can see the disabled-account screen but cannot enter a
   dashboard.
4. Only an active Super Admin can change another account's role or status.
5. A Super Admin cannot remove their own admin role or deactivate themselves.
6. All role/status UI actions report loading, success, and failure states and
   reload authoritative database data.
7. Production navigation contains no exposed placeholder admin destination.

## Rollout

All migrations are replayed and tested locally first. No remote database push,
merge, or production deployment occurs until the relevant local gates pass.

From a second PowerShell window with Docker Desktop and local Supabase already
running:

```powershell
Set-Location "C:\Users\ASUS ExpertBook\kaverilmspracticeplayground"
.\scripts\verify-local-platform.ps1
```

Then connect and prove the secure grader from another PowerShell window:

```powershell
Set-Location "C:\Users\ASUS ExpertBook\kaverilmspracticeplayground"
.\scripts\start-local-secure-grading.ps1
```

The script creates only a temporary local test student, runs a real published
reference solution through `secure-grade` and go-judge, verifies the audit row,
deletes the temporary user, and leaves the function server running for the LMS.
