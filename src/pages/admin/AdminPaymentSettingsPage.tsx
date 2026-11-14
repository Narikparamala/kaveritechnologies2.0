import { useEffect, useState } from 'react';
import { CreditCard, Save, RefreshCw, CheckCircle2, XCircle, HelpCircle, AlertTriangle } from 'lucide-react';
import { PageHeader } from '../../components/common/PageHeader';
import { useToast } from '../../components/ui/Toast';
import { supabase } from '../../lib/supabase';
import {
  PAYMENT_PROVIDERS, GATEWAY_IDS, probeGatewayStatus,
} from '../../lib/payments';
import type { GatewayId, GatewayStatus } from '../../lib/payments';

type GatewaySettingRow = {
  gateway: GatewayId;
  display_name: string;
  is_active: boolean;
  mode: 'sandbox' | 'live';
  currency: string;
};

type ProbeState = GatewayStatus | 'probing';

const CURRENCIES = ['INR', 'USD', 'EUR', 'GBP'] as const;

// Setup instructions per gateway. Secret NAMES only — never values.
// Fees checked 2026-11-14 from the gateways' own docs; re-check before
// quoting them to students, they change.
const SETUP: Record<GatewayId, { secrets: string[]; steps: string[]; fees: string; note?: string }> = {
  cashfree: {
    secrets: ['CASHFREE_TEST_APP_ID', 'CASHFREE_TEST_SECRET_KEY'],
    steps: [
      'Cashfree is already wired in test mode — its test secrets live as Supabase function secrets on the staging project.',
      'In the Cashfree merchant dashboard (Test Environment → API Keys) the test key pair can be viewed again; the secret is shown once per reveal.',
      'Whitelist the site domain in the Cashfree dashboard — the checkout SDK refuses to open on a domain that is not whitelisted.',
      'Live mode is a separate, deliberate step: production KYC + live keys (CASHFREE_APP_ID / CASHFREE_SECRET_KEY) + the live domain whitelisted. Do it only after the sandbox test passes.',
    ],
    fees: '1.95% + GST (2.30% all-in). Festive offer: 0% platform fee for new merchants up to ₹20 lakh GMV or 31 Mar 2027 (GST still applies).',
  },
  razorpay: {
    secrets: ['RAZORPAY_TEST_KEY_ID', 'RAZORPAY_TEST_KEY_SECRET', 'RAZORPAY_TEST_WEBHOOK_SECRET'],
    steps: [
      'Create a Razorpay merchant account at razorpay.com, then Dashboard → Settings → API Keys → Generate Test Key (Key ID rzp_test_…, Key Secret).',
      'Dashboard → Settings → Webhooks → Add New Webhook: paste the webhook URL below, subscribe to payment.captured, and copy the webhook secret you choose there (a separate secret from the Key Secret).',
      'Set the three test secrets above as Supabase function secrets (Dashboard → Edge Functions → razorpay-payments → Secrets, or the Supabase CLI).',
      'Back here: pick Razorpay as the active gateway, mode Sandbox, and Save. Checkout then uses Razorpay with no code change.',
      'Test with UPI success@razorpay or the test card 4100 2800 0000 1007.',
    ],
    fees: 'Standard domestic 2% + GST (2.36% all-in). UPI: 0% MDR but the 2% platform fee still applies. Intro offer: 0% platform fee for the first 90 days (new merchants, up to ₹5 lakh GMV).',
    note: 'No checkout domain whitelist is needed for Razorpay.',
  },
  stripe: {
    secrets: ['STRIPE_TEST_SECRET_KEY', 'STRIPE_TEST_WEBHOOK_SECRET', 'LMS_PUBLIC_URL'],
    steps: [
      'Stripe India is invite-only for new businesses — request an invite via Stripe Sales first. Without it you cannot create an Indian Stripe account.',
      'Once in: Dashboard → Developers → API keys → copy the test secret key (sk_test_…).',
      'Developers → Webhooks → Add endpoint: paste the webhook URL below, subscribe to checkout.session.completed and checkout.session.async_payment_succeeded, and copy the endpoint signing secret (whsec_…).',
      'Set the three secrets above as Supabase function secrets. LMS_PUBLIC_URL is the public site URL the success/cancel pages are built from.',
      'Back here: pick Stripe as the active gateway, mode Sandbox, and Save.',
      'Test with the card 4242 4242 4242 4242.',
    ],
    fees: 'India: 2% domestic cards, 3% international cards, +2% currency conversion. No setup or monthly fee.',
    note: 'Domestic UPI via Stripe Checkout for Indian accounts is not confirmed — verify in the dashboard before promising it.',
  },
  paypal: {
    secrets: ['PAYPAL_TEST_CLIENT_ID', 'PAYPAL_TEST_CLIENT_SECRET', 'PAYPAL_TEST_WEBHOOK_ID', 'LMS_PUBLIC_URL'],
    steps: [
      'Create a sandbox REST app at developer.paypal.com → My Apps & Credentials → Sandbox → Create App. Copy the Client ID and Secret.',
      'Webhooks → Add webhook: paste the webhook URL below, subscribe to CHECKOUT.ORDER.COMPLETED and PAYMENT.CAPTURE.COMPLETED, and copy the webhook ID.',
      'Set the four secrets above as Supabase function secrets. LMS_PUBLIC_URL is the public site URL the return/cancel pages are built from.',
      'Back here: pick PayPal as the active gateway, mode Sandbox, and Save.',
    ],
    fees: 'India receiving: 4.40% + fixed fee (USD $0.30 / INR ₹3.00). Currency conversion +3.0% above the base rate. Dispute fee $8.00 / ₹580.',
    note: 'PayPal India supports INTERNATIONAL payments only — no domestic India-to-India payments. Prices are charged in USD for Indian merchants.',
  },
};

function statusBadge(status: ProbeState) {
  if (status === 'probing') {
    return <span className="text-xs font-medium px-2 py-1 rounded-full bg-slate-100 text-slate-500 dark:bg-slate-800">Checking…</span>;
  }
  if (status === 'configured') {
    return (
      <span className="text-xs font-medium px-2 py-1 rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 flex items-center gap-1">
        <CheckCircle2 size={12} /> Configured
      </span>
    );
  }
  if (status === 'not-configured') {
    return (
      <span className="text-xs font-medium px-2 py-1 rounded-full bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 flex items-center gap-1">
        <XCircle size={12} /> Not configured
      </span>
    );
  }
  return (
    <span className="text-xs font-medium px-2 py-1 rounded-full bg-slate-100 text-slate-500 dark:bg-slate-800 flex items-center gap-1">
      <HelpCircle size={12} /> Unknown
    </span>
  );
}

export default function AdminPaymentSettingsPage() {
  const { success, error: toastError } = useToast();
  const [rows, setRows] = useState<GatewaySettingRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [tableMissing, setTableMissing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [probes, setProbes] = useState<Record<GatewayId, ProbeState>>({
    cashfree: 'probing', razorpay: 'probing', stripe: 'probing', paypal: 'probing',
  });

  const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.replace(/\/$/, '');

  const runProbes = () => {
    setProbes({ cashfree: 'probing', razorpay: 'probing', stripe: 'probing', paypal: 'probing' });
    for (const gateway of GATEWAY_IDS) {
      void probeGatewayStatus(gateway).then(status => {
        setProbes(prev => ({ ...prev, [gateway]: status }));
      }).catch(() => {
        setProbes(prev => ({ ...prev, [gateway]: 'unknown' }));
      });
    }
  };

  useEffect(() => {
    supabase.from('gateway_settings').select('*').order('gateway')
      .then(({ data, error }) => {
        if (error) {
          // Most likely the migration has not been applied yet.
          setTableMissing(true);
        } else {
          setRows((data ?? []) as GatewaySettingRow[]);
          runProbes();
        }
        setLoading(false);
      });
  }, []);

  const updateRow = (gateway: GatewayId, patch: Partial<GatewaySettingRow>) => {
    setRows(rs => (rs ?? []).map(r => (r.gateway === gateway ? { ...r, ...patch } : r)));
  };

  const setActive = (gateway: GatewayId) => {
    setRows(rs => (rs ?? []).map(r => ({ ...r, is_active: r.gateway === gateway })));
  };

  const handleSave = async () => {
    if (!rows) return;
    setSaving(true);
    for (const r of rows) {
      const { error } = await supabase.from('gateway_settings')
        .update({ is_active: r.is_active, mode: r.mode, currency: r.currency })
        .eq('gateway', r.gateway);
      if (error) {
        toastError('Save failed', error.message);
        setSaving(false);
        return;
      }
    }
    success('Payment settings saved!');
    setSaving(false);
  };

  if (loading) {
    return <div className="p-8 animate-pulse"><div className="h-8 bg-slate-100 dark:bg-slate-800 rounded w-1/3 mb-8" /></div>;
  }

  if (tableMissing) {
    return (
      <div className="p-6 lg:p-8 max-w-3xl mx-auto animate-fade-in">
        <PageHeader
          title="Payment Settings"
          subtitle="One active gateway, test/live mode, and currency per gateway"
          icon={CreditCard}
        />
        <div className="card p-6">
          <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
            The <code>gateway_settings</code> table does not exist yet — the migration{' '}
            <code>20261114120000_payment_gateway_settings.sql</code> has not been applied to
            this Supabase project. Apply it (staging first, with a backup), then reload this
            page. Until then checkout keeps using the Cashfree default from the environment.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 max-w-3xl mx-auto animate-fade-in">
      <PageHeader
        title="Payment Settings"
        subtitle="One active gateway, test/live mode, and currency per gateway"
        icon={CreditCard}
        action={
          <div className="flex items-center gap-2">
            <button onClick={runProbes} className="btn-secondary flex items-center gap-2" title="Re-check each gateway's live status">
              <RefreshCw size={14} /> Re-check status
            </button>
            <button onClick={handleSave} disabled={saving} className="btn-primary flex items-center gap-2">
              <Save size={14} /> {saving ? 'Saving…' : 'Save All'}
            </button>
          </div>
        }
      />

      <div className="card p-5 mb-6 flex gap-3 bg-amber-50/60 dark:bg-amber-900/10 border-amber-200 dark:border-amber-800">
        <AlertTriangle size={18} className="text-amber-600 shrink-0 mt-0.5" />
        <div className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
          <strong className="text-slate-900 dark:text-white">What this page cannot do.</strong>{' '}
          Creating a merchant account, KYC, and each gateway&apos;s own domain/webhook approval
          happen in that gateway&apos;s dashboard — they cannot be automated. Everything after
          you paste the keys as Supabase function secrets is automatic: the edge function
          activates itself, checkout uses the active gateway with no code change, and webhooks
          grant enrolment automatically. Secret keys never go in this table or in the repo.
        </div>
      </div>

      <div className="space-y-5">
        {(rows ?? []).map(row => {
          const provider = PAYMENT_PROVIDERS[row.gateway];
          const setup = SETUP[row.gateway];
          const webhookUrl = supabaseUrl
            ? `${supabaseUrl}/functions/v1/${provider.edgeFunction}/webhook`
            : `https://<your-project-ref>.supabase.co/functions/v1/${provider.edgeFunction}/webhook`;
          return (
            <div key={row.gateway} className="card p-6">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-slate-900 dark:text-white">{provider.label}</h3>
                    {row.is_active && (
                      <span className="text-xs font-medium px-2 py-1 rounded-full bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300">Active</span>
                    )}
                  </div>
                  <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{provider.blurb}</p>
                </div>
                {statusBadge(probes[row.gateway])}
              </div>

              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="label">Mode</label>
                  {row.gateway === 'cashfree' ? (
                    <>
                      <select className="input" value={row.mode} disabled title="Cashfree live activation is a separate, deliberate step — the v1 function reads test secrets only.">
                        <option value="sandbox">Sandbox (test)</option>
                      </select>
                      <p className="text-xs text-slate-400 mt-1">Cashfree live activation is a separate step (see below) — the v1 function reads test secrets only.</p>
                    </>
                  ) : (
                    <select className="input" value={row.mode} onChange={e => updateRow(row.gateway, { mode: e.target.value as 'sandbox' | 'live' })}>
                      <option value="sandbox">Sandbox (test)</option>
                      <option value="live">Live</option>
                    </select>
                  )}
                </div>
                <div>
                  <label className="label">Currency</label>
                  <select className="input" value={row.currency} onChange={e => updateRow(row.gateway, { currency: e.target.value })}>
                    {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>

              {!row.is_active && (
                <button
                  onClick={() => setActive(row.gateway)}
                  disabled={probes[row.gateway] === 'not-configured'}
                  className="btn-secondary text-sm mb-4"
                  title={probes[row.gateway] === 'not-configured' ? 'Set this gateway’s secrets first — its edge function is not configured yet.' : undefined}
                >
                  Set as active gateway
                </button>
              )}
              {!row.is_active && probes[row.gateway] === 'not-configured' && (
                <p className="text-xs text-amber-600 dark:text-amber-400 mb-4 -mt-2">
                  Set this gateway&apos;s secrets first (steps below) — its edge function reports not configured.
                </p>
              )}

              <details className="text-sm">
                <summary className="cursor-pointer font-medium text-slate-700 dark:text-slate-200">
                  Setup steps — {provider.label}
                </summary>
                <ol className="list-decimal ml-5 mt-3 space-y-1.5 text-slate-600 dark:text-slate-300 leading-relaxed">
                  {setup.steps.map((step, i) => <li key={i}>{step}</li>)}
                </ol>
                <p className="mt-3 text-slate-600 dark:text-slate-300">
                  <strong>Function secrets to set</strong> (Supabase Dashboard → Edge Functions → {provider.edgeFunction} → Secrets — names only, never paste values here):{' '}
                  <code>{setup.secrets.join(', ')}</code>
                </p>
                <p className="mt-2 text-slate-600 dark:text-slate-300">
                  <strong>Webhook URL</strong> (paste this in the gateway dashboard):{' '}
                  <code className="break-all">{webhookUrl}</code>
                </p>
                <p className="mt-2 text-slate-600 dark:text-slate-300">
                  <strong>Fees</strong> (checked 2026-11-14, re-check before quoting): {setup.fees}
                </p>
                {setup.note && <p className="mt-2 text-slate-600 dark:text-slate-300"><strong>Note:</strong> {setup.note}</p>}
              </details>
            </div>
          );
        })}
      </div>

      <p className="text-xs text-slate-400 mt-6 leading-relaxed">
        Status is detected live: &ldquo;Configured&rdquo; means the gateway&apos;s edge function answered
        (it still needs its secrets to be the right ones — a wrong key fails at checkout, not
        here). &ldquo;Not configured&rdquo; means the function fail-closed with 503 because its secrets
        are missing. Prices are a single number on each course; the active gateway&apos;s currency
        applies. PayPal is USD-only for Indian merchants.
      </p>
    </div>
  );
}
