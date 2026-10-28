// Connection resolution + edge-function bootstrap for the AI generation flow.
//
// resolveConnection():
//   1. explicit connectionId given -> load THAT connection (RLS enforces own)
//   2. else the faculty's is_default connection (or most recently updated)
//   3. decrypt the key in the edge runtime ONLY (never logged, never returned)
//
// initStaffRequest(): builds the JWT-bound Supabase client, verifies the user,
// and gates to staff roles — the exact pattern the existing generation
// functions used, extracted so every AI function behaves identically.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { decryptSecret } from './crypto.ts';

export const STAFF_ROLES = ['admin', 'faculty', 'super_admin'];

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export interface StaffRequestContext {
  supabase: any; // JWT-bound client (RLS active)
  facultyId: string;
  role: string;
}

export async function initStaffRequest(authHeader: string): Promise<StaffRequestContext> {
  if (!authHeader.startsWith('Bearer ')) {
    throw new HttpError(401, 'Authentication required');
  }
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!supabaseUrl || !anonKey) throw new HttpError(500, 'Server configuration error');

  const supabase = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData?.user) throw new HttpError(401, 'Invalid or expired session');

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userData.user.id)
    .maybeSingle();
  if (!profile || !STAFF_ROLES.includes(profile.role)) throw new HttpError(403, 'Staff only');

  return { supabase, facultyId: userData.user.id, role: profile.role };
}

export interface ResolvedAiConnection {
  id: string;
  provider: string;
  model: string;
  apiKey: string; // plaintext, edge-runtime memory only — never log or return
  baseUrl: string | null;
}

/**
 * connection_id conventions: undefined/null/'default' -> the faculty's default
 * connection; 'platform' -> force the platform fallback (generation.ts turns a
 * null resolution into the platform key). Any other value -> that connection id.
 */
export async function resolveConnection(
  supabase: any,
  facultyId: string,
  opts: { connectionId?: string | null; provider?: string | null } = {},
): Promise<ResolvedAiConnection | null> {
  if (opts.connectionId === 'platform') return null; // caller falls back to the platform key
  const explicitId = opts.connectionId && opts.connectionId !== 'default' ? opts.connectionId : null;

  let connection: any = null;
  if (explicitId) {
    ({ data: connection } = await supabase
      .from('faculty_ai_connections')
      .select('id,provider,model,api_key_encrypted,base_url')
      .eq('id', explicitId)
      .eq('faculty_id', facultyId)
      .maybeSingle());
    if (!connection) throw new HttpError(404, 'The selected AI connection no longer exists. Pick another model.');
  } else {
    // RLS limits this to the caller's rows already; still scope explicitly.
    const { data } = await supabase
      .from('faculty_ai_connections')
      .select('id,provider,model,api_key_encrypted,base_url,is_default,updated_at')
      .eq('faculty_id', facultyId)
      .order('is_default', { ascending: false })
      .order('updated_at', { ascending: false })
      .limit(1);
    connection = data?.[0] ?? null;
  }
  if (!connection) return null;
  if (opts.provider && connection.provider !== opts.provider) {
    throw new HttpError(400, 'The saved connection uses a different provider than this request.');
  }

  let apiKey: string;
  try {
    apiKey = await decryptSecret(connection.api_key_encrypted);
  } catch (e) {
    throw new HttpError(500, e instanceof Error ? e.message : 'Could not decrypt the stored key. Re-save the connection.');
  }

  return {
    id: connection.id,
    provider: connection.provider,
    model: connection.model,
    apiKey,
    baseUrl: connection.base_url ?? null,
  };
}

