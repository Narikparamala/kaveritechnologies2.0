/**
 * Load test for the Kaveri Academy API (Supabase REST endpoints).
 *
 * Simulates a realistic burst of ~1,050 read calls — the traffic the platform
 * sees when a full batch of students opens their dashboards at once
 * (course lists, chapter/lesson reads, quiz reads, profile reads).
 *
 * Usage:  node scripts/load-test-api.mjs [totalCalls] [concurrency]
 * Read-only: it never mutates platform data. Results print at the end.
 */
import { readFile } from 'node:fs/promises';

const env = await readFile('.env.local', 'utf8');
const SUPABASE_URL = env.match(/VITE_SUPABASE_URL="?([^"\n]+)"?/)?.[1];
const KEY = env.match(/VITE_SUPABASE_ANON_KEY="?([^"\n]+)"?/)?.[1];
if (!SUPABASE_URL || !KEY) { console.error('Missing Supabase env'); process.exit(1); }

const TOTAL = Number(process.argv[2] ?? 1050);
const CONCURRENCY = Number(process.argv[3] ?? 25);

// Realistic mixed read workload (weights mirror a dashboard burst).
const COURSE_ID = '86ba7af3-ad24-4fd8-8ad6-7283d5637db6';
const endpoints = [
  { w: 20, path: `/rest/v1/courses?id=eq.${COURSE_ID}&select=*` },
  { w: 18, path: `/rest/v1/chapters?course_id=eq.${COURSE_ID}&select=id,title,order_index&order=order_index` },
  { w: 15, path: `/rest/v1/profiles?select=id,full_name,role&limit=20` },
  { w: 12, path: `/rest/v1/quizzes?course_id=eq.${COURSE_ID}&select=id,title,is_published` },
  { w: 10, path: `/rest/v1/lessons?select=id,title&limit=30` },
  { w: 8,  path: `/rest/v1/coding_questions?select=id,title,difficulty&limit=25` },
  { w: 7,  path: `/rest/v1/projects?select=id,title&limit=20` },
  { w: 6,  path: `/rest/v1/announcements?select=id,title&limit=5` },
  { w: 4,  path: `/rest/v1/platform_settings?select=key,value` },
];
const pool = [];
for (const e of endpoints) for (let i = 0; i < e.w; i++) pool.push(e.path);

const latencies = [];
let errors = 0;
const errorSamples = new Map();
let done = 0;

async function fire(id) {
  const path = pool[id % pool.length];
  const t0 = performance.now();
  try {
    const res = await fetch(`${SUPABASE_URL}${path}`, {
      headers: { apikey: KEY, Authorization: `Bearer ${AUTH}` },
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) {
      errors++;
      errorSamples.set(res.status, (errorSamples.get(res.status) ?? 0) + 1);
    }
  } catch (e) {
    errors++;
    errorSamples.set(e.name ?? 'network', (errorSamples.get(e.name ?? 'network') ?? 0) + 1);
  }
  latencies.push(performance.now() - t0);
  done++;
  if (done % 150 === 0) console.log(`  progress: ${done}/${TOTAL}`);
}

console.log(`Load test: ${TOTAL} calls, concurrency ${CONCURRENCY} -> ${new globalThis.URL(SUPABASE_URL).host}`);

// Authenticate so protected tables behave like real logged-in student traffic.
const refreshToken = (env.match(/LOAD_TEST_REFRESH_TOKEN="?([^"\n]+)"?/)?.[1]) ?? process.env.LOAD_TEST_REFRESH_TOKEN;
let AUTH = KEY;
if (refreshToken) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
    method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
  if (res.ok) {
    AUTH = (await res.json()).access_token;
    console.log('Authenticated: yes');
  } else console.log('Authenticated: no (refresh token rejected) — anon-key run');
} else console.log('Authenticated: no (set LOAD_TEST_REFRESH_TOKEN env or in .env.local)');
const t0 = performance.now();
let cursor = 0;
async function worker() {
  while (cursor < TOTAL) {
    const id = cursor++;
    await fire(id);
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));
const wall = ((performance.now() - t0) / 1000).toFixed(1);

latencies.sort((a, b) => a - b);
const pct = p => latencies[Math.floor((p / 100) * latencies.length)]?.toFixed(0) ?? '-';
const avg = (latencies.reduce((a, b) => a + b, 0) / latencies.length).toFixed(0);

console.log(`
================= LOAD TEST RESULTS =================
 Calls:        ${TOTAL} (mixed read workload)
 Concurrency:  ${CONCURRENCY}
 Wall time:    ${wall}s  (~${(TOTAL / wall).toFixed(0)} rps)
 Errors:       ${errors}${errors ? ` -> ${JSON.stringify([...errorSamples])}` : ' (none)'}
 Latency avg:  ${avg} ms
 p50 / p90:    ${pct(50)} / ${pct(90)} ms
 p95 / p99:    ${pct(95)} / ${pct(99)} ms
 max:          ${latencies[latencies.length - 1]?.toFixed(0)} ms
======================================================`);
