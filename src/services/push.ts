// Web Push (FCM) client service.
//
// Architecture: the browser holds a Web Push subscription whose endpoint is
// an FCM registration token. The token is stored in push_subscriptions and
// the notification-push edge function sends via FCM HTTP v1. This module
// handles the browser side: permission, token lifecycle, foreground
// messages, and the subscription REST rows.
//
// Everything degrades gracefully when Firebase keys are not yet configured
// (isPushConfigured() → false): the settings card shows a neutral state
// instead of attempting registration.

import { supabase } from '../lib/supabase';
import { getFirebaseWebConfig, getVapidKey, isPushConfigured } from '../lib/firebaseConfig';

export type PushSupportReason =
  | 'unsupported-browser'
  | 'insecure-context'
  | 'not-configured'
  | null;

export type PushState = {
  supported: boolean;
  reason: PushSupportReason;
  permission: NotificationPermission | 'unknown';
};

export interface PushSubscriptionRow {
  id: string;
  endpoint: string;
  created_at: string;
  user_agent: string | null;
}

export async function getPushState(): Promise<PushState> {
  const hasApi =
    typeof window !== 'undefined' &&
    'Notification' in window &&
    'serviceWorker' in navigator &&
    'PushManager' in window;

  if (!hasApi) {
    return { supported: false, reason: 'unsupported-browser', permission: 'unknown' };
  }
  if (!window.isSecureContext) {
    return { supported: false, reason: 'insecure-context', permission: Notification.permission };
  }
  if (!isPushConfigured()) {
    return { supported: true, reason: 'not-configured', permission: Notification.permission };
  }
  return { supported: true, reason: null, permission: Notification.permission };
}

// The FCM SDK registers the messaging service worker at the SW scope root.
async function ensureServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  const cfg = getFirebaseWebConfig();
  if (!cfg) return null;
  try {
    const { getMessaging, getToken, onMessage, isSupported } = await import('firebase/messaging');
    const { initializeApp, getApps } = await import('firebase/app');

    if (!(await isSupported())) return null;
    const app = getApps().length ? getApps()[0]! : initializeApp(cfg);

    const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
    // Ensure an updated SW takes over before asking it for a token.
    await navigator.serviceWorker.ready;

    const messaging = getMessaging(app);
    const vapidKey = getVapidKey();

    // Foreground messages → surface through the existing toast/bell path:
    // the realtime notifications subscription already refreshes the bell;
    // here we also show a native-style in-page toast via a custom event.
    onMessage(messaging, payload => {
      const title = payload.notification?.title ?? 'Kaveri Academy';
      const body = payload.notification?.body ?? '';
      window.dispatchEvent(new CustomEvent('kaveri:push-foreground', { detail: { title, body } }));
    });

    if (!vapidKey) return registration;
    const token = await getToken(messaging, {
      vapidKey,
      serviceWorkerRegistration: registration,
    });
    if (token) await upsertPushSubscription(token, registration);
    return registration;
  } catch (error) {
    console.error('[push] service worker / token setup failed', error);
    return null;
  }
}

// ---- push_subscriptions REST rows (own-row RLS) ----
//
// The endpoint URL is the stable key; p256dh/auth are the Web Push keys the
// server would need for raw web-push. FCM HTTP v1 only needs the token, but
// storing the keys keeps the door open for a non-FCM driver later.

async function upsertPushSubscription(token: string, registration: ServiceWorkerRegistration) {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return;
  const sub = await registration.pushManager.getSubscription();
  const endpoint = sub?.endpoint ?? `https://fcm.googleapis.com/fcm/send/${token}`;

  const keys = sub?.toJSON().keys as { p256dh?: string; auth?: string } | undefined;
  const existing = await getActivePushSubscription();

  if (existing && existing.endpoint === endpoint) return; // unchanged

  if (existing) {
    const { error } = await supabase
      .from('push_subscriptions')
      .update({ endpoint, p256dh: keys?.p256dh ?? 'fcm', auth: keys?.auth ?? 'fcm', user_agent: navigator.userAgent, revoked_at: null })
      .eq('id', existing.id);
    if (error) throw error;
    return;
  }

  const { error } = await supabase.from('push_subscriptions').insert({
    user_id: auth.user.id,
    endpoint,
    p256dh: keys?.p256dh ?? 'fcm',
    auth: keys?.auth ?? 'fcm',
    user_agent: navigator.userAgent,
  });
  if (error) throw error;
}

export async function getActivePushSubscription(): Promise<PushSubscriptionRow | null> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;
  const { data, error } = await supabase
    .from('push_subscriptions')
    .select('id, endpoint, created_at, user_agent')
    .eq('user_id', auth.user.id)
    .is('revoked_at', null)
    .limit(1)
    .maybeSingle();
  if (error) return null;
  return (data as PushSubscriptionRow) ?? null;
}

// ---- public actions used by the settings card ----

export async function enablePush(): Promise<{ ok: boolean; error?: string }> {
  const state = await getPushState();
  if (!state.supported) return { ok: false, error: state.reason ?? 'unsupported-browser' };
  if (state.reason === 'not-configured') return { ok: false, error: 'not-configured' };

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return { ok: false, error: 'permission-denied' };

  const registration = await ensureServiceWorker();
  if (!registration) return { ok: false, error: 'registration-failed' };
  return { ok: true };
}

export async function disablePush(): Promise<{ ok: boolean; error?: string }> {
  try {
    const existing = await getActivePushSubscription();
    if (existing) {
      const { error } = await supabase
        .from('push_subscriptions')
        .update({ revoked_at: new Date().toISOString() })
        .eq('id', existing.id);
      if (error) throw error;
    }
    // Best-effort local unsubscribe too.
    const registration = await navigator.serviceWorker.getRegistration('/');
    const sub = await registration?.pushManager.getSubscription();
    if (sub) await sub.unsubscribe().catch(() => undefined);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'failed' };
  }
}

// Send-test: writes a real notification row; the DB trigger enqueues the
// push and the every-minute worker delivers it (honest ~1 min delay).
export async function sendTestPush(): Promise<{ ok: boolean; error?: string }> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { ok: false, error: 'not-signed-in' };
  const { error } = await supabase.from('notifications').insert({
    user_id: auth.user.id,
    title: 'Test push notification',
    message: 'This is a live test of Kaveri Academy push delivery. It should arrive on your device within about a minute.',
    type: 'system',
    action_url: '/notifications',
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// Ops note: the outbox worker resolves a push as sent with 0 devices when
// the recipient has no active subscriptions, so test sends always "work"
// end-to-end even before a device registers.
