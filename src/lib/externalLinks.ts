// Kaveri platform external entry points.
// These are the live hosts of the satellite apps in the Kaveri ecosystem.
// See docs/kaveri-platform-registry.md for the authoritative registry.

/** Kaveri Coding Workspace — student & teacher dashboard (coding_vscode domain). */
export const CODING_DASHBOARD_URL = 'https://kaveri-coding-dashboard.vercel.app';

/** Kaveri Coding VS Code extension deep link base (safe identifiers only — no tokens). */
export const CODING_EXTENSION_DEEPLINK_BASE = 'vscode://kaveritechnologies.kaveri-coding';

/** Workshop registration site. */
export const WORKSHOP_SITE_URL = 'https://kaveri-workshop-nextjs.vercel.app';

/**
 * Question Paper / Offline Exams system (Cloudflare Worker + React client).
 * Empty until the QP app is deployed to a public URL — the LMS then shows
 * the "Open Question Paper System" action automatically. See
 * docs/kaveri-platform-registry.md (section 5) for status.
 */
export const QUESTION_PAPER_APP_URL = '';

/** True when a configured satellite link should be surfaced in the UI. */
export const isSatelliteConfigured = (url: string): boolean =>
  typeof url === 'string' && url.trim().length > 0;
