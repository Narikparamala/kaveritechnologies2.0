// =====================================================================
// stripe-payments — Stripe integration for Kaveri Academy
//
// Mirrors cashfree-payments: same route shape, same guarantees.
//
//   Browser (student)            Edge function (this file)
//     → POST /functions/v1/stripe-payments  { action: "create-order", courseId }
//       (authenticated: the caller's Supabase JWT is verified here;
//        the gateway JWT check is off — see config.toml — because the
//        webhook route below cannot carry a Supabase JWT)
//       → creates a Stripe Checkout Session, returns its hosted URL
//     → browser redirects to the Stripe hosted checkout page
//       (src/lib/payments.ts — plain redirect, no SDK needed)
//   Stripe
//     → POST /functions/v1/stripe-payments/webhook   (server only)
//       Stripe-Signature verified against the raw body (see
//       verifyWebhookSignature below); on checkout.session.completed
//       the session is re-verified against Stripe server-side, then
//       enrolment is granted via the grant_paid_enrollment RPC. The
//       webhook is the ONLY thing that marks an order paid — the
//       browser redirect is UX, not truth. Never fulfil on the
//       success_url return alone.
//
// Environment (Supabase function secrets — never in the repo):
//   STRIPE_TEST_SECRET_KEY    Test secret key (sk_test_...).
//   STRIPE_TEST_WEBHOOK_SECRET
//                             Endpoint signing secret (whsec_...) for
//                             the webhook endpoint registered in the
//                             Stripe dashboard. Test and live endpoints
//                             have DIFFERENT secrets.
//   Live mode (gateway_settings.mode = 'live') reads instead:
//   STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET.
//   The mode + currency come from the gateway_settings row (set in
//   Admin → Payment Settings); without that table the function falls
//   back to sandbox + INR, so it keeps working on older installs.
//   LMS_PUBLIC_URL            Required for Stripe: the success and
//                             cancel URLs of the Checkout Session are
//                             built from it (e.g.
//                             https://kaveri-academy.vercel.app).
//   SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY
//                             Injected by the Supabase runtime.
//
// Test mode by design (v1): the env names carry the TEST prefix on
// purpose. Production activation is a separate, deliberate step: new
// env names (STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET with live
// values), a live webhook endpoint, and live keys. No checkout
// domain whitelist is required by Stripe.
//
// IMPORTANT — India: Stripe is invite-only for new Indian businesses
// (Stripe Support, 2026). New India accounts cannot self-sign-up;
// existing active India accounts keep working. Verify the account
// can accept payments before going live. Domestic UPI via Checkout
// for India accounts is not confirmed — verify against the specific
// account; do not assume it.
//
// Money model: single academy merchant account. The price is ALWAYS
// read server-side from courses.price — the client never sends an
// amount. Amounts go to Stripe in the smallest currency unit
// (paise for INR, cents for USD). A price only has effect on
// approval_required courses (same rule as Cashfree v1).
//
// Stripe docs used (checked 2026-11-14):
//   Checkout Sessions  POST /v1/checkout/sessions (form-encoded) —
//     mode=payment, line_items[0][price_data][currency],
//     [price_data][unit_amount], [price_data][product_data][name],
//     success_url, cancel_url. Returns url (hosted page).
//   Webhooks — header Stripe-Signature: t=<unix>,v1=<hex>;
//     signed payload = timestamp + "." + rawBody; HMAC-SHA256 hex
//     with the endpoint secret; 5-minute tolerance (do not set 0).
//     Events: checkout.session.completed is the fulfilment event;
//     checkout.session.async_payment_succeeded covers delayed
//     methods. Dedupe by event id; return 2xx quickly.
//   Test cards: 4242 4242 4242 4242 (success).
// =====================================================================

import { createClient } from "npm:@supabase/supabase-js@2.57.4";

type AdminClient = ReturnType<typeof createClient>;

type JsonObject = Record<string, unknown>;

function isRecord(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const STRIPE_BASE_URL = "https://api.stripe.com/v1";
const WEBHOOK_MAX_AGE_SECONDS = 5 * 60;
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

type StripeConfig = {
  secretKey: string;
  webhookSecret: string;
  publicUrl: string;
  mode: "sandbox" | "production";
};

function getStripeConfig(mode: "sandbox" | "live"): StripeConfig | { error: string } {
  // Test and live use different secret names on purpose: the mode in
  // gateway_settings picks which set the function reads. Live
  // activation is a separate step (live keys + live webhook endpoint).
  const names = mode === "live"
    ? { secretKey: "STRIPE_SECRET_KEY", webhookSecret: "STRIPE_WEBHOOK_SECRET" }
    : { secretKey: "STRIPE_TEST_SECRET_KEY", webhookSecret: "STRIPE_TEST_WEBHOOK_SECRET" };
  const secretKey = env(names.secretKey);
  const webhookSecret = env(names.webhookSecret);
  const publicUrl = env("LMS_PUBLIC_URL")?.replace(/\/$/, "");
  if (!secretKey || !webhookSecret) {
    return {
      error:
        `Stripe is not configured: set ${names.secretKey} and ${names.webhookSecret} as function secrets.`,
    };
  }
  if (!publicUrl) {
    return {
      error:
        "Stripe is not configured: set LMS_PUBLIC_URL as a function secret (needed for Checkout success/cancel URLs).",
    };
  }
  return {
    secretKey,
    webhookSecret,
    publicUrl,
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

// ---------- Stripe API (form-encoded) ----------

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
      .eq("gateway", "stripe")
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

async function stripeFetch(
  cfg: StripeConfig,
  path: string,
  form?: URLSearchParams,
  method = "POST",
): Promise<{ ok: boolean; status: number; body: unknown }> {
  const res = await fetch(`${STRIPE_BASE_URL}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${cfg.secretKey}`,
      ...(form ? { "content-type": "application/x-www-form-urlencoded" } : {}),
    },
    ...(form ? { body: form.toString() } : {}),
  });
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  return { ok: res.ok, status: res.status, body };
}

async function stripeGet(
  cfg: StripeConfig,
  path: string,
): Promise<{ ok: boolean; status: number; body: unknown }> {
  return await stripeFetch(cfg, path, undefined, "GET");
}

// ---------- Webhook signature (Stripe HMAC-SHA256 hex) ----------

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
  const header = req.headers.get("stripe-signature");
  if (!header) {
    return { ok: false, reason: "Missing Stripe-Signature header" };
  }
  // Format: t=<unix timestamp>,v1=<hex>[,v1=<hex>...]. Only v1 counts.
  const parts = header.split(",").map((p) => p.trim());
  const timestamp = parts.find((p) => p.startsWith("t="))?.slice(2) ?? "";
  const signatures = parts
    .filter((p) => p.startsWith("v1="))
    .map((p) => p.slice(3));
  if (!/^\d+$/.test(timestamp) || signatures.length === 0) {
    return { ok: false, reason: "Malformed Stripe-Signature header" };
  }
  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (age > WEBHOOK_MAX_AGE_SECONDS) {
    return { ok: false, reason: "Stale webhook timestamp" };
  }
  // Signed payload: timestamp + "." + raw body (no other separator).
  const expected = await hmacSha256Hex(secret, `${timestamp}.${rawBody}`);
  for (const sig of signatures) {
    if (await timingSafeEqual(expected, sig)) return { ok: true };
  }
  return { ok: false, reason: "Signature mismatch" };
}

// ---------- Route: create-order ----------

async function handleCreateOrder(req: Request): Promise<Response> {
  const admin = getAdminClient();
  const settings = await getGatewaySettings(admin, "INR");
  const cfg = getStripeConfig(settings.mode);
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
    `str_${crypto.randomUUID().replaceAll("-", "").slice(0, 24)}`;
  const currency = settings.currency;
  const amountMinor = Math.round(amount * 100);

  const { data: orderRow, error: orderError } = await admin
    .from("payment_orders")
    .insert({
      course_id: course.id,
      student_id: user.id,
      amount,
      currency,
      gateway: "stripe",
      gateway_order_id: gatewayOrderId,
      status: "created",
    })
    .select("id")
    .single();
  if (orderError || !orderRow) {
    console.error("[stripe-payments] order row insert failed", orderError?.message);
    return json({ ok: false, error: "ORDER_CREATE_FAILED" }, 500);
  }

  const form = new URLSearchParams();
  form.set("mode", "payment");
  form.set("client_reference_id", gatewayOrderId);
  form.set("customer_email", user.email ?? "");
  form.set("line_items[0][quantity]", "1");
  form.set("line_items[0][price_data][currency]", currency.toLowerCase());
  form.set("line_items[0][price_data][unit_amount]", String(amountMinor));
  form.set(
    "line_items[0][price_data][product_data][name]",
    `Course enrolment: ${String(course.title).slice(0, 180)}`,
  );
  form.set("metadata[order_id]", gatewayOrderId);
  form.set("metadata[course_id]", String(course.id));
  form.set(
    "success_url",
    `${cfg.publicUrl}/courses/${course.slug}?payment=return&order=${gatewayOrderId}`,
  );
  form.set("cancel_url", `${cfg.publicUrl}/courses/${course.slug}?payment=cancelled`);

  const stRes = await stripeFetch(cfg, "/checkout/sessions", form);
  const stBody: JsonObject = isRecord(stRes.body) ? stRes.body : {};
  const sessionId = typeof stBody.id === "string" ? stBody.id : null;
  const sessionUrl = typeof stBody.url === "string" ? stBody.url : null;
  if (!stRes.ok || !sessionId || !sessionUrl) {
    console.error(
      "[stripe-payments] Stripe create session failed",
      stRes.status,
      JSON.stringify(stRes.body)?.slice(0, 500),
    );
    await admin
      .from("payment_orders")
      .update({ status: "failed" })
      .eq("id", orderRow.id);
    return json({ ok: false, error: "GATEWAY_ERROR", message: "Stripe could not start checkout." }, 502);
  }

  // cf_order_id is the generic gateway-assigned order id column
  // (shared with Cashfree); the webhook resolves the order through it.
  await admin
    .from("payment_orders")
    .update({ cf_order_id: sessionId })
    .eq("id", orderRow.id);

  // The secret is never returned. Only the hosted checkout URL goes
  // to the browser.
  return json({
    ok: true,
    orderId: orderRow.id,
    gatewayOrderId,
    providerOrderId: sessionId,
    paymentSessionId: null,
    redirectUrl: sessionUrl,
    publishableKey: null,
    amount,
    currency,
    gateway: "stripe",
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
    gateway: "stripe",
    cf_payment_id: row.gateway_payment_id,
    event_type: row.event_type,
    gateway_status: row.gateway_status,
    amount: row.amount,
    currency: row.currency,
    signature_valid: true,
    raw_payload: row.raw_payload,
  });
  if (error) {
    console.error("[stripe-payments] transaction record failed", error.message);
  }
}

async function handleWebhook(req: Request): Promise<Response> {
  if (req.method !== "POST") {
    return json({ ok: false, error: "METHOD_NOT_ALLOWED" }, 405);
  }
  const admin = getAdminClient();
  const settings = await getGatewaySettings(admin, "INR");
  const cfg = getStripeConfig(settings.mode);
  if ("error" in cfg) {
    // Cannot verify without the secret: fail closed so Stripe retries.
    return json({ ok: false, error: "CONFIGURATION_ERROR" }, 503);
  }

  // The raw body is the signed material — read it before any parsing.
  const rawBody = await req.text();
  const verified = await verifyWebhookSignature(req, rawBody, cfg.webhookSecret);
  if (verified.ok === false) {
    console.error("[stripe-payments] webhook rejected:", verified.reason);
    return json({ ok: false, error: "INVALID_SIGNATURE" }, 401);
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return json({ ok: false, error: "INVALID_JSON" }, 400);
  }

  const root: JsonObject = isRecord(payload) ? payload : {};
  const eventId = typeof root.id === "string" ? root.id : null;
  const eventType = typeof root.type === "string" ? root.type : "UNKNOWN";
  const dataObj: JsonObject = isRecord(root.data) ? root.data : {};
  const session: JsonObject = isRecord(dataObj.object) ? dataObj.object : {};
  const sessionId = typeof session.id === "string" ? session.id : null;
  const clientRef = typeof session.client_reference_id === "string"
    ? session.client_reference_id
    : null;
  const paymentIntentId = typeof session.payment_intent === "string"
    ? session.payment_intent
    : null;
  const paymentStatus = typeof session.payment_status === "string"
    ? session.payment_status
    : null;
  const amountTotal = session.amount_total != null ? Number(session.amount_total) : null;
  const sessionCurrency = typeof session.currency === "string"
    ? session.currency.toUpperCase()
    : null;

  // Idempotency by Stripe event id: a replayed delivery carries the
  // same event id. Store it in raw_payload and check the transaction
  // rows for this gateway + event type + session.
  if (eventId && sessionId) {
    const { data: seen } = await admin
      .from("payment_transactions")
      .select("id")
      .eq("gateway", "stripe")
      .eq("cf_payment_id", paymentIntentId ?? sessionId)
      .maybeSingle();
    if (seen) {
      return json({ ok: true, duplicate: true });
    }
  }

  // Resolve our order: client_reference_id is our gateway_order_id.
  const refToMatch = clientRef ?? sessionId;
  if (!refToMatch) {
    return json({ ok: true, ignored: true, reason: "No order reference in payload" });
  }
  const { data: order, error: orderError } = await admin
    .from("payment_orders")
    .select("id, course_id, student_id, amount, currency, status")
    .eq("gateway", "stripe")
    .eq("gateway_order_id", refToMatch)
    .maybeSingle();
  let resolvedOrder = order;
  if ((orderError || !resolvedOrder) && sessionId) {
    // Fall back to the session id stored in cf_order_id.
    const { data: bySession } = await admin
      .from("payment_orders")
      .select("id, course_id, student_id, amount, currency, status")
      .eq("gateway", "stripe")
      .eq("cf_order_id", sessionId)
      .maybeSingle();
    resolvedOrder = bySession ?? null;
  }
  if (!resolvedOrder) {
    console.error("[stripe-payments] webhook for unknown order", refToMatch);
    return json({ ok: true, ignored: true, reason: "Unknown order" });
  }

  await recordTransaction(admin, {
    payment_order_id: resolvedOrder.id,
    gateway_payment_id: paymentIntentId ?? sessionId,
    event_type: eventType,
    gateway_status: paymentStatus,
    amount: amountTotal != null ? amountTotal / 100 : null,
    currency: sessionCurrency,
    raw_payload: payload,
  });

  if (eventType === "checkout.session.async_payment_failed") {
    await admin
      .from("payment_orders")
      .update({ status: "failed" })
      .eq("id", resolvedOrder.id)
      .neq("status", "paid");
    return json({ ok: true, recorded: true });
  }

  if (
    eventType !== "checkout.session.completed" &&
    eventType !== "checkout.session.async_payment_succeeded"
  ) {
    return json({ ok: true, ignored: true, event: eventType });
  }

  if (paymentStatus !== "paid") {
    return json({ ok: false, error: "PAYMENT_NOT_PAID" }, 422);
  }

  // Amount check: the paid amount must match the order we created.
  if (
    amountTotal === null ||
    !Number.isFinite(amountTotal) ||
    Math.abs(amountTotal - Math.round(Number(resolvedOrder.amount) * 100)) > 1
  ) {
    console.error(
      "[stripe-payments] amount mismatch",
      sessionId,
      amountTotal,
      resolvedOrder.amount,
    );
    return json({ ok: false, error: "AMOUNT_MISMATCH" }, 422);
  }

  // Server-side verification: confirm the session against Stripe
  // before granting anything.
  if (!sessionId) {
    return json({ ok: false, error: "PAYMENT_NOT_CONFIRMED" }, 422);
  }
  const verifyRes = await stripeGet(
    cfg,
    `/checkout/sessions/${encodeURIComponent(sessionId)}`,
  );
  const verifyBody: JsonObject = isRecord(verifyRes.body) ? verifyRes.body : {};
  if (!verifyRes.ok) {
    console.error(
      "[stripe-payments] Stripe session verification failed",
      verifyRes.status,
    );
    return json({ ok: false, error: "VERIFICATION_UNAVAILABLE" }, 502);
  }
  if (verifyBody.payment_status !== "paid") {
    console.error(
      "[stripe-payments] session not confirmed by Stripe",
      sessionId,
    );
    return json({ ok: false, error: "PAYMENT_NOT_CONFIRMED" }, 422);
  }

  const { error: paidError } = await admin
    .from("payment_orders")
    .update({ status: "paid" })
    .eq("id", resolvedOrder.id);
  if (paidError) {
    console.error("[stripe-payments] marking order paid failed", paidError.message);
    return json({ ok: false, error: "ORDER_UPDATE_FAILED" }, 500);
  }

  // Grant enrolment server-side. The RPC is idempotent, so a retried
  // webhook cannot double-enrol (and the payment-id check above
  // stops replays earlier still).
  const { error: grantError } = await admin.rpc("grant_paid_enrollment", {
    p_payment_order_id: resolvedOrder.id,
  });
  if (grantError) {
    console.error("[stripe-payments] grant enrolment failed", grantError.message);
    return json({ ok: false, error: "GRANT_FAILED" }, 500);
  }

  return json({ ok: true, granted: true });
}

// ---------- Router ----------

Deno.serve(async (req: Request) => {
  try {
    const url = new URL(req.url);
    const segments = url.pathname.split("/").filter(Boolean);
    // /functions/v1/stripe-payments[/webhook]
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
    console.error("[stripe-payments] unhandled error", e);
    return json({ ok: false, error: "INTERNAL_ERROR" }, 500);
  }
});
