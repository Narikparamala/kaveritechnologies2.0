// AI mini-project draft generator (staff-only).
//
// Faculty give a free-form prompt ("a Python quiz score calculator"); Gemini
// returns ONE complete browser mini-project draft as structured JSON: problem
// statement, starter code, reference solution, and 3-5 stdin/stdout test
// cases. The draft is returned to the browser for review — the Content Import
// "AI Mini Projects" tab runs the reference solution through the secure judge
// BEFORE anything can be saved. The AI never publishes anything directly.
//
// Secrets (supabase secrets set):
//   GEMINI_API_KEY   - Google AI Studio key (same one generate-questions uses)
//
// Request:  { prompt: string }
// Response: { draft: MiniProjectDraft }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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

  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) return json({ error: 'Authentication required' }, 401);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const geminiKey = Deno.env.get('GEMINI_API_KEY');
  if (!supabaseUrl || !anonKey) return json({ error: 'Server configuration error' }, 500);
  if (!geminiKey) return json({ error: 'AI generation is not configured (GEMINI_API_KEY missing)' }, 501);

  const supabase = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) return json({ error: 'Invalid or expired session' }, 401);

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userData.user.id)
    .maybeSingle();
  if (!profile || !['admin', 'faculty', 'super_admin'].includes(profile.role)) {
    return json({ error: 'Staff only' }, 403);
  }

  let payload: { prompt?: string };
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
- expected_output must be EXACTLY what print() produces (use \n between lines, no trailing spaces/newline).
- At least 1 visible (is_hidden=false) and at least 2 hidden (is_hidden=true) tests.
- Cover edge cases in hidden tests.
- reference_solution must pass ALL tests - trace each one mentally before answering.
- Output raw JSON only. No markdown fences, no commentary.`;

  const user = `Design the mini project: ${prompt}`;

  const genBody = JSON.stringify({
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: 'user', parts: [{ text: user }] }],
    generationConfig: { temperature: 0.6, maxOutputTokens: 4096, responseMimeType: 'application/json' },
  });
  const modelUrls = [
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent',
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent',
  ];

  // Retry transient upstream failures (Gemini occasionally 503s under load),
  // falling back to the lighter model if the primary stays overloaded.
  let genRes: Response | null = null;
  let detail = '';
  for (let modelIdx = 0; modelIdx < modelUrls.length && (!genRes || !genRes.ok); modelIdx += 1) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      if (attempt > 0) await new Promise(r => setTimeout(r, 1500 * attempt));
      genRes = await fetch(modelUrls[modelIdx], {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'X-goog-api-key': geminiKey },
        body: genBody,
      });
      if (genRes.ok) break;
      detail = await genRes.text().catch(() => '');
      if (genRes.status !== 503 && genRes.status !== 429) break; // only retry overload/rate-limit
    }
  }

  if (!genRes || !genRes.ok) {
    return json({ error: `Gemini request failed (${genRes?.status ?? 'network'}). ${detail.slice(0, 200)}` }, 502);
  }

  const gen = await genRes.json();
  const text: string =
    gen?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? '').join('') ?? '';
  if (!text.trim()) return json({ error: 'The AI returned an empty draft. Try again.' }, 502);

  let draft: unknown;
  try {
    draft = JSON.parse(text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, ''));
  } catch {
    return json({ error: 'The AI returned malformed JSON. Try again.' }, 502);
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
          input_text: String(t?.input_text ?? '').replace(/\r\n/g, '\n'),
          expected_output: String(t?.expected_output ?? '').replace(/\r\n/g, '\n').trimEnd(),
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
      starter_code: String(d.starter_code ?? '').replace(/\r\n/g, '\n'),
      reference_solution: String(d.reference_solution).replace(/\r\n/g, '\n'),
      tests,
    },
  });
});
