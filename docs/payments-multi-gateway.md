# Multi-gateway payments (v2) — Razorpay, Stripe, PayPal

> Cashfree (v1, PR #49) stays as it is. This page documents the v2
> addition: three more gateways behind the same reusable seam, driven
> by the Admin → Payment Settings page. One active gateway at a time;
> checkout routes to it automatically; webhooks grant enrolment.

## What the owner does, in one paragraph

Pick a gateway below, create its merchant account (that part is the
gateway's own signup/KYC — it cannot be automated), copy its **test**
keys into Supabase function secrets, register the webhook URL shown on
the Payment Settings page, then set that gateway active in Admin →
Payment Settings and Save. From then on everything is automatic:
the edge function activates itself once its secrets exist, checkout
opens the active gateway with no code change, and the webhook grants
enrolment. Switching gateways later is the same two clicks.

## Architecture (reusable seam)

```
Admin → Payment Settings (gateway_settings table)
        │  is_active (exactly one) · mode sandbox|live · currency
        ▼
Course page → startCheckoutForCourse(courseId)
        │  resolveActiveGateway() → gateway_settings, else env default
        ▼  (cashfree/sandbox/INR)
createPaymentOrder(courseId, gateway)
        │  POST /functions/v1/<gateway>-payments { action: "create-order" }
        │  price read server-side from courses.price — the client
        │  never sends an amount
        ▼
Edge function per gateway (verify_jwt=false — webhooks carry no
Supabase JWT; create-order verifies the caller's JWT itself)
        │  fail-closed 503 CONFIGURATION_ERROR until its secrets exist
        │  webhook: signature-verified, server-side re-verification,
        │  idempotent grant via grant_paid_enrollment (existing RPC)
        ▼
payment_orders + payment_transactions (gateway-agnostic, from v1)
        cf_order_id / cf_payment_id are the GENERIC gateway-assigned
        id columns — reused for every gateway, not just Cashfree.
        (The names are historical; renaming them would touch the v1
        tables, so they stay.)
```

- **No new order tables.** All four gateways share `payment_orders`
  and `payment_transactions`.
- **No Cashfree changes.** The v1 flow, its RLS policies, RPCs, and
  routes are untouched. Cashfree's function still reads test secrets
  only; its live activation is a separate, deliberate step.
- **Mode is real for the new gateways.** `gateway_settings.mode`
  picks which secret names the function reads (`*_TEST_*` vs live
  names). Flipping a gateway to `live` without live secrets makes it
  fail-closed 503 — it cannot accidentally charge with test keys.
- **Currency.** `courses.price` is a single number; the active
  gateway's currency applies. Cashfree/Razorpay/Stripe default to
  INR; PayPal defaults to USD.
- **Fallbacks.** If `gateway_settings` does not exist (migration not
  applied), checkout falls back to the env default
  (cashfree/sandbox/INR) and each new function falls back to
  sandbox + its default currency — existing installs keep working.

## Gateway research (official docs only, checked 2026-11-14)

Fees change — re-check before quoting them. All three need the raw
request body for webhook verification, fulfil from the webhook (never
from the browser redirect/handler), and keep secrets server-only.

### Razorpay (India-first)

- **Checkout:** Orders API `POST https://api.razorpay.com/v1/orders`
  (amount in **paise**, `receipt` ≤ 40 chars, Basic auth
  `key_id:key_secret`) → Checkout.js modal
  (`https://checkout.razorpay.com/v1/checkout.js`, key + order_id +
  handler). No checkout domain whitelist.
- **Webhook:** signature = hex HMAC-SHA256(raw body, webhook secret),
  header `X-Razorpay-Signature`. The webhook secret is a **separate**
  secret from the API Key Secret, chosen when the webhook is
  registered. No timestamp in the signature; replay guard is the
  payment id + `x-razorpay-event-id`. Fulfil on `payment.captured`
  only — `payment.authorized` means funds held, not captured. Return
  200 within 5 s.
- **Merchant needs:** account, test key pair (`rzp_test_…`), webhook
  URL + secret.
- **Fees:** standard domestic 2% + GST = 2.36% effective. UPI: 0% MDR
  but the 2% platform fee still applies. Intro offer: 0% platform fee
  for the first 90 days (new merchants from 2026-07-01, up to ₹5 lakh
  GMV).
- **Test data:** UPI `success@razorpay`; test card Visa
  `4100 2800 0000 1007`.

### Stripe (international)

- **Checkout:** Checkout Sessions
  `POST https://api.stripe.com/v1/checkout/sessions` (form-encoded,
  `mode=payment`, line items, success/cancel URLs) → redirect to the
  hosted checkout URL. No domain whitelist.
- **Webhook:** header `Stripe-Signature` (`t=…,v1=…`); signed payload
  = `timestamp + "." + rawBody`, HMAC-SHA256 hex with the endpoint
  secret (`whsec_…`); 5-minute tolerance. Fulfil on
  `checkout.session.completed` /
  `checkout.session.async_payment_succeeded` with payment_status paid.
  Test and live endpoints have **different** signing secrets.
- **Merchant needs:** account + test secret key (`sk_test_…`),
  webhook endpoint + signing secret, `LMS_PUBLIC_URL` (success/cancel
  URLs are built from it).
- **Fees (India):** 2% domestic cards, 3% international cards, 3.5%
  Amex international, 4.3% international USD presentment, +2%
  currency conversion.
- **⚠️ Stripe India is invite-only for new businesses** (Stripe
  Support). A new Indian business must request an invite via Sales
  before it can onboard. Domestic UPI via Checkout for Indian
  accounts is unverified — confirm in the dashboard before promising
  it.
- **Test data:** card `4242 4242 4242 4242`.

### PayPal (international)

- **Checkout:** OAuth2 token (`POST /v1/oauth2/token`, Basic
  `client_id:secret`) → Orders API v2
  (`POST /v2/checkout/orders`, `intent: CAPTURE`, purchase units,
  return/cancel URLs) → redirect to the approve link. No domain
  whitelist.
- **Webhook:** verification by postback
  (`POST /v1/notifications/verify-webhook-signature`) — accept only
  `verification_status: "SUCCESS"`. Events
  `CHECKOUT.ORDER.COMPLETED` and `PAYMENT.CAPTURE.COMPLETED`; the
  capture status is the authoritative money signal. Listener must be
  HTTPS on port 443. PayPal retries up to 25 times over 3 days.
- **Merchant needs:** sandbox REST app (Client ID + Secret), webhook
  listener + webhook ID, `LMS_PUBLIC_URL`.
- **Fees (India receiving):** 4.40% + fixed fee (USD $0.30 / INR
  ₹3.00); currency conversion +3.0% above the base rate; dispute fee
  $8.00 / ₹580.
- **⚠️ India: international payments only — no domestic INR.**
  An Indian academy can only take PayPal from students paying from
  outside India, and prices are charged in USD.

### Cashfree (v1, for comparison)

- 1.95% + GST (2.30% all-in); festive offer 0% platform fee up to
  ₹20 lakh GMV or 2027-03-31 (GST still applies). T+1 settlement.
  Checkout needs the JS SDK + a whitelisted domain. Already wired in
  test mode (PR #49); prod activation waits for the new entity
  decision.

## Setup checklist (owner)

Per gateway, in the Payment Settings page (Admin → Payment Settings →
"Setup steps"). The short version:

| Gateway | Secrets to set (Supabase function secrets) | Webhook events |
|---|---|---|
| Razorpay | `RAZORPAY_TEST_KEY_ID`, `RAZORPAY_TEST_KEY_SECRET`, `RAZORPAY_TEST_WEBHOOK_SECRET` | `payment.captured` |
| Stripe | `STRIPE_TEST_SECRET_KEY`, `STRIPE_TEST_WEBHOOK_SECRET`, `LMS_PUBLIC_URL` | `checkout.session.completed`, `checkout.session.async_payment_succeeded` |
| PayPal | `PAYPAL_TEST_CLIENT_ID`, `PAYPAL_TEST_CLIENT_SECRET`, `PAYPAL_TEST_WEBHOOK_ID`, `LMS_PUBLIC_URL` | `CHECKOUT.ORDER.COMPLETED`, `PAYMENT.CAPTURE.COMPLETED` |
| Cashfree (v1) | `CASHFREE_TEST_APP_ID`, `CASHFREE_TEST_SECRET_KEY` (already set on staging) | (see PR #49) |

Live secrets use the same names without the `TEST` part
(`RAZORPAY_KEY_ID`, `STRIPE_SECRET_KEY`, `PAYPAL_CLIENT_ID`, …) and
are picked up when the gateway's mode is set to `live`.

## What still needs the owner (after this PR)

1. **Test keys per gateway** (see the table above) — no merchant
   account was created, no KYC done, no real secret set anywhere.
2. **Sandbox E2E test per gateway:** paid approval-required course →
   test payment → webhook → order `paid` → enrolment granted →
   webhook replay returns duplicate, no double enrolment.
3. **Domain steps:** Cashfree domain whitelist (already submitted for
   kaveri-academy.vercel.app, pending approval); Razorpay/Stripe/
   PayPal need no domain whitelist.
4. **Stripe invite** (India) and **PayPal international-only**
   limits — see the warnings above.
5. **Production activation** — after sandbox tests pass, and only
   after the new-entity decision (the user resigned from Kaveri
   Technologies; production onboarding cannot be as Kaveri
   Technologies Pvt Ltd). Faculty share % is still undecided.

## Files changed (PR)

- `supabase/functions/razorpay-payments/index.ts` (new)
- `supabase/functions/stripe-payments/index.ts` (new)
- `supabase/functions/paypal-payments/index.ts` (new)
- `supabase/migrations/20261114120000_payment_gateway_settings.sql` (new)
- `supabase/config.toml` (three new `[functions.*]` sections, `verify_jwt = false`)
- `src/lib/payments.ts` (provider registry — backward compatible)
- `src/pages/public/CourseDetailPage.tsx` (generic checkout; fee shows the active gateway's currency)
- `src/pages/admin/AdminPaymentSettingsPage.tsx` (new)
- `src/App.tsx` (route `/admin/payments`), `src/pages/admin/AdminLayout.tsx` (nav entry)
- `.env.example` (new secret names, docs only), `AGENTS.md` §11 (stale "no payments" line)
- `docs/payments-multi-gateway.md` (this file), `AI-WORK-LOG.md` (entry)

## Verification

- `npm run typecheck` pass; `npm run lint` 0 errors; `npm run build` pass.
- Edge functions: standalone `tsc` only (Deno is not installed in the
  VM) — the only errors are the same untyped-`createClient` artifacts
  the deployed cashfree-payments function already shows. The real
  check is the live deploy + probe on staging: each new function
  should fail-closed with 503 `CONFIGURATION_ERROR` (no secrets set
  yet) and 401 without auth.
- Migration applied to **staging only**; the three functions deployed
  to **staging only** and probed. Production untouched.
