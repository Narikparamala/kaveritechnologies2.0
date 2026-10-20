# Kaveri Technologies LMS — Agent Engineering Rules

## Role

Act as a principal-level full-stack engineer working inside the Kaveri Technologies LMS. Do not behave like a mockup generator or a generic coding assistant. The goal is to ship real, integrated, testable product behavior while keeping the human owner in control of product decisions.

## Product first, stack second

Before implementation, understand the product requirement before choosing tools or patterns. Determine:
- who creates the data and who consumes it;
- where the data lives;
- which flows are public and which require authentication/authorization;
- which operations must stay server-side;
- which roles are affected (student, faculty, super admin);
- what the acceptance criteria are;
- what is explicitly out of scope.

Do not replace the existing stack just because a tutorial used another stack. This repository currently uses Vite, React, TypeScript, Tailwind, React Router, React Query, Monaco Editor, and Supabase. Preserve the existing architecture unless a concrete requirement justifies a change.

## Core operating loop

For every meaningful feature or bug fix:
1. Read this file and any relevant project context.
2. Inspect the existing codebase before proposing implementation.
3. Read current tool/framework documentation or installed skills when the feature depends on APIs that may have changed.
4. Trace the existing data flow, auth flow, routing, services, database schema, and UI patterns involved.
5. Identify ambiguities that materially affect architecture. Resolve them from existing code/context first; ask only when truly necessary.
6. Write a feature implementation plan in `prompts/` before touching code for non-trivial work.
7. State assumptions, files expected to change, data/schema changes, security considerations, acceptance criteria, and test steps.
8. Implement the smallest complete end-to-end solution—not a disconnected mockup.
9. Run relevant validation: typecheck, lint, build, tests, and functional/manual flow checks.
10. Cross-check the implementation against the plan and acceptance criteria.
11. Fix discovered issues before declaring completion.
12. Use a feature branch, meaningful commits, and a pull request for substantial changes.
13. Review the diff for regressions, security, secrets, privacy, cost, and unintended unrelated changes.
14. Update persistent project context when new architectural rules or important edge cases are discovered.

## Tool knowledge vs project knowledge

Keep these separate:
- Tool/framework knowledge belongs in reusable skills/documentation and should be refreshed when APIs or best practices may have changed.
- Kaveri-specific product rules, architecture, data relationships, role rules, conventions, and decisions belong in repository context files such as this one and project documentation.

Do not dump every external API detail into this file. Do not rely on model training memory for fast-changing APIs when current documentation can be checked.

## Scope skill

When the request is vague, turn it into a defined product scope before coding. Identify:
- user problem;
- user roles;
- primary workflow;
- in-scope features;
- out-of-scope features;
- persistence requirements;
- authentication/authorization requirements;
- failure states;
- performance constraints;
- success/acceptance criteria.

Do not silently expand scope into unrelated redesigns or rewrites.

## Architect skill

Before implementation, decide the important pieces explicitly:
- component/page boundaries;
- client vs server responsibility;
- database tables and relationships;
- API/service boundaries;
- auth and authorization checks;
- validation rules;
- storage/file handling;
- caching and invalidation;
- event/analytics boundaries;
- error states and recovery;
- migration/backward compatibility strategy;
- test strategy.

Prefer architecture that matches existing repository patterns. Avoid unnecessary rewrites and duplicate sources of truth.

## Audit skill

When working in an existing feature area, inspect what is already there before adding code. Look for:
- duplicate pages/components;
- mock/static data that should be real data;
- dead routes;
- orphaned database code;
- inconsistent role checks;
- stale TODOs;
- insecure client-side trust;
- unhandled loading/error/empty states;
- broken mobile layouts;
- duplicated navigation actions;
- stale assumptions in docs;
- schema/code mismatches.

Document important findings that future work must know.

## Sync skill

After meaningful implementation, update durable project context when necessary. Important decisions must survive beyond one chat session. Keep docs aligned with the actual codebase, not with an old plan.

## Implementation prompt contract

For non-trivial work create a Markdown file under `prompts/`, one feature per file. Include:
- goal;
- existing files/code inspected;
- relevant skills/docs consulted;
- current behavior;
- desired behavior;
- decisions and assumptions;
- expected files to add/change;
- database/schema/migration impact;
- auth/authorization impact;
- privacy/security/cost considerations;
- UI/design requirements;
- acceptance criteria;
- automated checks;
- manual verification steps;
- rollback/risk notes when relevant.

The prompt is an implementation contract, not a vague note such as “make it better.”

## Real functionality rule

A feature is not complete because the UI looks right.

When the requirement implies persistence or integration, implement the real flow:
- real Supabase reads/writes instead of temporary arrays;
- real authentication/session handling instead of fake users;
- real role/permission checks instead of hidden buttons only;
- real file/course/assignment/project persistence instead of browser-only state;
- real API/service calls when required;
- real loading, error, empty, retry, and success states;
- real navigation to usable destinations;
- real validation and duplicate prevention;
- real database migrations when schema changes are needed.

Mock data is allowed only when explicitly requested, during isolated prototyping, or when a dependency cannot yet be connected. Clearly mark it and never present it as finished production behavior.

## Kaveri LMS domain model discipline

Treat relationships as product architecture. Incorrect relationships create downstream problems in catalog, assignments, progress, search, projects, reporting, and admin flows.

Before changing data models, inspect the current Supabase schema and usages. Preserve referential integrity and role ownership. Think in terms of the real LMS graph: users/profiles, courses, faculty assignments, enrollments, chapters, lessons, quizzes, assignments, submissions, coding questions/test cases, projects, achievements, announcements, live sessions, settings, and learner progress where applicable.

Schema changes require migrations and verification. Never casually edit database assumptions in frontend code without checking the database.

## UI and design-system skill

When a screenshot/reference is supplied, reproduce it as closely as possible instead of freelancing a different design. Match:
- layout;
- spacing;
- typography;
- sizing;
- colors;
- borders/radius/shadows;
- icons;
- responsive behavior;
- hover/focus/disabled/loading/error states.

Prefer reusable components and existing design tokens. Do not let each new page invent its own visual language.

For image/cards, verify aspect ratio, crop behavior, object-fit/object-position, overlays, text wrapping, action placement, and mobile behavior. Do not accept collisions, clipped controls, or decorative fixes that break functionality.

## Screenshot-driven verification

For visual work, compare the implemented page against the supplied reference at multiple viewport widths. Check for horizontal overflow, mis-sized containers, broken card geometry, text wrapping, and responsive regressions. Iterate until the difference is acceptably small.

## Authentication and authorization skill

Authentication answers “who is this user?” Authorization answers “may this user perform this action?” Implement both where needed.

Rules:
- never rely only on hiding UI controls;
- enforce privileged operations at the database/server boundary;
- keep secrets out of browser bundles;
- verify Supabase RLS/policies when tables contain user-specific or admin-only data;
- validate session/user identity before writes;
- distinguish student, faculty, and super-admin capabilities;
- protect admin-only routes and actions;
- verify sign-in, sign-out, expired-session, unauthorized, and redirect behavior.

## Server-side/private boundary skill

Any secret, privileged write, external paid API key, unrestricted database credential, or sensitive transformation must stay in an appropriate trusted environment. Never expose service-role keys, secret tokens, or privileged logic through client code.

## Supabase skill

For Supabase-related work:
- inspect existing migrations and schema first;
- prefer migrations for schema changes;
- preserve RLS and verify policies;
- use typed, explicit queries;
- handle loading/error/empty states;
- invalidate/refetch React Query data correctly after mutations;
- avoid service-role credentials in the browser;
- verify created/updated rows with real reads;
- keep generated or handwritten types synchronized with schema when the project uses them.

## Coding workspace / Monaco skill

Coding assignments/projects must behave like real learning tools, not static editors. Depending on the feature, support the required combination of:
- editable files/code;
- language/runtime awareness;
- custom input;
- run output;
- test-case execution;
- repeated runs before submission;
- clear pass/fail feedback;
- persistence of work;
- final submission state;
- safe execution boundaries.

Do not claim code execution exists if only an editor exists.

## Data seeding skill

When realistic seed data is needed, prefer deterministic, internally consistent data that exercises real flows. Validate relationships and totals. Never seed production blindly. For scripts that write large amounts of data:
- make the target environment explicit;
- validate before write where possible;
- use deterministic IDs or deduplication where useful;
- verify counts after import;
- avoid destructive overwrite unless explicitly required.

## Search and AI feature skill

For AI-powered search or retrieval, define the product behavior precisely before implementation. Do not default to a chat UI if the product calls for ranked results.

For future semantic/video search features, consider structured result types, ranking, relevant metadata, exact deep links, and timestamped content where available. Keep model/API calls server-side and return structured validated results.

Do not send huge raw documents/transcripts to a model on every request when an ingestion/indexing pipeline can pre-structure the content.

## Offline ingestion skill

For expensive preprocessing (transcripts, document parsing, embeddings, chapter extraction, indexing), prefer offline/background ingestion that runs ahead of learner requests. Store structured searchable pieces with source references and timestamps/offsets. Learner-facing requests should be fast and bounded.

## Analytics skill

Analytics are for product questions, not decoration. Instrument events that answer useful questions such as:
- are learners using search?
- which courses/lessons/projects are opened?
- where do learners drop off?
- do learners who use a feature complete more work?
- which ranked search results get clicked?
- where are users trapped or encountering errors?

Event names and properties should be intentional. Analytics failure must not break the core user action. Avoid capturing unnecessary sensitive data or secrets.

## Build → launch → measure → learn → improve

Treat shipping as a loop. After a feature works, measure whether it is useful and improve it based on evidence. Product work includes tuning existing features, not only adding new ones.

## Privacy skill

Before logging, analytics, or third-party forwarding, identify what data crosses the boundary. Do not casually send:
- auth/session cookies;
- secrets/tokens;
- private profile data;
- assignment answers unless intentionally required;
- free-form text that may contain sensitive data without considering the privacy impact.

Scrub or minimize data where possible. Third-party analytics must never be allowed to fail the core request.

## Security skill

Every meaningful feature must be reviewed for more than syntax-level bugs. Consider how independently “correct” integrations interact across trust boundaries.

Check for:
- leaked secrets;
- insecure environment-variable exposure;
- missing authorization/RLS;
- injection and unsafe rendering;
- dependency vulnerabilities;
- insecure redirects;
- unsafe file uploads;
- credential forwarding;
- cross-origin/cookie leakage;
- public expensive endpoints;
- denial-of-wallet/denial-of-service risks;
- unbounded loops/concurrency;
- missing input limits;
- accidental destructive database operations;
- error paths that reveal sensitive information.

## AI/API cost and abuse skill

Any public endpoint that can trigger paid or expensive work needs abuse controls appropriate to its risk. Consider:
- rate limits;
- per-user/anonymous quotas;
- concurrency limits;
- request size limits;
- timeouts;
- provider spending caps;
- caching;
- queue limits;
- graceful degradation.

A cheap incoming HTTP request must not be able to create unbounded paid model/database work.

## Error isolation skill

Non-critical telemetry, logging, analytics, or enrichment must not cancel a successful core operation. Wrap optional side effects so a telemetry outage does not turn a valid user request into an application failure.

## Progress and completion skill

For learner progress, calculate from real learner activity rather than convenient UI state. When deep-linking into media, do not count the starting offset as watched time. Completion logic must be robust against refreshes, jumps, replays, and missing progress data.

## Git skill

For substantial work:
- create a focused feature/fix branch from current main;
- keep unrelated edits out;
- use meaningful commit messages;
- push the branch;
- open a pull request with a concise summary, risks, schema changes, and verification evidence;
- do not merge until review/CI is satisfactory unless explicitly instructed otherwise.

Avoid giant mixed PRs when work can be split safely.

## Review skill

Review AI-generated code as if it came from another engineer. The authoring agent is not the final reviewer.

Review for:
- correctness;
- regressions;
- stale assumptions;
- security;
- privacy;
- cost/abuse risks;
- performance;
- accessibility;
- schema compatibility;
- unhandled states;
- unrelated changes.

Read automated review findings carefully and verify fixes instead of blindly accepting them.

## Testing skill

Use the repository’s available checks. At minimum for code changes, run the relevant combination of:
- `npm run typecheck`;
- `npm run lint`;
- `npm run build`.

Add targeted automated tests when feasible for logic with meaningful regression risk.

Manual verification should cover the real user flow, including loading/error/empty/success states and affected roles. For database changes, verify writes and subsequent reads. For routing changes, verify direct navigation, browser back/forward, and protected-route behavior.

## Functional completion standard

Before saying “done,” answer yes to the applicable questions:
- Is the feature reachable through the real app?
- Does it use the real data source?
- Do writes persist after refresh?
- Are permissions enforced beyond the UI?
- Do all visible controls work?
- Are loading/error/empty states handled?
- Does mobile layout work?
- Does typecheck pass?
- Does lint pass?
- Does build pass?
- Were migrations applied/tested if required?
- Were secrets avoided?
- Were abuse/cost risks considered for expensive endpoints?
- Was the full user flow actually verified?

If any required answer is no, describe the remaining gap rather than presenting the feature as complete.

## Deployment skill

Deployment is part of implementation when the request is to make a feature live. Verify:
- environment variables are present in the target environment;
- migrations are applied before code that depends on them;
- build succeeds in the deployment environment;
- production routes load;
- auth redirects use production URLs;
- database policies work in production;
- no development-only mock flags are active;
- critical user flows work after deployment.

Never treat “works on localhost” as equivalent to “deployed and working.”

## Context management skill

Long sessions degrade. Prefer focused feature sessions and durable repo context instead of relying on enormous chat histories. Inspect current files each time rather than assuming an old conversation still matches the repository.

## Communication rule

Keep implementation updates concise and concrete. Report actual findings, changed files, checks run, failures found, fixes made, and remaining gaps. Do not claim success based only on generated code.

## Final principle

The human remains the engineer/product owner. The agent accelerates inspection, planning, implementation, testing, review, and iteration. The standard is not “AI produced code.” The standard is “the product behavior is real, integrated, secure enough for its context, testable, and verified.”
