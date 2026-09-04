// Email provider adapter — isolated so the provider can be swapped later
// without touching the delivery/state-machine logic. Provider credentials
// come ONLY from server-side environment (function secrets); never from
// Vite, browser code, or Git.

export type ProviderOutcome =
  | { ok: true; providerMessageId: string }
  | { ok: false; transient: boolean; code: string };

export type SendInput = {
  to: string;
  subject: string;
  html: string;
  text: string;
  idempotencyKey?: string;
  // LOCAL QA ONLY: when an outbox payload sets dev_fail_mode, the mock
  // log provider simulates provider failures (mirrors the worker's own
  // simulate_failure mode). Production providers ignore this field.
  devFailMode?: string;
};

export interface EmailProvider {
  name: string;
  send(input: SendInput): Promise<ProviderOutcome>;
}

// ---- local/mock provider: logs the rendered message, always succeeds ----
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

    // 4xx = permanent (bad recipient, rejected template, ...); 5xx = transient.
    const permanent = response.status >= 400 && response.status < 500;
    return {
      ok: false,
      transient: !permanent,
      code: `PROVIDER_REJECTED_${response.status}`,
    };
  },
};

export function getProvider(): EmailProvider {
  const name = (Deno.env.get('MAILER_PROVIDER') ?? 'log').toLowerCase();
  if (name === 'resend') return resendProvider;
  return logProvider;
}