// =====================================================================
// paypal-payments — PayPal integration for Kaveri Academy
//
// Mirrors cashfree-payments: same route shape, same guarantees.
//
//   Browser (student)            Edge function (this file)
//     → POST /functions/v1/paypal-payments  { action: "create-order", courseId }
//       (authenticated: the caller's Supabase JWT is verified here;
//        the gateway JWT check is off — see config.toml — because the
//        webhook route below cannot carry a Supabase JWT)
//       → creates a PayPal order, returns its approve URL
//     → browser redirects to the PayPal approve URL
//       (src/lib/payments.ts — plain redirect, no SDK needed)
//   PayPal
//     → POST /functions/v1/paypal-payments/webhook   (server only)
//       Verified by postback (see verifyWebhookSignature below); on
//       CHECKOUT.ORDER.COMPLETED the order is re-verified against
//       PayPal server-side, then enrolment is granted via the
//       grant_paid_enrollment RPC. The webhook is the ONLY thing
//       that marks an order paid — the browser redirect is UX, not
//       truth. Never fulfil on the return_url alone.
//
// Environment (Supabase function secrets — never in the repo):
//   PAYPAL_TEST_CLIENT_ID     Sandbox REST app Client ID.
//   PAYPAL_TEST_CLIENT_SECRET Sandbox REST app Client Secret.
//   PAYPAL_TEST_WEBHOOK_ID    Webhook ID assigned when the listener
//                             URL was subscribed in the PayPal
//                             Developer Dashboard (different per app,
//                             per URL, sandbox vs live).
//   LMS_PUBLIC_URL            Required for PayPal: the return and
//                             cancel URLs of the order are built from
//                             it (e.g. https://kaveri-academy.vercel.app).
//   SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY
//                             Injected by the Supabase runtime.
//
// Test mode by design (v1): the env names carry the TEST prefix on
// purpose. Production activation is a separate, deliberate step: new
// env names (PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET /
// PAYPAL_WEBHOOK_ID with live values), a live REST app, and a live
// webhook subscription — switched on by setting
// gateway_settings.mode = 'live' in Admin → Payment Settings. The
// webhook listener must be HTTPS on port 443. No checkout domain
// whitelist is required by PayPal. Without the gateway_settings
// table the function falls back to sandbox + USD, so it keeps
// working on older installs.
//
// IMPORTANT — India: PayPal India supports INTERNATIONAL payments
// only. Domestic India-to-India payments are NOT supported. An
// Indian academy can therefore only take PayPal from students
// paying from outside India, in a foreign currency (USD here).
// Currency conversion on receipt costs ~3% above the base rate.
//
// Money model: single academy merchant account. The price is ALWAYS
// read server-side from courses.price — the client never sends an
// amount. Currency is USD for PayPal (see gateway_settings). A price
// only has effect on approval_required courses (same rule as
// Cashfree v1).
//
// PayPal docs used (checked 2026-11-14):
//   Orders API v2 — POST /v2/checkout/orders {intent: CAPTURE,
//     purchase_units: [{reference_id, amount: {currency_code,
//     value}}], payment_source: {paypal: {experience_context:
//     {return_url, cancel_url}}}}. Returns id + links (rel=approve).
//     Capture status (not just order status) is the authoritative
//     money-moved signal.
//   OAuth2 — POST /v1/oauth2/token (Basic client_id:secret,
//     grant_type=client_credentials) → access_token.
//   Webhooks — verification by postback: POST
//     /v1/notifications/verify-webhook-signature {auth_algo,
//     cert_url, transmission_id, transmission_sig, transmission_time,
//     webhook_id, webhook_event}; accept only verification_status
//     "SUCCESS". Events: CHECKOUT.ORDER.COMPLETED,
//     PAYMENT.CAPTURE.COMPLETED. Retries up to 25 times over 3 days;
//     simulator mock events cannot pass postback verification.
//   Sandbox base URL: https://api-m.sandbox.paypal.com
//   (live: https://api-m.paypal.com).
// =====================================================================

import { createClient } from "npm:@supabase/supabase-js@2.57.4";

type AdminClient = ReturnType<typeof createClient>;

type JsonObject = Record<string, unknown>;

function isRecord(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const PAYPAL_SANDBOX_BASE_URL = "https://api-m.sandbox.paypal.com";
const PAYPAL_LIVE_BASE_URL = "https://api-m.paypal.com";
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

type PayPalConfig = {
  clientId: string;
  clientSecret: string;
  webhookId: string;
  publicUrl: string;
  baseUrl: string;
  mode: "sandbox" | "production";
};

function getPayPalConfig(mode: "sandbox" | "live"): PayPalConfig | { error: string } {
  // Test and live use different secret names on purpose: the mode in
  // gateway_settings picks which set (and which API host) the
  // function uses. Live activation is a separate step (live app +
  // live webhook id).
  const names = mode === "live"
    ? { clientId: "PAYPAL_CLIENT_ID", clientSecret: "PAYPAL_CLIENT_SECRET", webhookId: "PAYPAL_WEBHOOK_ID" }
    : { clientId: "PAYPAL_TEST_CLIENT_ID", clientSecret: "PAYPAL_TEST_CLIENT_SECRET", webhookId: "PAYPAL_TEST_WEBHOOK_ID" };
  const clientId = env(names.clientId);
  const clientSecret = env(names.clientSecret);
  const webhookId = env(names.webhookId);
  const publicUrl = env("LMS_PUBLIC_URL")?.replace(/\/$/, "");
  if (!clientId || !clientSecret || !webhookId) {
    return {
      error:
        `PayPal is not configured: set ${names.clientId}, ${names.clientSecret} and ${names.webhookId} as function secrets.`,
    };
  }
  if (!publicUrl) {
    return {
      error:
        "PayPal is not configured: set LMS_PUBLIC_URL as a function secret (needed for order return/cancel URLs).",
    };
  }
  return {
    clientId,
    clientSecret,
    webhookId,
    publicUrl,
    baseUrl: mode === "live" ? PAYPAL_LIVE_BASE_URL : PAYPAL_SANDBOX_BASE_URL,
    mode: mode === "live" ? "production" : "sandbox",
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

// ---------- PayPal API ----------

/**
 * Non-secret gateway settings (mode + currency) from gateway_settings
 * when the v2 migration has been applied; falls back to sandbox + USD
 * (PayPal India is international payments only) when the table or
 * row is missing, so the function keeps working on installs without
 * the migration.
 */
async function getGatewaySettings(
  admin: AdminClient,
  fallbackCurrency: string,
): Promise<{ mode: "sandbox" | "live"; currency: string }> {
  try {
    const { data } = await admin
      .from("gateway_settings")
      .select("mode, currency")
      .eq("gateway", "paypal")
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

async function getAccessToken(
  cfg: PayPalConfig,
): Promise<string | null> {
  const res = await fetch(`${cfg.baseUrl}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      authorization: `Basic ${btoa(`${cfg.clientId}:${cfg.clientSecret}`)}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) {
    console.error("[paypal-payments] OAuth token failed", res.status);
    return null;
  }
  const parsed: unknown = await res.json();
  const body: JsonObject = isRecord(parsed) ? parsed : {};
  return typeof body.access_token === "string" ? body.access_token : null;
}

async function paypalFetch(
  cfg: PayPalConfig,
  accessToken: string,
  path: string,
  init?: RequestInit,
): Promise<{ ok: boolean; status: number; body: unknown }> {
  const res = await fetch(`${cfg.baseUrl}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
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

// ---------- Webhook verification (PayPal postback) ----------

async function verifyWebhookSignature(
  cfg: PayPalConfig,
  accessToken: string,
  req: Request,
  rawBody: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const authAlgo = req.headers.get("paypal-auth-algo");
  const certUrl = req.headers.get("paypal-cert-url");
  const transmissionId = req.headers.get("paypal-transmission-id");
  const transmissionSig = req.headers.get("paypal-transmission-sig");
  const transmissionTime = req.headers.get("paypal-transmission-time");
  if (!authAlgo || !certUrl || !transmissionId || !transmissionSig || !transmissionTime) {
    return { ok: false, reason: "Missing PayPal webhook headers" };
  }
  let event: unknown;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return { ok: false, reason: "INVALID_JSON" };
  }
  const res = await paypalFetch(cfg, accessToken, "/v1/notifications/verify-webhook-signature", {
    method: "POST",
    body: JSON.stringify({
      auth_algo: authAlgo,
      cert_url: certUrl,
      transmission_id: transmissionId,
      transmission_sig: transmissionSig,
      transmission_time: transmissionTime,
      webhook_id: cfg.webhookId,
      webhook_event: event,
    }),
  });
  const body: JsonObject = isRecord(res.body) ? res.body : {};
  if (!res.ok) {
    console.error(
      "[paypal-payments] webhook verification call failed",
      res.status,
      JSON.stringify(body)?.slice(0, 300),
    );
    return { ok: false, reason: "Verification call failed" };
  }
  if (body.verification_status !== "SUCCESS") {
    return { ok: false, reason: "Verification status not SUCCESS" };
  }
  return { ok: true };
}

// ---------- Route: create-order ----------

async function handleCreateOrder(req: Request): Promise<Response> {
  const admin = getAdminClient();
  const settings = await getGatewaySettings(admin, "USD");
  const cfg = getPayPalConfig(settings.mode);
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

  const gatewayOrderId =
    `pp_${crypto.randomUUID().replaceAll("-", "").slice(0, 24)}`;
  // PayPal for Indian merchants is USD, international only.
  const currency = settings.currency;

  const { data: orderRow, error: orderError } = await admin
    .from("payment_orders")
    .insert({
      course_id: course.id,
      student_id: user.id,
      amount,
      currency,
      gateway: "paypal",
      gateway_order_id: gatewayOrderId,
      status: "created",
    })
    .select("id")
    .single();
  if (orderError || !orderRow) {
    console.error("[paypal-payments] order row insert failed", orderError?.message);
    return json({ ok: false, error: "ORDER_CREATE_FAILED" }, 500);
  }

  const accessToken = await getAccessToken(cfg);
  if (!accessToken) {
    await admin
      .from("payment_orders")
      .update({ status: "failed" })
      .eq("id", orderRow.id);
    return json({ ok: false, error: "GATEWAY_ERROR", message: "PayPal could not start checkout." }, 502);
  }

  const ppRes = await paypalFetch(cfg, accessToken, "/v2/checkout/orders", {
    method: "POST",
    body: JSON.stringify({
      intent: "CAPTURE",
      purchase_units: [
        {
          reference_id: gatewayOrderId,
          description: `Course enrolment: ${String(course.title).slice(0, 120)}`,
          amount: {
            currency_code: currency,
            value: amount.toFixed(2),
          },
        },
      ],
      payment_source: {
        paypal: {
          experience_context: {
            return_url: `${cfg.publicUrl}/courses/${course.slug}?payment=return&order=${gatewayOrderId}`,
            cancel_url: `${cfg.publicUrl}/courses/${course.slug}?payment=cancelled`,
          },
        },
      },
    }),
  });

  const ppBody: JsonObject = isRecord(ppRes.body) ? ppRes.body : {};
  const paypalOrderId = typeof ppBody.id === "string" ? ppBody.id : null;
  const links: unknown[] = Array.isArray(ppBody.links) ? ppBody.links : [];
  const approveLink = links.find(
    (l) => isRecord(l) && l.rel === "approve" && typeof l.href === "string",
  ) as JsonObject | undefined;
  const approveUrl = approveLink ? String(approveLink.href) : null;
  if (!ppRes.ok || !paypalOrderId || !approveUrl) {
    console.error(
      "[paypal-payments] PayPal create order failed",
      ppRes.status,
      JSON.stringify(ppRes.body)?.slice(0, 500),
    );
    await admin
      .from("payment_orders")
      .update({ status: "failed" })
      .eq("id", orderRow.id);
    return json({ ok: false, error: "GATEWAY_ERROR", message: "PayPal could not start checkout." }, 502);
  }

  // cf_order_id is the generic gateway-assigned order id column
  // (shared with Cashfree); the webhook resolves the order through it.
  await admin
    .from("payment_orders")
    .update({ cf_order_id: paypalOrderId })
    .eq("id", orderRow.id);

  // The secret is never returned. Only the PayPal approve URL goes
  // to the browser.
  return json({
    ok: true,
    orderId: orderRow.id,
    gatewayOrderId,
    providerOrderId: paypalOrderId,
    paymentSessionId: null,
    redirectUrl: approveUrl,
    publishableKey: null,
    amount,
    currency,
    gateway: "paypal",
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
    gateway: "paypal",
    cf_payment_id: row.gateway_payment_id,
    event_type: row.event_type,
    gateway_status: row.gateway_status,
    amount: row.amount,
    currency: row.currency,
    signature_valid: true,
    raw_payload: row.raw_payload,
  });
  if (error) {
    console.error("[paypal-payments] transaction record failed", error.message);
  }
}

async function handleWebhook(req: Request): Promise<Response> {
  if (req.method !== "POST") {
    return json({ ok: false, error: "METHOD_NOT_ALLOWED" }, 405);
  }
  const admin = getAdminClient();
  const settings = await getGatewaySettings(admin, "USD");
  const cfg = getPayPalConfig(settings.mode);
  if ("error" in cfg) {
    // Cannot verify without the secrets: fail closed so PayPal retries.
    return json({ ok: false, error: "CONFIGURATION_ERROR" }, 503);
  }

  // The raw body is the signed material — read it before any parsing.
  const rawBody = await req.text();

  const accessToken = await getAccessToken(cfg);
  if (!accessToken) {
    // Cannot verify without a token: 5xx so PayPal retries.
    return json({ ok: false, error: "VERIFICATION_UNAVAILABLE" }, 502);
  }
  const verified = await verifyWebhookSignature(cfg, accessToken, req, rawBody);
  if (verified.ok === false) {
    console.error("[paypal-payments] webhook rejected:", verified.reason);
    return json({ ok: false, error: "INVALID_SIGNATURE" }, 401);
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return json({ ok: false, error: "INVALID_JSON" }, 400);
  }

  const root: JsonObject = isRecord(payload) ? payload : {};
  const eventType = typeof root.event_type === "string" ? root.event_type : "UNKNOWN";
  const resource: JsonObject = isRecord(root.resource) ? root.resource : {};
  // CHECKOUT.ORDER.COMPLETED: resource.id is the PayPal order id.
  // PAYMENT.CAPTURE.COMPLETED: resource.id is the capture id and the
  // order id lives in supplementary_data.related_ids.order_id.
  const supplementary: JsonObject = isRecord(resource.supplementary_data)
    ? resource.supplementary_data
    : {};
  const related: JsonObject = isRecord(supplementary.related_ids) ? supplementary.related_ids : {};
  const paypalOrderId =
    eventType === "CHECKOUT.ORDER.COMPLETED"
      ? (typeof resource.id === "string" ? resource.id : null)
      : (typeof related.order_id === "string" ? related.order_id : null);
  const captureId =
    eventType === "PAYMENT.CAPTURE.COMPLETED"
      ? (typeof resource.id === "string" ? resource.id : null)
      : null;
  const captureStatus = typeof resource.status === "string" ? resource.status : null;
  const amountObj: JsonObject = isRecord(resource.amount) ? resource.amount : {};
  const amountValue = amountObj.value != null ? Number(amountObj.value) : null;
  const amountCurrency = typeof amountObj.currency_code === "string"
    ? amountObj.currency_code
    : null;

  if (!paypalOrderId) {
    return json({ ok: true, ignored: true, reason: "No order id in payload" });
  }
  const { data: order, error: orderError } = await admin
    .from("payment_orders")
    .select("id, course_id, student_id, amount, currency, status")
    .eq("gateway", "paypal")
    .eq("cf_order_id", paypalOrderId)
    .maybeSingle();
  if (orderError || !order) {
    console.error("[paypal-payments] webhook for unknown order", paypalOrderId);
    return json({ ok: true, ignored: true, reason: "Unknown order" });
  }

  // Idempotency: a replayed delivery carries the same capture id
  // (or the same order id for CHECKOUT.ORDER.COMPLETED).
  const dedupeId = captureId ?? paypalOrderId;
  const { data: seen } = await admin
    .from("payment_transactions")
    .select("id")
    .eq("gateway", "paypal")
    .eq("cf_payment_id", dedupeId)
    .maybeSingle();
  if (seen) {
    return json({ ok: true, duplicate: true });
  }

  await recordTransaction(admin, {
    payment_order_id: order.id,
    gateway_payment_id: dedupeId,
    event_type: eventType,
    gateway_status: captureStatus,
    amount: amountValue,
    currency: amountCurrency,
    raw_payload: payload,
  });

  if (eventType !== "CHECKOUT.ORDER.COMPLETED" && eventType !== "PAYMENT.CAPTURE.COMPLETED") {
    return json({ ok: true, ignored: true, event: eventType });
  }

  // Amount check: the captured amount must match the order we created.
  // For CHECKOUT.ORDER.COMPLETED the resource amount is the order
  // amount; for PAYMENT.CAPTURE.COMPLETED it is the capture amount.
  if (
    amountValue === null ||
    !Number.isFinite(amountValue) ||
    Math.abs(amountValue - Number(order.amount)) > 0.01
  ) {
    console.error(
      "[paypal-payments] amount mismatch",
      paypalOrderId,
      amountValue,
      order.amount,
    );
    return json({ ok: false, error: "AMOUNT_MISMATCH" }, 422);
  }

  // Server-side verification: confirm the order against PayPal
  // before granting anything. The capture status — not just the
  // order status — is the authoritative money-moved signal.
  const verifyRes = await paypalFetch(
    cfg,
    accessToken,
    `/v2/checkout/orders/${encodeURIComponent(paypalOrderId)}`,
  );
  const verifyBody: JsonObject = isRecord(verifyRes.body) ? verifyRes.body : {};
  if (!verifyRes.ok) {
    console.error(
      "[paypal-payments] PayPal order verification failed",
      verifyRes.status,
    );
    return json({ ok: false, error: "VERIFICATION_UNAVAILABLE" }, 502);
  }
  const units: unknown[] = Array.isArray(verifyBody.purchase_units)
    ? verifyBody.purchase_units
    : [];
  const firstUnit: JsonObject = units.length > 0 && isRecord(units[0]) ? units[0] : {};
  const payments: JsonObject = isRecord(firstUnit.payments) ? firstUnit.payments : {};
  const captures: unknown[] = Array.isArray(payments.captures) ? payments.captures : [];
  const confirmed = verifyBody.status === "COMPLETED" &&
    captures.some((c) => isRecord(c) && c.status === "COMPLETED");
  if (!confirmed) {
    console.error(
      "[paypal-payments] order not confirmed by PayPal",
      paypalOrderId,
      verifyBody.status,
    );
    return json({ ok: false, error: "PAYMENT_NOT_CONFIRMED" }, 422);
  }

  const { error: paidError } = await admin
    .from("payment_orders")
    .update({ status: "paid" })
    .eq("id", order.id);
  if (paidError) {
    console.error("[paypal-payments] marking order paid failed", paidError.message);
    return json({ ok: false, error: "ORDER_UPDATE_FAILED" }, 500);
  }

  // Grant enrolment server-side. The RPC is idempotent, so a retried
  // webhook cannot double-enrol (and the capture-id check above
  // stops replays earlier still).
  const { error: grantError } = await admin.rpc("grant_paid_enrollment", {
    p_payment_order_id: order.id,
  });
  if (grantError) {
    console.error("[paypal-payments] grant enrolment failed", grantError.message);
    return json({ ok: false, error: "GRANT_FAILED" }, 500);
  }

  return json({ ok: true, granted: true });
}

// ---------- Router ----------

Deno.serve(async (req: Request) => {
  try {
    const url = new URL(req.url);
    const segments = url.pathname.split("/").filter(Boolean);
    // /functions/v1/paypal-payments[/webhook]
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
    console.error("[paypal-payments] unhandled error", e);
    return json({ ok: false, error: "INTERNAL_ERROR" }, 500);
  }
});
