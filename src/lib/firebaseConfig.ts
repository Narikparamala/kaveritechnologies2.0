// Firebase Web Push configuration — public-by-design values (Firebase web
// API keys identify the project, they do not authorize anything sensitive;
// access is locked down by Firebase Security Rules + the VAPID protocol).
//
// Values are injected at BUILD time from .env.local (Vite envs) so the
// browser bundle never reads them at runtime and ops keeps one source of
// truth. If keys are missing, push features render their "waiting for
// keys" state instead of crashing.

export interface FirebaseWebConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  messagingSenderId: string;
  appId: string;
}

export function getFirebaseWebConfig(): FirebaseWebConfig | null {
  const cfg = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY as string | undefined,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID as string | undefined,
    appId: import.meta.env.VITE_FIREBASE_APP_ID as string | undefined,
  };
  const required: (keyof FirebaseWebConfig)[] = [
    'apiKey', 'authDomain', 'projectId', 'messagingSenderId', 'appId',
  ];
  if (required.some(k => !cfg[k])) return null;
  return cfg as FirebaseWebConfig;
}

export function getVapidKey(): string | null {
  const key = import.meta.env.VITE_FCM_VAPID_KEY as string | undefined;
  return key && key.trim() ? key.trim() : null;
}

export function isPushConfigured(): boolean {
  return getFirebaseWebConfig() !== null && getVapidKey() !== null;
}
