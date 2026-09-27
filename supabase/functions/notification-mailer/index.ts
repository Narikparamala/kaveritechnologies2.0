// =====================================================================
// notification-mailer — transactional email delivery for the central
// outbox.  Service-to-service only:
//
//   Supabase DB (process_notification_outbox via pg_net)
//     → POST /functions/v1/notification-mailer
//       X-Kaveri-Mailer-Token: <notification_mailer_token>
//       body: { "outbox_id": "<uuid>" }
//     → loads the row from notification_outbox, renders the approved
//       template from the DB row, calls the provider, resolves the row.
//
// MESSAGE AUTHORITY: the notification_outbox row is the single authority
// for template_key / recipient_email / recipient_name / payload / dedupe.
// The HTTP body only carries the outbox id; a tampered body can never
// change the actual destination or content of an email.
//
// Authorization: the shared token travels in the X-Kaveri-Mailer-Token
// header (a custom header, so the edge-runtime JWT gateway does not
// intercept it like it does Authorization). The token is read from
// supabase_vault (or the NOTIFICATION_MAILER_TOKEN function secret) and
// compared constant-time. Provider credentials come only from server-side
// function secrets. Nothing here is ever exposed to browsers or Git.
//
// FAIL CLOSED: if MAILER_PROVIDER is missing/unknown the row is resolved
// to failed (PROVIDER_NOT_CONFIGURED) — an email is never marked sent
// without an explicitly configured provider.
// =====================================================================

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.57.4';
import { renderTemplate, ALLOWED_TEMPLATE_KEYS } from './_shared/templates.ts';
import { providerByName } from './_shared/provider.ts';

type AdminClient = SupabaseClient<any, any, any>;

type OutboxRow = {
  id: string;
  status: string;
  channel: string;
  template_key: string;
  recipient_email: string | null;
  recipient_name: string | null;
  payload: Record<string, unknown>;
  dedupe_key: string | null;
  attempts: number;
  max_attempts: number;
  delivery_generation: number;
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

// Provider selection: env MAILER_PROVIDER wins; otherwise the vault secret
// 'mailer_provider' (both server-side only). Missing/unknown → fail closed.
async function resolveProviderName(admin: AdminClient): Promise<string> {
  const env = (Deno.env.get('MAILER_PROVIDER') ?? '').trim().toLowerCase();
  if (env) return env;

  const { data, error } = await admin.rpc('get_server_secret', { p_name: 'mailer_provider' });
  if (error || typeof data !== 'string') return '';
  return data.trim().toLowerCase();
}

async function expectedToken(admin: AdminClient): Promise<string> {
  const envToken = Deno.env.get('NOTIFICATION_MAILER_TOKEN');
  if (envToken) return envToken;

  const { data, error } = await admin.rpc('get_server_secret', { p_name: 'notification_mailer_token' });
  if (error) {
    console.error('[notification-mailer] could not read server secret', error.message);
    return '';
  }
  return typeof data === 'string' ? data : '';
}

async function loadOutboxRow(admin: AdminClient, outboxId: string): Promise<OutboxRow | null> {
  const { data, error } = await admin
    .from('notification_outbox')
    .select(
      'id,status,channel,template_key,recipient_email,recipient_name,payload,dedupe_key,attempts,max_attempts,delivery_generation',
    )
    .eq('id', outboxId)
    .maybeSingle();
  if (error) {
    console.error('[notification-mailer] could not load outbox row', error.message);
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
    .select(
      'id,status,channel,template_key,recipient_email,recipient_name,payload,dedupe_key,attempts,max_attempts,delivery_generation',
    )
    .maybeSingle();
  if (error) {
    console.error('[notification-mailer] claim failed', error.message);
    return null;
  }
  return data as OutboxRow | null;
}

// Returns false if the database could not record the resolution. In that
// case the row stays 'delivering' and is reclaimed by the worker later —
// the provider idempotency key (same generation) prevents a duplicate send.
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
    console.error(`[notification-mailer] resolve (${resolution}) failed`, error.message);
    return false;
  }
  return true;
}

function providerIdempotencyKey(row: OutboxRow): string {
  // Same delivery_generation → same provider key (retries deduplicated).
  // force_resend bumps the generation → a NEW intentional delivery.
  return `${row.dedupe_key ?? `outbox:${row.id}`}:delivery:${row.delivery_generation}`;
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return json({}, 204);
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const providedToken = req.headers.get('x-kaveri-mailer-token');
  if (!providedToken) return json({ error: 'Authentication required' }, 401);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) {
    console.error('[notification-mailer] missing runtime env');
    return json({ error: 'Server configuration error' }, 500);
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const token = await expectedToken(admin);
  if (!token) return json({ error: 'Mailer not configured' }, 503);
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

  // ---- message authority: load everything from the DB row ----
  const existing = await loadOutboxRow(admin, outboxId);
  if (!existing) return json({ error: 'outbox row not found' }, 404);
  if (existing.status === 'sent') return json({ ok: true, outbox_id: outboxId, duplicate: true }, 200);

  if (existing.channel !== 'email') {
    await resolveDelivery(admin, outboxId, 'failed', { last_error: 'CHANNEL_UNSUPPORTED' });
    return json({ error: 'Channel not supported', code: 'CHANNEL_UNSUPPORTED' }, 422);
  }
  if (!ALLOWED_TEMPLATE_KEYS.includes(existing.template_key as never)) {
    await resolveDelivery(admin, outboxId, 'failed', { last_error: 'TEMPLATE_UNKNOWN' });
    return json({ error: 'Unknown template_key', code: 'TEMPLATE_UNKNOWN' }, 422);
  }
  const recipientEmail = String(existing.recipient_email ?? '').trim().toLowerCase();
  if (!recipientEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail)) {
    await resolveDelivery(admin, outboxId, 'failed', { last_error: 'INVALID_RECIPIENT' });
    return json({ error: 'Invalid recipient email', code: 'INVALID_RECIPIENT' }, 422);
  }
  if (Number(existing.attempts ?? 0) >= Number(existing.max_attempts ?? 5)) {
    await resolveDelivery(admin, outboxId, 'failed', { last_error: 'MAX_ATTEMPTS_EXCEEDED' });
    return json({ ok: true, outbox_id: outboxId, status: 'failed' }, 200);
  }

  // Atomic claim: only one concurrent mailer invocation may deliver this row.
  const claimed = await claimDelivery(admin, outboxId);
  if (!claimed) {
    return json({ ok: true, outbox_id: outboxId, duplicate: true }, 200);
  }

  // Fail closed: an explicitly configured provider is required.
  const provider = providerByName(await resolveProviderName(admin));
  if (!provider) {
    await resolveDelivery(admin, outboxId, 'failed', { last_error: 'PROVIDER_NOT_CONFIGURED' });
    return json(
      { ok: true, outbox_id: outboxId, status: 'failed', code: 'PROVIDER_NOT_CONFIGURED' },
      200,
    );
  }

  const payload = (claimed.payload ?? {}) as Record<string, unknown>;
  const rendered = renderTemplate(claimed.template_key, payload);
  if (!rendered) {
    await resolveDelivery(admin, outboxId, 'failed', { last_error: 'TEMPLATE_RENDER_FAILED' });
    return json({ error: 'Template render failed', code: 'TEMPLATE_RENDER_FAILED' }, 500);
  }

  const outcome = await provider.send({
    to: recipientEmail,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
    idempotencyKey: providerIdempotencyKey(claimed),
    devFailMode: String(payload.dev_fail_mode ?? ''),
  });

  if (outcome.ok) {
    // Provider accepted the message. If the DB cannot record 'sent', do NOT
    // pretend it is resolved: return 500 so the row stays 'delivering' and
    // gets reclaimed. The provider idempotency key is unchanged, so the
    // retry cannot create a duplicate email.
    const resolved = await resolveDelivery(admin, outboxId, 'sent', {
      sent_at: new Date().toISOString(),
      provider_message_id: outcome.providerMessageId,
      last_error: null,
    });
    if (!resolved) {
      return json(
        { error: 'Delivery accepted but could not be recorded', code: 'RESOLVE_FAILED' },
        500,
      );
    }
    return json(
      { ok: true, outbox_id: outboxId, status: 'sent', provider: provider.name },
      200,
    );
  }

  // Failure: business state (enrollment etc.) is already committed — only
  // the delivery is retried or failed. Store safe codes only, never raw
  // provider errors or secrets.
  if (outcome.transient) {
    const retryMs = (outcome.retryAfterSeconds ?? 0) > 0
      ? outcome.retryAfterSeconds! * 1000
      : 60_000 * Math.min(2 ** Number(claimed.attempts ?? 0), 60);
    const resolved = await resolveDelivery(admin, outboxId, 'queued', {
      last_error: outcome.code,
      next_attempt_at: new Date(Date.now() + retryMs).toISOString(),
    });
    if (!resolved) {
      return json({ error: 'Transient failure could not be recorded', code: 'RESOLVE_FAILED' }, 500);
    }
    return json(
      { ok: true, outbox_id: outboxId, status: 'queued', provider: provider.name, retry: true },
      202,
    );
  }

  const resolved = await resolveDelivery(admin, outboxId, 'failed', { last_error: outcome.code });
  if (!resolved) {
    return json({ error: 'Permanent failure could not be recorded', code: 'RESOLVE_FAILED' }, 500);
  }
  return json(
    { ok: true, outbox_id: outboxId, status: 'failed', provider: provider.name },
    200,
  );
});