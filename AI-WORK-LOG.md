# AI-WORK-LOG.md — Agent work log (start using this now)

> **Why this file exists:** this project was built over ~100 days
> by many AIs with no log at all. The next agent had to reconstruct
> everything from git history. Do not repeat that.
>
> **Rule: every agent, every task, one entry below — before you
> close the task.** A task without a log entry is not finished.
> Copy the template for each new entry. Newest first.

## Template (copy this)

```markdown
### YYYY-MM-DD — <short title>
- **Agent / tool:** <e.g. Muse, Bolt, Cursor, ChatGPT — name it>
- **Goal (user's words):** <what the user asked for>
- **What I changed:**
  - <file(s) + what changed, in one line each>
  - Migrations added: <filenames, or "none">
  - Edge functions changed: <names, or "none">
  - Secrets/env added: <names only, never values>
- **What I verified:**
  - <commands run + result, e.g. `npm run typecheck` — pass>
  - <manual smoke test + result>
- **What I deliberately did NOT change (and why):**
  - <e.g. did not touch RLS / routes / RPC signatures / grading>
- **Known risks / follow-ups:**
  - <anything the next agent should check>
- **Branch / PR:** <branch name, PR link or "not pushed yet">
```

---

## Reconstructed history (before this log existed)

*Best-effort reconstruction, 2026-11-12. See `AGENTS.md` §7 for detail.*

### 2026-08-02 — Project started in Bolt.new
- **Agent / tool:** Bolt.new (badge `bolt.new/~/sb1-iwdwyk7x` in README)
- **Goal:** Build Kaveri Academy LMS
- **What happened:** Initial Vite + React + Supabase scaffold.
  No agent log was kept.

### 2026-08 — 2026-10 — Main build (196 commits)
- **Agent / tool:** Mostly Bolt (`bolt/continue-secure-grading`,
  PRs #8–#42), plus other unnamed AIs. All commits under the
  human identity Narik Paramala.
- **What was built:** 3 portals, 160 migrations, 29 RPCs,
  12 edge functions, secure grading (go-judge), AI content import,
  notifications outbox, live classes, enrolments, certificates, jobs.
- **What was NOT recorded:** which AI did what, which migrations
  had already run in prod, which fixes were reverted, why
  Infisical / go-judge / Vercel Python runner were chosen.

### 2026-09-03 — Contamination / reset event (no post-mortem)
- **Evidence:** branches `archive/bolt-contaminated-2026-09-03`,
  `handoff/bolt-2026-09-03`,
  `archive/main-before-lms-normalization-2026-09-03`,
  `snapshot/pre-reset`.
- **Follow-up for the next agent:** if you find duplicated or
  contradictory code from this period, verify against live DB
  behaviour before assuming it is intentional.

### 2026-10-21 / 2026-10-27 — Open bugs filed
- **#43:** Admin Create Course bypasses `create_faculty_course` RPC.
- **#44:** Faculty lesson checklist hardcodes `done={false}`.
- Both confirmed in code on 2026-11-12. Still open at pack creation.

### 2026-10-28 — HEAD `9054751` (WIP checkpoint)
- "wip: save local changes before machine reset (LMS pages,
  services, supabase functions)". Unpolished tip, not a release.

### 2026-11-12 — Handover pack created (Muse)
- **Agent / tool:** Muse
- **Goal (user's words):** "Run the full app, I want to make this
  project very useful, customisable so everybody can reuse it …
  when some user use this project and assign a goal to his agent
  and agent have to get full understanding of whole project …
  without changing or modifying anything any feature just upgrading,
  updating add new features … people can rename for their own company"
- **What I changed:**
  - Created this pack (not yet copied into the repo — see below):
    `AGENTS.md`, `ARCHITECTURE.md`, `REBRAND-GUIDE.md`,
    `FRESH-SETUP.md`, `AI-WORK-LOG.md` (this file)
  - Research audit saved as `kaveri-research-audit.md`
  - Migrations added: none. Edge functions changed: none.
    App code changed: none.
- **What I verified:**
  - Fresh clone at HEAD `9054751`, `git status` clean
  - `npm ci` — 588 packages, 25 s, exit 0
  - `npm run build` — pass, 1 m 27 s, dist 16 MB
  - `npm run typecheck` — zero errors
  - `npm run dev:plain` — HTTP 200, correct title; dummy
    Supabase keys fail as expected (shell renders, no data)
  - Supabase read-only: org `kaveritechnologies`, project
    `atcncxckuokjarsxckwy`, 110 tables, 3,045 rows, all RLS on
  - GitHub issues #43 / #44 confirmed in code
- **What I deliberately did NOT change (and why):**
  - No repo code, no migrations, no pushes — user approval
    needed before the pack is copied into the repo / PR'd
  - No real secrets used; dummy env values only for the run
- **Known risks / follow-ups:**
  - Copy this pack into the repo root (`AGENTS.md`,
    `ARCHITECTURE.md`, etc.) via a PR, or it will not be
    found by the next agent
  - Fix #43 / #44 as separate PRs
  - `lms-stable` vs `main` branch model is still undocumented
  - Vercel API access still 403 for team
    `narikparamalas-projects` after reconnect (live site is fine)
- **Branch / PR:** `docs/handover-pack`, PR #45 — https://github.com/Narikparamala/kaveritechnologies2.0/pull/45, commit 3a3be6f546fc8f4df7c386eb126f112313edea08

---

## New entries go above this line (newest first)
