// =====================================================================
// resolve-canva-link — expand Canva short links (canva.link/CODE) into
// the real embeddable /design/{id}/{token}/view?embed URL.
//
// Why: short codes are opaque — only Canva's server knows which design
// a code maps to. Deriving an embed URL from the code alone fabricates
// a nonexistent design (students saw "This design is private", 403).
// The only correct way is to follow the redirect.
//
// Called by the faculty material editor at SAVE time. Authenticated
// users only (faculty/admin edit materials; students never call this).
// Response: { embedUrl, ratio } or { embedUrl: null } for non-Canva /
// unresolvable input (caller decides whether that's an error).
// =====================================================================
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CANVA_SHORT_RE = /^https:\/\/canva\.link\/([A-Za-z0-9]+)/;
const CANVA_DESIGN_RE =
  /^https:\/\/www\.canva\.com\/design\/([A-Za-z0-9_-]+)(?:\/(?!view\b|edit\b|preview\b)([A-Za-z0-9_-]+))?(?:\/(view|edit|preview))?/;
const ALLOWED_ORIGINS = (Deno.env.get('LMS_ALLOWED_ORIGINS') ?? 'http://localhost:5173')
  .split(',').map(v => v.trim()).filter(Boolean);

function json(body: unknown, status: number, origin: string) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    },
  });
}

Deno.serve(async req => {
  const requestOrigin = req.headers.get('origin') ?? '';
  const responseOrigin = ALLOWED_ORIGINS.includes(requestOrigin) ? requestOrigin : ALLOWED_ORIGINS[0];

  if (req.method === 'OPTIONS') return json({}, 200, responseOrigin);
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405, responseOrigin);

  const authorization = req.headers.get('authorization');
  if (!authorization?.startsWith('Bearer ')) return json({ error: 'Authentication required' }, 401, responseOrigin);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!supabaseUrl || !anonKey) return json({ error: 'Server configuration error' }, 500, responseOrigin);

  // Validate the caller's session (any active authenticated user may resolve).
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: { user }, error: userError } = await userClient.auth.getUser(authorization.slice(7));
  if (userError || !user) return json({ error: 'Invalid or expired session' }, 401, responseOrigin);

  let payload: { url?: string };
  try {
    payload = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400, responseOrigin);
  }

  const raw = (payload.url ?? '').trim();
  if (!raw) return json({ error: 'url is required' }, 400, responseOrigin);

  // Pass through full design links untouched (nothing to resolve).
  const direct = CANVA_DESIGN_RE.exec(raw);
  if (direct) {
    const [, designId, token] = direct;
    const embedUrl = token
      ? `https://www.canva.com/design/${designId}/${token}/view?embed`
      : `https://www.canva.com/design/${designId}/view?embed`;
    return json({ embedUrl, ratio: null }, 200, responseOrigin);
  }

  const short = CANVA_SHORT_RE.exec(raw);
  if (!short) return json({ embedUrl: null, reason: 'not-canva' }, 200, responseOrigin);

  // Follow the redirect manually (fetch does not expose redirect chains).
  let current: string = raw;
  for (let hop = 0; hop < 5; hop++) {
    let resp: Response;
    try {
      resp = await fetch(current, { redirect: 'manual' });
    } catch {
      return json({ embedUrl: null, reason: 'resolve-failed' }, 200, responseOrigin);
    }
    const loc = resp.headers.get('location');
    if (!loc) {
      // No redirect — if we've landed on a design page, parse it.
      const landed = CANVA_DESIGN_RE.exec(current);
      if (landed) {
        const [, designId, token] = landed;
        const embedUrl = token
          ? `https://www.canva.com/design/${designId}/${token}/view?embed`
          : `https://www.canva.com/design/${designId}/view?embed`;
        return json({ embedUrl, ratio: null }, 200, responseOrigin);
      }
      return json({ embedUrl: null, reason: `unexpected-status-${resp.status}` }, 200, responseOrigin);
    }
    current = new URL(loc, current).toString();
    if (CANVA_DESIGN_RE.test(current)) {
      const m = CANVA_DESIGN_RE.exec(current)!;
      const [, designId, token] = m;
      const embedUrl = token
        ? `https://www.canva.com/design/${designId}/${token}/view?embed`
        : `https://www.canva.com/design/${designId}/view?embed`;
      return json({ embedUrl, ratio: null }, 200, responseOrigin);
    }
  }
  return json({ embedUrl: null, reason: 'too-many-redirects' }, 200, responseOrigin);
});
