import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, ArrowLeft, CheckCircle, AlertCircle } from 'lucide-react';
import { Logo } from '../../components/ui/Logo';
import { ThemeToggle } from '../../components/ui/ThemeToggle';
import { supabase } from '../../lib/supabase';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) { setError('Please enter your email address.'); return; }
    setLoading(true);
    setError('');
    const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (err) {
      setError(err.message);
    } else {
      setSent(true);
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="flex items-center justify-between mb-8">
          <Link to="/"><Logo size="sm" /></Link>
          <ThemeToggle />
        </div>

        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">Reset your password</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm">
            Enter your email and we'll send you a reset link.
          </p>
        </div>

        {sent ? (
          <div className="card p-8 text-center">
            <CheckCircle size={48} className="text-emerald-500 mx-auto mb-4" />
            <h2 className="font-bold text-xl text-slate-900 dark:text-white mb-2">Check your email</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
              We sent a password reset link to <strong className="text-slate-700 dark:text-slate-300">{email}</strong>.
            </p>
            <Link to="/login" className="btn-primary inline-flex">Back to Sign In</Link>
          </div>
        ) : (
          <div className="card p-8">
            <form onSubmit={handleSubmit} className="space-y-5">
              {error && (
                <div className="flex items-center gap-2 p-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 text-red-700 dark:text-red-400 text-sm">
                  <AlertCircle size={15} className="flex-shrink-0" /> {error}
                </div>
              )}
              <div>
                <label className="label" htmlFor="fp-email">
                  <Mail size={14} className="inline mr-1" /> Email Address
                </label>
                <input
                  id="fp-email"
                  type="email"
                  className="input"
                  placeholder="you@example.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                />
              </div>
              <button type="submit" disabled={loading} className="btn-primary w-full py-3">
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Sending...
                  </span>
                ) : 'Send Reset Link'}
              </button>
            </form>
            <div className="mt-5 text-center">
              <Link to="/login" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors">
                <ArrowLeft size={14} /> Back to Sign In
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
