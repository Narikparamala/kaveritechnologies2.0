// One-off verification of public-profile RLS + RPC (anon key only).
import { readFileSync } from 'node:fs';

const envFile = ['.env.local', '.env'].map(f => {
  try { return readFileSync(f, 'utf8'); } catch { return ''; }
}).find(s => s.includes('VITE_SUPABASE_ANON_KEY'));

const URL_ = envFile.match(/VITE_SUPABASE_URL="?([^"\n]+)"?/)?.[1];
const KEY = envFile.match(/VITE_SUPABASE_ANON_KEY="?([^"\n]+)"?/)?.[1];
if (!URL_ || !KEY) { console.error('Missing env'); process.exit(1); }

const headers = { apikey: KEY, Authorization: `Bearer ${KEY}` };
const rpc = (slug) => fetch(`${URL_}/rest/v1/rpc/get_public_profile`, {
  method: 'POST',
  headers: { ...headers, 'Content-Type': 'application/json' },
  body: JSON.stringify({ p_slug: slug }),
}).then(async r => ({ status: r.status, body: await r.json() }));

// 1) Anon table read: ONLY granted columns, ONLY public rows.
const profRes = await fetch(`${URL_}/rest/v1/profiles?select=id,full_name,profile_public,profile_slug&limit=50`, { headers });
const profRows = await profRes.json();
console.log('anon profiles status:', profRes.status, 'rows:', Array.isArray(profRows) ? profRows.length : JSON.stringify(profRows));
console.log('all visible rows profile_public:', Array.isArray(profRows) ? profRows.every(r => r.profile_public === true) : '?');

// 2) RPC with unknown slug → null.
const unknown = await rpc('not-a-real-slug');
console.log('RPC unknown slug →', unknown.status, unknown.body === null ? 'null — OK' : JSON.stringify(unknown.body).slice(0, 200));

// 3) Real slug (pass as argv[2]) — should return the aggregated public profile.
const slug = process.argv[2];
if (slug) {
  const real = await rpc(slug);
  if (real.body === null) {
    console.log('RPC real slug → null (profile not public)');
  } else {
    const d = real.body;
    console.log('RPC real slug →', real.status);
    console.log(' name:', d.profile?.full_name, '| xp:', d.profile?.xp_points, '| level:', d.profile?.level);
    console.log(' coding:', JSON.stringify(d.coding));
    console.log(' quizzes:', JSON.stringify(d.quizzes), '| lessons_completed:', d.lessons_completed);
    console.log(' solved_questions:', Array.isArray(d.solved_questions) ? d.solved_questions.length : 0,
      '| mini_projects:', Array.isArray(d.mini_projects) ? d.mini_projects.length : 0,
      '| courses:', Array.isArray(d.courses) ? d.courses.length : 0,
      '| batches:', JSON.stringify(d.batches),
      '| projects:', Array.isArray(d.projects) ? d.projects.length : 0);
    console.log(' leaks email/phone:', JSON.stringify(d).includes('email') || JSON.stringify(d).includes('phone') ? 'YES — BAD' : 'no — OK');
  }
} else {
  console.log('(pass a slug to test a real profile: node scripts/verify-public-profile.mjs <slug>)');
}
