// Email provider adapter — isolated so the provider can be swapped later
// without touching the delivery/state-machine logic. Provider credentials
// come ONLY from server-side environment (function secrets); never from
// Vite, browser code, or Git.
//
// FAIL-CLOSED: providerByName() returns null unless the name is explicitly
// 'resend' or 'log'. Selection lives in index.ts: env MAILER_PROVIDER first,
// then the vault secret 'mailer_provider' (both server-side only). A
// missing/unknown value is an ops misconfiguration — the mailer must NOT
// mark anything as sent.

export type ProviderOutcome =
  | { ok: true; providerMessageId: string }
  | {
      ok: false;
      transient: boolean;
      code: string;
      // Provider-supplied retry delay (seconds); the mailer uses it for
      // next_attempt_at when cleanly available, else its own backoff.
      retryAfterSeconds?: number;
    };

export type SendInput = {
  to: string;
  subject: string;
  html: string;
  text: string;
  idempotencyKey?: string;
  // LOCAL QA ONLY: an outbox row whose payload sets dev_fail_mode makes
  // the mock log provider simulate provider failures (mirrors the worker's
  // own simulate_failure mode). Production providers ignore this field.
  devFailMode?: string;
};

export interface EmailProvider {
  name: string;
  send(input: SendInput): Promise<ProviderOutcome>;
}

// ---- local/mock provider: renders + logs, never sends externally ----
const logProvider: EmailProvider = {
  name: 'log',
  async send(input) {
    // Logged server-side only. Recipient addresses are the sender's own
    // platform data; no secrets are ever logged.
    console.log(
      '[notification-mailer][log-provider]',
      JSON.stringify({
        to: input.to,
        subject: input.subject,
        idempotencyKey: input.idempotencyKey ?? null,
        textLength: input.text.length,
        htmlLength: input.html.length,
        devFailMode: input.devFailMode ?? null,
      }),
    );

    if (input.devFailMode === 'transient') {
      return { ok: false, transient: true, code: 'PROVIDER_UNAVAILABLE' };
    }
    if (input.devFailMode === 'permanent') {
      return { ok: false, transient: false, code: 'PROVIDER_REJECTED_422' };
    }

    return {
      ok: true,
      providerMessageId: `log-${crypto.randomUUID()}`,
    };
  },
};

// Statuses the provider considers retryable even though they are 4xx.
const TRANSIENT_4XX = new Set([408, 425, 429]);

function parseRetryAfter(value: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value.trim());
  if (Number.isFinite(seconds) && seconds > 0) return seconds;
  // HTTP-date Retry-After: not supported for V1; fall back to backoff.
  return undefined;
}

// ---- Resend provider (transactional email) ----
const resendProvider: EmailProvider = {
  name: 'resend',
  async send(input) {
    const apiKey = Deno.env.get('RESEND_API_KEY');
    if (!apiKey) {
      return { ok: false, transient: false, code: 'PROVIDER_NOT_CONFIGURED' };
    }

    let response: Response;
    try {
      response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'authorization': `Bearer ${apiKey}`,
          'content-type': 'application/json',
          ...(input.idempotencyKey ? { 'Idempotency-Key': input.idempotencyKey } : {}),
        },
        body: JSON.stringify({
          from: Deno.env.get('RESEND_FROM') ?? 'Kaveri Technologies Academy <noreply@kaveritech.co.in>',
          to: input.to,
          subject: input.subject,
          html: input.html,
          text: input.text,
        }),
        signal: AbortSignal.timeout(15_000),
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'TimeoutError') {
        return { ok: false, transient: true, code: 'PROVIDER_TIMEOUT' };
      }
      console.error('[notification-mailer] resend request failed', error);
      return { ok: false, transient: true, code: 'PROVIDER_UNAVAILABLE' };
    }

    if (response.ok) {
      const body: unknown = await response.json().catch(() => null);
      const id = body && typeof body === 'object' && 'id' in body
        ? String((body as { id: unknown }).id)
        : '';
      return { ok: true, providerMessageId: id || `resend-${crypto.randomUUID()}` };
    }

    // 408/425/429 and every 5xx are transient/retryable. Other 4xx
    // (validation, auth) are permanent — retrying cannot fix them.
    const transient = response.status >= 500 || TRANSIENT_4XX.has(response.status);
    return {
      ok: false,
      transient,
      code: `PROVIDER_REJECTED_${response.status}`,
      retryAfterSeconds: parseRetryAfter(response.headers.get('retry-after')),
    };
  },
};

export function providerByName(name: string): EmailProvider | null {
  if (name === 'resend') return resendProvider;
  if (name === 'log') return logProvider;
  // Fail closed: an unset or unknown provider name is a production
  // misconfiguration. Nothing may be marked as sent.
  return null;
}