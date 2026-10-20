# Feature Implementation Prompts

Create one Markdown file here for each non-trivial feature or significant bug fix before implementation.

Recommended filename examples:
- `assignment-runner.md`
- `project-workspace.md`
- `course-card-image-crop.md`
- `admin-role-protection.md`
- `learner-progress.md`

Each prompt should contain:

## Goal
What user-visible problem is being solved?

## Existing behavior
What happens now? Include the concrete broken/unfinished flow.

## Existing code inspected
List the routes, components, services, hooks, database objects, migrations, and context files inspected before planning.

## Relevant technical knowledge
List current docs/skills consulted for fast-changing APIs or frameworks.

## Scope
Define what is in and out.

## Architecture / decisions
Describe client/server boundaries, data flow, state ownership, persistence, role rules, and important edge cases.

## Files expected to change
List expected additions/edits. Avoid unrelated files.

## Database impact
State tables, columns, relationships, migrations, policies/RLS, seed data, and rollback implications. Write `None` when truly not applicable.

## Authentication / authorization
State who may view/use/change the feature and where that permission is enforced.

## Security / privacy / cost
Consider secrets, third-party data sharing, input limits, paid APIs, abuse, rate limiting, concurrency, and trust boundaries.

## UI requirements
Reference screenshots/design-system components and responsive states when applicable.

## Acceptance criteria
Write observable pass/fail criteria.

## Automated verification
List commands/tests such as:
- `npm run typecheck`
- `npm run lint`
- `npm run build`
- targeted tests

## Manual verification
Describe the real click-through/data flow to test, including refresh persistence, affected roles, and failure states.

## Risks / rollback
Call out migration, compatibility, destructive-write, performance, or deployment risks when applicable.

After implementation, update the prompt or linked project docs if the actual architecture differs from the original plan. The repository is the durable source of project state; do not rely on a chat session to preserve important decisions.
