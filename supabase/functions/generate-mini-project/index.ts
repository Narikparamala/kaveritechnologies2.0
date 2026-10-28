// AI mini-project draft generator (staff-only).
//
// Faculty give a free-form prompt ("a Python quiz score calculator"); their OWN
// AI connection (or the platform Gemini fallback) returns ONE complete browser
// mini-project draft as structured JSON: problem statement, starter code,
// reference solution, and 3-5 stdin/stdout test cases. The generation is
// course-aware: connection resolve → key decrypt → context pack → internal
// kaveri-context MCP tools → provider chat loop, then the draft is validated.
//
// The draft is returned to the browser for review — the Content Import
// "AI Mini Projects" tab runs the reference solution through the secure judge
// BEFORE anything can be saved. The AI never publishes anything directly.
//
// Secrets:
//   GEMINI_API_KEY           — optional platform fallback (legacy behavior)
//   AI_KEY_ENCRYPTION_SECRET — decryption of stored faculty keys
//
// Request:  { prompt, connection_id?, course_id?, lesson_id? }
// Response: { draft: MiniProjectDraft, meta: { connection, model, tool_rounds } }

import { jsonResponse } from '../_shared/ai/errors.ts';
import { HttpError, initStaffRequest } from '../_shared/ai/connections.ts';
import { runGeneration, stripCodeFences } from '../_shared/ai/generation.ts';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'content-type': 'application/json' },
  });
}

// Some models write "\\n" (literal backslash-n) instead of real newlines in code
// fields. A single-line field whose only breaks are those escapes is meant to
// contain real line breaks; when real breaks exist, backslash-n is kept as code.
function normalizeCodeText(value: string): string {
  if (!value.includes('\\') || value.includes('\n') || value.includes('\r')) return value;
  return value.replace(/\\n/g, '\n').replace(/\\t/g, '\t');
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return json({}, 200);

  let ctx;
  try {
    ctx = await initStaffRequest(req.headers.get('Authorization') ?? '');
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message }, e.status);
    return json({ error: 'Request failed' }, 500);
  }

  let payload: { prompt?: string; connection_id?: string; course_id?: string; lesson_id?: string };
  try {
    payload = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const prompt = (payload.prompt ?? '').trim();
  if (prompt.length < 5) return json({ error: 'Describe the mini project you want (at least 5 characters)' }, 400);

  const system = `You design small auto-gradable Python mini projects for a browser IDE.
The program always reads from stdin and prints to stdout - it is graded by exact output match.
Return ONLY a JSON object with EXACTLY these keys:
{
  "title": string,                     // short, e.g. "Mini Project: Quiz Score Calculator"
  "topic": string,                     // 1-3 words, e.g. "Conditionals"
  "concepts": string[],                // 3-6 short concept tags this project requires, e.g. ["Lists", "Loops", "Strings", "Input Parsing"]
  "problem_statement": string,         // full instructions: input format line by line, output format EXACTLY, one Input/Output example
  "starter_code": string,              // python skeleton with TODOs, reads input but does not solve
  "reference_solution": string,        // complete correct Python 3, reads stdin, prints exact expected output, no prompts
  "tests": [                           // 3 to 5 cases
    { "input_text": string, "expected_output": string, "is_hidden": boolean }
  ]
}
Rules:
- concepts: name the Python concepts a student must already know to solve this (title case, 1-3 words each, no duplicates).
- expected_output must be EXACTLY what print() produces (use \\n between lines, no trailing spaces/newline).
- At least 1 visible (is_hidden=false) and at least 2 hidden (is_hidden=true) tests.
- Cover edge cases in hidden tests.
- reference_solution must pass ALL tests - trace each one mentally before answering.
- Stay consistent with the course context when provided: match its topic naming and do not duplicate existing mini projects listed there.
- Output raw JSON only. No markdown fences, no commentary.`;

  // Weaker models sometimes emit mangled JSON (doubled escapes, stray quotes).
  // A cheap escape-repair pass handles a subset; otherwise ask the model once
  // more with a strict-validity nudge before giving up.
  const parseLenient = (text: string): unknown | undefined => {
    const fenceMatch = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
    const candidates = [stripCodeFences(text), fenceMatch ? fenceMatch[1].trim() : ''];
    for (const stripped of candidates) {
      if (!stripped) continue;
      try {
        return JSON.parse(stripped);
      } catch {
        try {
          // Double up backslash-escapes that JSON does not define (\d, \ , ...).
          return JSON.parse(stripped.replace(/\\(?![\\/"bfnrtu])/g, '\\\\'));
        } catch {
          // try next candidate
        }
      }
    }
    return undefined;
  };

  try {
    let draft: unknown | undefined;
    let finalText = '';
    let metaResult = { connectionId: null as string | null, model: null as string | null, toolRounds: 0 };
    for (let attempt = 1; attempt <= 3 && !draft; attempt++) {
      const result = await runGeneration({
        ctx,
        kind: 'mini_project',
        scope: {
          connectionId: payload.connection_id ?? null,
          courseId: payload.course_id ?? null,
          lessonId: payload.lesson_id ?? null,
          topic: prompt,
        },
        compose: () => ({
          system,
          user: attempt === 1
            ? `Design the mini project: ${prompt}`
            : attempt === 2
              ? `Design the mini project: ${prompt}\n\n(The previous answer could not be parsed.) Output ONE valid JSON object only — plain JSON, nothing else. Do not double-escape quotes or backslashes.`
              : `Design the mini project: ${prompt}\n\nOutput ONLY a fenced code block: \`\`\`json\n{ ...one complete valid JSON object... }\n\`\`\`\nInside the block, use real newlines (actual line breaks) and standard JSON escaping only.`,
          jsonMode: attempt === 1,
          temperature: attempt === 1 ? 0.6 : 0.2,
          maxOutputTokens: 8192,
        }),
      });
      finalText = result.text;
      metaResult = { connectionId: result.connectionId, model: result.model, toolRounds: result.toolRounds };
      const parsed = parseLenient(finalText);
      if (parsed) draft = parsed;
    }

    if (!draft) {
      const msg = `The AI could not produce a valid JSON draft [${(finalText || '').slice(0, 120)}…]`;
      return json({ error: msg }, 502);
    }

    const d = draft as {
      title?: unknown; topic?: unknown; concepts?: unknown; problem_statement?: unknown;
      starter_code?: unknown; reference_solution?: unknown; tests?: unknown;
    };
    const concepts = Array.isArray(d.concepts)
      ? Array.from(new Set(
          (d.concepts as unknown[])
            .map(c => String(c ?? '').trim())
            .filter(c => c.length > 0 && c.length <= 40),
        )).slice(0, 8)
      : [];
    const tests = Array.isArray(d.tests)
      ? (d.tests as any[])
          .map((t, i) => ({
            input_text: normalizeCodeText(String(t?.input_text ?? '')).replace(/\r\n/g, '\n'),
            expected_output: normalizeCodeText(String(t?.expected_output ?? '')).replace(/\r\n/g, '\n').trimEnd(),
            is_hidden: t?.is_hidden === true,
            position: i + 1,
          }))
          .filter(t => t.expected_output !== '')
      : [];

    if (!d.title || !d.problem_statement || !d.reference_solution || tests.length < 2) {
      return json({ error: 'The AI draft is incomplete (needs title, problem, solution and 2+ tests). Try again.' }, 502);
    }

    return json({
      draft: {
        title: String(d.title).slice(0, 120),
        topic: String(d.topic ?? 'Mini Projects').slice(0, 60) || 'Mini Projects',
        concepts,
        problem_statement: String(d.problem_statement).replace(/\r\n/g, '\n'),
        starter_code: normalizeCodeText(String(d.starter_code ?? '')).replace(/\r\n/g, '\n'),
        reference_solution: normalizeCodeText(String(d.reference_solution)).replace(/\r\n/g, '\n'),
        tests,
      },
      meta: { connection: metaResult.connectionId, model: metaResult.model, tool_rounds: metaResult.toolRounds },
    });
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message }, e.status);
    return json({ error: e instanceof Error ? e.message : 'Generation failed.' }, 502);
  }
});
