// Slide-dump → practice generator (staff-only).
//
// Faculty paste the raw slide content of one lesson (the "=====\nSLIDE 35\n====="
// style dump with its "Practice time" blocks) and Gemini turns every practice
// block into a coding question WITH a runnable reference solution and concrete
// test cases, plus (optionally) an MCQ quiz covering the lesson's concepts.
//
// The response is JSON (not CSV): models mangle CSV quote-escaping far too
// often (\" instead of ""), which silently shifts fields. Structured JSON with
// responseMimeType keeps the contract exact. The browser maps the drafts onto
// the same QuestionRow/QuizRow shapes the Content Import pipeline validates by
// execution and imports as drafts — the AI never publishes anything directly.
//
// Secrets (supabase secrets set):
//   GEMINI_API_KEY — Google AI Studio key (same one generate-questions uses)
//
// Request:  { slides: string, chapterLabel?: string, lessonLabel?: string, includeQuiz?: boolean }
// Response: { questions: GeneratedDraftJSON[], quiz: { title, questions } | null }

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

// New-style AI Studio keys don't expose the old pinned model names, and the
// "latest" aliases occasionally return 503 under load — walk the chain.
const GEMINI_MODELS = ['gemini-flash-latest', 'gemini-flash-lite-latest'];

async function callGeminiJson(geminiKey: string, system: string, user: string): Promise<unknown> {
  let lastError = 'unknown error';
  for (const model of GEMINI_MODELS) {
    const modelUrl =
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

    const genRes = await fetch(modelUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'X-goog-api-key': geminiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: user }] }],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 16384,
          responseMimeType: 'application/json',
        },
      }),
    });

    if (genRes.ok) {
      const gen = await genRes.json();
      const text: string =
        gen?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? '').join('') ?? '';
      const trimmed = text.trim();
      if (trimmed) {
        try {
          return JSON.parse(trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, ''));
        } catch {
          lastError = 'The AI returned malformed JSON. Try again.';
          continue;
        }
      }
      lastError = 'The AI returned an empty draft.';
      continue;
    }

    const detail = await genRes.text().catch(() => '');
    lastError = `Gemini request failed (${genRes.status}). ${detail.slice(0, 200)}`;
    // 404/503 → try the next model in the chain; other statuses are unlikely to improve.
    if (genRes.status !== 404 && genRes.status !== 503) break;
  }
  throw new Error(lastError);
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

  let payload: { slides?: string; chapterLabel?: string; lessonLabel?: string; includeQuiz?: boolean };
  try {
    payload = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const slides = (payload.slides ?? '').trim();
  const chapterLabel = (payload.chapterLabel ?? '').trim();
  const lessonLabel = (payload.lessonLabel ?? '').trim();
  const includeQuiz = payload.includeQuiz !== false;

  if (slides.length < 40) {
    return json({ error: 'Paste the slide content of the lesson (at least a few lines).' }, 400);
  }

  const context = [
    chapterLabel ? `Chapter: ${chapterLabel}` : null,
    lessonLabel ? `Lesson: ${lessonLabel}` : null,
  ].filter(Boolean).join(' | ');

  const questionsSystem = `You convert lecture-slide practice exercises into coding questions for a Python teaching platform.
You are given the raw text of one lesson's slides (possibly with "SLIDE N" separators). Every exercise / "Practice time" block becomes ONE coding question. If the slides contain no practice exercises, invent 3 to 5 beginner exercises that fit the exact concepts taught in these slides.

Return JSON of this exact shape:
{"questions": [{"title": "", "topic": "", "subtopic": "", "difficulty": "easy", "problemStatement": "", "inputFormat": "", "outputFormat": "", "referenceSolution": "", "explanation": "", "hints": [""], "tests": [{"input": "", "expected": "", "hidden": false}]}]}

Field rules:
- title: short imperative name for the exercise (e.g. "Reverse the Digits"). If a slide gives a title, use it.
- topic: the core Python concept (e.g. Integer Operations, String Slicing). subtopic: more specific (e.g. Loops, Input Parsing) or empty string.
- difficulty: "easy" or "medium".
- problemStatement: the exercise description, cleaned up into 1-4 clear sentences. Include the slide's example inline like: For example, if the input is 21, the output is 12.
- inputFormat / outputFormat: one short sentence each describing exactly what is read and printed. Derive them from the slide; if the slide is vague, infer the most natural convention.
- referenceSolution: complete runnable Python 3 that reads from stdin and prints the answer. No prompts, no extra text, no trailing whitespace. Newlines are real \\n characters inside the JSON string.
- explanation: one or two sentences on how the solution works. hints: 1-3 short strings.
- CRITICAL — tests: derive them from the slide's stated example / Sample Input / Sample Output FIRST (that exact pair must be the FIRST test and hidden=false). Add 1-2 more correct hidden tests (hidden=true) with different values, including a typical case and an edge case when sensible (e.g. two-digit number ending in 0, single-word input).
- test.input is the exact stdin (use \\n for multiple lines). test.expected is exactly what print() produces, line per line, no trailing spaces.
- Output the JSON only. No markdown fences, no commentary.`;

  const quizSystem = `You create a short multiple-choice quiz covering the CONCEPTS taught in one lesson's slides (not the practice exercises — the concepts they practice).

Return JSON of this exact shape:
{"title": "", "questions": [{"questionText": "", "options": ["", "", "", ""], "correctIndex": 0, "explanation": ""}]}

Field rules:
- title: ${lessonLabel ? `"${lessonLabel} Practice Quiz"` : 'the lesson topic, e.g. "Loops Practice Quiz"'}.
- Produce exactly 5 quiz questions, each with 4 options and exactly one correct (correctIndex 0-3). Vary which index is correct.
- Questions must be answerable purely from the slide content: predict-the-output, spot-the-bug, concept checks.
- explanation: one short sentence.
- Output the JSON only. No markdown fences, no commentary.`;

  const user = `${context ? context + '\n' : ''}Slide content:\n${slides}`;

  const str = (v: unknown, fallback = ''): string =>
    typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : fallback;

  try {
    const parsed = await callGeminiJson(geminiKey, questionsSystem, user) as {
      questions?: unknown[];
    };

    const questions = (parsed?.questions ?? [])
      .map((rawQ) => {
        const q = rawQ as Record<string, unknown>;
        const tests = Array.isArray(q.tests)
          ? q.tests
              .map((t) => {
                const tt = t as Record<string, unknown>;
                return {
                  input: str(tt.input),
                  expected: typeof tt.expected === 'string' ? tt.expected.replace(/\r\n/g, '\n').trimEnd() : '',
                  hidden: tt.hidden === true || tt.hidden === 'true',
                };
              })
              .filter(t => t.expected !== '' && (t.input !== '' || t.expected !== ''))
          : [];
        return {
          title: str(q.title),
          topic: str(q.topic, 'Python Basics'),
          subtopic: str(q.subtopic),
          difficulty: str(q.difficulty, 'easy') === 'hard' ? 'hard' : str(q.difficulty, 'easy') === 'medium' ? 'medium' : 'easy',
          problemStatement: str(q.problemStatement),
          inputFormat: str(q.inputFormat),
          outputFormat: str(q.outputFormat),
          referenceSolution: typeof q.referenceSolution === 'string' ? q.referenceSolution.replace(/\r\n/g, '\n').trim() : '',
          explanation: str(q.explanation),
          hints: Array.isArray(q.hints) ? q.hints.map(h => str(h)).filter(Boolean) : [],
          tests,
        };
      })
      .filter(q => q.title && q.problemStatement && q.referenceSolution && q.tests.length > 0);

    if (questions.length === 0) {
      return json({ error: 'The AI returned no usable questions. Try again.' }, 502);
    }

    let quiz: { title: string; questions: { questionText: string; options: { text: string; correct: boolean }[]; explanation: string }[] } | null = null;
    if (includeQuiz) {
      try {
        const parsedQuiz = await callGeminiJson(geminiKey, quizSystem, user) as {
          title?: unknown;
          questions?: unknown[];
        };
        const quizQuestions = (parsedQuiz?.questions ?? [])
          .map((raw) => {
            const q = raw as Record<string, unknown>;
            const options = Array.isArray(q.options) ? q.options.map(o => str(o)) : [];
            const idx = Math.min(Math.max(0, Math.floor(Number(q.correctIndex ?? 0)) || 0), Math.max(0, options.length - 1));
            return {
              questionText: str(q.questionText),
              options: options.filter(Boolean).map((text, i) => ({ text, correct: i === idx })),
              explanation: str(q.explanation),
            };
          })
          .filter(q => q.questionText && q.options.length >= 2 && q.options.some(o => o.correct));
        if (quizQuestions.length > 0) {
          quiz = { title: str(parsedQuiz?.title, 'Practice Quiz') || 'Practice Quiz', questions: quizQuestions };
        }
      } catch (e) {
        // Quiz is a bonus — questions are the core deliverable.
        return json({
          questions,
          quiz: null,
          warning: `Questions generated, but quiz generation failed: ${e instanceof Error ? e.message : 'unknown error'}`,
        });
      }
    }

    return json({ questions, quiz });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Generation failed' }, 502);
  }
});
