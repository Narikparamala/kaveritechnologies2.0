// API-key encryption for BYO AI connections.
//
// Keys are stored ENCRYPTED AT REST with AES-256-GCM. The wrapping key is
// derived (SHA-256) from AI_KEY_ENCRYPTION_SECRET, which lives only in the
// Edge Function runtime environment (supabase secrets set
// AI_KEY_ENCRYPTION_SECRET=...). Ciphertext format:
//
//     v1:<base64 iv>:<base64 ciphertext+tag>
//
// The plaintext key exists only transiently inside a request handler. No
// helper here ever logs values — callers must never include keys in toasts,
// error payloads, or ai_generation_logs.

const VERSION = 'v1';

let cachedKey: CryptoKey | null = null;

function getSecret(): string {
  const secret = Deno.env.get('AI_KEY_ENCRYPTION_SECRET');
  if (!secret) {
    throw new Error(
      'Encryption is not configured: run `supabase secrets set AI_KEY_ENCRYPTION_SECRET=<random 32+ chars>`',
    );
  }
  return secret;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

async function getAesKey(): Promise<CryptoKey> {
  if (cachedKey) return cachedKey;
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(getSecret()));
  const key = await crypto.subtle.importKey('raw', digest, 'AES-GCM', false, ['encrypt', 'decrypt']);
  cachedKey = key;
  return key;
}

function toBase64(buf: ArrayBuffer | Uint8Array<ArrayBuffer>): string {
  return btoa(String.fromCharCode(...(buf instanceof Uint8Array ? buf : new Uint8Array(buf))));
}

function fromBase64(value: string): Uint8Array<ArrayBuffer> {
  const bin = atob(value);
  const bytes = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/** Encrypt a plaintext API (or any secret) string into the v1 storage format. */
export async function encryptSecret(plaintext: string): Promise<string> {
  const key = await getAesKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoder.encode(plaintext),
  );
  return `${VERSION}:${toBase64(iv)}:${toBase64(ciphertext)}`;
}

/**
 * Decrypt a stored v1 ciphertext. Throws on tampering (GCM auth failure) or
 * unknown versions — callers surface this as "Server configuration error",
 * never as the key content.
 */
export async function decryptSecret(stored: string): Promise<string> {
  const [version, ivB64, ctB64] = stored.split(':');
  if (version !== VERSION || !ivB64 || !ctB64) {
    throw new Error('Stored key format is invalid (expected v1 ciphertext). Re-save the connection.');
  }
  const key = await getAesKey();
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromBase64(ivB64) },
    key,
    fromBase64(ctB64),
  );
  return decoder.decode(plaintext);
}

/** One random secret to seed AI_KEY_ENCRYPTION_SECRET (dev/migration aid). */
export function randomEncryptionSecret(): string {
  return toBase64(crypto.getRandomValues(new Uint8Array(32)));
}
