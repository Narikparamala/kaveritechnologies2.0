/**
 * Phone verification card for the student Settings page.
 *
 * ADDITIVE ONLY (2026-11-24, feature/supabase-otp): a new, optional
 * section. A phone number is never required — existing users without one
 * see this card and can ignore it.
 *
 * Flow (signed-in user): enter phone → `updateUser({ phone })` sends an
 * SMS code → enter the 6-digit code → `verifyOtp({ type: 'phone_change' })`
 * confirms it. Supabase Auth records `phone_confirmed_at` itself and the
 * verified number lands in `profiles.phone` (column already exists).
 *
 * GATED: SMS codes need an SMS provider (Twilio) enabled in the Supabase
 * dashboard (Authentication → Providers → Phone). Until then the request
 * fails cleanly and this card says so in plain English. No Firebase Phone
 * Auth is used, no SMS keys live in this repo.
 */
import { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle, MessageSquareText, ShieldCheck } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../ui/Toast';
import {
  OTP_CODE_LENGTH,
  OTP_RESEND_COOLDOWN_SECONDS,
  normalizePhoneNumber,
  requestPhoneChangeOtp,
  verifyPhoneChangeOtp,
} from '../../services/otpAuth';

export function PhoneVerificationCard() {
  const { profile, refreshProfile } = useAuth();
  const { success } = useToast();
  const [phone, setPhone] = useState(profile?.phone ?? '');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'idle' | 'verify'>('idle');
  const [verified, setVerified] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (profile?.phone) setPhone(profile.phone);
  }, [profile?.phone]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      const { data } = await supabase.auth.getUser();
      if (!active) return;
      setVerified(Boolean(data.user?.phone_confirmed_at));
    };
    void load();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(() => setCooldown(c => c - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  const sendCode = async () => {
    const normalized = normalizePhoneNumber(phone);
    if (!normalized) {
      setError('Please enter a valid phone number, e.g. +91 98765 43210 or a 10-digit Indian number.');
      return;
    }
    setError('');
    setLoading(true);
    const { error: err } = await requestPhoneChangeOtp(normalized);
    setLoading(false);
    if (err) {
      setError(err);
      return;
    }
    setPhone(normalized);
    setStep('verify');
    setCooldown(OTP_RESEND_COOLDOWN_SECONDS);
  };

  const handleSendCode = (e: React.FormEvent) => {
    e.preventDefault();
    void sendCode();
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (code.trim().length !== OTP_CODE_LENGTH) {
      setError(`Please enter the ${OTP_CODE_LENGTH}-digit code.`);
      return;
    }
    setError('');
    setLoading(true);
    const { error: err } = await verifyPhoneChangeOtp(phone, code);
    setLoading(false);
    if (err) {
      setError(err);
      return;
    }
    setVerified(true);
    setStep('idle');
    setCode('');
    await refreshProfile();
    success('Phone number verified!');
  };

  return (
    <div className="card p-6">
      <h2 className="font-bold text-slate-900 dark:text-white mb-2 flex items-center gap-2">
        <ShieldCheck size={18} className="text-primary-600" /> Phone Verification
      </h2>
      <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
        Optional. Verify a phone number to sign in with an SMS code later.
        Your phone number is never shown on your public profile.
      </p>

      {verified && step === 'idle' && (
        <p className="flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl p-3 mb-4">
          <CheckCircle size={16} /> Phone verified{profile?.phone ? `: ${profile.phone}` : ''}
        </p>
      )}

      <p className="flex items-start gap-2 text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-3 mb-4">
        <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
        <span>
          SMS codes need an SMS provider (Twilio) enabled in the Supabase dashboard
          (Authentication → Providers → Phone). Until an admin sets that up, sending a
          code will fail with a clear message — nothing is charged and nothing breaks.
        </span>
      </p>

      {error && (
        <div className="flex items-start gap-3 p-4 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 text-red-700 dark:text-red-400 text-sm mb-4 animate-fade-in">
          <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {step === 'idle' ? (
        <form onSubmit={handleSendCode} className="space-y-4" noValidate>
          <div>
            <label className="label" htmlFor="verify-phone">Phone Number</label>
            <input
              id="verify-phone"
              type="tel"
              className="input"
              placeholder="+91 98765 43210"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              autoComplete="tel"
              required
            />
            <p className="text-xs text-slate-400 mt-1.5">
              Enter your number with country code, or a 10-digit Indian number.
            </p>
          </div>
          <button type="submit" disabled={loading} className="btn-primary text-sm flex items-center gap-2">
            {loading ? (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <MessageSquareText size={14} />
            )}
            {verified ? 'Verify a different number' : 'Send verification code'}
          </button>
        </form>
      ) : (
        <form onSubmit={handleVerify} className="space-y-4" noValidate>
          <div>
            <label className="label" htmlFor="verify-phone-code">
              {OTP_CODE_LENGTH}-digit code sent to {phone}
            </label>
            <input
              id="verify-phone-code"
              className="input text-center text-2xl tracking-[0.5em] font-mono"
              placeholder="••••••"
              value={code}
              onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, OTP_CODE_LENGTH))}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={OTP_CODE_LENGTH}
              required
            />
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => {
                setStep('idle');
                setCode('');
                setError('');
              }}
              className="btn-secondary text-sm"
            >
              Cancel
            </button>
            <button type="submit" disabled={loading} className="btn-primary text-sm flex items-center gap-2">
              {loading ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : null}
              Verify phone
            </button>
            <button
              type="button"
              onClick={() => void sendCode()}
              disabled={cooldown > 0 || loading}
              className="text-sm text-primary-600 dark:text-primary-400 hover:underline disabled:text-slate-400 disabled:no-underline self-center"
            >
              {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend code'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
