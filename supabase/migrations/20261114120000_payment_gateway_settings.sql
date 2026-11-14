-- =====================================================================
-- Payment gateway settings (multi-gateway, v2) — settings-driven
-- =====================================================================
-- ADDITIVE ONLY. No existing table, column, policy, or RPC is dropped,
-- renamed, or weakened by this migration.
--
-- What this adds:
--   1. public.gateway_settings — one row per gateway
--      (cashfree, razorpay, stripe, paypal). Stores ONLY non-secret
--      config: which gateway is active, sandbox/live mode, currency.
--      Secret keys NEVER live here — they stay as Supabase function
--      secrets, set in the dashboard/CLI by the academy owner.
--   2. Exactly one active gateway at a time (partial unique index).
--   3. Seed rows: cashfree active (preserves the v1 behaviour —
--      checkout already defaults to cashfree), the other three
--      inactive until the owner configures them.
--
-- How "automatic" works (see docs/payments-multi-gateway.md):
--   * Each gateway's edge function fail-closes with 503 until its
--     secrets exist; once the owner pastes the keys as function
--     secrets, the function activates itself — no code change.
--   * Checkout reads gateway_settings for the active gateway and
--     falls back to the cashfree env default if this table does not
--     exist yet (e.g. before this migration is applied), so existing
--     checkouts keep working.
--   * Webhooks auto-grant enrolment via grant_paid_enrollment.
--   * What CANNOT be automated: merchant account creation, KYC,
--     and each gateway's own domain/webhook approval. Those are the
--     gateway's requirements, not this project's.
--
-- Currency note: courses.price is a single number. The active
-- gateway's currency applies to it. Cashfree/Razorpay/Stripe
-- default to INR; PayPal defaults to USD (PayPal India supports
-- international payments only — no domestic INR).
--
-- Verification after applying (staging first, with a backup):
--   1. gateway_settings has 4 rows; exactly one is_active.
--   2. Admin Payment Settings page loads and shows all four
--      gateways with their live status.
--   3. Checkout still defaults to cashfree when no row is active.
-- =====================================================================

-- ---------- gateway_settings ----------
create table if not exists public.gateway_settings (
  id uuid primary key default gen_random_uuid(),
  gateway text not null unique
    check (gateway in ('cashfree', 'razorpay', 'stripe', 'paypal')),
  display_name text not null,
  is_active boolean not null default false,
  mode text not null default 'sandbox'
    check (mode in ('sandbox', 'live')),
  currency text not null default 'INR'
    check (currency in ('INR', 'USD', 'EUR', 'GBP')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.gateway_settings is
  'Non-secret payment gateway config, one row per gateway. Secret keys live only in Supabase function secrets. is_active picks the checkout gateway; mode picks sandbox/live keys. Exactly one gateway may be active at a time.';

-- Exactly one active gateway: a unique index on the boolean column
-- with a predicate only admits a single true value.
create unique index if not exists gateway_settings_one_active_idx
  on public.gateway_settings (is_active)
  where is_active;

drop trigger if exists update_gateway_settings_updated_at on public.gateway_settings;
create trigger update_gateway_settings_updated_at
  before update on public.gateway_settings
  for each row execute function update_updated_at_column();

alter table public.gateway_settings enable row level security;

-- Admin-only: super_admin manages gateway config. No policies for
-- anon/authenticated non-admins (deny by default). The checkout
-- client reads the active row through a dedicated read policy below;
-- secrets are never in this table, so read access is safe.
drop policy if exists gateway_settings_admin_all on public.gateway_settings;
create policy gateway_settings_admin_all
  on public.gateway_settings
  for all
  to authenticated
  using (is_admin())
  with check (is_admin());

drop policy if exists gateway_settings_select_active on public.gateway_settings;
create policy gateway_settings_select_active
  on public.gateway_settings
  for select
  to authenticated
  using (is_active = true);

-- ---------- seed rows ----------
insert into public.gateway_settings (gateway, display_name, is_active, mode, currency, notes)
values
  ('cashfree', 'Cashfree', true, 'sandbox', 'INR',
   'India-first gateway (UPI, cards, netbanking). Live since v1.'),
  ('razorpay', 'Razorpay', false, 'sandbox', 'INR',
   'India-first gateway (UPI, cards, netbanking). Needs test keys + webhook secret.'),
  ('stripe', 'Stripe', false, 'sandbox', 'INR',
   'International gateway. NOTE: Stripe India is invite-only for new businesses.'),
  ('paypal', 'PayPal', false, 'sandbox', 'USD',
   'International gateway. PayPal India supports international payments only — no domestic INR.')
on conflict (gateway) do nothing;

notify pgrst, 'reload schema';
