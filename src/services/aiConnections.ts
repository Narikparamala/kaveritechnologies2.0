// Client service for per-faculty AI connections (BYO API keys).
//
// All calls go through the faculty-ai-connections edge function. Keys are
// only sent on save/test and are NEVER returned by the server — the client
// list view only sees provider / model / base_url / label / default-flag.

import { supabase } from '../lib/supabase';

export type AiProvider =
  | 'google'
  | 'openai'
  | 'anthropic'
  | 'groq'
  | 'openrouter'
  | 'custom';

export const AI_PROVIDERS: { id: AiProvider; label: string; hint: string }[] = [
  { id: 'openrouter', label: 'OpenRouter', hint: 'One key, 100+ models (Claude, GPT, Llama…)' },
  { id: 'google', label: 'Google Gemini', hint: 'AI Studio keys; generous free tier' },
  { id: 'openai', label: 'OpenAI', hint: 'GPT-4o / GPT-4o-mini' },
  { id: 'anthropic', label: 'Anthropic', hint: 'Claude Sonnet / Haiku' },
  { id: 'groq', label: 'Groq', hint: 'Fast Llama / Mixtral inference' },
  { id: 'custom', label: 'Custom (OpenAI-compatible)', hint: 'Any compatible endpoint + base URL' },
];

export interface AiConnection {
  id: string;
  provider: string;
  provider_label: string;
  model: string;
  base_url: string | null;
  label: string | null;
  is_default: boolean;
  updated_at: string;
}

export interface AiConnectionsData {
  connections: AiConnection[];
  platform_fallback_allowed: boolean;
  defaults: Record<string, string[]>; // provider -> suggested model ids
}

export interface SaveConnectionPayload {
  id?: string | null;
  provider: AiProvider;
  model: string;
  api_key?: string | null; // omit when editing without changing the key
  base_url?: string | null;
  label?: string | null;
  is_default?: boolean;
}

async function callAiConnections<T>(payload: Record<string, unknown>): Promise<T> {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) throw new Error('Session expired — please sign in again.');

  const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/faculty-ai-connections`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
    },
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.error ?? `Request failed (${res.status})`);
  return body as T;
}

export async function fetchAiConnections(): Promise<AiConnectionsData> {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) throw new Error('Session expired — please sign in again.');

  const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/faculty-ai-connections`, {
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
    },
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.error ?? `Request failed (${res.status})`);
  return body as AiConnectionsData;
}

export function saveAiConnection(payload: SaveConnectionPayload): Promise<{ connection: AiConnection }> {
  return callAiConnections({ action: 'save', ...payload });
}

export function testAiConnection(payload: {
  id?: string | null; // omit to test the unsaved form values
  provider?: AiProvider | null;
  model?: string | null;
  api_key?: string | null;
  base_url?: string | null;
}): Promise<{ ok: boolean; error?: string }> {
  return callAiConnections({ action: 'test', ...payload });
}

export function deleteAiConnection(id: string): Promise<{ deleted: boolean }> {
  return callAiConnections({ action: 'delete', id });
}
