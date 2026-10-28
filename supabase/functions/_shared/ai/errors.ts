// Provider error mapping shared by every generation function.
//
// Map upstream provider failures to the faculty-facing strings the rules
// require, without ever echoing a key or leaking the provider's raw body
// beyond a short sanitized slice.

export interface ProviderFailure {
  status: number;
  provider: string;
  detail?: string;
}

export function mapProviderError(failure: ProviderFailure): string {
  const { status, provider } = failure;

  if (status === 401 || status === 403) return `Invalid API key — ${provider} rejected it. Re-save a valid key in AI Connections.`;
  if (status === 404) return `Model not available — "${provider}" does not expose this model (or the base URL is wrong).`;
  if (status === 429) return 'Rate limited — your account hit this provider\'s rate limit. Wait a bit or switch models.';
  if (status === 400) {
    const hint = failure.detail && /context|token|length/i.test(failure.detail)
      ? ' (the course context was long — try a smaller model or fewer topics)'
      : '';
    return `The request was rejected${hint}. Check the model name and base URL.`;
  }
  if (status >= 500) return `Upstream error from ${provider} (HTTP ${status}). Try again in a moment.`;
  return `Generation failed — ${provider} returned HTTP ${status}.`;
}

/** Short, safe upstream body excerpt: no keys, capped, single line. */
export function safeDetail(raw: string): string {
  return raw.replace(/\s+/g, ' ').replace(/[A-Za-z0-9_-]{20,}\.?[A-Za-z0-9_-]*/g, '<redacted>').slice(0, 200);
}

export function jsonHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return {
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'content-type': 'application/json',
    ...extra,
  };
}

export function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: jsonHeaders() });
}
