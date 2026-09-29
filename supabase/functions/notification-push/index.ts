// =====================================================================
// notification-push — Web Push delivery (FCM HTTP v1) for the central
// outbox. Service-to-service only:
//
//   Supabase DB (process_notification_outbox via pg_net + pg_cron)
//     → POST /functions/v1/notification-push
//       X-Kaveri-Push-Token: <notification_push_token>
//       body: { "outbox_id": "<uuid>" }
//     → loads the row from notification_outbox, loads the recipient's
//       active push_subscriptions, sends via FCM, resolves the row.
//
// MESSAGE AUTHORITY: the notification_outbox row is the single authority
// (template push.generic, payload {title, body, url}). The HTTP body only
// carries the outbox id.
//
// FAIL-QUIET-BUT-HONEST: push is best-effort. A recipient with zero
// active subscriptions resolves to sent (0 targets) — the user simply
// has no devices. Recipient-side FCM errors never fail the outbox row.
// Server-side / config errors (no service account, bad token) fail
// transiently so the row retries, and resolve to failed once attempts
// are exhausted.
//
// FCM auth: the service account JSON arrives via the
// FCM_SERVICE_ACCOUNT_JSON secret. A JWT (RS256, signed with
// crypto.subtle) is exchanged for an OAuth access token, cached in
// memory until ~5 min before expiry.
// =====================================================================

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.57.4';

type AdminClient = SupabaseClient<any, any, any>;

type OutboxRow = {
  id: string;
  status: string;
  channel: string;
  template_key: string;
  recipient_user_id: string | null;
  payload: Record<string, unknown>;
  dedupe_key: string | null;
  attempts: number;
  max_attempts: number;
  delivery_generation: number;
};

type SubscriptionRow = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
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

// The worker (process_notification_outbox) posts to BOTH delivery functions
// with the SAME shared token under the x-kaveri-mailer-token header (vault
// 'notification_mailer_token'). Accept that canonical form, plus the
// x-kaveri-push-token alias.
async function expectedToken(admin: AdminClient): Promise<string> {
  const envToken = Deno.env.get('NOTIFICATION_MAILER_TOKEN') ?? Deno.env.get('NOTIFICATION_PUSH_TOKEN');
  if (envToken) return envToken;
  const { data, error } = await admin.rpc('get_server_secret', { p_name: 'notification_mailer_token' });
  if (error) {
    console.error('[notification-push] could not read server secret', error.message);
    return '';
  }
  return typeof data === 'string' ? data : '';
}

async function loadOutboxRow(admin: AdminClient, outboxId: string): Promise<OutboxRow | null> {
  const { data, error } = await admin
    .from('notification_outbox')
    .select('id,status,channel,template_key,recipient_user_id,payload,dedupe_key,attempts,max_attempts,delivery_generation')
    .eq('id', outboxId)
    .maybeSingle();
  if (error) {
    console.error('[notification-push] could not load outbox row', error.message);
    return null;
  }
  return data as OutboxRow | null;
}

async function claimDelivery(admin: AdminClient, outboxId: string): Promise<OutboxRow | null> {
  const { data, error } = await admin
    .from('notification_outbox')
    .update({ status: 'delivering', delivery_claimed_at: new Date().toISOString() })
    .eq('id', outboxId)
    .in('status', ['sending', 'queued'])
    .select('id,status,channel,template_key,recipient_user_id,payload,dedupe_key,attempts,max_attempts,delivery_generation')
    .maybeSingle();
  if (error) {
    console.error('[notification-push] claim failed', error.message);
    return null;
  }
  return data as OutboxRow | null;
}

async function resolveDelivery(
  admin: AdminClient,
  outboxId: string,
  resolution: 'sent' | 'failed' | 'queued',
  fields: Record<string, unknown>,
): Promise<boolean> {
  const update: Record<string, unknown> = {
    status: resolution,
    delivery_claimed_at: null,
    updated_at: new Date().toISOString(),
    ...fields,
  };
  const { error } = await admin
    .from('notification_outbox')
    .update(update)
    .eq('id', outboxId)
    .eq('status', 'delivering');
  if (error) {
    console.error(`[notification-push] resolve (${resolution}) failed`, error.message);
    return false;
  }
  return true;
}

function providerIdempotencyKey(row: OutboxRow): string {
  return `${row.dedupe_key ?? `outbox:${row.id}`}:delivery:${row.delivery_generation}`;
}

// ---------- FCM HTTP v1 (service account → JWT → OAuth token) ----------

type ServiceAccount = {
  client_email: string;
  private_key: string;
  project_id?: string;
};

function b64url(input: ArrayBuffer | Uint8Array | string): string {
  let bytes: Uint8Array;
  if (typeof input === 'string') bytes = new TextEncoder().encode(input);
  else bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

let cachedOAuth: { token: string; expiresAtMs: number } | null = null;

async function getAccessToken(serviceAccount: ServiceAccount): Promise<string | null> {
  if (cachedOAuth && Date.now() < cachedOAuth.expiresAtMs) return cachedOAuth.token;

  const nowSec = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64url(JSON.stringify({
    iss: serviceAccount.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat: nowSec,
    exp: nowSec + 3600,
  }));
  const unsigned = `${header}.${claims}`;

  const pkcs8 = serviceAccount.private_key
    .replace(/\\n/g, '\n')
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s+/g, '');
  const rawKey = Uint8Array.from(atob(pkcs8), c => c.charCodeAt(0));
  let key: CryptoKey;
  try {
    key = await crypto.subtle.importKey(
      'pkcs8',
      rawKey,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['sign'],
    );
  } catch (e) {
    console.error('[notification-push] bad service account key', e instanceof Error ? e.message : e);
    return null;
  }
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsigned));
  const jwt = `${unsigned}.${b64url(sig)}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    console.error('[notification-push] oauth token exchange failed', res.status);
    return null;
  }
  const body = await res.json();
  if (typeof body.access_token !== 'string') return null;
  cachedOAuth = { token: body.access_token, expiresAtMs: Date.now() + 55 * 60 * 1000 };
  return body.access_token;
}

type PushOutcome =
  | { ok: true; providerMessageId: string }
  | { ok: false; transient: boolean; code: string; retryAfterSeconds?: number };

// Per-recipient classification: never fails the outbox row (the notification
// itself is fine — this device just can't receive it anymore).
function classifyRecipientError(status: number): PushOutcome {
  if (status === 404 || status === 410) {
    return { ok: true, providerMessageId: `unsubscribed-${status}` };
  }
  if (status === 401 || status === 403) {
    return { ok: true, providerMessageId: `auth-denied-${status}` };
  }
  if (status === 400) {
    // Expired registration / malformed token → drop the device.
    return { ok: true, providerMessageId: 'invalid-registration' };
  }
  // 429 / 5xx → transient; the subscription may still be fine.
  return { ok: false, transient: true, code: `FCM_RECIPIENT_${status}` };
}

async function sendToFcm(
  serviceAccount: ServiceAccount,
  projectId: string,
  sub: SubscriptionRow,
  title: string,
  bodyText: string,
  url: string,
): Promise<PushOutcome> {
  const token = await getAccessToken(serviceAccount);
  if (!token) return { ok: false, transient: true, code: 'FCM_AUTH_FAILED' };

  // The FCM v1 endpoint takes the web-push subscription's registration token
  // (the last path segment of the PushSubscription endpoint for the
  // fcm.googleapis.com driver).
  let registrationToken = '';
  try {
    const endpointUrl = new URL(sub.endpoint);
    registrationToken = endpointUrl.pathname.split('/').filter(Boolean).pop() ?? '';
  } catch {
    registrationToken = '';
  }
  if (!registrationToken) {
    return { ok: true, providerMessageId: 'no-registration-token' };
  }

  let response: Response;
  try {
    response = await fetch(
      `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/messages:send`,
      {
        method: 'POST',
        headers: {
          'authorization': `Bearer ${token}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          message: {
            token: registrationToken,
            notification: { title, body: bodyText },
            webpush: {
              notification: { title, body: bodyText, icon: '/assets/images/WhatsApp_Image_2026-06-16_at_10.34.22.jpeg', tag: 'kaveri-lms' },
              fcmOptions: { link: url },
            },
          },
        }),
        signal: AbortSignal.timeout(15_000),
      },
    );
  } catch (error) {
    if (error instanceof DOMException && error.name === 'TimeoutError') {
      return { ok: false, transient: true, code: 'FCM_TIMEOUT' };
    }
    console.error('[notification-push] fcm request failed', error);
    return { ok: false, transient: true, code: 'FCM_UNAVAILABLE' };
  }

  if (response.ok) return { ok: true, providerMessageId: `fcm-${crypto.randomUUID()}` };
  return classifyRecipientError(response.status);
}

// ---------- main ----------

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return json({}, 204);
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const providedToken = req.headers.get('x-kaveri-mailer-token') ?? req.headers.get('x-kaveri-push-token');
  if (!providedToken) return json({ error: 'Authentication required' }, 401);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) {
    console.error('[notification-push] missing runtime env');
    return json({ error: 'Server configuration error' }, 500);
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const token = await expectedToken(admin);
  if (!token) return json({ error: 'Push not configured' }, 503);
  if (!(await timingSafeEqual(providedToken, token))) {
    return json({ error: 'Invalid token' }, 401);
  }

  let body: { outbox_id?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }
  const outboxId = String(body.outbox_id ?? '');
  if (!outboxId) return json({ error: 'outbox_id is required' }, 400);

  const existing = await loadOutboxRow(admin, outboxId);
  if (!existing) return json({ error: 'outbox row not found' }, 404);
  if (existing.status === 'sent') return json({ ok: true, outbox_id: outboxId, duplicate: true }, 200);

  if (existing.channel !== 'push') {
    await resolveDelivery(admin, outboxId, 'failed', { last_error: 'CHANNEL_UNSUPPORTED' });
    return json({ error: 'Channel not supported', code: 'CHANNEL_UNSUPPORTED' }, 422);
  }
  if (existing.template_key !== 'push.generic') {
    await resolveDelivery(admin, outboxId, 'failed', { last_error: 'TEMPLATE_UNKNOWN' });
    return json({ error: 'Unknown template_key', code: 'TEMPLATE_UNKNOWN' }, 422);
  }
  if (!existing.recipient_user_id) {
    await resolveDelivery(admin, outboxId, 'failed', { last_error: 'MISSING_RECIPIENT' });
    return json({ error: 'Missing recipient', code: 'MISSING_RECIPIENT' }, 422);
  }
  if (Number(existing.attempts ?? 0) >= Number(existing.max_attempts ?? 5)) {
    await resolveDelivery(admin, outboxId, 'failed', { last_error: 'MAX_ATTEMPTS_EXCEEDED' });
    return json({ ok: true, outbox_id: outboxId, status: 'failed' }, 200);
  }

  const claimed = await claimDelivery(admin, outboxId);
  if (!claimed) return json({ ok: true, outbox_id: outboxId, duplicate: true }, 200);

  // Config check: without a service account nothing can be sent — fail
  // transiently (row retries, later fails honestly after max attempts).
  const saRaw = (Deno.env.get('FCM_SERVICE_ACCOUNT_JSON') ?? '').trim();
  let serviceAccount: ServiceAccount | null = null;
  let projectId = '';
  if (saRaw) {
    try {
      serviceAccount = JSON.parse(saRaw) as ServiceAccount;
      projectId = serviceAccount.project_id || Deno.env.get('FCM_PROJECT_ID') || '';
    } catch {
      console.error('[notification-push] FCM_SERVICE_ACCOUNT_JSON is not valid JSON');
    }
  }
  if (!serviceAccount || !projectId || !serviceAccount.client_email || !serviceAccount.private_key) {
    // Mirror the email pipeline's disabled-mode semantics: nothing attempted,
    // no retry budget burned, honestly labelled for ops.
    const resolved = await resolveDelivery(admin, outboxId, 'skipped', {
      last_error: 'PUSH_NOT_CONFIGURED: set FCM_SERVICE_ACCOUNT_JSON (service account JSON) + FCM_PROJECT_ID',
    });
    if (!resolved) return json({ error: 'Could not record state', code: 'RESOLVE_FAILED' }, 500);
    return json({ ok: true, outbox_id: outboxId, status: 'skipped', code: 'PUSH_NOT_CONFIGURED' }, 200);
  }

  const { data: subs, error: subsError } = await admin
    .from('push_subscriptions')
    .select('id,endpoint,p256dh,auth')
    .eq('user_id', claimed.recipient_user_id)
    .is('revoked_at', null);

  if (subsError) {
    console.error('[notification-push] subscription load failed', subsError.message);
    const resolved = await resolveDelivery(admin, outboxId, 'queued', {
      last_error: 'SUBSCRIPTION_LOAD_FAILED',
      next_attempt_at: new Date(Date.now() + 60_000).toISOString(),
    });
    if (!resolved) return json({ error: 'Could not record state', code: 'RESOLVE_FAILED' }, 500);
    return json({ ok: true, outbox_id: outboxId, status: 'queued', code: 'SUBSCRIPTION_LOAD_FAILED' }, 202);
  }

  // Zero devices: nothing to deliver, the row is honestly 'sent'.
  const activeSubs = (subs ?? []) as SubscriptionRow[];
  if (activeSubs.length === 0) {
    const resolved = await resolveDelivery(admin, outboxId, 'sent', {
      sent_at: new Date().toISOString(),
      provider_message_id: 'no-active-devices',
      last_error: null,
    });
    if (!resolved) return json({ error: 'Could not record state', code: 'RESOLVE_FAILED' }, 500);
    return json({ ok: true, outbox_id: outboxId, status: 'sent', devices: 0 }, 200);
  }

  const payload = (claimed.payload ?? {}) as Record<string, unknown>;
  const title = String(payload.title ?? 'Kaveri Academy').slice(0, 120);
  const bodyText = String(payload.body ?? '').slice(0, 300);
  const url = String(payload.url ?? '/').slice(0, 500);

  let delivered = 0;
  let hadTransient = false;
  let lastCode = '';
  for (const sub of activeSubs) {
    const outcome = await sendToFcm(serviceAccount, projectId, sub, title, bodyText, url);
    if (outcome.ok) {
      delivered += 1;
    } else if (outcome.transient) {
      hadTransient = true;
      lastCode = outcome.code;
    } else {
      // Permanent recipient error: revoke the subscription (best-effort).
      await admin.from('push_subscriptions').update({ revoked_at: new Date().toISOString() }).eq('id', sub.id);
    }
  }

  if (delivered > 0 || !hadTransient) {
    // At least one device got it, or every failure was recipient-permanent.
    const resolved = await resolveDelivery(admin, outboxId, 'sent', {
      sent_at: new Date().toISOString(),
      provider_message_id: `${delivered}/${activeSubs.length} devices`,
      last_error: delivered === 0 && lastCode ? lastCode : null,
    });
    if (!resolved) return json({ error: 'Delivery accepted but could not be recorded', code: 'RESOLVE_FAILED' }, 500);
    return json({ ok: true, outbox_id: outboxId, status: 'sent', devices: `${delivered}/${activeSubs.length}` }, 200);
  }

  // All targets transient-failed: retry with backoff.
  const retryMs = 60_000 * Math.min(2 ** Number(claimed.attempts ?? 0), 60);
  const resolved = await resolveDelivery(admin, outboxId, 'queued', {
    last_error: lastCode || 'FCM_TRANSIENT',
    next_attempt_at: new Date(Date.now() + retryMs).toISOString(),
  });
  if (!resolved) return json({ error: 'Transient failure could not be recorded', code: 'RESOLVE_FAILED' }, 500);
  return json({ ok: true, outbox_id: outboxId, status: 'queued', provider: 'fcm', retry: true }, 202);
});
