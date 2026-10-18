// Kaveri platform external entry points.
// These are the live hosts of the satellite apps in the Kaveri ecosystem.
// See docs/kaveri-platform-registry.md for the authoritative registry.

import { supabase } from './supabase';

/** Kaveri Coding Workspace — student & teacher dashboard (coding_vscode domain). */
export const CODING_DASHBOARD_URL = 'https://kaveri-coding-dashboard.vercel.app';

/** Kaveri Coding VS Code extension deep link base (safe identifiers only — no tokens). */
export const CODING_EXTENSION_DEEPLINK_BASE = 'vscode://kaveritechnologies.kaveri-coding';

/**
 * Auth handoff for the Coding Workspace dashboard (Bug 6).
 *
 * The coding dashboard is a separate Vercel app backed by the SAME Supabase
 * project, but its browser session lives under that origin, so a plain link
 * lands the user on a signed-out sign-in wall. Supabase sessions persist per
 * origin's localStorage, so we cannot literally transfer the session — but we
 * CAN carry the current refresh token as a short-lived one-time handoff value
 * the dashboard can exchange: append `#auth_handoff=<refresh_token>` and the
 * dashboard calls `supabase.auth.setSession({ access_token, refresh_token })`
 * then strips the hash. The token rides in the URL fragment only (never
 * sent to any server, never lands in history logs beyond this origin), and
 * becomes useless as soon as the dashboard completes the exchange.
 *
 * If no session exists the plain origin URL is returned — the dashboard's
 * own sign-in flow takes over.
 */
export async function buildCodingDashboardUrl(): Promise<string> {
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.refresh_token;
    if (!token) return CODING_DASHBOARD_URL;
    return `${CODING_DASHBOARD_URL}#auth_handoff=${encodeURIComponent(token)}`;
  } catch {
    return CODING_DASHBOARD_URL;
  }
}

/**
 * Click handler wrapper for coding-dashboard links: resolves the handoff URL
 * at click time (session read is async) and opens it in a new tab. Falls
 * back to the plain origin if anything goes wrong.
 */
export async function openCodingDashboard(handoffEvents: {
  preventDefault: () => void;
  stopPropagation: () => void;
}) {
  handoffEvents.preventDefault();
  handoffEvents.stopPropagation();
  const url = await buildCodingDashboardUrl();
  window.open(url, '_blank', 'noopener,noreferrer');
}

/** Workshop registration site. */
export const WORKSHOP_SITE_URL = 'https://kaveri-workshop-nextjs.vercel.app';
