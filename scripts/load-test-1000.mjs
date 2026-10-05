// Load test: simulates a wave of students hitting the hot READ paths the
// student portal uses on login/first browse. Uses only Node built-ins, so it
// runs with plain `node` (Node 18+ has fetch).
//
// Usage:
//   ANON_KEY=eyJ... TEST_TOKEN=eyJ... node scripts/load-test-1000.mjs
//   - ANON_KEY      the public VITE_SUPABASE_ANON_KEY from .env.local
//   - TEST_TOKEN    an access_token of a logged-in student/dev account
//   - TEST_QUIZ_ID  (optional) a published quiz the test account can open
//
// What it does NOT do: it never writes (no submissions, no attempts, no
// progress rows) and never calls the external code runner or Gemini. It is a
// read-path capacity check, which is what a 1000-student login wave stresses.

const SUPABASE_URL = 'https://atcncxckuokjarsxckwy.supabase.co';
const ANON_KEY = process.env.ANON_KEY;
const TEST_TOKEN = process.env.TEST_TOKEN;
const TEST_QUIZ_ID = process.env.TEST_QUIZ_ID || '';

if (!ANON_KEY || !TEST_TOKEN) {
  console.error('Set ANON_KEY and TEST_TOKEN env vars first.');
  process.exit(1);
}

// Each virtual student performs this read sequence once, with small gaps,
// mirroring a student clicking through the portal after login.
async function studentJourney(studentIndex) {
  const results = [];
  const authHeaders = { apikey: ANON_KEY, Authorization: `Bearer ${TEST_TOKEN}` };

  const get = async (label, path) => {
    const started = performance.now();
    try {
      const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: authHeaders });
      await response.arrayBuffer();
      const ms = Math.round(performance.now() - started);
      results.push({ label, ms, ok: response.ok, status: response.status });
    } catch (error) {
      const ms = Math.round(performance.now() - started);
      results.push({ label, ms, ok: false, status: 0, error: String(error) });
    }
  };

  const rpc = async (label, fn, args) => {
    const started = performance.now();
    try {
      const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
        method: 'POST',
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify(args),
      });
      await response.arrayBuffer();
      const ms = Math.round(performance.now() - started);
      results.push({ label, ms, ok: response.ok, status: response.status });
    } catch (error) {
      const ms = Math.round(performance.now() - started);
      results.push({ label, ms, ok: false, status: 0, error: String(error) });
    }
  };

  await get('enrollments', 'course_enrollments?select=course_id&student_id=eq.' + JSON.parse(atob(TEST_TOKEN.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).sub);
  await get('quizzes', 'quizzes?select=id,title,is_published&is_published=eq.true');
  await get('attempts', 'coding_question_attempts?select=question_id,first_solved_at,attempts_count');
  await get('lesson_progress', 'lesson_progress?select=lesson_id&completed=eq.true');
  await rpc('coding_questions', 'get_student_coding_questions', { p_question_id: null });
  if (TEST_QUIZ_ID) await rpc('quiz_questions', 'get_quiz_questions_for_student', { p_quiz_id: TEST_QUIZ_ID });

  return results;
}

const arg = process.argv[2] || 'wave';
const CONCURRENCY = Number(process.env.CONCURRENCY || 100);
const ROUNDS = Number(process.env.ROUNDS || 3);

function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
}

let all = [];
const startedAt = Date.now();

if (arg === 'wave') {
  for (let round = 1; round <= ROUNDS; round += 1) {
    console.log(`Wave ${round}/${ROUNDS}: ${CONCURRENCY} concurrent students...`);
    const batch = await Promise.all(
      Array.from({ length: CONCURRENCY }, (_, index) => studentJourney(index)),
    );
    all = all.concat(batch.flat());
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
} else {
  // 'ramp': 10 -> 50 -> 100 -> 200 concurrent, one wave each.
  for (const size of [10, 50, 100, 200]) {
    console.log(`Ramp: ${size} concurrent students...`);
    const batch = await Promise.all(Array.from({ length: size }, (_, index) => studentJourney(index)));
    all = all.concat(batch.flat());
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
}

const elapsedS = Math.round((Date.now() - startedAt) / 1000);
const byLabel = new Map();
for (const result of all) {
  if (!byLabel.has(result.label)) byLabel.set(result.label, []);
  byLabel.get(result.label).push(result);
}

console.log(`\n${all.length} requests in ${elapsedS}s\n`);
let failures = 0;
for (const [label, items] of byLabel) {
  const okItems = items.filter(item => item.ok);
  const msValues = okItems.map(item => item.ms);
  failures += items.length - okItems.length;
  console.log(
    `${label.padEnd(18)} n=${String(items.length).padStart(4)}  ok=${String(okItems.length).padStart(4)}  p50=${String(percentile(msValues, 50)).padStart(5)}ms  p95=${String(percentile(msValues, 95)).padStart(5)}ms  max=${String(Math.max(0, ...msValues)).padStart(5)}ms`,
  );
  for (const bad of items.filter(item => !item.ok).slice(0, 3)) {
    console.log(`   ! status=${bad.status} ${bad.error ?? ''}`);
  }
}
console.log(`\nFailures: ${failures}`);
process.exit(failures > 0 ? 2 : 0);
