// =====================================================================
// integrations-workshop — Kaveri Workshop Bridge V1 ingestion endpoint
//
//   Workshop app (server only, never browser)
//     → POST /functions/v1/integrations-workshop
//       X-Kaveri-Timestamp: <unix epoch seconds>
//       X-Kaveri-Signature: <hex HMAC-SHA256(timestamp "." raw_body)>
//       Idempotency-Key: workshop.<stable_registration_uuid>
//       body: { external_workshop_id, external_registration_id, email,
//               full_name, phone?, workshop_name, starts_at?, venue?,
//               mode?, status?, registered_at?, metadata? }
//
// Verification:
//   - signature: constant-time compare against the per-satellite secret
//     (env KAVERI_WORKSHOP_INTEGRATION_SECRET, else vault secret
//     'integrations.workshop.secret' — server-side only)
//   - timestamp freshness: ±5 minutes (replay window)
//   - idempotency: handled server-side by ingest_workshop_registration via
//     integration_audit_log (source+action+idempotency_key)
//
// Account linking happens INSIDE the RPC and ONLY for Supabase Auth emails
// that are verified/confirmed. No auth account is ever auto-created. No
// password is ever set. This endpoint never sends the registration
// confirmation email — Apps Script remains the single source.
// =====================================================================

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.57.4';

type AdminClient = SupabaseClient<any, any, any>;

const REPLAY_WINDOW_SECONDS = 5 * 60;

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

function sha256Hex(value: string): Promise<string> {
  return crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)).then(bytes =>
    Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join(''),
  );
}

async function timingSafeEqual(a: string, b: string): Promise<boolean> {
  const digest = async (value: string) =>
    new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
  const [aHash, bHash] = await Promise.all([digest(a), digest(b)]);
  if (aHash.length !== bHash.length) return false;
  let diff = 0;
  for (let index = 0; index < aHash.length; index += 1) diff |= aHash[index] ^ bHash[index];
  return diff === 0;
}

async function workshopSecret(admin: AdminClient): Promise<string> {
  const env = Deno.env.get('KAVERI_WORKSHOP_INTEGRATION_SECRET');
  if (env) return env;
  const { data, error } = await admin.rpc('get_server_secret', { p_name: 'integrations.workshop.secret' });
  if (error || typeof data !== 'string') return '';
  return data;
}

async function auditRejection(
  admin: AdminClient,
  source: string,
  reason: string,
  rawBody: string,
  timestamp: string,
  responseCode: number,
) {
  // Server-internal record of rejected calls (deduped by signature hash so
  // repeated identical attacks do not flood the log).
  const hash = await sha256Hex(`${timestamp}.${rawBody}`);
  const { error } = await admin.from('integration_audit_log').upsert(
    {
      source,
      action: 'workshop.registration.upsert',
      idempotency_key: `rejected:${reason}:${hash.slice(0, 32)}`,
      request_sha256: hash,
      request_summary: { reason, rejected: true },
      response_code: responseCode,
      result: reason,
    },
    { onConflict: 'source,action,idempotency_key' },
  );
  if (error) console.error('[integrations-workshop] audit write failed', error.message);
}

type WorkshopPayload = {
  external_workshop_id?: string;
  external_registration_id?: string;
  email?: string;
  full_name?: string;
  phone?: string;
  workshop_name?: string;
  workshop_slug?: string;
  starts_at?: string | null;
  venue?: string | null;
  mode?: string | null;
  status?: string | null;
  registered_at?: string | null;
  metadata?: Record<string, unknown> | null;
};

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return json({}, 204);
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const timestamp = req.headers.get('x-kaveri-timestamp');
  const signature = req.headers.get('x-kaveri-signature');
  const idempotencyKey = req.headers.get('idempotency-key');
  if (!timestamp || !signature || !idempotencyKey) {
    return json({ error: 'Missing webhook headers' }, 401);
  }

  const rawBody = await req.text();
  const timestampSeconds = Number(timestamp);
  if (!Number.isFinite(timestampSeconds)) return json({ error: 'Invalid timestamp' }, 401);
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestampSeconds) > REPLAY_WINDOW_SECONDS) {
    return json({ error: 'Stale timestamp', code: 'STALE_TIMESTAMP' }, 401);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) {
    console.error('[integrations-workshop] missing runtime env');
    return json({ error: 'Server configuration error' }, 500);
  }
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Constant-time signature verification against the per-satellite secret.
  const secret = await workshopSecret(admin);
  if (!secret) return json({ error: 'Integration not configured' }, 503);

  // Signature = hex(HMAC-SHA256(timestamp "." raw_body, per-satellite secret))
  const rawKey = secret.length >= 32 ? secret : secret.padEnd(32, '0');
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(rawKey),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${timestamp}.${rawBody}`));
  const actualSignature = Array.from(new Uint8Array(mac), byte => byte.toString(16).padStart(2, '0')).join('');

  if (!(await timingSafeEqual(signature, actualSignature))) {
    await auditRejection(admin, 'workshop-app', 'invalid_signature', rawBody, timestamp, 401);
    return json({ error: 'Invalid signature' }, 401);
  }

  let payload: WorkshopPayload;
  try {
    payload = JSON.parse(rawBody) as WorkshopPayload;
  } catch {
    await auditRejection(admin, 'workshop-app', 'malformed_payload', rawBody, timestamp, 400);
    return json({ error: 'Malformed JSON payload' }, 400);
  }

  // Basic structural validation; the RPC enforces the authoritative rules.
  const email = String(payload.email ?? '').trim().toLowerCase();
  const required = [
    ['external_workshop_id', payload.external_workshop_id],
    ['external_registration_id', payload.external_registration_id],
    ['email', email],
    ['full_name', payload.full_name],
    ['workshop_name', payload.workshop_name],
  ] as const;
  const missing = required.filter(([, value]) => !value).map(([name]) => name);
  if (missing.length) {
    await auditRejection(admin, 'workshop-app', `missing_fields:${missing.join(',')}`, rawBody, timestamp, 400);
    return json({ error: 'Missing required fields', fields: missing }, 400);
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    await auditRejection(admin, 'workshop-app', 'invalid_email', rawBody, timestamp, 400);
    return json({ error: 'Invalid email' }, 400);
  }

  const { data, error } = await admin.rpc('ingest_workshop_registration', {
    p_source: 'workshop-app',
    p_external_workshop_id: payload.external_workshop_id,
    p_external_registration_id: payload.external_registration_id,
    p_workshop_name: payload.workshop_name,
    p_workshop_slug: payload.workshop_slug ?? null,
    p_starts_at: payload.starts_at ?? null,
    p_venue: payload.venue ?? null,
    p_mode: payload.mode ?? null,
    p_email: email,
    p_full_name: payload.full_name,
    p_phone: payload.phone ?? null,
    p_registration_status: payload.status ?? 'registered',
    p_registered_at: payload.registered_at ?? null,
    p_metadata: payload.metadata ?? {},
    p_idempotency_key: idempotencyKey,
    p_action: 'workshop.registration.upsert',
  });

  if (error) {
    console.error('[integrations-workshop] ingest RPC failed', error.message);
    if (String(error.message).includes('INSUFFICIENT_PRIVILEGE')) {
      return json({ error: 'Unauthorized' }, 401);
    }
    return json({ error: 'Ingestion failed', code: error.code ?? 'INGEST_ERROR' }, 500);
  }

  return json({ ok: true, ...(data as Record<string, unknown>) }, 200);
});