// =====================================================================
// payments — client-side payments config (single source of truth)
//
// This module is the reusable/customisable seam for payments. Nothing
// about the academy, the company, or a specific gateway is hardcoded
// here beyond defaults:
//   * provider — which gateway the checkout uses ('cashfree' in v1).
//     PhonePe/Stripe are added by adding a provider adapter, not by
//     editing the enrolment flow.
//   * currency — 'INR' by default; override with VITE_PAYMENT_CURRENCY.
//   * faculty revenue split is NOT in v1: payments settle to the single
//     academy merchant account. Split is a future setting, not a code
//     change in the enrolment path.
//
// Rules the UI must never break:
//   * The client NEVER sends an amount. The edge function reads the
//     price server-side from courses.price.
//   * The browser redirect after payment is UX only. Enrolment is
//     granted by the verified webhook, never by the return URL.
//   * No gateway secret ever reaches this file or the browser bundle.
//     The only thing the browser holds is the single-use
//     payment_session_id returned by the edge function.
//   * Cashfree checkout needs the Cashfree JS SDK (cashfree.js v3).
//     There is no redirect-by-URL: the SDK opens the hosted page.
//     The merchant domain must be whitelisted in the Cashfree
//     dashboard or the SDK refuses to open checkout.
// =====================================================================

import { supabase } from './supabase';

export const PAYMENT_CONFIG = {
  /** Active gateway. 'cashfree' in v1; override with VITE_PAYMENT_PROVIDER. */
  provider: (import.meta.env.VITE_PAYMENT_PROVIDER ?? 'cashfree').toLowerCase(),
  /** Checkout currency. 'INR' by default; override with VITE_PAYMENT_CURRENCY. */
  currency: (import.meta.env.VITE_PAYMENT_CURRENCY ?? 'INR').toUpperCase(),
  /** Cashfree minimum order amount. */
  minAmount: 1,
} as const;

export type PaymentMode = 'sandbox' | 'production';

export type PaymentOrder = {
  orderId: string;
  gatewayOrderId: string;
  cfOrderId: string | null;
  paymentSessionId: string;
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

/**
 * Start a paid checkout for a course. The price is read server-side
 * from courses.price — `courseId` is the only input.
 */
export async function createPaymentOrder(courseId: string): Promise<PaymentOrder> {
  const { data, error } = await supabase.functions.invoke('cashfree-payments', {
    body: { action: 'create-order', courseId },
  });
  if (error) throw new Error(error.message || 'Could not start checkout.');
  if (!data?.ok || !data?.paymentSessionId) {
    throw new Error(data?.message || data?.error || 'Could not start checkout.');
  }
  return data as PaymentOrder;
}

declare global {
  interface Window {
    Cashfree?: (options: { mode: PaymentMode }) => {
      checkout: (options: {
        paymentSessionId: string;
        redirectTarget?: '_self' | '_blank' | '_modal';
      }) => Promise<unknown>;
    };
  }
}

const CASHFREE_SDK_URL = 'https://sdk.cashfree.com/js/v3/cashfree.js';

let sdkLoadPromise: Promise<Window['Cashfree']> | null = null;

/** Load cashfree.js v3 once, then return the Cashfree factory. */
function loadCashfreeSdk(): Promise<Window['Cashfree']> {
  if (typeof window.Cashfree === 'function') return Promise.resolve(window.Cashfree);
  if (sdkLoadPromise) return sdkLoadPromise;
  sdkLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = CASHFREE_SDK_URL;
    script.async = true;
    script.onload = () => {
      if (typeof window.Cashfree === 'function') resolve(window.Cashfree);
      else reject(new Error('Cashfree checkout did not load. Please try again.'));
    };
    script.onerror = () =>
      reject(new Error('Cashfree checkout could not be loaded. Check your connection and try again.'));
    document.head.appendChild(script);
  });
  return sdkLoadPromise;
}

/**
 * Open the Cashfree hosted checkout for a payment order created by
 * createPaymentOrder. redirectTarget '_self' navigates the same tab
 * to Cashfree; after payment Cashfree returns the student to the
 * return_url set at order creation (the course page).
 */
export async function startCashfreeCheckout(order: PaymentOrder): Promise<void> {
  const factory = await loadCashfreeSdk();
  if (!factory) throw new Error('Cashfree checkout did not load. Please try again.');
  const cashfree = factory({ mode: order.mode });
  await cashfree.checkout({
    paymentSessionId: order.paymentSessionId,
    redirectTarget: '_self',
  });
}
