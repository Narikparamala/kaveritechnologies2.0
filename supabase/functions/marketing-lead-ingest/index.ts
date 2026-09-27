// =====================================================================
// marketing-lead-ingest — Kaveri Marketing Lead Central Ingestion API
//
//   Marketing app (server only, never browser)
//     → POST /functions/v1/marketing-lead-ingest
//       Content-Type: application/json
//       X-Kaveri-Timestamp: <unix epoch seconds>
//       X-Kaveri-Signature: <hex HMAC-SHA256(timestamp "." idempotency_key "." raw_body)>
//       Idempotency-Key: marketing.<uuid>
//       body: { version, event, source, idempotencyKey, lead }
//
// Verification:
//   - signature: constant-time compare against the shared secret
//     (env KAVERI_LEAD_API_SECRET, else vault secret
//     'marketing.lead.secret' — server-side only). The idempotency
//     key is part of the signed payload: changing the header invalidates
//     the signature.
//   - secret strength: minimum 32 bytes (UTF-8). A short secret is a
//     CONFIGURATION_ERROR — it is never padded.
//   - timestamp freshness: ±5 minutes (replay window)
//   - idempotency: handled server-side by ingest_marketing_lead via
//     the idempotency_keys table (source+action+idempotency_key)
//
// The marketing app sends a lead for each form submission. The lead is
// anonymous and NEVER creates an LMS student account. Conversion to a
// student happens only after explicit admission in the CRM.
// =====================================================================

import {
  createClient,
  type SupabaseClient,
} from "npm:@supabase/supabase-js@2.57.4";

type AdminClient = SupabaseClient<any, any, any>;

const REPLAY_WINDOW_SECONDS = 5 * 60;
const MIN_SECRET_BYTES = 32;

const LEAD_TYPES = [
  "course_enquiry",
  "general_training",
  "career_return",
  "computer_skills",
  "internship",
  "project_mentoring",
  "trainer_application",
] as const;

type LeadType = typeof LEAD_TYPES[number];

type Attribution = {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
  fbclid?: string;
  gclid?: string;
  landing_page?: string;
  referrer?: string;
  captured_at?: string;
};

type LeadPayload = {
  leadType?: string;
  fullName?: string;
  phone?: string;
  email?: unknown;
  college?: unknown;
  qualification?: unknown;
  degree?: unknown;
  branch?: unknown;
  graduationYear?: unknown;
  skills?: unknown;
  internshipArea?: unknown;
  experience?: unknown;
  resumeUrl?: unknown;
  message?: unknown;
  courseSlug?: unknown;
  courseTitle?: unknown;
  consent?: boolean;
  firstTouch?: Attribution | null;
  lastTouch?: Attribution | null;
  page?: unknown;
  userAgent?: unknown;
  ipHash?: unknown;
  receivedAt?: string;
};

type MarketingPayload = {
  version?: number;
  event?: string;
  source?: string;
  idempotencyKey?: string;
  lead?: LeadPayload;
};

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

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

async function leadSecret(admin: AdminClient): Promise<string> {
  const env = Deno.env.get("KAVERI_LEAD_API_SECRET");
  if (env) return env;
  const { data, error } = await admin.rpc("get_server_secret", {
    p_name: "marketing.lead.secret",
  });
  if (error || typeof data !== "string") return "";
  return data;
}

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") {
    return json({ ok: false, message: "Method not allowed" }, 405);
  }

  const contentType = request.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    return json(
      { ok: false, message: "Content-Type must be application/json" },
      415,
    );
  }

  const timestamp = request.headers.get("x-kaveri-timestamp");
  const signature = request.headers.get("x-kaveri-signature");
  const idempotencyKey = request.headers.get("idempotency-key");

  if (!timestamp || !signature || !idempotencyKey) {
    return json({ ok: false, message: "Missing required headers" }, 400);
  }

  if (!idempotencyKey.startsWith("marketing.")) {
    return json({ ok: false, message: "Invalid idempotency key" }, 400);
  }

  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return json({ ok: false, message: "Failed to read request body" }, 400);
  }

  if (!rawBody.trim()) {
    return json({ ok: false, message: "Empty request body" }, 400);
  }

  const admin = adminClient();

  const now = Math.floor(Date.now() / 1000);
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(now - ts) > REPLAY_WINDOW_SECONDS) {
    await auditRejection(
      admin,
      "marketing-app",
      "stale_timestamp",
      rawBody,
      timestamp,
      401,
    );
    return json({ ok: false, message: "Invalid timestamp" }, 401);
  }

  const secret = await leadSecret(admin);

  const secretBytes = new TextEncoder().encode(secret).length;
  if (secretBytes < MIN_SECRET_BYTES) {
    console.error(
      "[marketing-lead-ingest] KAVERI_LEAD_API_SECRET is too short.",
    );
    return json(
      { ok: false, message: "Lead service is not configured safely" },
      503,
    );
  }

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
  const actualSignature = Array.from(
    new Uint8Array(mac),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");

  if (!(await timingSafeEqual(signature, actualSignature))) {
    await auditRejection(
      admin,
      "marketing-app",
      "invalid_signature",
      rawBody,
      timestamp,
      401,
    );
    return json({ ok: false, message: "Invalid signature" }, 401);
  }

  let payload: MarketingPayload;
  try {
    payload = JSON.parse(rawBody) as MarketingPayload;
  } catch {
    await auditRejection(
      admin,
      "marketing-app",
      "malformed_payload",
      rawBody,
      timestamp,
      400,
    );
    return json({ ok: false, message: "Malformed JSON payload" }, 400);
  }

  if (payload.idempotencyKey !== idempotencyKey) {
    await auditRejection(
      admin,
      "marketing-app",
      "idempotency_mismatch",
      rawBody,
      timestamp,
      400,
    );
    return json({ ok: false, message: "Idempotency key mismatch" }, 400);
  }

  if (!payload.event || payload.event !== "marketing.lead.created") {
    await auditRejection(
      admin,
      "marketing-app",
      "invalid_event",
      rawBody,
      timestamp,
      400,
    );
    return json({ ok: false, message: "Invalid event type" }, 400);
  }

  if (!payload.lead || typeof payload.lead !== "object") {
    await auditRejection(
      admin,
      "marketing-app",
      "missing_lead",
      rawBody,
      timestamp,
      400,
    );
    return json({ ok: false, message: "Missing lead data" }, 400);
  }

  const lead = payload.lead;
  const fullName = String(lead.fullName ?? "").trim();
  const phone = String(lead.phone ?? "").trim();

  if (!fullName || fullName.length < 2) {
    await auditRejection(
      admin,
      "marketing-app",
      "invalid_full_name",
      rawBody,
      timestamp,
      400,
    );
    return json({ ok: false, message: "Invalid full name" }, 400);
  }
  if (!/^[6-9][0-9]{9}$/.test(phone)) {
    await auditRejection(
      admin,
      "marketing-app",
      "invalid_phone",
      rawBody,
      timestamp,
      400,
    );
    return json({ ok: false, message: "Invalid phone" }, 400);
  }
  if (!LEAD_TYPES.includes(lead.leadType as LeadType)) {
    await auditRejection(
      admin,
      "marketing-app",
      "invalid_lead_type",
      rawBody,
      timestamp,
      400,
    );
    return json({ ok: false, message: "Invalid lead type" }, 400);
  }
  if (lead.consent !== true) {
    await auditRejection(
      admin,
      "marketing-app",
      "consent_required",
      rawBody,
      timestamp,
      400,
    );
    return json({ ok: false, message: "Consent is required" }, 400);
  }

  const optionalText = (value: unknown): string | null => {
    if (value === null || value === undefined) return null;
    const text = String(value).trim();
    return text ? text : null;
  };

  const payloadHash = await sha256Hex(rawBody);

  const { data, error } = await admin.rpc("ingest_marketing_lead", {
    p_idempotency_key: idempotencyKey,
    p_lead_type: lead.leadType as string,
    p_full_name: fullName,
    p_phone: phone,
    p_email: optionalText(lead.email),
    p_college: optionalText(lead.college),
    p_qualification: optionalText(lead.qualification),
    p_degree: optionalText(lead.degree),
    p_branch: optionalText(lead.branch),
    p_graduation_year: optionalText(lead.graduationYear),
    p_skills: optionalText(lead.skills),
    p_internship_area: optionalText(lead.internshipArea),
    p_experience: optionalText(lead.experience),
    p_resume_url: optionalText(lead.resumeUrl),
    p_message: optionalText(lead.message),
    p_course_slug: optionalText(lead.courseSlug),
    p_course_title: optionalText(lead.courseTitle),
    p_first_touch: lead.firstTouch ?? null,
    p_last_touch: lead.lastTouch ?? null,
    p_page_url: optionalText(lead.page),
    p_user_agent: optionalText(lead.userAgent),
    p_ip_hash: optionalText(lead.ipHash),
    p_consent: true,
    p_consent_timestamp: lead.receivedAt ?? new Date().toISOString(),
    p_received_at: lead.receivedAt ?? new Date().toISOString(),
    p_payload_hash: payloadHash,
  });

  if (error) {
    console.error("[marketing-lead-ingest] ingest RPC failed", error.message);
    if (String(error.message).includes("INSUFFICIENT_PRIVILEGE")) {
      return json({ ok: false, message: "Unauthorized" }, 401);
    }
    if (String(error.message).includes("IDEMPOTENCY_KEY_CONFLICT")) {
      await auditRejection(
        admin,
        "marketing-app",
        "idempotency_key_conflict",
        rawBody,
        timestamp,
        409,
      );
      return json({ ok: false, message: "Idempotency key conflict" }, 409);
    }
    return json({ ok: false, message: "Ingestion failed" }, 500);
  }

  return json({ ok: true, ...(data as Record<string, unknown>) }, 200);
});

function adminClient(): AdminClient {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
  }
  return createClient(url, key, { db: { schema: "public" } });
}

async function auditRejection(
  admin: AdminClient,
  source: string,
  reason: string,
  rawBody: string,
  timestamp: string,
  responseCode: number,
): Promise<void> {
  const hash = await sha256Hex(`${timestamp}.${rawBody}`);
  const { error } = await admin.from("integration_audit_log").upsert(
    {
      source,
      action: "marketing.lead.ingest",
      idempotency_key: `reject:${hash}`,
      request_sha256: hash,
      request_summary: { reason: reason.slice(0, 120) },
      response_code: responseCode,
      result: "rejected",
    },
    { onConflict: "source, action, idempotency_key" },
  );
  if (error) {
    console.error("[marketing-lead-ingest] audit log failed", error.message);
  }
}
