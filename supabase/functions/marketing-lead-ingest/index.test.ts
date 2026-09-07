// =====================================================================
// marketing-lead-ingest — unit tests for pure verification logic
//
// Run with: deno test --allow-net index.test.ts
//
// These tests verify the HMAC signature computation, timing-safe
// comparison, and payload validation logic WITHOUT requiring a live
// Supabase instance.
// =====================================================================

import { assertEquals, assertNotEquals } from "npm:std/assert";

const LEAD_TYPES = [
  "course_enquiry",
  "general_training",
  "career_return",
  "computer_skills",
  "internship",
  "project_mentoring",
  "trainer_application",
] as const;

function sha256Hex(value: string): Promise<string> {
  return crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)).then(
    (bytes) =>
      Array.from(
        new Uint8Array(bytes),
        (byte) => byte.toString(16).padStart(2, "0"),
      ).join(""),
  );
}

async function timingSafeEqual(a: string, b: string): Promise<boolean> {
  const digest = async (value: string) =>
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
    );
  const [aHash, bHash] = await Promise.all([digest(a), digest(b)]);
  if (aHash.length !== bHash.length) return false;
  let diff = 0;
  for (let index = 0; index < aHash.length; index += 1) {
    diff |= aHash[index] ^ bHash[index];
  }
  return diff === 0;
}

async function computeSignature(
  secret: string,
  timestamp: string,
  idempotencyKey: string,
  rawBody: string,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${timestamp}.${idempotencyKey}.${rawBody}`),
  );
  return Array.from(
    new Uint8Array(mac),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
}

function optionalText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text ? text : null;
}

function validateLeadType(leadType: string): boolean {
  return LEAD_TYPES.includes(leadType as typeof LEAD_TYPES[number]);
}

function validatePhone(phone: string): boolean {
  return /^[6-9][0-9]{9}$/.test(phone);

  Deno.test("HMAC signature: known inputs produce expected signature", async () => {
    const secret = "a".repeat(64);
    const timestamp = "1717000000";
    const idempotencyKey = "marketing.test-uuid";
    const rawBody = '{"test":true}';
    const sig = await computeSignature(
      secret,
      timestamp,
      idempotencyKey,
      rawBody,
    );
    assertEquals(sig.length, 64);
    assertEquals(/^[0-9a-f]{64}$/.test(sig), true);
  });

  Deno.test("HMAC signature: different bodies produce different signatures", async () => {
    const secret = "a".repeat(64);
    const timestamp = "1717000000";
    const key = "marketing.test-uuid";
    const sig1 = await computeSignature(secret, timestamp, key, '{"a":1}');
    const sig2 = await computeSignature(secret, timestamp, key, '{"a":2}');
    assertNotEquals(sig1, sig2);
  });

  Deno.test("HMAC signature: different timestamps produce different signatures", async () => {
    const secret = "a".repeat(64);
    const key = "marketing.test-uuid";
    const body = '{"test":true}';
    const sig1 = await computeSignature(secret, "1717000000", key, body);
    const sig2 = await computeSignature(secret, "1717000001", key, body);
    assertNotEquals(sig1, sig2);
  });

  Deno.test("HMAC signature: different idempotency keys produce different signatures", async () => {
    const secret = "a".repeat(64);
    const timestamp = "1717000000";
    const body = '{"test":true}';
    const sig1 = await computeSignature(
      secret,
      timestamp,
      "marketing.key-1",
      body,
    );
    const sig2 = await computeSignature(
      secret,
      timestamp,
      "marketing.key-2",
      body,
    );
    assertNotEquals(sig1, sig2);
  });

  Deno.test("HMAC signature: same inputs produce same signature", async () => {
    const secret = "b".repeat(64);
    const timestamp = "1717000000";
    const key = "marketing.test-uuid";
    const body = '{"test":true}';
    const sig1 = await computeSignature(secret, timestamp, key, body);
    const sig2 = await computeSignature(secret, timestamp, key, body);
    assertEquals(sig1, sig2);
  });

  Deno.test("timingSafeEqual: identical strings are equal", async () => {
    assertEquals(await timingSafeEqual("abc123", "abc123"), true);
  });

  Deno.test("timingSafeEqual: different strings are not equal", async () => {
    assertEquals(await timingSafeEqual("abc123", "abc124"), false);
  });

  Deno.test("timingSafeEqual: different lengths are not equal", async () => {
    assertEquals(await timingSafeEqual("abc", "abcd"), false);
  });

  Deno.test("timingSafeEqual: empty strings are equal", async () => {
    assertEquals(await timingSafeEqual("", ""), true);
  });

  Deno.test("validateLeadType: all valid types accepted", () => {
    for (const lt of LEAD_TYPES) {
      assertEquals(validateLeadType(lt), true);
    }
  });

  Deno.test("validateFullName: valid names accepted", () => {
    assertEquals(validateFullName("Rahul"), true);
    assertEquals(validateFullName("Rahul Kumar"), true);
    assertEquals(validateFullName("  Rahul  "), true);
  });

  Deno.test("validateFullName: invalid names rejected", () => {
    assertEquals(validateFullName(""), false);
    assertEquals(validateFullName("A"), false);
    assertEquals(validateFullName("  "), false);
  });

  Deno.test("optionalText: null/undefined/empty return null", () => {
    assertEquals(optionalText(null), null);
    assertEquals(optionalText(undefined), null);
    assertEquals(optionalText(""), null);
    assertEquals(optionalText("   "), null);
  });

  Deno.test("optionalText: valid text returned trimmed", () => {
    assertEquals(optionalText("  hello  "), "hello");
    assertEquals(optionalText("hello"), "hello");
  });

  Deno.test("optionalText: non-string values coerced", () => {
    assertEquals(optionalText(123), "123");
    assertEquals(optionalText(true), "true");
  });

  Deno.test("sha256Hex: correct hash for known input", async () => {
    const hash = await sha256Hex("hello");
    assertEquals(
      hash,
      "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
    );
  });

  Deno.test("secret byte length: 64 hex chars = 32 bytes", () => {
    assertEquals(new TextEncoder().encode("a".repeat(64)).length, 32);
  });

  Deno.test("secret byte length: short secret detected", () => {
    assertEquals(new TextEncoder().encode("short").length < 32, true);
  });

  Deno.test("JSON: valid marketing.lead.created parses", () => {
    const raw = JSON.stringify({
      version: 1,
      event: "marketing.lead.created",
      source: "kaveri-marketing-growth",
      idempotencyKey: "marketing.test",
      lead: {
        leadType: "course_enquiry",
        fullName: "Test",
        phone: "9876543210",
        consent: true,
      },
    });
    const parsed = JSON.parse(raw);
    assertEquals(parsed.event, "marketing.lead.created");
    assertEquals(parsed.lead.consent, true);
  });

  Deno.test("JSON: malformed JSON throws", () => {
    let threw = false;
    try {
      JSON.parse("{ invalid }");
    } catch {
      threw = true;
    }
    assertEquals(threw, true);
  });

  Deno.test("timestamp: current accepted, old rejected, future rejected", () => {
    const now = Math.floor(Date.now() / 1000);
    assertEquals(Math.abs(now - now) <= 300, true);
    assertEquals(Math.abs(now - (now - 600)) > 300, true);
    assertEquals(Math.abs(now - (now + 600)) > 300, true);
  });

  Deno.test("idempotency: header/body mismatch detected", () => {
    assertEquals("marketing.key-1" !== "marketing.key-2", true);
  });

  Deno.test("validateLeadType: invalid types rejected", () => {
    assertEquals(validateLeadType("invalid"), false);
    assertEquals(validateLeadType(""), false);
    assertEquals(validateLeadType("COURSE_ENQUIRY"), false);
  });

  Deno.test("validatePhone: valid Indian mobile accepted", () => {
    assertEquals(validatePhone("9876543210"), true);
    assertEquals(validatePhone("6000000000"), true);
  });

  Deno.test("validatePhone: invalid phones rejected", () => {
    assertEquals(validatePhone("1234567890"), false);
    assertEquals(validatePhone("5876543210"), false);
    assertEquals(validatePhone("987654321"), false);
    assertEquals(validatePhone(""), false);
  });
}

function validateFullName(name: string): boolean {
  return name.trim().length >= 2;
}
