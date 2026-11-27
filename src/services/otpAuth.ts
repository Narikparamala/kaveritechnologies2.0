/**
 * Supabase OTP auth — email + phone one-time codes.
 *
 * ADDITIVE ONLY (2026-11-24, feature/supabase-otp): this module adds OTP
 * sign-in alongside the existing password + Google OAuth flows. It does not
 * change `signIn` / `signUp` in AuthContext, the password reset flow, or any
 * existing page behaviour.
 *
 * - Email OTP: `signInWithOtp({ email })` + `verifyOtp({ type: 'email' })`.
 *   Needs NO extra provider — it uses the same Supabase Auth mailer that
 *   already sends confirmation / password-reset emails. NOTE: whether the
 *   email contains a 6-digit code or a magic link depends on the Supabase
 *   dashboard email template (Auth → Templates → "Magic Link" must contain
 *   `{{ .Token }}` for a code). The UI therefore tells the user to either
 *   type the code OR click the link in the email — both sign the user in.
 * - Phone OTP: `signInWithOtp({ phone })` + `verifyOtp({ type: 'sms' })`.
 *   GATED on dashboard setup: Supabase dashboard → Authentication →
 *   Providers → Phone must be enabled with an SMS provider (Twilio) and
 *   its keys. Until then every phone request fails cleanly with a
 *   "provider not configured" error, which `friendlyOtpError` turns into a
 *   plain-English message. No Firebase Phone Auth is used, no SMS keys
 *   live in this repo.
 * - Phone linking for a signed-in user: `updateUser({ phone })` sends the
 *   SMS code, then `verifyOtp({ type: 'phone_change' })` confirms it.
 *   Supabase Auth itself records `phone_confirmed_at`; no DB migration
 *   was needed and `profiles.phone` (already a column) is populated by
 *   the existing `handle_new_user` / profile sync.
 */

import { supabase } from '../lib/supabase';

export const OTP_CODE_LENGTH = 6;
/** Resend cooldown, seconds. Supabase also rate-limits server-side. */
export const OTP_RESEND_COOLDOWN_SECONDS = 60;

export type OtpChannel = 'email' | 'phone';

/**
 * Normalise a user-typed phone number to E.164.
 * Accepts "+91 98765 43210", "919876543210", or a bare 10-digit Indian
 * number (assumed +91). Returns null when it cannot be normalised.
 */
export function normalizePhoneNumber(input: string): string | null {
  const digits = input.replace(/[\s\-().]/g, '');
  if (/^\+[1-9]\d{7,14}$/.test(digits)) return digits;
  if (/^\d{10}$/.test(digits)) return `+91${digits}`;
  if (/^91\d{10}$/.test(digits)) return `+${digits}`;
  return null;
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

/**
 * Turn a raw Supabase Auth error into a message a user can act on.
 * In particular, a missing SMS provider is reported as a setup problem,
 * not as a wrong-code problem.
 */
export function friendlyOtpError(error: { message?: string; status?: number } | null | undefined): string {
  if (!error) return 'Something went wrong. Please try again.';
  const raw = error.message ?? '';
  const message = raw.toLowerCase();

  if (
    message.includes('sms') ||
    message.includes('phone provider') ||
    message.includes('twilio') ||
    message.includes('messagebird') ||
    message.includes('vonage') ||
    message.includes('provider is not enabled') ||
    message.includes('unsupported phone provider') ||
    message.includes('error sending sms') ||
    message.includes('phone not confirmed')
  ) {
    return (
      'Phone sign-in is not set up yet: no SMS provider is enabled in the Supabase dashboard ' +
      '(Authentication → Providers → Phone, Twilio). Email-code sign-in still works — ' +
      'use that for now, or ask an admin to connect Twilio.'
    );
  }
  if (message.includes('rate limit') || message.includes('too many requests') || error.status === 429) {
    return 'Too many attempts. Please wait a minute before trying again.';
  }
  if (message.includes('expired') || message.includes('token has expired')) {
    return 'That code has expired. Request a new code and try again.';
  }
  if (
    message.includes('invalid') ||
    message.includes('incorrect') ||
    message.includes('token not found') ||
    message.includes('otp expired')
  ) {
    return 'That code is incorrect or has expired. Check the latest code and try again.';
  }
  if (message.includes('signups not allowed') || message.includes('signup is disabled')) {
    return 'New sign-ups are disabled for this method. Please sign in with your password or Google instead.';
  }
  if (message.includes('user not found') || message.includes('no user')) {
    return 'No account exists for that email or phone number. Create an account first, or sign in another way.';
  }
  if (message.includes('email not confirmed')) {
    return 'Please verify your email address before signing in. Check your inbox.';
  }
  return raw || 'Something went wrong. Please try again.';
}

/** True when the error means the SMS provider is not configured. */
export function isSmsProviderError(error: { message?: string } | null | undefined): boolean {
  if (!error?.message) return false;
  const message = error.message.toLowerCase();
  return (
    message.includes('sms') ||
    message.includes('phone provider') ||
    message.includes('twilio') ||
    message.includes('provider is not enabled') ||
    message.includes('unsupported phone provider') ||
    message.includes('error sending sms')
  );
}

function redirectToAuthRedirect(): string {
  return `${window.location.origin}/auth/redirect`;
}

/**
 * Send a 6-digit email code (or magic link, depending on the dashboard
 * email template — see the module docstring).
 * `createUser: false` on login so a typo'd email cannot create an account;
 * `createUser: true` on register, with the full name stored as user metadata
 * so the profile trigger can pick it up.
 */
export async function requestEmailOtp(
  email: string,
  options: { createUser?: boolean; fullName?: string } = {},
): Promise<{ error: string | null }> {
  const { error } = await supabase.auth.signInWithOtp({
    email: email.trim(),
    options: {
      shouldCreateUser: options.createUser ?? false,
      emailRedirectTo: redirectToAuthRedirect(),
      ...(options.fullName ? { data: { full_name: options.fullName } } : {}),
    },
  });
  return { error: error ? friendlyOtpError(error) : null };
}

export async function verifyEmailOtp(
  email: string,
  token: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase.auth.verifyOtp({
    email: email.trim(),
    token: token.trim(),
    type: 'email',
  });
  return { error: error ? friendlyOtpError(error) : null };
}

/** Send an SMS code to a phone number (fails cleanly until Twilio is set up). */
export async function requestPhoneOtp(
  phone: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase.auth.signInWithOtp({
    phone,
    options: { shouldCreateUser: false },
  });
  return { error: error ? friendlyOtpError(error) : null };
}

export async function verifyPhoneOtp(
  phone: string,
  token: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase.auth.verifyOtp({
    phone,
    token: token.trim(),
    type: 'sms',
  });
  return { error: error ? friendlyOtpError(error) : null };
}

/**
 * Signed-in user linking a phone number: sends the SMS code for the
 * number change. Verify with `verifyPhoneChangeOtp`.
 */
export async function requestPhoneChangeOtp(
  phone: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase.auth.updateUser({ phone });
  return { error: error ? friendlyOtpError(error) : null };
}

export async function verifyPhoneChangeOtp(
  phone: string,
  token: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase.auth.verifyOtp({
    phone,
    token: token.trim(),
    type: 'phone_change',
  });
  return { error: error ? friendlyOtpError(error) : null };
}
