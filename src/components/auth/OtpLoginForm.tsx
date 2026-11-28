/**
 * OTP sign-in form — email code (primary) and SMS code (dashboard-gated).
 *
 * ADDITIVE ONLY (2026-11-24, feature/supabase-otp): rendered by LoginPage
 * and RegisterPage as an *additional* option next to the existing password
 * form and Google button. It never replaces or restyles them.
 *
 * Flow: enter email/phone → code sent → enter 6-digit code → verified →
 * navigate to /auth/redirect, where the existing AuthContext session /
 * profile flow takes over exactly as password login does (AuthRedirectPage
 * retries the profile fetch, so no extra session handling is needed here).
 *
 * Phone (SMS) will fail until Twilio is enabled in the Supabase dashboard
 * (Authentication → Providers → Phone). That failure is shown in plain
 * English, never as a raw provider error, and the email-code tab keeps
 * working.
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, CheckCircle, KeyRound, Mail, MessageSquareText, ArrowLeft } from 'lucide-react';
import {
  OTP_CODE_LENGTH,
  OTP_RESEND_COOLDOWN_SECONDS,
  isValidEmail,
  normalizePhoneNumber,
  requestEmailOtp,
  requestPhoneOtp,
  verifyEmailOtp,
  verifyPhoneOtp,
  type OtpChannel,
} from '../../services/otpAuth';

interface OtpLoginFormProps {
  /** 'login' = sign in to an existing account; 'register' = create one with a code. */
  mode: 'login' | 'register';
  onBack: () => void;
}

export function OtpLoginForm({ mode, onBack }: OtpLoginFormProps) {
  const navigate = useNavigate();
  // Register is email-only: a phone sign-up would create an account with no
  // full name, and the profile trigger reads full_name from user metadata.
  const [channel, setChannel] = useState<OtpChannel>('email');
  const [fullName, setFullName] = useState('');
  const [identifier, setIdentifier] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'request' | 'verify'>('request');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(() => setCooldown(c => c - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  const sendCode = async (): Promise<boolean> => {
    setError('');
    setInfo('');
    if (mode === 'register' && !fullName.trim()) {
      setError('Please enter your full name.');
      return false;
    }
    if (channel === 'email') {
      if (!isValidEmail(identifier)) {
        setError('Please enter a valid email address.');
        return false;
      }
      setLoading(true);
      const { error: err } = await requestEmailOtp(identifier, {
        createUser: mode === 'register',
        fullName: mode === 'register' ? fullName.trim() : undefined,
      });
      setLoading(false);
      if (err) {
        setError(err);
        return false;
      }
      setInfo(`Code sent to ${identifier.trim()}. It can take a minute to arrive.`);
    } else {
      const phone = normalizePhoneNumber(identifier);
      if (!phone) {
        setError('Please enter a valid phone number, e.g. +91 98765 43210 or a 10-digit Indian number.');
        return false;
      }
      setLoading(true);
      const { error: err } = await requestPhoneOtp(phone);
      setLoading(false);
      if (err) {
        setError(err);
        return false;
      }
      setInfo(`Code sent by SMS to ${phone}. It can take a minute to arrive.`);
    }
    setStep('verify');
    setCooldown(OTP_RESEND_COOLDOWN_SECONDS);
    return true;
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (code.trim().length !== OTP_CODE_LENGTH) {
      setError(`Please enter the ${OTP_CODE_LENGTH}-digit code.`);
      return;
    }
    setError('');
    setLoading(true);
    const { error: err } =
      channel === 'email'
        ? await verifyEmailOtp(identifier, code)
        : await verifyPhoneOtp(normalizePhoneNumber(identifier) ?? identifier, code);
    setLoading(false);
    if (err) {
      setError(err);
      return;
    }
    // Verified — the AuthContext onAuthStateChange listener picks up the new
    // session and loads the profile; /auth/redirect does the rest.
    navigate('/auth/redirect', { replace: true });
  };

  const handleResend = async () => {
    if (cooldown > 0 || loading) return;
    setCode('');
    await sendCode();
  };

  return (
    <div className="space-y-5 animate-fade-in">
      <button
        type="button"
        onClick={onBack}
        className="flex items-center gap-1.5 text-sm text-primary-600 dark:text-primary-400 hover:underline"
      >
        <ArrowLeft size={14} /> Back to {mode === 'register' ? 'password sign-up' : 'password sign-in'}
      </button>

      {mode === 'login' && (
        <div className="grid grid-cols-2 gap-2" role="tablist" aria-label="Code sign-in method">
          {(
            [
              { value: 'email' as OtpChannel, label: 'Email code', icon: Mail },
              { value: 'phone' as OtpChannel, label: 'SMS code', icon: MessageSquareText },
            ] as const
          ).map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={channel === value}
              onClick={() => {
                setChannel(value);
                setError('');
                setInfo('');
                setStep('request');
                setCode('');
              }}
              className={`flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 text-sm font-medium transition-all ${
                channel === value
                  ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300'
                  : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-600'
              }`}
            >
              <Icon size={15} /> {label}
            </button>
          ))}
        </div>
      )}

      {channel === 'phone' && (
        <p className="flex items-start gap-2 text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-3">
          <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
          <span>
            SMS codes need an SMS provider (Twilio) enabled in the Supabase dashboard
            (Authentication → Providers → Phone). Until an admin sets that up, SMS codes
            will fail — use the email code instead.
          </span>
        </p>
      )}

      {error && (
        <div className="flex items-start gap-3 p-4 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 text-red-700 dark:text-red-400 text-sm animate-fade-in">
          <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}
      {info && !error && (
        <div className="flex items-start gap-3 p-4 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-700 text-emerald-700 dark:text-emerald-400 text-sm animate-fade-in">
          <CheckCircle size={16} className="flex-shrink-0 mt-0.5" />
          <span>{info}</span>
        </div>
      )}

      {step === 'request' ? (
        <form
          onSubmit={e => {
            e.preventDefault();
            void sendCode();
          }}
          className="space-y-5"
          noValidate
        >
          {mode === 'register' && (
            <div>
              <label className="label" htmlFor="otp-full-name">Full Name</label>
              <input
                id="otp-full-name"
                className="input"
                placeholder="Your full name"
                value={fullName}
                onChange={e => setFullName(e.target.value)}
                autoComplete="name"
                required
              />
            </div>
          )}
          <div>
            <label className="label" htmlFor="otp-identifier">
              {channel === 'email' ? 'Email Address' : 'Phone Number'}
            </label>
            <input
              id="otp-identifier"
              type={channel === 'email' ? 'email' : 'tel'}
              className="input"
              placeholder={channel === 'email' ? 'you@example.com' : '+91 98765 43210'}
              value={identifier}
              onChange={e => setIdentifier(e.target.value)}
              autoComplete={channel === 'email' ? 'email' : 'tel'}
              required
            />
            {channel === 'phone' && (
              <p className="text-xs text-slate-400 mt-1.5">
                Enter your number with country code, or a 10-digit Indian number.
              </p>
            )}
          </div>
          <button
            type="submit"
            disabled={loading}
            className="btn-primary w-full flex items-center justify-center gap-2 py-3 text-base"
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <><KeyRound size={16} /> {mode === 'register' ? 'Send code & create account' : 'Send me a code'}</>
            )}
          </button>
          {channel === 'email' && (
            <p className="text-xs text-slate-400 text-center">
              We email you a 6-digit code. If your email instead contains a sign-in link, clicking it signs you in too.
            </p>
          )}
        </form>
      ) : (
        <form onSubmit={handleVerify} className="space-y-5" noValidate>
          <div>
            <label className="label" htmlFor="otp-code">
              {OTP_CODE_LENGTH}-digit code sent to {channel === 'email' ? identifier.trim() : normalizePhoneNumber(identifier) ?? identifier.trim()}
            </label>
            <input
              id="otp-code"
              className="input text-center text-2xl tracking-[0.5em] font-mono"
              placeholder="••••••"
              value={code}
              onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, OTP_CODE_LENGTH))}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={OTP_CODE_LENGTH}
              required
            />
            <p className="text-xs text-slate-400 mt-1.5">
              Codes expire after a few minutes. Wrong or expired codes show an error — just request a new one.
            </p>
          </div>
          <button
            type="submit"
            disabled={loading}
            className="btn-primary w-full flex items-center justify-center gap-2 py-3 text-base"
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <><KeyRound size={16} /> Verify & {mode === 'register' ? 'create account' : 'sign in'}</>
            )}
          </button>
          <p className="text-center text-sm">
            <button
              type="button"
              onClick={() => void handleResend()}
              disabled={cooldown > 0 || loading}
              className="text-primary-600 dark:text-primary-400 hover:underline font-medium disabled:text-slate-400 disabled:no-underline"
            >
              {cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}
            </button>
            {' · '}
            <button
              type="button"
              onClick={() => {
                setStep('request');
                setCode('');
                setError('');
                setInfo('');
              }}
              className="text-slate-500 dark:text-slate-400 hover:underline"
            >
              Use a different {channel === 'email' ? 'email' : 'phone number'}
            </button>
          </p>
        </form>
      )}
    </div>
  );
}
