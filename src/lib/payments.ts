// =====================================================================
// payments — client-side payments config (single source of truth)
//
// This module is the reusable/customisable seam for payments. Nothing
// about the academy, the company, or a specific gateway is hardcoded
// here beyond defaults. Each gateway is a provider adapter in the
// registry below; adding a gateway means adding one registry entry,
// one edge function, and one row in gateway_settings — the enrolment
// flow never changes.
//
// Providers (v2): cashfree, razorpay, stripe, paypal. The ACTIVE
// gateway comes from the gateway_settings table (Admin → Payment
// Settings); if that table does not exist yet (migration not applied)
// the env fallback below applies, so existing checkouts keep working.
//
// Rules the UI must never break:
//   * The client NEVER sends an amount. The edge function reads the
//     price server-side from courses.price.
//   * The browser redirect / modal callback after payment is UX only.
//     Enrolment is granted by the verified webhook, never by the
//     return URL or the checkout callback.
//   * No gateway secret ever reaches this file or the browser bundle.
//     The only things the browser holds are public identifiers
//     (Razorpay Key ID) and single-use session ids / redirect URLs.
//   * Cashfree checkout needs the Cashfree JS SDK (cashfree.js v3).
//     There is no redirect-by-URL: the SDK opens the hosted page.
//     The merchant domain must be whitelisted in the Cashfree
//     dashboard or the SDK refuses to open checkout.
//   * Razorpay checkout needs Checkout.js and opens a modal.
//   * Stripe and PayPal checkouts are plain redirects to their
//     hosted pages — no SDK is loaded for them.
// =====================================================================

import { supabase } from './supabase';

export type PaymentMode = 'sandbox' | 'production';

export type GatewayId = 'cashfree' | 'razorpay' | 'stripe' | 'paypal';

export type CheckoutKind = 'sdk-cashfree' | 'sdk-razorpay' | 'redirect';

export interface PaymentProvider {
  id: GatewayId;
  label: string;
  /** Supabase edge function name (also the webhook path suffix). */
  edgeFunction: string;
  checkout: CheckoutKind;
  /** Currency used when gateway_settings has no row for this gateway. */
  defaultCurrency: string;
  /** Public SDK script URL, when the checkout needs one. */
  sdkUrl?: string;
  /** Short note shown on the admin settings page. */
  blurb: string;
}

export const PAYMENT_PROVIDERS: Record<GatewayId, PaymentProvider> = {
  cashfree: {
    id: 'cashfree',
    label: 'Cashfree',
    edgeFunction: 'cashfree-payments',
    checkout: 'sdk-cashfree',
    defaultCurrency: 'INR',
    sdkUrl: 'https://sdk.cashfree.com/js/v3/cashfree.js',
    blurb: 'India-first (UPI, cards, netbanking). Needs the merchant domain whitelisted in the Cashfree dashboard.',
  },
  razorpay: {
    id: 'razorpay',
    label: 'Razorpay',
    edgeFunction: 'razorpay-payments',
    checkout: 'sdk-razorpay',
    defaultCurrency: 'INR',
    sdkUrl: 'https://checkout.razorpay.com/v1/checkout.js',
    blurb: 'India-first (UPI, cards, netbanking). No checkout domain whitelist; test with success@razorpay (UPI).',
  },
  stripe: {
    id: 'stripe',
    label: 'Stripe',
    edgeFunction: 'stripe-payments',
    checkout: 'redirect',
    defaultCurrency: 'INR',
    blurb: 'International (cards). NOTE: Stripe India is invite-only for new businesses — verify the account first.',
  },
  paypal: {
    id: 'paypal',
    label: 'PayPal',
    edgeFunction: 'paypal-payments',
    checkout: 'redirect',
    defaultCurrency: 'USD',
    blurb: 'International only. PayPal India supports international payments only — no domestic INR.',
  },
};

export const GATEWAY_IDS = Object.keys(PAYMENT_PROVIDERS) as GatewayId[];

export function isGatewayId(value: string): value is GatewayId {
  return (Object.keys(PAYMENT_PROVIDERS) as string[]).includes(value);
}

export const PAYMENT_CONFIG = {
  /** Fallback gateway when gateway_settings has no active row. */
  provider: ((import.meta.env.VITE_PAYMENT_PROVIDER ?? 'cashfree') as string).toLowerCase(),
  /** Fallback currency. */
  currency: ((import.meta.env.VITE_PAYMENT_CURRENCY ?? 'INR') as string).toUpperCase(),
  /** Minimum order amount. */
  minAmount: 1,
} as const;

export interface ActiveGateway {
  gateway: GatewayId;
  mode: PaymentMode;
  currency: string;
}

const FALLBACK_GATEWAY: ActiveGateway = {
  gateway: isGatewayId(PAYMENT_CONFIG.provider) ? PAYMENT_CONFIG.provider : 'cashfree',
  mode: 'sandbox',
  currency: PAYMENT_CONFIG.currency,
};

let activeGatewayPromise: Promise<ActiveGateway> | null = null;

/**
 * Resolve the active gateway from gateway_settings. Falls back to the
 * env default (cashfree / sandbox / INR) when the table does not exist
 * yet or the query fails — checkout must keep working on installs
 * where the v2 migration has not been applied. Cached per page load.
 */
export function resolveActiveGateway(): Promise<ActiveGateway> {
  if (activeGatewayPromise) return activeGatewayPromise;
  const promise = (async () => {
    try {
      const { data, error } = await supabase
        .from('gateway_settings')
        .select('gateway, mode, currency')
        .eq('is_active', true)
        .maybeSingle();
      if (error || !data) return FALLBACK_GATEWAY;
      const row = data as { gateway?: unknown; mode?: unknown; currency?: unknown };
      const gateway = typeof row.gateway === 'string' && isGatewayId(row.gateway)
        ? row.gateway
        : FALLBACK_GATEWAY.gateway;
      const mode: PaymentMode = row.mode === 'live' ? 'production' : 'sandbox';
      const currency = typeof row.currency === 'string' && row.currency
        ? row.currency.toUpperCase()
        : PAYMENT_PROVIDERS[gateway].defaultCurrency;
      return { gateway, mode, currency } satisfies ActiveGateway;
    } catch {
      return FALLBACK_GATEWAY;
    }
  })();
  activeGatewayPromise = promise;
  return promise;
}

export type PaymentOrder = {
  orderId: string;
  gatewayOrderId: string;
  /** Cashfree-assigned id (cashfree only, kept for compatibility). */
  cfOrderId: string | null;
  /** Gateway-assigned order/session id (Razorpay order id, Stripe session id, PayPal order id). */
  providerOrderId: string | null;
  /** Single-use session id (Cashfree only). */
  paymentSessionId: string | null;
  /** Hosted checkout / approve URL (Stripe, PayPal). */
  redirectUrl: string | null;
  /** Public identifier for SDK checkouts (Razorpay Key ID). */
  publishableKey: string | null;
  /** Amount in minor units, for SDK checkouts (Razorpay paise). */
  amountMinor?: number | null;
  amount: number;
  currency: string;
  gateway: string;
  mode: PaymentMode;
};

/** Format an amount in the configured currency (en-IN by default). */
export function formatPrice(
  amount: number | null | undefined,
  currency: string = PAYMENT_CONFIG.currency,
): string {
  const value = typeof amount === 'number' && Number.isFinite(amount) ? amount : 0;
  try {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${currency} ${value.toFixed(2)}`;
  }
}

function normalizeOrder(data: Record<string, unknown>): PaymentOrder {
  return {
    orderId: String(data.orderId ?? ''),
    gatewayOrderId: String(data.gatewayOrderId ?? ''),
    cfOrderId: typeof data.cfOrderId === 'string' ? data.cfOrderId : null,
    providerOrderId: typeof data.providerOrderId === 'string' ? data.providerOrderId : null,
    paymentSessionId: typeof data.paymentSessionId === 'string' ? data.paymentSessionId : null,
    redirectUrl: typeof data.redirectUrl === 'string' ? data.redirectUrl : null,
    publishableKey: typeof data.publishableKey === 'string' ? data.publishableKey : null,
    amountMinor: typeof data.amountPaise === 'number' ? data.amountPaise : null,
    amount: typeof data.amount === 'number' ? data.amount : 0,
    currency: typeof data.currency === 'string' ? data.currency : PAYMENT_CONFIG.currency,
    gateway: typeof data.gateway === 'string' ? data.gateway : 'cashfree',
    mode: data.mode === 'production' ? 'production' : 'sandbox',
  };
}

/**
 * Start a paid checkout for a course. The price is read server-side
 * from courses.price — `courseId` is the only input. Uses the active
 * gateway (gateway_settings, env fallback) unless `gateway` is given.
 */
export async function createPaymentOrder(
  courseId: string,
  gateway?: GatewayId,
): Promise<PaymentOrder> {
  const active = gateway ?? (await resolveActiveGateway()).gateway;
  const provider = PAYMENT_PROVIDERS[active];
  const { data, error } = await supabase.functions.invoke(provider.edgeFunction, {
    body: { action: 'create-order', courseId },
  });
  if (error) throw new Error(error.message || 'Could not start checkout.');
  if (!data?.ok) {
    throw new Error(
      (typeof data?.message === 'string' && data.message) ||
        (typeof data?.error === 'string' && data.error) ||
        'Could not start checkout.',
    );
  }
  return normalizeOrder(data as Record<string, unknown>);
}

declare global {
  interface Window {
    Cashfree?: (options: { mode: PaymentMode }) => {
      checkout: (options: {
        paymentSessionId: string;
        redirectTarget?: '_self' | '_blank' | '_modal';
      }) => Promise<unknown>;
    };
    Razorpay?: new (options: RazorpayCheckoutOptions) => {
      open: () => void;
    };
  }
}

export interface RazorpayCheckoutOptions {
  key: string;
  amount: number;
  currency: string;
  name: string;
  description?: string;
  order_id: string;
  prefill?: { email?: string };
  theme?: { color?: string };
  handler: (response: {
    razorpay_payment_id: string;
    razorpay_order_id: string;
    razorpay_signature: string;
  }) => void;
  modal?: { ondismiss?: () => void };
}

const CASHFREE_SDK_URL = PAYMENT_PROVIDERS.cashfree.sdkUrl as string;
const RAZORPAY_SDK_URL = PAYMENT_PROVIDERS.razorpay.sdkUrl as string;

function loadScriptOnce(src: string, globalCheck: () => boolean): Promise<void> {
  if (globalCheck()) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () =>
        reject(new Error('Checkout could not be loaded. Check your connection and try again.')),
      );
      return;
    }
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.onload = () => {
      if (globalCheck()) resolve();
      else reject(new Error('Checkout did not load. Please try again.'));
    };
    script.onerror = () =>
      reject(new Error('Checkout could not be loaded. Check your connection and try again.'));
    document.head.appendChild(script);
  });
}

/**
 * Open the Cashfree hosted checkout for a payment order created by
 * createPaymentOrder. redirectTarget '_self' navigates the same tab
 * to Cashfree; after payment Cashfree returns the student to the
 * return_url set at order creation (the course page).
 */
export async function startCashfreeCheckout(order: PaymentOrder): Promise<void> {
  if (!order.paymentSessionId) throw new Error('Cashfree checkout did not start. Please try again.');
  await loadScriptOnce(CASHFREE_SDK_URL, () => typeof window.Cashfree === 'function');
  const factory = window.Cashfree;
  if (!factory) throw new Error('Cashfree checkout did not load. Please try again.');
  const cashfree = factory({ mode: order.mode });
  await cashfree.checkout({
    paymentSessionId: order.paymentSessionId,
    redirectTarget: '_self',
  });
}

/**
 * Open the Razorpay Checkout.js modal for a payment order. The
 * handler fires on a successful payment in the browser, but
 * fulfilment is webhook-only: it only navigates back to the course
 * page — enrolment appears once the webhook is processed.
 */
export async function startRazorpayCheckout(
  order: PaymentOrder,
  courseSlug: string,
): Promise<void> {
  if (!order.providerOrderId || !order.publishableKey) {
    throw new Error('Razorpay checkout did not start. Please try again.');
  }
  await loadScriptOnce(RAZORPAY_SDK_URL, () => typeof window.Razorpay === 'function');
  const Razorpay = window.Razorpay;
  if (!Razorpay) throw new Error('Razorpay checkout did not load. Please try again.');
  const checkout = new Razorpay({
    key: order.publishableKey,
    amount: order.amountMinor ?? Math.round(order.amount * 100),
    currency: order.currency,
    name: 'Course enrolment',
    description: `Course enrolment — order ${order.gatewayOrderId}`,
    order_id: order.providerOrderId,
    handler: () => {
      window.location.assign(`/courses/${courseSlug}?payment=return&order=${order.gatewayOrderId}`);
    },
    modal: {
      ondismiss: () => {
        window.location.assign(`/courses/${courseSlug}?payment=cancelled`);
      },
    },
  });
  checkout.open();
}

/** Open the hosted checkout page for redirect gateways (Stripe, PayPal). */
export function startRedirectCheckout(order: PaymentOrder): void {
  if (!order.redirectUrl) throw new Error('Checkout did not start. Please try again.');
  window.location.assign(order.redirectUrl);
}

/**
 * Route a payment order to its gateway's checkout automatically:
 * Cashfree SDK, Razorpay modal, or a redirect for Stripe/PayPal.
 */
export async function startCheckout(order: PaymentOrder, courseSlug?: string): Promise<void> {
  const provider = isGatewayId(order.gateway)
    ? PAYMENT_PROVIDERS[order.gateway]
    : PAYMENT_PROVIDERS.cashfree;
  if (provider.checkout === 'sdk-cashfree') return startCashfreeCheckout(order);
  if (provider.checkout === 'sdk-razorpay') {
    return startRazorpayCheckout(order, courseSlug ?? '');
  }
  return startRedirectCheckout(order);
}

/**
 * One call for the course page: create the order with the active
 * gateway and open its checkout. Price is read server-side.
 */
export async function startCheckoutForCourse(
  courseId: string,
  courseSlug: string,
): Promise<void> {
  const order = await createPaymentOrder(courseId);
  await startCheckout(order, courseSlug);
}

/** Live status of one gateway's edge function, as probed from the browser. */
export type GatewayStatus = 'configured' | 'not-configured' | 'unknown';

/** Probe one gateway's edge function: 503 = not configured, anything else = configured. */
export async function probeGatewayStatus(
  gateway: GatewayId,
): Promise<GatewayStatus> {
  try {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
    const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
    if (!supabaseUrl || !anonKey) return 'unknown';
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;
    const res = await fetch(
      `${supabaseUrl.replace(/\/$/, '')}/functions/v1/${PAYMENT_PROVIDERS[gateway].edgeFunction}`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          apikey: anonKey,
          ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({ action: 'create-order' }),
      },
    );
    if (res.status === 503) return 'not-configured';
    if (res.status === 400 || res.status === 401) return 'configured';
    return 'unknown';
  } catch {
    return 'unknown';
  }
}
