// =====================================================================
// cashfree-payments — Cashfree (Payments) integration for Kaveri Academy
//
//   Browser (student)            Edge function (this file)
//     → POST /functions/v1/cashfree-payments   { action: "create-order", courseId }
//       (authenticated: the caller's Supabase JWT is verified here;
//        the gateway JWT check is off — see config.toml — because the
//        webhook route below cannot carry a Supabase JWT)
//       → creates a Cashfree sandbox order, returns payment_session_id
//     → Cashfree JS SDK checkout({ paymentSessionId })   (src/lib/payments.ts)
//   Cashfree
//     → POST /functions/v1/cashfree-payments/webhook   (server only)
//       HMAC-SHA256 verified against the raw body (see verifyWebhook
//       below); on PAYMENT_SUCCESS the order is re-verified against
//       Cashfree server-side, then enrolment is granted via the
//       grant_paid_enrollment RPC. The webhook is the ONLY thing that
//       marks an order paid — the browser redirect is UX, not truth.
//
// Environment (Supabase function secrets — never in the repo):
//   CASHFREE_TEST_APP_ID      Test App ID (x-client-id), Test env.
//   CASHFREE_TEST_SECRET_KEY  Test secret key (x-client-secret). Also
//                             the webhook HMAC key.
//   CASHFREE_API_VERSION      PG API version, default "2025-01-01".
//   CASHFREE_API_BASE_URL     Default https://sandbox.cashfree.com/pg
//                             (production: https://api.cashfree.com/pg).
//   LMS_PUBLIC_URL            Absolute link base for order return_url
//                             (e.g. https://kaveri-academy.vercel.app).
//                             Optional: without it no return_url is set
//                             and Cashfree shows its default page.
//   SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY
//                             Injected by the Supabase runtime.
//
// Sandbox-only by design (v1): the env names carry the TEST prefix on
// purpose. Production activation is a separate, deliberate step: new
// env names (CASHFREE_APP_ID / CASHFREE_SECRET_KEY), prod KYC, and a
// domain whitelist in the Cashfree dashboard (the JS SDK refuses
// non-whitelisted origins). Do NOT point CASHFREE_API_BASE_URL at prod
// while the TEST keys are set — Cashfree will reject the calls.
//
// Money model (v1): single academy merchant account. Every payment
// settles to that one account; faculty revenue split is a future
// configurable setting, not auto-split here. Currency is INR.
// The price is ALWAYS read server-side from courses.price — the client
// never sends an amount. A price only has effect on
// approval_required courses (see migration 20261112150000).
//
// Cashfree docs used (checked 2026-11-12):
//   Create Order  POST /pg/orders — order_amount >= 1, order_id
//     3-45 chars [A-Za-z0-9_-], returns payment_session_id.
//   Webhooks — signature = Base64(HMAC-SHA256(timestamp + rawBody,
//     secret)); headers x-webhook-signature / x-webhook-timestamp.
//     Note the docs' pseudocode shows "timestamp.payload" with a dot,
//     but the manual-verification code concatenates with NO separator
//     — this implementation follows the code (timestamp + rawBody).
//   Checkout requires the Cashfree JS SDK (cashfree.js v3); there is
//     no redirect-by-URL. See src/lib/payments.ts.
// =====================================================================

import { createClient } from "npm:@supabase/supabase-js@2.57.4";

type AdminClient = ReturnType<typeof createClient>;

type JsonObject = Record<string, unknown>;

function isRecord(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const CASHFREE_API_VERSION_DEFAULT = "2025-01-01";
const SANDBOX_BASE_URL = "https://sandbox.cashfree.com/pg";
const WEBHOOK_MAX_AGE_SECONDS = 10 * 60;
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

type CashfreeConfig = {
  appId: string;
  secret: string;
  apiVersion: string;
  baseUrl: string;
  mode: "sandbox" | "production";
};

function getCashfreeConfig(): CashfreeConfig | { error: string } {
  const appId = env("CASHFREE_TEST_APP_ID");
  const secret = env("CASHFREE_TEST_SECRET_KEY");
  if (!appId || !secret) {
    return {
      error:
        "Cashfree is not configured: set CASHFREE_TEST_APP_ID and CASHFREE_TEST_SECRET_KEY as function secrets.",
    };
  }
  const baseUrl = env("CASHFREE_API_BASE_URL") ?? SANDBOX_BASE_URL;
  return {
    appId,
    secret,
    apiVersion: env("CASHFREE_API_VERSION") ?? CASHFREE_API_VERSION_DEFAULT,
    baseUrl: baseUrl.replace(/\/$/, ""),
    mode: baseUrl.includes("sandbox") ? "sandbox" : "production",
  };
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

// ---------- Cashfree API ----------

async function cashfreeFetch(
  cfg: CashfreeConfig,
  path: string,
  init?: RequestInit,
): Promise<{ ok: boolean; status: number; body: unknown }> {
  const res = await fetch(`${cfg.baseUrl}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      "x-client-id": cfg.appId,
      "x-client-secret": cfg.secret,
      "x-api-version": cfg.apiVersion,
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

// ---------- Webhook signature (Cashfree HMAC-SHA256, raw body) ----------

async function hmacSha256Base64(
  secret: string,
  message: string,
): Promise<string> {
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
  const bytes = new Uint8Array(signature);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
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

function parseWebhookTimestamp(raw: string | null): number | null {
  if (!raw || !/^\d+$/.test(raw)) return null;
  const value = Number(raw);
  // Cashfree sends milliseconds; tolerate seconds too.
  return value > 1e12 ? Math.floor(value / 1000) : value;
}

async function verifyWebhookSignature(
  req: Request,
  rawBody: string,
  secret: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const signature = req.headers.get("x-webhook-signature");
  const timestampRaw = req.headers.get("x-webhook-timestamp");
  if (!signature || !timestampRaw) {
    return { ok: false, reason: "Missing webhook signature headers" };
  }
  const timestamp = parseWebhookTimestamp(timestampRaw);
  if (timestamp === null) {
    return { ok: false, reason: "Invalid webhook timestamp" };
  }
  const age = Math.abs(Date.now() / 1000 - timestamp);
  if (age > WEBHOOK_MAX_AGE_SECONDS) {
    return { ok: false, reason: "Stale webhook timestamp" };
  }
  // Concatenation, no separator — per Cashfree's manual-verification code.
  const expected = await hmacSha256Base64(secret, `${timestampRaw}${rawBody}`);
  if (!(await timingSafeEqual(expected, signature))) {
    return { ok: false, reason: "Signature mismatch" };
  }
  return { ok: true };
}

// ---------- Route: create-order ----------

async function handleCreateOrder(req: Request): Promise<Response> {
  const cfg = getCashfreeConfig();
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

  const admin = getAdminClient();

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
  // Paid checkout only applies to approval_required courses. An `open`
  // course is freely enrolable by design — a price on it has no effect.
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

  // Cashfree order_id: 3-45 chars, [A-Za-z0-9_-]. Unique per order.
  const gatewayOrderId =
    `kaveri_${crypto.randomUUID().replaceAll("-", "").slice(0, 24)}`;
  const currency = "INR";

  const { data: orderRow, error: orderError } = await admin
    .from("payment_orders")
    .insert({
      course_id: course.id,
      student_id: user.id,
      amount,
      currency,
      gateway: "cashfree",
      gateway_order_id: gatewayOrderId,
      status: "created",
    })
    .select("id")
    .single();
  if (orderError || !orderRow) {
    console.error("[cashfree-payments] order row insert failed", orderError?.message);
    return json({ ok: false, error: "ORDER_CREATE_FAILED" }, 500);
  }

  const publicUrl = env("LMS_PUBLIC_URL")?.replace(/\/$/, "");
  const webhookUrl = env("SUPABASE_URL")
    ? `${env("SUPABASE_URL")!.replace(/\/$/, "")}/functions/v1/cashfree-payments/webhook`
    : undefined;

  const cfRes = await cashfreeFetch(cfg, "/orders", {
    method: "POST",
    body: JSON.stringify({
      order_id: gatewayOrderId,
      order_amount: amount,
      order_currency: currency,
      customer_details: {
        customer_id: user.id,
        customer_email: user.email ?? undefined,
      },
      order_meta: {
        ...(publicUrl
          ? {
              return_url: `${publicUrl}/courses/${course.slug}?payment=return&order=${gatewayOrderId}`,
            }
          : {}),
        ...(webhookUrl ? { notify_url: webhookUrl } : {}),
      },
      order_note: `Course enrolment: ${String(course.title).slice(0, 180)}`,
      order_tags: { course_id: String(course.id) },
    }),
  });

  const cfBody: JsonObject = isRecord(cfRes.body) ? cfRes.body : {};
  const paymentSessionId = typeof cfBody.payment_session_id === "string"
    ? cfBody.payment_session_id
    : null;
  if (!cfRes.ok || !paymentSessionId) {
    console.error(
      "[cashfree-payments] Cashfree create order failed",
      cfRes.status,
      JSON.stringify(cfRes.body)?.slice(0, 500),
    );
    await admin
      .from("payment_orders")
      .update({ status: "failed" })
      .eq("id", orderRow.id);
    return json({ ok: false, error: "GATEWAY_ERROR", message: "Cashfree could not start checkout." }, 502);
  }

  await admin
    .from("payment_orders")
    .update({
      cf_order_id: cfBody.cf_order_id != null ? String(cfBody.cf_order_id) : null,
    })
    .eq("id", orderRow.id);

  // The secret is never returned. Only the single-use session id goes
  // to the browser, for the Cashfree JS SDK.
  return json({
    ok: true,
    orderId: orderRow.id,
    gatewayOrderId,
    cfOrderId: cfBody.cf_order_id != null ? String(cfBody.cf_order_id) : null,
    paymentSessionId,
    amount,
    currency,
    gateway: "cashfree",
    mode: cfg.mode,
  });
}

// ---------- Route: webhook ----------

async function recordTransaction(
  admin: AdminClient,
  row: {
    payment_order_id: string;
    cf_payment_id: string | null;
    event_type: string;
    gateway_status: string | null;
    amount: number | null;
    currency: string | null;
    raw_payload: unknown;
  },
): Promise<void> {
  const { error } = await admin.from("payment_transactions").insert({
    ...row,
    gateway: "cashfree",
    signature_valid: true,
  });
  if (error) {
    console.error("[cashfree-payments] transaction record failed", error.message);
  }
}

async function handleWebhook(req: Request): Promise<Response> {
  if (req.method !== "POST") {
    return json({ ok: false, error: "METHOD_NOT_ALLOWED" }, 405);
  }
  const cfg = getCashfreeConfig();
  if ("error" in cfg) {
    // Cannot verify without the secret: fail closed so Cashfree retries.
    return json({ ok: false, error: "CONFIGURATION_ERROR" }, 503);
  }

  // The raw body is the signed material — read it before any parsing.
  const rawBody = await req.text();
  const verified = await verifyWebhookSignature(req, rawBody, cfg.secret);
  if (verified.ok === false) {
    console.error("[cashfree-payments] webhook rejected:", verified.reason);
    return json({ ok: false, error: "INVALID_SIGNATURE" }, 401);
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return json({ ok: false, error: "INVALID_JSON" }, 400);
  }

  const root: JsonObject = isRecord(payload) ? payload : {};
  const eventType = typeof root.type === "string" ? root.type : "UNKNOWN";
  const data: JsonObject = isRecord(root.data) ? root.data : {};
  const orderObj: JsonObject = isRecord(data.order) ? data.order : {};
  const paymentObj: JsonObject = isRecord(data.payment) ? data.payment : {};
  const gatewayOrderId = typeof orderObj.order_id === "string"
    ? orderObj.order_id
    : null;
  const cfPaymentId = paymentObj.cf_payment_id != null
    ? String(paymentObj.cf_payment_id)
    : null;
  const paymentStatus = typeof paymentObj.payment_status === "string"
    ? paymentObj.payment_status
    : null;
  const paymentAmount = paymentObj.payment_amount != null
    ? Number(paymentObj.payment_amount)
    : null;

  const admin = getAdminClient();

  // Unknown order: nothing to fulfil. Still a verified event, so
  // acknowledge it — Cashfree must not retry forever.
  if (!gatewayOrderId) {
    return json({ ok: true, ignored: true, reason: "No order id in payload" });
  }
  const { data: order, error: orderError } = await admin
    .from("payment_orders")
    .select("id, course_id, student_id, amount, currency, status")
    .eq("gateway", "cashfree")
    .eq("gateway_order_id", gatewayOrderId)
    .maybeSingle();
  if (orderError || !order) {
    console.error("[cashfree-payments] webhook for unknown order", gatewayOrderId);
    return json({ ok: true, ignored: true, reason: "Unknown order" });
  }

  // Idempotency: a replayed delivery carries the same cf_payment_id.
  if (cfPaymentId) {
    const { data: seen } = await admin
      .from("payment_transactions")
      .select("id")
      .eq("gateway", "cashfree")
      .eq("cf_payment_id", cfPaymentId)
      .maybeSingle();
    if (seen) {
      return json({ ok: true, duplicate: true });
    }
  }

  await recordTransaction(admin, {
    payment_order_id: order.id,
    cf_payment_id: cfPaymentId,
    event_type: eventType,
    gateway_status: paymentStatus,
    amount: paymentAmount,
    currency: typeof paymentObj.payment_currency === "string"
      ? paymentObj.payment_currency
      : null,
    raw_payload: payload,
  });

  if (eventType === "PAYMENT_FAILED_WEBHOOK" || eventType === "PAYMENT_USER_DROPPED_WEBHOOK") {
    await admin
      .from("payment_orders")
      .update({ status: "failed" })
      .eq("id", order.id)
      .neq("status", "paid");
    return json({ ok: true, recorded: true });
  }

  if (eventType !== "PAYMENT_SUCCESS_WEBHOOK") {
    return json({ ok: true, ignored: true, event: eventType });
  }

  if (paymentStatus !== "SUCCESS") {
    return json({ ok: false, error: "PAYMENT_NOT_SUCCESS" }, 422);
  }

  // Amount check: the paid amount must match the order we created.
  // (The gateway is never trusted for the price.)
  if (
    paymentAmount === null ||
    !Number.isFinite(paymentAmount) ||
    Math.abs(paymentAmount - Number(order.amount)) > 0.01
  ) {
    console.error(
      "[cashfree-payments] amount mismatch",
      gatewayOrderId,
      paymentAmount,
      order.amount,
    );
    return json({ ok: false, error: "AMOUNT_MISMATCH" }, 422);
  }

  // Server-side verification: confirm the payment against Cashfree
  // before granting anything. A failed lookup returns 5xx so Cashfree
  // retries the webhook instead of us granting on an unverified event.
  const verifyRes = await cashfreeFetch(
    cfg,
    `/orders/${encodeURIComponent(gatewayOrderId)}/payments`,
  );
  const payments: unknown[] = Array.isArray(verifyRes.body) ? verifyRes.body : [];
  const confirmed = payments.some((p) => {
    if (!isRecord(p)) return false;
    return String(p.cf_payment_id) === cfPaymentId &&
      p.payment_status === "SUCCESS";
  });
  if (!verifyRes.ok) {
    console.error(
      "[cashfree-payments] Cashfree payment verification failed",
      verifyRes.status,
    );
    return json({ ok: false, error: "VERIFICATION_UNAVAILABLE" }, 502);
  }
  if (!confirmed) {
    console.error(
      "[cashfree-payments] payment not confirmed by Cashfree",
      gatewayOrderId,
      cfPaymentId,
    );
    return json({ ok: false, error: "PAYMENT_NOT_CONFIRMED" }, 422);
  }

  const paidUpdate: Record<string, unknown> = { status: "paid" };
  if (typeof orderObj.cf_order_id === "string") {
    paidUpdate.cf_order_id = orderObj.cf_order_id;
  }
  const { error: paidError } = await admin
    .from("payment_orders")
    .update(paidUpdate)
    .eq("id", order.id);
  if (paidError) {
    console.error("[cashfree-payments] marking order paid failed", paidError.message);
    return json({ ok: false, error: "ORDER_UPDATE_FAILED" }, 500);
  }

  // Grant enrolment server-side. The RPC is idempotent, so a retried
  // webhook cannot double-enrol (and the cf_payment_id check above
  // stops replays earlier still).
  const { error: grantError } = await admin.rpc("grant_paid_enrollment", {
    p_payment_order_id: order.id,
  });
  if (grantError) {
    console.error("[cashfree-payments] grant enrolment failed", grantError.message);
    return json({ ok: false, error: "GRANT_FAILED" }, 500);
  }

  return json({ ok: true, granted: true });
}

// ---------- Router ----------

Deno.serve(async (req: Request) => {
  try {
    const url = new URL(req.url);
    const segments = url.pathname.split("/").filter(Boolean);
    // /functions/v1/cashfree-payments[/webhook]
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
    console.error("[cashfree-payments] unhandled error", e);
    return json({ ok: false, error: "INTERNAL_ERROR" }, 500);
  }
});
