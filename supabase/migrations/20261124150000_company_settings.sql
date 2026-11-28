-- =====================================================================
-- Company / branding settings (feature/branding-settings)
-- =====================================================================
-- ADDITIVE ONLY. No existing table, column, policy, or RPC is dropped,
-- renamed, or weakened by this migration.
--
-- What this adds:
--   1. public.company_settings — ONE row (enforced by the singleton
--      unique constraint) holding the academy's display branding:
--      display name, tagline, contact email/phone, website, logo and
--      favicon URLs, legal entity name, and an optional primary colour.
--      A dedicated table (rather than new platform_settings keys) so
--      URLs and validation live in typed columns. Nothing reads this
--      table until the new useCompanyBranding() hook ships with it;
--      every reader falls back to src/lib/company.ts when the row is
--      absent, so existing pages keep working unchanged.
--   2. RLS: anyone (anon + authenticated) may read the row — the logo
--      and display name appear on public pages, exactly like
--      platform_settings today. Only Super Admins may write.
--   3. One seed row with today's hardcoded src/lib/company.ts values,
--      so the table is populated, not empty.
--
-- Deliberate non-goals (see docs/branding-settings.md):
--   - Editing legal_name here is NOT a company rename. The registered
--     entity (Kaveri Technologies Pvt Ltd) cannot change until the
--     owner decides the new entity; the field is only the display
--     legal name shown on legal pages.
--   - primary_color is stored and exposed as the --brand-primary CSS
--     variable by the hook. It does NOT recolour Tailwind classes
--     (bg-primary-600 etc.) — those compile at build time. Full
--     runtime recolouring is a documented follow-up, not faked here.
--   - The contact email in the seed row (kaveritech2022@gmail.com)
--     is the DISPLAY contact email from company.ts. It is not an
--     account or sign-in email; the user forbids that address for
--     new accounts.
--
-- Verification after applying (staging first, with a backup):
--   1. company_settings exists with the columns below, exactly 1 row.
--   2. Anon select returns the row; anon insert/update is denied.
--   3. An admin update of display_name/logo_url reads back.
--   4. Deleting the row (staging only, then re-seeding) makes the
--      hook fall back to company.ts values — existing pages unchanged.
-- =====================================================================

create table if not exists public.company_settings (
  id uuid primary key default gen_random_uuid(),
  -- Singleton enforcement: exactly one row may exist.
  singleton boolean not null default true,
  display_name text not null default 'Kaveri Technologies Academy',
  tagline text not null default 'Learn Technology. Build Real Projects. Become Industry Ready.',
  contact_email text not null default 'kaveritech2022@gmail.com',
  contact_phone text not null default '+91 94900 67803',
  website text not null default 'www.kaveritech.co.in',
  website_url text not null default 'https://www.kaveritech.co.in',
  logo_url text,
  favicon_url text,
  -- Display legal name for legal pages. NOT a company rename: the
  -- registered entity changes only by the owner's separate decision.
  legal_name text not null default 'Kaveri Technologies Private Limited',
  -- Optional brand primary colour, #RRGGBB. Nullable: null keeps the
  -- default indigo #004B8D. Stored + exposed as --brand-primary; it
  -- does not recolour build-time Tailwind classes on its own.
  primary_color text check (primary_color is null or primary_color ~ '^#[0-9a-fA-F]{6}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint company_settings_singleton_unique unique (singleton)
);

comment on table public.company_settings is
  'Single-row display branding for the academy (name, tagline, contact, logo/favicon URLs, legal display name, primary colour). Read by useCompanyBranding() with src/lib/company.ts as fallback. Editing legal_name is not a company rename.';

comment on column public.company_settings.legal_name is
  'Display legal name shown on legal pages. Changing it does not change the registered legal entity.';
comment on column public.company_settings.primary_color is
  'Optional #RRGGBB brand primary. Exposed as the --brand-primary CSS variable; does not recolour Tailwind classes (bg-primary-600 etc.) without the runtime recolouring follow-up.';

drop trigger if exists update_company_settings_updated_at on public.company_settings;
create trigger update_company_settings_updated_at
  before update on public.company_settings
  for each row execute function update_updated_at_column();

alter table public.company_settings enable row level security;

-- Public read: the display name and logo appear on public pages.
drop policy if exists company_settings_public_select on public.company_settings;
create policy company_settings_public_select
  on public.company_settings
  for select
  using (true);

-- Super Admins only may write.
drop policy if exists company_settings_admin_all on public.company_settings;
create policy company_settings_admin_all
  on public.company_settings
  for all
  using (public.is_admin())
  with check (public.is_admin());

-- Seed one row with today's hardcoded src/lib/company.ts values.
insert into public.company_settings (
  singleton, display_name, tagline, contact_email, contact_phone,
  website, website_url, logo_url, favicon_url, legal_name, primary_color
) values (
  true,
  'Kaveri Technologies Academy',
  'Learn Technology. Build Real Projects. Become Industry Ready.',
  'kaveritech2022@gmail.com',
  '+91 94900 67803',
  'www.kaveritech.co.in',
  'https://www.kaveritech.co.in',
  '/assets/images/WhatsApp_Image_2026-06-16_at_10.34.22.jpeg',
  '/assets/images/WhatsApp_Image_2026-06-16_at_10.34.22.jpeg',
  'Kaveri Technologies Private Limited',
  null
)
on conflict (singleton) do nothing;
