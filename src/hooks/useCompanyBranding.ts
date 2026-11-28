import { useEffect, useState } from 'react';
import {
  DEFAULT_BRANDING,
  getCompanyBranding,
  type CompanyBranding,
} from '../services/companyBranding';

/**
 * useCompanyBranding() — read the DB-backed display branding with
 * src/lib/company.ts values as fallback.
 *
 * - When the company_settings row exists, its values win; when the
 *   table is empty/unreachable, DEFAULT_BRANDING applies, so existing
 *   pages keep working unchanged.
 * - One fetch is shared across every Logo instance on the page via a
 *   module-level cache (Logo is rendered in ~10 places).
 * - Side effects, applied only when a DB row exists (never from the
 *   static defaults, so a missing row cannot rewrite the page):
 *   document.title, the favicon link, and the --brand-primary CSS
 *   variable. The CSS variable is a forward-compatible hook point:
 *   index.css already defines --brand-primary, but no Tailwind class
 *   reads it today, so setting primary_color does NOT recolour
 *   bg-primary-600 etc. Full runtime recolouring is a documented
 *   follow-up (docs/branding-settings.md) — it is not faked here.
 */

const DEFAULT_TITLE = 'Kaveri Technologies Academy — IT Training Platform';

let cachedBranding: CompanyBranding | null = null;
let cachedHasRow = false;
let inflight: Promise<CompanyBranding | null> | null = null;

function loadBranding(): Promise<CompanyBranding | null> {
  if (cachedBranding) return Promise.resolve(cachedBranding);
  if (!inflight) {
    inflight = getCompanyBranding().then(row => {
      if (row) {
        cachedBranding = row;
        cachedHasRow = true;
      }
      inflight = null;
      return row;
    });
  }
  return inflight;
}

function applyBrandingToDocument(branding: CompanyBranding): void {
  if (typeof document === 'undefined') return;
  document.title = `${branding.displayName} — IT Training Platform`;
  const favicon = document.querySelector<HTMLLinkElement>("link[rel~='icon']");
  if (favicon && branding.faviconUrl) favicon.href = branding.faviconUrl;
  if (branding.primaryColor) {
    document.documentElement.style.setProperty('--brand-primary', branding.primaryColor);
  }
}

export function resetBrandingCacheForTests(): void {
  cachedBranding = null;
  cachedHasRow = false;
  inflight = null;
  if (typeof document !== 'undefined') {
    document.title = DEFAULT_TITLE;
    document.documentElement.style.removeProperty('--brand-primary');
  }
}

export interface CompanyBrandingResult {
  /** Resolved branding: DB row merged over company.ts defaults. */
  branding: CompanyBranding;
  loading: boolean;
  /** True only when a company_settings row exists in the DB. */
  hasCustomBranding: boolean;
}

export function useCompanyBranding(): CompanyBrandingResult {
  const [branding, setBranding] = useState<CompanyBranding>(
    () => cachedBranding ?? DEFAULT_BRANDING,
  );
  const [hasCustomBranding, setHasCustomBranding] = useState<boolean>(() => cachedHasRow);
  const [loading, setLoading] = useState<boolean>(() => cachedBranding === null);

  useEffect(() => {
    let cancelled = false;
    loadBranding().then(row => {
      if (cancelled) return;
      if (row) {
        setBranding(row);
        setHasCustomBranding(true);
        applyBrandingToDocument(row);
      }
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return { branding, loading, hasCustomBranding };
}
