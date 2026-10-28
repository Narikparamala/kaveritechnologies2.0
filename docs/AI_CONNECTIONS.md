# Faculty AI Connections (BYO keys) + Course-Aware Generation

Each faculty member connects **their own API key** for any model. Content Import
(AI Drafts, AI Mini Projects, AI Assignments, Slides→Practice) generates against
**their key**, with a **trimmed course context pack** and an **internal MCP
server** (`kaveri-context`) the model can call for more course detail. Drafts
always land in the existing validate-and-review flows — nothing auto-publishes.
If a faculty has no connection, generation falls back to the platform
`GEMINI_API_KEY` exactly like before, so existing users keep working.

## One-time setup

```bash
supabase db push                       # applies 20261022100000_faculty_ai_connections.sql
supabase secrets set AI_KEY_ENCRYPTION_SECRET="<openssl rand -base64 32>"
supabase functions deploy faculty-ai-connections generate-questions generate-mini-project generate-from-slides
```

`GEMINI_API_KEY` stays as-is: it is the **platform fallback** when a faculty
member has no connection of their own.

To re-check the server code locally, a portable Deno lives at
`.freebuff-tools/deno-2.9.8/deno.exe` (Windows), and `.freebuff/mcp-smoke.ts`
boots the MCP server over InMemoryTransport with a stubbed Supabase client:

```bash
deno check supabase/functions/faculty-ai-connections/index.ts  # or any function entrypoint
deno run --allow-net .freebuff/mcp-smoke.ts                    # MCP boot/tool-call smoke
```

## How it fits together

| Piece | Location | Purpose |
| --- | --- | --- |
| Table + RLS | `supabase/migrations/20261022100000_faculty_ai_connections.sql` | `faculty_ai_connections` (AES-GCM ciphertext, provider, model, base_url, is_default) + `ai_generation_logs` |
| Encryption | `supabase/functions/_shared/ai/crypto.ts` | AES-256-GCM `v1:<iv>:<ct>`; key derived from `AI_KEY_ENCRYPTION_SECRET` |
| Providers | `supabase/functions/_shared/ai/providers.ts` | One `chat()` for google / openai / anthropic / groq / openrouter / custom (OpenAI-compatible base URL) |
| Errors | `supabase/functions/_shared/ai/errors.ts` | "Invalid API key", "Model not available", "Rate limited", … |
| Context pack | `supabase/functions/_shared/ai/context.ts` | Course skeleton + focused lesson detail, deduped, capped ≈5.5k tokens |
| MCP | `supabase/functions/_shared/mcp/kaveri-context/server.ts` | In-process MCP server + client (`get_course_tree`, `get_lesson_context`, `search_question_bank`, `get_faculty_drafts`, `get_related_items`) — ownership enforced via the caller's JWT *and* explicit `course_faculty` checks. Pinned to `@modelcontextprotocol/sdk@1.17.3` + `zod@3.25.76` (esm.sh Deno target): newer 1.x bundles have a broken zod v4 interop at import time. |
| Orchestrator | `supabase/functions/_shared/ai/generation.ts` | resolve → decrypt → context → MCP → provider loop → log |
| CRUD + test | `supabase/functions/faculty-ai-connections/index.ts` | GET list / POST save / test / delete; keys never leave the server |
| UI | `src/pages/faculty/FacultyAiConnectionsPage.tsx` | `/faculty/settings/ai-connections` — provider cards, masked key, Test connection, defaults |
| Model selector | `src/pages/faculty/ContentImportPage.tsx` | Shared selector on AI Drafts / Mini Projects / Assignments tabs |

## Generation request flow

`generate-questions` / `generate-mini-project` accept an optional
`connection_id` (`null` = default, `'platform'` = force platform key),
`course_id` and `lesson_id`. Server-side:

1. Load + decrypt the connection (RLS-limited to the caller).
2. Build the context pack for the selected course / lesson / topic.
3. Boot the in-process MCP server bound to that faculty's JWT and expose its
   tools to the model (tool-capable providers run a bounded tool-call loop).
4. Call the provider, strip fences, validate the draft.
5. `ai_generation_logs`.

## Adding a new provider

1. Add a constant to `DEFAULT_BASE_URLS` / `PROVIDER_LABELS` / `SUGGESTED_MODELS`
   in `supabase/functions/_shared/ai/providers.ts`.
2. Write one adapter (`async function chat<Provider>(args)` — copy the
   OpenAI-compatible one for anything OpenAI-style) and add it to the
   `switch` in `chat()`.
3. Add the id to the `_shared/ai/connections.ts` provider validation (it uses
   `PROVIDER_LABELS` keys automatically) and to `AI_PROVIDERS` in
   `src/services/aiConnections.ts` for the UI cards.

That's all — the DB stores whatever provider string is passed; RLS and
encryption are provider-agnostic.

## Security notes

- Keys are AES-256-GCM encrypted; plaintext exists only transiently in the
  edge runtime and is never logged or returned to any client.
- Every table update/delete is scoped by `faculty_id` and RLS-enforced.
- MCP tools re-check `course_faculty` membership on every course-scoped read.
- Generation output stays a draft; import still requires the secure-judge
  validation the faculty member must review and trigger.
