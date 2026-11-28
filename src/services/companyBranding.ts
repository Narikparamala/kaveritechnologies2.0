import { supabase } from '../lib/supabase';
import { COMPANY } from '../lib/company';

/**
 * DB-backed display branding (company_settings, one row).
 *
 * Every reader merges the DB row over DEFAULT_BRANDING (today's
 * hardcoded src/lib/company.ts values), so existing pages keep working
 * unchanged when the table is empty or a row is missing — this is what
 * makes the branding feature additive.
 *
 * The contact email here is the DISPLAY contact email shown on public
 * pages. It is not an account or sign-in email.
 */

export interface CompanyBranding {
  displayName: string;
  tagline: string;
  contactEmail: string;
  contactPhone: string;
  website: string;
  websiteUrl: string;
  logoUrl: string;
  faviconUrl: string;
  /** Display legal name for legal pages. Editing it is NOT a company rename. */
  legalName: string;
  /** Optional #RRGGBB brand primary, or null to keep the default indigo. */
  primaryColor: string | null;
}

export const DEFAULT_BRANDING: CompanyBranding = {
  displayName: COMPANY.brandName,
  tagline: COMPANY.tagline,
  contactEmail: COMPANY.email,
  contactPhone: COMPANY.phoneDisplay,
  website: COMPANY.website,
  websiteUrl: COMPANY.websiteUrl,
  logoUrl: '/assets/images/WhatsApp_Image_2026-06-16_at_10.34.22.jpeg',
  faviconUrl: '/assets/images/WhatsApp_Image_2026-06-16_at_10.34.22.jpeg',
  legalName: COMPANY.legalName,
  primaryColor: null,
};

export interface CompanySettingsRow {
  id: string;
  display_name: string | null;
  tagline: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  website: string | null;
  website_url: string | null;
  logo_url: string | null;
  favicon_url: string | null;
  legal_name: string | null;
  primary_color: string | null;
}

function rowToBranding(row: CompanySettingsRow): CompanyBranding {
  return {
    displayName: row.display_name ?? DEFAULT_BRANDING.displayName,
    tagline: row.tagline ?? DEFAULT_BRANDING.tagline,
    contactEmail: row.contact_email ?? DEFAULT_BRANDING.contactEmail,
    contactPhone: row.contact_phone ?? DEFAULT_BRANDING.contactPhone,
    website: row.website ?? DEFAULT_BRANDING.website,
    websiteUrl: row.website_url ?? DEFAULT_BRANDING.websiteUrl,
    logoUrl: row.logo_url ?? DEFAULT_BRANDING.logoUrl,
    faviconUrl: row.favicon_url ?? DEFAULT_BRANDING.faviconUrl,
    legalName: row.legal_name ?? DEFAULT_BRANDING.legalName,
    primaryColor: row.primary_color ?? null,
  };
}

function brandingToRow(branding: CompanyBranding): Omit<CompanySettingsRow, 'id'> {
  return {
    display_name: branding.displayName,
    tagline: branding.tagline,
    contact_email: branding.contactEmail,
    contact_phone: branding.contactPhone,
    website: branding.website,
    website_url: branding.websiteUrl,
    logo_url: branding.logoUrl || null,
    favicon_url: branding.faviconUrl || null,
    legal_name: branding.legalName,
    primary_color: branding.primaryColor || null,
  };
}

/**
 * Fetch the branding row, resolved over the company.ts defaults.
 * Returns null when the table has no row (or is unreachable) — callers
 * must fall back to DEFAULT_BRANDING in that case.
 */
export async function getCompanyBranding(): Promise<CompanyBranding | null> {
  try {
    const { data, error } = await supabase
      .from('company_settings')
      .select('*')
      .limit(1)
      .maybeSingle();
    if (error || !data) return null;
    return rowToBranding(data as CompanySettingsRow);
  } catch {
    return null;
  }
}

/** Create the single row if missing, otherwise update it (admin only, per RLS). */
export async function saveCompanyBranding(branding: CompanyBranding): Promise<void> {
  const row = brandingToRow(branding);
  const { data: existing, error: readError } = await supabase
    .from('company_settings')
    .select('id')
    .limit(1)
    .maybeSingle();
  if (readError) throw new Error(`Could not read branding settings: ${readError.message}`);
  if (existing) {
    const { error } = await supabase
      .from('company_settings')
      .update(row)
      .eq('id', (existing as { id: string }).id);
    if (error) throw new Error(`Could not save branding settings: ${error.message}`);
  } else {
    const { error } = await supabase
      .from('company_settings')
      .insert({ ...row, singleton: true });
    if (error) throw new Error(`Could not save branding settings: ${error.message}`);
  }
}
