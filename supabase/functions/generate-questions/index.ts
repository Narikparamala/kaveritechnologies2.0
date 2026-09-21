// AI question draft generator (staff-only).
//
// Faculty give a topic + count; Gemini drafts coding questions WITH a
// reference solution and test cases. Drafts are returned to the browser as a
// CSV row set — they land in the Content Import page's validate-and-review
// flow, where the reference solution is executed against the tests through the
// secure runner BEFORE anything can be imported. The AI never publishes
// anything directly.
//
// Secrets (supabase secrets set):
//   GEMINI_API_KEY   — Google AI Studio key (free tier is fine)
//
// Request:  { topic: string, count: 1-20, difficulty?: 'easy'|'medium'|'hard' }
// Response: { csv: string } — QUESTIONS_CSV_TEMPLATE format, ready to paste
//           into Content Import (questions tab) for validation + import.

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

function csvEscape(s: string): string {
  const v = String(s ?? '');
  return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
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

  let payload: { topic?: string; count?: number; difficulty?: string };
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
- reference_solution is complete runnable Python 3 that reads from stdin and prints the answer. No prompts, no extra text.
- Each question has EXACTLY 2 test cases: test 1 visible (test_hidden_1 = no), test 2 hidden (test_hidden_2 = yes).
- expected output must be exactly what print() produces, with no trailing spaces.
- Wrap every field containing commas or newlines in double quotes; escape inner quotes as "".
- One question per CSV line-pair is fine because quoted fields may span newlines.
- Output the raw CSV only. No markdown fences, no commentary.`;

  const user = `Generate ${count} Python coding question(s) about: ${topic}
Difficulty: ${difficulty}.
Vary the scenarios (not all the same story). Each question tests a different angle of the topic.`;

  const modelUrl =
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`;

  const genRes = await fetch(modelUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: user }] }],
      generationConfig: { temperature: 0.7, maxOutputTokens: 8192 },
    }),
  });

  if (!genRes.ok) {
    const detail = await genRes.text().catch(() => '');
    return json({ error: `Gemini request failed (${genRes.status}). ${detail.slice(0, 200)}` }, 502);
  }

  const gen = await genRes.json();
  const text: string =
    gen?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? '').join('') ?? '';
  if (!text.trim()) return json({ error: 'The AI returned an empty draft. Try again.' }, 502);

  // Strip markdown fences if the model added them despite instructions.
  const csv = text.trim().replace(/^```(?:csv)?\s*/i, '').replace(/\s*```$/, '');
  return json({ csv });
});
