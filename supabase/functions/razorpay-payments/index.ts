// =====================================================================
// razorpay-payments — Razorpay integration for Kaveri Academy
//
// Mirrors cashfree-payments: same route shape, same guarantees.
//
//   Browser (student)            Edge function (this file)
//     → POST /functions/v1/razorpay-payments  { action: "create-order", courseId }
//       (authenticated: the caller's Supabase JWT is verified here;
//        the gateway JWT check is off — see config.toml — because the
//        webhook route below cannot carry a Supabase JWT)
//       → creates a Razorpay order, returns order id + public key id
//     → Razorpay Checkout.js modal   (src/lib/payments.ts)
//   Razorpay
//     → POST /functions/v1/razorpay-payments/webhook   (server only)
//       HMAC-SHA256 verified against the raw body (see verifyWebhook
//       below); on payment.captured the payment is re-verified
//       against Razorpay server-side, then enrolment is granted via
//       the grant_paid_enrollment RPC. The webhook is the ONLY thing
//       that marks an order paid — the browser callback is UX, not
//       truth. Never fulfil on the browser handler alone: the student
//       may close the tab before it fires.
//
// Environment (Supabase function secrets — never in the repo):
//   RAZORPAY_TEST_KEY_ID      Test Key ID (rzp_test_...).
//   RAZORPAY_TEST_KEY_SECRET  Test Key Secret (shown once; also used
//                             to verify the checkout payment signature
//                             if the browser handler is ever used).
//   RAZORPAY_TEST_WEBHOOK_SECRET
//                             Webhook secret chosen when the webhook
//                             is registered in the Razorpay dashboard.
//                             This is a SEPARATE secret from the Key
//                             Secret — do not mix them up.
//   Live mode (gateway_settings.mode = 'live') reads instead:
//   RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET / RAZORPAY_WEBHOOK_SECRET.
//   The mode + currency come from the gateway_settings row (set in
//   Admin → Payment Settings); without that table the function falls
//   back to sandbox + INR, so it keeps working on older installs.
//   LMS_PUBLIC_URL            Optional link base (unused by the modal
//                             flow; kept for parity with Cashfree).
//   SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY
//                             Injected by the Supabase runtime.
//
// Test mode by design (v1): the env names carry the TEST prefix on
// purpose. Production activation is a separate, deliberate step: new
// env names (RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET /
// RAZORPAY_WEBHOOK_SECRET), live KYC, and a separate live webhook.
// Same base URL for test and live: https://api.razorpay.com/v1.
// No checkout domain whitelist is required by Razorpay.
//
// Money model: single academy merchant account. Currency is INR.
// The price is ALWAYS read server-side from courses.price — the client
// never sends an amount. Amounts go to Razorpay in paise (x100).
// A price only has effect on approval_required courses (same rule as
// Cashfree v1).
//
// Razorpay docs used (checked 2026-11-14):
//   Create Order  POST /v1/orders — amount in paise, receipt <= 40
//     chars, returns id (order_...). Basic auth key_id:key_secret.
//   Checkout.js  https://checkout.razorpay.com/v1/checkout.js —
//     modal with key, order_id, handler. No redirect-by-URL.
//   Webhooks — signature = hex(HMAC-SHA256(rawBody, webhookSecret));
//     header x-razorpay-signature. No timestamp in the signature;
//     replay guard is the payment id (see handleWebhook) plus
//     x-razorpay-event-id. Events: payment.captured is the
//     fulfilment event; payment.authorized means funds held, not
//     captured — do NOT fulfil on it. Return 200 within 5s.
//   Test cards/UPI: docs.razorpay.com — success@razorpay (UPI).
// =====================================================================

import { createClient } from "npm:@supabase/supabase-js@2.57.4";

type AdminClient = ReturnType<typeof createClient>;

type JsonObject = Record<string, unknown>;

function isRecord(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const RAZORPAY_BASE_URL = "https://api.razorpay.com/v1";
const MIN_ORDER_AMOUNT = 1;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function env(name: string): string | undefined {
  const value = Deno.env.get(name);
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

type RazorpayConfig = {
  keyId: string;
  keySecret: string;
  webhookSecret: string;
  mode: "sandbox" | "production";
};

/**
 * Non-secret gateway settings (mode + currency) from gateway_settings
 * when the v2 migration has been applied; falls back to sandbox +
 * the default currency when the table or row is missing, so the
 * function keeps working on installs without the migration.
 */
async function getGatewaySettings(
  admin: AdminClient,
  fallbackCurrency: string,
): Promise<{ mode: "sandbox" | "live"; currency: string }> {
  try {
    const { data } = await admin
      .from("gateway_settings")
      .select("mode, currency")
      .eq("gateway", "razorpay")
      .maybeSingle();
    const row = (data ?? {}) as JsonObject;
    const mode = row.mode === "live" ? "live" : "sandbox";
    const currency = typeof row.currency === "string" && row.currency
      ? String(row.currency).toUpperCase()
      : fallbackCurrency;
    return {
      mode,
      currency: ["INR", "USD", "EUR", "GBP"].includes(currency) ? currency : fallbackCurrency,
    };
  } catch {
    return { mode: "sandbox", currency: fallbackCurrency };
  }
}

function getRazorpayConfig(mode: "sandbox" | "live"): RazorpayConfig | { error: string } {
  // Test and live use different secret names on purpose: the mode in
  // gateway_settings picks which set the function reads. Live
  // activation is a separate step (live keys + live webhook).
  const names = mode === "live"
    ? {
        keyId: "RAZORPAY_KEY_ID",
        keySecret: "RAZORPAY_KEY_SECRET",
        webhookSecret: "RAZORPAY_WEBHOOK_SECRET",
      }
    : {
        keyId: "RAZORPAY_TEST_KEY_ID",
        keySecret: "RAZORPAY_TEST_KEY_SECRET",
        webhookSecret: "RAZORPAY_TEST_WEBHOOK_SECRET",
      };
  const keyId = env(names.keyId);
  const keySecret = env(names.keySecret);
  const webhookSecret = env(names.webhookSecret);
  if (!keyId || !keySecret || !webhookSecret) {
    return {
      error:
        `Razorpay is not configured: set ${names.keyId}, ${names.keySecret} and ${names.webhookSecret} as function secrets.`,
    };
  }
  return { keyId, keySecret, webhookSecret, mode: mode === "live" ? "production" : "sandbox" };
}

function getAdminClient(): AdminClient {
  const url = env("SUPABASE_URL");
  const key = env("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
  }
  return createClient(url, key, { db: { schema: "public" } });
}

async function getAuthenticatedUser(req: Request) {
  const header = req.headers.get("authorization") ?? "";
  const match = /^bearer\s+(.+)$/i.exec(header);
  if (!match) return null;
  const url = env("SUPABASE_URL");
  const anonKey = env("SUPABASE_ANON_KEY");
  if (!url || !anonKey) return null;
  const client = createClient(url, anonKey, {
    auth: { persistSession: false },
  });
  const { data, error } = await client.auth.getUser(match[1]);
  if (error || !data.user) return null;
  return data.user;
}

// ---------- Razorpay API ----------

function basicAuth(cfg: RazorpayConfig): string {
  return `Basic ${btoa(`${cfg.keyId}:${cfg.keySecret}`)}`;
}

async function razorpayFetch(
  cfg: RazorpayConfig,
  path: string,
  init?: RequestInit,
): Promise<{ ok: boolean; status: number; body: unknown }> {
  const res = await fetch(`${RAZORPAY_BASE_URL}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      authorization: basicAuth(cfg),
      ...(init?.headers ?? {}),
    },
  });
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  return { ok: res.ok, status: res.status, body };
}

// ---------- Webhook signature (Razorpay HMAC-SHA256 hex, raw body) ----------

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(message),
  );
  return [...new Uint8Array(signature)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function timingSafeEqual(a: string, b: string): Promise<boolean> {
  const digest = async (value: string) =>
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
    );
  const [hashA, hashB] = await Promise.all([digest(a), digest(b)]);
  if (hashA.length !== hashB.length) return false;
  let diff = 0;
  for (let i = 0; i < hashA.length; i++) diff |= hashA[i] ^ hashB[i];
  return diff === 0;
}

async function verifyWebhookSignature(
  req: Request,
  rawBody: string,
  secret: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const signature = req.headers.get("x-razorpay-signature");
  if (!signature) {
    return { ok: false, reason: "Missing webhook signature header" };
  }
  // Hex HMAC-SHA256 over the raw body with the webhook secret.
  const expected = await hmacSha256Hex(secret, rawBody);
  if (!(await timingSafeEqual(expected, signature))) {
    return { ok: false, reason: "Signature mismatch" };
  }
  return { ok: true };
}

// ---------- Route: create-order ----------

async function handleCreateOrder(req: Request): Promise<Response> {
  const admin = getAdminClient();
  const settings = await getGatewaySettings(admin, "INR");
  const cfg = getRazorpayConfig(settings.mode);
  if ("error" in cfg) {
    return json({ ok: false, error: "CONFIGURATION_ERROR", message: cfg.error }, 503);
  }

  const user = await getAuthenticatedUser(req);
  if (!user) {
    return json({ ok: false, error: "UNAUTHORIZED" }, 401);
  }

  let payload: JsonObject = {};
  try {
    payload = await req.json();
  } catch {
    return json({ ok: false, error: "INVALID_JSON" }, 400);
  }
  const courseId = typeof payload.courseId === "string" ? payload.courseId : "";
  if (!courseId) {
    return json({ ok: false, error: "courseId is required" }, 400);
  }

  // Price is read server-side from the course. The client never sends it.
  const { data: course, error: courseError } = await admin
    .from("courses")
    .select("id, slug, title, price, is_published, enrollment_mode")
    .eq("id", courseId)
    .maybeSingle();
  if (courseError || !course) {
    return json({ ok: false, error: "COURSE_NOT_FOUND" }, 404);
  }
  if (!course.is_published) {
    return json({ ok: false, error: "COURSE_NOT_PUBLISHED" }, 400);
  }
  if (course.enrollment_mode !== "approval_required") {
    return json(
      { ok: false, error: "COURSE_NOT_PAYABLE", message: "This course does not use paid checkout." },
      400,
    );
  }
  const amount = Number(course.price);
  if (!Number.isFinite(amount) || amount < MIN_ORDER_AMOUNT) {
    return json(
      { ok: false, error: "INVALID_PRICE", message: "This course has no payable price set." },
      400,
    );
  }

  const { data: existingEnrollment } = await admin
    .from("course_enrollments")
    .select("id")
    .eq("course_id", course.id)
    .eq("student_id", user.id)
    .eq("access_status", "active")
    .maybeSingle();
  if (existingEnrollment) {
    return json({ ok: false, error: "ALREADY_ENROLLED" }, 409);
  }

  // Our merchant order id. Also used as Razorpay `receipt` (<= 40 chars).
  const gatewayOrderId =
    `rzp_${crypto.randomUUID().replaceAll("-", "").slice(0, 24)}`;
  const currency = settings.currency;
  const amountPaise = Math.round(amount * 100);

  const { data: orderRow, error: orderError } = await admin
    .from("payment_orders")
    .insert({
      course_id: course.id,
      student_id: user.id,
      amount,
      currency,
      gateway: "razorpay",
      gateway_order_id: gatewayOrderId,
      status: "created",
    })
    .select("id")
    .single();
  if (orderError || !orderRow) {
    console.error("[razorpay-payments] order row insert failed", orderError?.message);
    return json({ ok: false, error: "ORDER_CREATE_FAILED" }, 500);
  }

  const rzRes = await razorpayFetch(cfg, "/orders", {
    method: "POST",
    body: JSON.stringify({
      amount: amountPaise,
      currency,
      receipt: gatewayOrderId,
      notes: { course_id: String(course.id) },
    }),
  });

  const rzBody: JsonObject = isRecord(rzRes.body) ? rzRes.body : {};
  const razorpayOrderId = typeof rzBody.id === "string" ? rzBody.id : null;
  if (!rzRes.ok || !razorpayOrderId) {
    console.error(
      "[razorpay-payments] Razorpay create order failed",
      rzRes.status,
      JSON.stringify(rzRes.body)?.slice(0, 500),
    );
    await admin
      .from("payment_orders")
      .update({ status: "failed" })
      .eq("id", orderRow.id);
    return json({ ok: false, error: "GATEWAY_ERROR", message: "Razorpay could not start checkout." }, 502);
  }

  // The secrets are never returned. Only the public Key ID and the
  // Razorpay order id go to the browser, for Checkout.js.
  // cf_order_id is the generic gateway-assigned order id column
  // (shared with Cashfree); the webhook resolves the order through it.
  await admin
    .from("payment_orders")
    .update({ cf_order_id: razorpayOrderId })
    .eq("id", orderRow.id);

  return json({
    ok: true,
    orderId: orderRow.id,
    gatewayOrderId,
    providerOrderId: razorpayOrderId,
    paymentSessionId: null,
    redirectUrl: null,
    publishableKey: cfg.keyId,
    amount,
    amountPaise,
    currency,
    gateway: "razorpay",
    mode: cfg.mode,
  });
}

// ---------- Route: webhook ----------

async function recordTransaction(
  admin: AdminClient,
  row: {
    payment_order_id: string;
    gateway_payment_id: string | null;
    event_type: string;
    gateway_status: string | null;
    amount: number | null;
    currency: string | null;
    raw_payload: unknown;
  },
): Promise<void> {
  // cf_payment_id is the generic gateway payment id column (shared
  // with Cashfree); the unique index is (gateway, cf_payment_id).
  const { error } = await admin.from("payment_transactions").insert({
    payment_order_id: row.payment_order_id,
    gateway: "razorpay",
    cf_payment_id: row.gateway_payment_id,
    event_type: row.event_type,
    gateway_status: row.gateway_status,
    amount: row.amount,
    currency: row.currency,
    signature_valid: true,
    raw_payload: row.raw_payload,
  });
  if (error) {
    console.error("[razorpay-payments] transaction record failed", error.message);
  }
}

async function handleWebhook(req: Request): Promise<Response> {
  if (req.method !== "POST") {
    return json({ ok: false, error: "METHOD_NOT_ALLOWED" }, 405);
  }
  const admin = getAdminClient();
  const settings = await getGatewaySettings(admin, "INR");
  const cfg = getRazorpayConfig(settings.mode);
  if ("error" in cfg) {
    // Cannot verify without the secret: fail closed so Razorpay retries.
    return json({ ok: false, error: "CONFIGURATION_ERROR" }, 503);
  }

  // The raw body is the signed material — read it before any parsing.
  const rawBody = await req.text();
  const verified = await verifyWebhookSignature(req, rawBody, cfg.webhookSecret);
  if (verified.ok === false) {
    console.error("[razorpay-payments] webhook rejected:", verified.reason);
    return json({ ok: false, error: "INVALID_SIGNATURE" }, 401);
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return json({ ok: false, error: "INVALID_JSON" }, 400);
  }

  const root: JsonObject = isRecord(payload) ? payload : {};
  const eventType = typeof root.event === "string" ? root.event : "UNKNOWN";
  const payloadObj: JsonObject = isRecord(root.payload) ? root.payload : {};
  const paymentObj: JsonObject = isRecord(payloadObj.payment) ? payloadObj.payment : {};
  const entity: JsonObject = isRecord(paymentObj.entity) ? paymentObj.entity : {};
  const razorpayPaymentId = typeof entity.id === "string" ? entity.id : null;
  const razorpayOrderId = typeof entity.order_id === "string" ? entity.order_id : null;
  const paymentStatus = typeof entity.status === "string" ? entity.status : null;
  // Amount is in paise in Razorpay payloads.
  const paymentAmountPaise = entity.amount != null ? Number(entity.amount) : null;

  if (!razorpayOrderId) {
    return json({ ok: true, ignored: true, reason: "No order id in payload" });
  }
  // Resolve our order through the Razorpay order id stored in
  // cf_order_id at creation time (the generic gateway-assigned id
  // column). The receipt we sent equals our gateway_order_id.
  const { data: order, error: orderError } = await admin
    .from("payment_orders")
    .select("id, course_id, student_id, amount, currency, status")
    .eq("gateway", "razorpay")
    .eq("cf_order_id", razorpayOrderId)
    .maybeSingle();
  if (orderError || !order) {
    console.error("[razorpay-payments] webhook for unknown order", razorpayOrderId);
    return json({ ok: true, ignored: true, reason: "Unknown order" });
  }
  const resolvedOrder = order;

  // Idempotency: a replayed delivery carries the same payment id.
  if (razorpayPaymentId) {
    const { data: seen } = await admin
      .from("payment_transactions")
      .select("id")
      .eq("gateway", "razorpay")
      .eq("cf_payment_id", razorpayPaymentId)
      .maybeSingle();
    if (seen) {
      return json({ ok: true, duplicate: true });
    }
  }

  await recordTransaction(admin, {
    payment_order_id: resolvedOrder.id,
    gateway_payment_id: razorpayPaymentId,
    event_type: eventType,
    gateway_status: paymentStatus,
    amount: paymentAmountPaise != null ? paymentAmountPaise / 100 : null,
    currency: typeof entity.currency === "string" ? entity.currency : null,
    raw_payload: payload,
  });

  // Only a captured payment fulfils. Authorized = funds held, not
  // captured — never grant on it. Failed events mark the order failed.
  if (eventType === "payment.failed") {
    await admin
      .from("payment_orders")
      .update({ status: "failed" })
      .eq("id", resolvedOrder.id)
      .neq("status", "paid");
    return json({ ok: true, recorded: true });
  }

  if (eventType !== "payment.captured") {
    return json({ ok: true, ignored: true, event: eventType });
  }

  if (paymentStatus !== "captured") {
    return json({ ok: false, error: "PAYMENT_NOT_CAPTURED" }, 422);
  }

  // Amount check: the paid amount must match the order we created.
  if (
    paymentAmountPaise === null ||
    !Number.isFinite(paymentAmountPaise) ||
    Math.abs(paymentAmountPaise - Math.round(Number(resolvedOrder.amount) * 100)) > 1
  ) {
    console.error(
      "[razorpay-payments] amount mismatch",
      razorpayOrderId,
      paymentAmountPaise,
      resolvedOrder.amount,
    );
    return json({ ok: false, error: "AMOUNT_MISMATCH" }, 422);
  }

  // Server-side verification: confirm the payment against Razorpay
  // before granting anything.
  if (!razorpayPaymentId) {
    return json({ ok: false, error: "PAYMENT_NOT_CONFIRMED" }, 422);
  }
  const verifyRes = await razorpayFetch(
    cfg,
    `/payments/${encodeURIComponent(razorpayPaymentId)}`,
  );
  const verifyBody: JsonObject = isRecord(verifyRes.body) ? verifyRes.body : {};
  if (!verifyRes.ok) {
    console.error(
      "[razorpay-payments] Razorpay payment verification failed",
      verifyRes.status,
    );
    return json({ ok: false, error: "VERIFICATION_UNAVAILABLE" }, 502);
  }
  if (verifyBody.status !== "captured" || verifyBody.order_id !== razorpayOrderId) {
    console.error(
      "[razorpay-payments] payment not confirmed by Razorpay",
      razorpayOrderId,
      razorpayPaymentId,
    );
    return json({ ok: false, error: "PAYMENT_NOT_CONFIRMED" }, 422);
  }

  const { error: paidError } = await admin
    .from("payment_orders")
    .update({ status: "paid" })
    .eq("id", resolvedOrder.id);
  if (paidError) {
    console.error("[razorpay-payments] marking order paid failed", paidError.message);
    return json({ ok: false, error: "ORDER_UPDATE_FAILED" }, 500);
  }

  // Grant enrolment server-side. The RPC is idempotent, so a retried
  // webhook cannot double-enrol (and the payment-id check above
  // stops replays earlier still).
  const { error: grantError } = await admin.rpc("grant_paid_enrollment", {
    p_payment_order_id: resolvedOrder.id,
  });
  if (grantError) {
    console.error("[razorpay-payments] grant enrolment failed", grantError.message);
    return json({ ok: false, error: "GRANT_FAILED" }, 500);
  }

  return json({ ok: true, granted: true });
}

// ---------- Router ----------

Deno.serve(async (req: Request) => {
  try {
    const url = new URL(req.url);
    const segments = url.pathname.split("/").filter(Boolean);
    // /functions/v1/razorpay-payments[/webhook]
    const tail = segments[segments.length - 1] ?? "";
    let action = tail === "webhook" ? "webhook" : "";

    if (!action && req.method === "POST") {
      // supabase-js invoke() posts to the function root; the action
      // travels in the body instead of the path.
      try {
        const probe = await req.clone().json();
        if (typeof probe?.action === "string") action = probe.action;
      } catch {
        action = "";
      }
    }

    if (action === "webhook") return await handleWebhook(req);
    if (action === "create-order") return await handleCreateOrder(req);
    return json({ ok: false, error: "NOT_FOUND" }, 404);
  } catch (e) {
    console.error("[razorpay-payments] unhandled error", e);
    return json({ ok: false, error: "INTERNAL_ERROR" }, 500);
  }
});
