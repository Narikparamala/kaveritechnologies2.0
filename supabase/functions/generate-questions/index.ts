// AI question draft generator (staff-only).
//
// Faculty give a topic + count; their OWN AI connection (or the platform
// Gemini fallback) drafts coding questions WITH a reference solution and test
// cases. The generation is course-aware: the edge function resolves the
// faculty's faculty_ai_connections row, decrypts the key in the edge runtime,
// builds a trimmed course context pack, exposes the internal kaveri-context
// MCP tools, then runs the provider chat loop.
//
// Drafts land in the Content Import page's validate-and-review flow, where the
// reference solution is executed against the tests through the secure runner
// BEFORE anything can be imported. The AI never publishes anything directly.
//
// Secrets:
//   GEMINI_API_KEY           — optional platform fallback (legacy behavior)
//   AI_KEY_ENCRYPTION_SECRET — decryption of stored faculty keys
//
// Request:  { topic, count 1-20, difficulty?, connection_id?, course_id?, lesson_id? }
// Response: { csv, meta: { connection, model, tool_rounds } }

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

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return json({}, 200);

  let ctx;
  try {
    ctx = await initStaffRequest(req.headers.get('Authorization') ?? '');
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message }, e.status);
    return json({ error: 'Request failed' }, 500);
  }

  let payload: {
    topic?: string; count?: number; difficulty?: string;
    connection_id?: string; course_id?: string; lesson_id?: string;
  };
  try {
    payload = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const topic = (payload.topic ?? '').trim();
  const count = Math.min(20, Math.max(1, Math.floor(Number(payload.count ?? 5)) || 5));
  const difficulty = ['easy', 'medium', 'hard'].includes(payload.difficulty ?? '')
    ? payload.difficulty!
    : 'mixed';

  if (topic.length < 3) return json({ error: 'Describe the topic (at least 3 characters)' }, 400);

  // Deterministic, execution-friendly output contract for the model.
  const system = `You generate practice coding questions for a Python teaching platform.
Return ONLY valid CSV matching this header exactly:
title,topic,subtopic,difficulty,marks,publish,problem_statement,input_format,output_format,starter_code,reference_solution,explanation,hints,test_input_1,test_expected_1,test_hidden_1,test_weight_1,test_input_2,test_expected_2,test_hidden_2,test_weight_2
Rules:
- difficulty is easy, medium, or hard (mix them when asked for "mixed").
- marks = 10.
- publish = no (a human reviews every draft).
- The question must be solvable as a SCRIPT: it reads its input with input() or sys.stdin and prints the result with print().
- reference_solution is a complete runnable straight-line Python 3 script.
- CRITICAL: do NOT write solution-only function definitions. If you define any helper function you MUST call it at the bottom of the script (inside an if __name__ == '__main__' guard or directly). A def that is never called produces no output and fails every test.
- Every solution MUST print at least one line. A run with empty stdout is a failure.
- Do not print trailing spaces at the end of any line; do not print anything except the expected output.
- Each question has EXACTLY 2 test cases: test 1 visible (test_hidden_1 = no), test 2 hidden (test_hidden_2 = yes).
- expected output must be exactly what print() produces, with no trailing spaces. Trace each test mentally through your reference_solution before writing it: the solution's actual stdout for the given input MUST equal test_expected_X character for character.
- Pattern/table/list outputs: print ONE result per line with one print() call per line inside the loop. Never join values on one line separated by spaces, and never print a whole list object like [0, 1, 1] unless the test literally expects that list string. Print separate values by calling print(value) repeatedly.
- Wrap every field containing commas or newlines in double quotes; escape inner quotes as "".
- One question per CSV line-pair is fine because quoted fields may span newlines.
- Stay consistent with the course context when it is provided: match its topic naming and difficulty norms, and do not duplicate questions already present in it.
- Output the raw CSV only. No markdown fences, no commentary.`;

  const user = `Generate ${count} Python coding question(s) about: ${topic}
Difficulty: ${difficulty}.
Vary the scenarios (not all the same story). Each question tests a different angle of the topic.`;

  try {
    const result = await runGeneration({
      ctx,
      kind: 'questions',
      scope: {
        connectionId: payload.connection_id ?? null,
        courseId: payload.course_id ?? null,
        lessonId: payload.lesson_id ?? null,
        topic,
      },
      compose: () => ({ system, user, temperature: 0.7, maxOutputTokens: 8192 }),
    });

    const csv = stripCodeFences(result.text);
    if (!csv || !csv.toLowerCase().includes('title')) {
      return json({ error: 'The AI returned an unusable draft. Try again or switch models.' }, 502);
    }
    return json({
      csv,
      meta: { connection: result.connectionId, model: result.model, tool_rounds: result.toolRounds },
    });
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message }, e.status);
    // chat() throws already-mapped provider errors ("Invalid API key", etc.)
    return json({ error: e instanceof Error ? e.message : 'Generation failed.' }, 502);
  }
});
