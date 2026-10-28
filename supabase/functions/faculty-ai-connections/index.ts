// Faculty AI connection management (CRUD + connection test), staff-only.
//
// GET              -> list this faculty's connections (key never leaves)
// POST save        -> create / update (api_key re-encrypted on change)
// POST test        -> resolve + decrypt + one minimal provider round-trip
// POST delete      -> remove a connection
//
// All rows are protected by RLS (own-rows only); this function additionally
// scopes every query by faculty_id and never returns api_key material — the
// client only ever sees provider, model, base_url, label and flags.
//
// Secrets (supabase secrets set):
//   AI_KEY_ENCRYPTION_SECRET  — AES wrapping key source (shared with decryption)

import { jsonResponse } from '../_shared/ai/errors.ts';
import {
  HttpError,
  initStaffRequest,
  STAFF_ROLES,
  type StaffRequestContext,
} from '../_shared/ai/connections.ts';
import { encryptSecret } from '../_shared/ai/crypto.ts';
import { probeConnection, PROVIDER_LABELS, SUGGESTED_MODELS } from '../_shared/ai/providers.ts';

const PROVIDER_IDS = Object.keys(PROVIDER_LABELS) as (keyof typeof PROVIDER_LABELS)[];

function normalizeBaseUrl(raw: unknown): string | null {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  try {
    const url = new URL(s);
    if (!/^https?:$/.test(url.protocol)) return null;
    return url.origin + url.pathname.replace(/\/+$/, '');
  } catch {
    return null;
  }
}

function publicRow(row: any) {
  return {
    id: row.id,
    provider: row.provider,
    provider_label: PROVIDER_LABELS[row.provider as keyof typeof PROVIDER_LABELS] ?? row.provider,
    model: row.model,
    base_url: row.base_url,
    label: row.label,
    is_default: row.is_default === true,
    updated_at: row.updated_at,
  };
}

async function clearOtherDefaults(ctx: StaffRequestContext, exceptId?: string) {
  let query = ctx.supabase
    .from('faculty_ai_connections')
    .update({ is_default: false })
    .eq('faculty_id', ctx.facultyId)
    .eq('is_default', true);
  if (exceptId) query = query.neq('id', exceptId);
  await query;
}

async function listConnections(ctx: StaffRequestContext) {
  const { data, error } = await ctx.supabase
    .from('faculty_ai_connections')
    .select('id,provider,model,base_url,label,is_default,updated_at')
    .eq('faculty_id', ctx.facultyId)
    .order('is_default', { ascending: false })
    .order('updated_at', { ascending: false });
  if (error) throw new HttpError(500, 'Could not load connections.');
  return {
    connections: (data ?? []).map(publicRow),
    platform_fallback_allowed: STAFF_ROLES.includes(ctx.role),
    defaults: SUGGESTED_MODELS,
  };
}

interface SavePayload {
  id?: string | null;
  provider?: string;
  model?: string;
  api_key?: string;
  base_url?: string | null;
  label?: string | null;
  is_default?: boolean;
}

async function saveConnection(ctx: StaffRequestContext, payload: SavePayload) {
  const provider = String(payload.provider ?? '').trim() as keyof typeof PROVIDER_LABELS;
  if (!PROVIDER_IDS.includes(provider)) {
    throw new HttpError(400, `Unknown provider "${provider}".`);
  }

  const model = String(payload.model ?? '').trim();
  if (!model || model.length > 120) throw new HttpError(400, 'Pick a valid model name.');

  const baseUrl = normalizeBaseUrl(payload.base_url);
  if (provider === 'custom' && !baseUrl) {
    throw new HttpError(400, 'Custom providers need a Base URL (https://…).');
  }

  const label = payload.label ? String(payload.label).trim().slice(0, 60) || null : null;

  // null/omitted api_key on edit = keep the stored key; empty string on
  // create = validation error. Only a non-empty value is (re)encrypted.
  let apiKeyEncrypted: string | undefined;
  if (payload.api_key != null && String(payload.api_key).trim() !== '') {
    const apiKey = String(payload.api_key).trim();
    if (apiKey.length < 8) throw new HttpError(400, 'Enter the full API key (at least 8 characters).');
    try {
      apiKeyEncrypted = await encryptSecret(apiKey);
    } catch (e) {
      throw new HttpError(500, e instanceof Error ? e.message : 'Encryption is not configured.');
    }
  }

  const baseFields: Record<string, unknown> = {
    provider,
    model,
    base_url: baseUrl,
    label,
  };

  // Update path: the row must already belong to this faculty (double-check).
  if (payload.id) {
    const { data: existing, error: fetchError } = await ctx.supabase
      .from('faculty_ai_connections')
      .select('id')
      .eq('id', payload.id)
      .eq('faculty_id', ctx.facultyId)
      .maybeSingle();
    if (fetchError || !existing) throw new HttpError(404, 'Connection not found.');

    const update: Record<string, unknown> = { ...baseFields };
    if (apiKeyEncrypted !== undefined) update.api_key_encrypted = apiKeyEncrypted;
    const { data: updated, error: updateError } = await ctx.supabase
      .from('faculty_ai_connections')
      .update(update)
      .eq('id', payload.id)
      .eq('faculty_id', ctx.facultyId)
      .select('id,provider,model,base_url,label,is_default,updated_at')
      .single();
    if (updateError || !updated) throw new HttpError(500, 'Could not update the connection.');

    if (payload.is_default) await clearOtherDefaults(ctx, payload.id);
    const { data: row } = await ctx.supabase
      .from('faculty_ai_connections')
      .select('id,provider,model,base_url,label,is_default,updated_at')
      .eq('id', payload.id)
      .single();
    return { connection: row ? publicRow(row) : publicRow(updated) };
  }

  // Create path: first connection becomes default automatically.
  const { count } = await ctx.supabase
    .from('faculty_ai_connections')
    .select('id', { count: 'exact', head: true })
    .eq('faculty_id', ctx.facultyId);
  const shouldBeDefault = payload.is_default === true || (count ?? 0) === 0;

  const insert: Record<string, unknown> = {
    faculty_id: ctx.facultyId,
    ...baseFields,
    api_key_encrypted: apiKeyEncrypted,
    is_default: shouldBeDefault,
  };
  const { data: created, error: insertError } = await ctx.supabase
    .from('faculty_ai_connections')
    .insert(insert)
    .select('id,provider,model,base_url,label,is_default,updated_at')
    .single();
  if (insertError || !created) throw new HttpError(500, 'Could not save the connection.');

  if (shouldBeDefault) await clearOtherDefaults(ctx, created.id);
  return { connection: publicRow(created) };
}

async function testConnection(ctx: StaffRequestContext, payload: { id?: string | null; provider?: string | null; model?: string | null; api_key?: string | null; base_url?: string | null }) {
  // Unsaved form (no id): probe with the values straight from the form.
  if (!payload.id || payload.id === 'default') {
    const formApiKey = String(payload.api_key ?? '').trim();
    const model = String(payload.model ?? '').trim();
    if (!formApiKey || formApiKey.length < 8 || !model) throw new HttpError(400, 'Enter an API key and model before testing.');
    const result = await probeConnection({
      provider: payload.provider as any,
      apiKey: formApiKey,
      baseUrl: payload.base_url,
      model,
    });
    return { ok: result.ok, error: result.ok ? undefined : result.error };
  }

  // Saved connection: resolve via the same path generation uses (decrypt here).
  const { resolveConnection } = await import('../_shared/ai/connections.ts');
  const resolved = await resolveConnection(ctx.supabase, ctx.facultyId, { connectionId: payload.id });
  if (!resolved) throw new HttpError(404, 'Connection not found.');
  const result = await probeConnection({
    provider: resolved.provider as any,
    apiKey: resolved.apiKey,
    baseUrl: resolved.baseUrl,
    model: resolved.model,
  });
  return { ok: result.ok, error: result.ok ? undefined : result.error };
}

async function deleteConnection(ctx: StaffRequestContext, id: string) {
  const { error } = await ctx.supabase
    .from('faculty_ai_connections')
    .delete()
    .eq('id', id)
    .eq('faculty_id', ctx.facultyId);
  if (error) throw new HttpError(500, 'Could not remove the connection.');
  // Promote the most recent remaining connection to default.
  const { data: next } = await ctx.supabase
    .from('faculty_ai_connections')
    .select('id,updated_at')
    .eq('faculty_id', ctx.facultyId)
    .order('updated_at', { ascending: false })
    .limit(1);
  if (next?.[0]) {
    await ctx.supabase
      .from('faculty_ai_connections')
      .update({ is_default: true })
      .eq('id', next[0].id)
      .eq('faculty_id', ctx.facultyId);
  }
  return { deleted: true };
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return jsonResponse({}, 200);
  if (req.method !== 'GET' && req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  let ctx: StaffRequestContext;
  try {
    ctx = await initStaffRequest(req.headers.get('Authorization') ?? '');
  } catch (e) {
    if (e instanceof HttpError) return jsonResponse({ error: e.message }, e.status);
    return jsonResponse({ error: 'Request failed' }, 500);
  }

  try {
    if (req.method === 'GET') return jsonResponse(await listConnections(ctx));

    let payload: any = {};
    try {
      payload = await req.json();
    } catch {
      return jsonResponse({ error: 'Invalid JSON body' }, 400);
    }

    switch (payload?.action) {
      case 'save':
        return jsonResponse(await saveConnection(ctx, payload));
      case 'test':
        return jsonResponse(await testConnection(ctx, payload));
      case 'delete':
        if (!payload.id) return jsonResponse({ error: 'Connection id is required.' }, 400);
        return jsonResponse(await deleteConnection(ctx, payload.id));
      default:
        return jsonResponse({ error: 'Unknown action.' }, 400);
    }
  } catch (e) {
    if (e instanceof HttpError) return jsonResponse({ error: e.message }, e.status);
    console.error('faculty-ai-connections failed:', e instanceof Error ? e.message : e);
    return jsonResponse({ error: 'Unexpected server error' }, 500);
  }
});
