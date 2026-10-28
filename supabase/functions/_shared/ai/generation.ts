// End-to-end generation orchestration shared by every AI edge function.
//
// Steps (in order):
//   1. Resolve the faculty's chosen connection (connection_id) or their default.
//      If they have NO connection, fall back to the platform Gemini key — but
//      only when GEMINI_API_KEY is configured. Existing users keep working.
//   2. Build the trimmed course context pack (course/lesson/topic scoped).
//   3. Boot the internal kaveri-context MCP server + in-process client and
//      advertise its tools to tool-capable models.
//   4. Run the provider chat loop (with tool rounds when supported).
//   5. Log the attempt to ai_generation_logs (never the key, never raw prompts).

import {
  chat,
  type McpToolDef,
  type ProviderId,
} from './providers.ts';
import { HttpError, resolveConnection, type ResolvedAiConnection, type StaffRequestContext } from './connections.ts';
import { buildContextPack } from './context.ts';
import { createKaveriMcpClient, type KaveriMcpClient } from '../mcp/kaveri-context/server.ts';

export interface GenerationRequestScope {
  connectionId?: string | null;
  courseId?: string | null;
  lessonId?: string | null;
  topic?: string | null;
}

export interface ComposedPrompt {
  system: string;
  user: string;
  jsonMode?: boolean;
  temperature?: number;
  maxOutputTokens?: number;
}

export interface GenerationResult {
  text: string;
  toolRounds: number;
  connectionId: string; // 'platform' for the shared key
  provider: ProviderId;
  model: string;
}

/** Platform fallback preserves the pre-BYO Gemini behavior. */
async function platformFallback(): Promise<ResolvedAiConnection | null> {
  const geminiKey = Deno.env.get('GEMINI_API_KEY');
  if (!geminiKey) return null;
  return {
    id: 'platform',
    provider: 'google',
    model: 'gemini-flash-latest',
    apiKey: geminiKey,
    baseUrl: null,
  };
}

async function logGeneration(
  ctx: StaffRequestContext,
  entry: {
    kind: string;
    connectionId: string;
    provider: string | null;
    model: string | null;
    status: 'success' | 'error';
    errorMessage?: string;
    topic?: string | null;
    courseId?: string | null;
    lessonId?: string | null;
    toolRounds?: number | null;
    durationMs?: number | null;
    outputChars?: number | null;
  },
): Promise<void> {
  try {
    await ctx.supabase.from('ai_generation_logs').insert({
      faculty_id: ctx.facultyId,
      kind: entry.kind,
      connection_id: entry.connectionId === 'platform' ? null : entry.connectionId || null,
      provider: entry.provider,
      model: entry.model,
      status: entry.status,
      error_message: entry.errorMessage ?? null,
      topic: entry.topic ?? null,
      course_id: entry.courseId ?? null,
      lesson_id: entry.lessonId ?? null,
      tool_rounds: entry.toolRounds ?? null,
      duration_ms: entry.durationMs ?? null,
      output_chars: entry.outputChars ?? null,
    });
  } catch (e) {
    // Logging must never break generation. Log only the reason, no payloads.
    console.error('ai_generation_logs insert failed:', e instanceof Error ? e.message : e);
  }
}

/**
 * Runs one full generation. `compose` receives the resolved connection so the
 * caller can phrase prompts per provider if needed; the returned system prompt
 * gets the context pack appended automatically.
 */
export async function runGeneration(opts: {
  ctx: StaffRequestContext;
  kind: string;
  scope: GenerationRequestScope;
  compose: (conn: ResolvedAiConnection) => ComposedPrompt;
  maxToolRounds?: number;
}): Promise<GenerationResult> {
  const { ctx, kind, scope } = opts;
  const startedAt = Date.now();

  // 1. Resolve connection (explicit -> default -> platform Gemini fallback).
  let conn: ResolvedAiConnection | null = null;
  try {
    conn = await resolveConnection(ctx.supabase, ctx.facultyId, { connectionId: scope.connectionId ?? null });
  } catch (e) {
    await logGeneration(ctx, {
      kind, connectionId: scope.connectionId ?? 'none', provider: null, model: null,
      status: 'error', errorMessage: e instanceof Error ? e.message : 'Resolve failed',
      topic: scope.topic, courseId: scope.courseId, lessonId: scope.lessonId,
    });
    throw e;
  }
  if (!conn) conn = await platformFallback();
  if (!conn) throw new HttpError(401, 'No AI key connected. Add yours under Settings → AI Connections to generate.');

  // 2. Context pack (graceful: generation proceeds without it if it fails).
  let contextText = '';
  try {
    const pack = await buildContextPack(ctx.supabase, {
      facultyId: ctx.facultyId,
      courseId: scope.courseId ?? null,
      lessonId: scope.lessonId ?? null,
      topic: scope.topic ?? null,
    });
    contextText = pack.text;
  } catch (e) {
    console.error('context pack failed:', e instanceof Error ? e.message : e);
  }

  // 3. MCP client with THIS faculty's auth (fresh per request).
  let mcp: KaveriMcpClient | null = null;
  try {
    mcp = await createKaveriMcpClient({ supabase: ctx.supabase, facultyId: ctx.facultyId, role: ctx.role });
  } catch (e) {
    console.error('mcp boot failed:', e instanceof Error ? e.message : e);
  }

  let tools: McpToolDef[] = [];
  if (mcp) {
    try {
      tools = await mcp.listTools(); // models without tool support simply ignore these
    } catch {
      tools = [];
    }
  }

  const composed = opts.compose(conn);
  const system = contextText
    ? `${composed.system}\n\n=== COURSE CONTEXT (use this as ground truth; do not invent course details) ===\n${contextText}\n=== END COURSE CONTEXT ===\n\nTools (get_course_tree, get_lesson_context, search_question_bank, get_faculty_drafts, get_related_items) can fetch MORE detail about the selecting course when you need it. Only call them when the pack above is insufficient.`
    : composed.system;

  const logBase = {
    kind,
    connectionId: conn.id,
    provider: conn.provider,
    model: conn.model,
    topic: scope.topic,
    courseId: scope.courseId,
    lessonId: scope.lessonId,
  };

  try {
    const outcome = await chat({
      provider: conn.provider as ProviderId,
      apiKey: conn.apiKey,
      baseUrl: conn.baseUrl,
      model: conn.model,
      system,
      user: composed.user,
      jsonMode: composed.jsonMode,
      temperature: composed.temperature,
      maxOutputTokens: composed.maxOutputTokens,
      tools: tools.length > 0 ? tools : undefined,
      runTool: mcp ? (call => mcp!.callTool(call.name, call.argsJson)) : undefined,
      maxToolRounds: opts.maxToolRounds ?? 3,
    });

    await logGeneration(ctx, {
      ...logBase,
      status: 'success',
      toolRounds: outcome.toolRounds,
      durationMs: Date.now() - startedAt,
      outputChars: outcome.text.length,
    });
    return {
      text: outcome.text,
      toolRounds: outcome.toolRounds,
      connectionId: conn.id,
      provider: conn.provider as ProviderId,
      model: conn.model,
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Generation failed.';
    await logGeneration(ctx, {
      ...logBase,
      status: 'error',
      errorMessage: message,
      durationMs: Date.now() - startedAt,
    });
    throw e;
  } finally {
    await mcp?.close();
  }
}

/** Context-strip helper shared by both functions (fences, stray preamble). */
export function stripCodeFences(text: string): string {
  return text.trim().replace(/^```(?:json|csv)?\s*/i, '').replace(/\s*```$/, '').trim();
}
