import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Bell,
  CalendarCheck,
  CheckCircle2,
  Eye,
  EyeOff,
  Laptop,
  Loader2,
  LockKeyhole,
  LogOut,
  Moon,
  Palette,
  ShieldCheck,
  Sun,
  Unplug,
  UserRound,
} from 'lucide-react';
import { PageHeader } from '../../components/common/PageHeader';
import { Badge } from '../../components/ui/Badge';
import { useToast } from '../../components/ui/Toast';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { supabase } from '../../lib/supabase';
import {
  disconnectGoogleAccount,
  getGoogleConnectionStatus,
  getGoogleOAuthUrl,
} from '../../services/liveSessions';

type NotificationPreferences = {
  submissions: boolean;
  liveClasses: boolean;
  support: boolean;
  announcements: boolean;
};

const DEFAULT_PREFERENCES: NotificationPreferences = {
  submissions: true,
  liveClasses: true,
  support: true,
  announcements: true,
};

type PreferenceKey = keyof NotificationPreferences;

function SettingToggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onChange}
      className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${
        checked ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-600'
      }`}
    >
      <span
        className={`absolute left-1 top-1 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
          checked ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  );
}

export default function FacultySettingsPage() {
  const { profile } = useAuth();
  const { theme, setTheme } = useTheme();
  const { success, error: toastError } = useToast();
  const [searchParams] = useSearchParams();

  const [preferences, setPreferences] = useState(DEFAULT_PREFERENCES);
  const [googleConnected, setGoogleConnected] = useState(false);
  const [googleEmail, setGoogleEmail] = useState<string | null>(null);
  const [checkingGoogle, setCheckingGoogle] = useState(true);
  const [connectingGoogle, setConnectingGoogle] = useState(false);
  const [disconnectingGoogle, setDisconnectingGoogle] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [updatingPassword, setUpdatingPassword] = useState(false);
  const [signingOutOthers, setSigningOutOthers] = useState(false);

  const preferencesKey = useMemo(
    () => `kaveri:faculty-settings:${profile?.id ?? 'preview'}`,
    [profile?.id],
  );

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(preferencesKey);
      if (saved) {
        setPreferences({ ...DEFAULT_PREFERENCES, ...JSON.parse(saved) });
      } else {
        setPreferences(DEFAULT_PREFERENCES);
      }
    } catch {
      setPreferences(DEFAULT_PREFERENCES);
    }
  }, [preferencesKey]);

  const loadGoogleStatus = useCallback(async () => {
    if (!profile?.id) {
      setCheckingGoogle(false);
      return;
    }

    setCheckingGoogle(true);
    try {
      const status = await getGoogleConnectionStatus(profile.id);
      setGoogleConnected(status.connected);
      setGoogleEmail(status.google_email);
    } catch (error) {
      console.error('Could not load Google connection status:', error);
      setGoogleConnected(false);
      setGoogleEmail(null);
    } finally {
      setCheckingGoogle(false);
    }
  }, [profile?.id]);

  useEffect(() => {
    void loadGoogleStatus();
  }, [loadGoogleStatus]);

  useEffect(() => {
    if (searchParams.get('google_connected') !== '1') return;

    const email = searchParams.get('google_email');
    setGoogleConnected(true);
    setGoogleEmail(email);
    success('Google account connected', 'Meet links can now be generated automatically.');

    const url = new URL(window.location.href);
    url.searchParams.delete('google_connected');
    url.searchParams.delete('google_email');
    window.history.replaceState({}, '', url.toString());
  }, [searchParams, success]);

  const updatePreference = (key: PreferenceKey) => {
    setPreferences((current) => {
      const next = { ...current, [key]: !current[key] };
      try {
        window.localStorage.setItem(preferencesKey, JSON.stringify(next));
      } catch (error) {
        console.error('Could not save faculty preferences:', error);
      }
      return next;
    });
  };

  const connectGoogle = async () => {
    if (!profile?.id) {
      toastError('Could not connect Google', 'Your faculty profile is not available.');
      return;
    }

    setConnectingGoogle(true);
    try {
      const redirectUri = `${window.location.origin}${window.location.pathname}${window.location.search}`;
      const authUrl = await getGoogleOAuthUrl(profile.id, redirectUri);
      if (!authUrl) throw new Error('Google authorization URL was not returned.');
      window.location.href = authUrl;
    } catch (error) {
      console.error('Could not start Google connection:', error);
      toastError('Could not connect Google', 'Please try again or check the Google integration setup.');
      setConnectingGoogle(false);
    }
  };

  const disconnectGoogle = async () => {
    if (!profile?.id) return;
    if (!window.confirm('Disconnect this Google account? New Meet links will no longer be generated automatically.')) {
      return;
    }

    setDisconnectingGoogle(true);
    try {
      await disconnectGoogleAccount(profile.id);
      setGoogleConnected(false);
      setGoogleEmail(null);
      success('Google account disconnected');
    } catch (error) {
      console.error('Could not disconnect Google account:', error);
      toastError('Could not disconnect Google', 'Please try again.');
    } finally {
      setDisconnectingGoogle(false);
    }
  };

  const updatePassword = async () => {
    if (newPassword.length < 8) {
      toastError('Password is too short', 'Use at least 8 characters.');
      return;
    }

    if (newPassword !== confirmPassword) {
      toastError('Passwords do not match', 'Enter the same password in both fields.');
      return;
    }

    setUpdatingPassword(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      setNewPassword('');
      setConfirmPassword('');
      success('Password updated', 'Use your new password the next time you sign in.');
    } catch (error) {
      console.error('Could not update password:', error);
      toastError('Could not update password', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setUpdatingPassword(false);
    }
  };

  const signOutOtherDevices = async () => {
    setSigningOutOthers(true);
    try {
      const { error } = await supabase.auth.signOut({ scope: 'others' });
      if (error) throw error;
      success('Other sessions signed out', 'This device remains signed in.');
    } catch (error) {
      console.error('Could not sign out other devices:', error);
      toastError('Could not sign out other devices', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setSigningOutOthers(false);
    }
  };

  const avatarUrl = profile?.avatar_url;
  const initials = (profile?.full_name || profile?.email || 'F')
    .split(/\s+/)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Faculty Settings"
        subtitle="Manage teaching preferences, integrations and account security"
        icon={ShieldCheck}
      />

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-4">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-blue-500 to-teal-500 text-xl font-bold text-white">
              {avatarUrl ? <img src={avatarUrl} alt="Faculty profile" className="h-full w-full object-cover" /> : initials}
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="truncate text-lg font-semibold text-slate-900 dark:text-white">
                  {profile?.full_name || 'Faculty member'}
                </h2>
                <Badge variant="success">Faculty / Trainer</Badge>
              </div>
              <p className="truncate text-sm text-slate-500 dark:text-slate-400">{profile?.email}</p>
            </div>
          </div>
          <Link to="/faculty/profile" className="btn-secondary inline-flex items-center justify-center gap-2">
            <UserRound size={17} /> Edit faculty profile
          </Link>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-800">
          <div className="mb-5 flex items-start gap-3">
            <div className="rounded-xl bg-violet-50 p-2.5 text-violet-600 dark:bg-violet-500/10 dark:text-violet-300">
              <Palette size={21} />
            </div>
            <div>
              <h2 className="font-semibold text-slate-900 dark:text-white">Appearance</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">Choose how your faculty workspace looks.</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setTheme('light')}
              className={`rounded-xl border p-4 text-left transition ${
                theme === 'light'
                  ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500 dark:bg-blue-500/10'
                  : 'border-slate-200 hover:border-slate-300 dark:border-slate-700 dark:hover:border-slate-600'
              }`}
            >
              <Sun className="mb-3 text-amber-500" size={23} />
              <p className="font-medium text-slate-900 dark:text-white">Light</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">Bright workspace</p>
            </button>
            <button
              type="button"
              onClick={() => setTheme('dark')}
              className={`rounded-xl border p-4 text-left transition ${
                theme === 'dark'
                  ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500 dark:bg-blue-500/10'
                  : 'border-slate-200 hover:border-slate-300 dark:border-slate-700 dark:hover:border-slate-600'
              }`}
            >
              <Moon className="mb-3 text-indigo-500" size={23} />
              <p className="font-medium text-slate-900 dark:text-white">Dark</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">Low-light workspace</p>
            </button>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-800">
          <div className="mb-5 flex items-start gap-3">
            <div className="rounded-xl bg-blue-50 p-2.5 text-blue-600 dark:bg-blue-500/10 dark:text-blue-300">
              <CalendarCheck size={21} />
            </div>
            <div>
              <h2 className="font-semibold text-slate-900 dark:text-white">Google Calendar & Meet</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">Create Meet links automatically for live classes.</p>
            </div>
          </div>

          {checkingGoogle ? (
            <div className="flex min-h-28 items-center justify-center text-slate-500">
              <Loader2 className="mr-2 animate-spin" size={19} /> Checking connection...
            </div>
          ) : googleConnected ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900 dark:bg-emerald-500/10">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 shrink-0 text-emerald-600" size={20} />
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-emerald-900 dark:text-emerald-200">Google account connected</p>
                  <p className="truncate text-sm text-emerald-700 dark:text-emerald-300">{googleEmail || 'Connected faculty account'}</p>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Link to="/faculty/live-classes" className="btn-primary inline-flex items-center gap-2">
                  <CalendarCheck size={16} /> Manage live classes
                </Link>
                <button
                  type="button"
                  onClick={disconnectGoogle}
                  disabled={disconnectingGoogle}
                  className="btn-secondary inline-flex items-center gap-2"
                >
                  {disconnectingGoogle ? <Loader2 className="animate-spin" size={16} /> : <Unplug size={16} />}
                  Disconnect
                </button>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
              <p className="text-sm text-slate-600 dark:text-slate-300">
                Connect the Google account that should own your Calendar events and Meet links.
              </p>
              <button
                type="button"
                onClick={connectGoogle}
                disabled={connectingGoogle}
                className="btn-primary mt-4 inline-flex items-center gap-2"
              >
                {connectingGoogle ? <Loader2 className="animate-spin" size={16} /> : <CalendarCheck size={16} />}
                Connect Google account
              </button>
            </div>
          )}
        </section>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-800">
        <div className="mb-2 flex items-start gap-3">
          <div className="rounded-xl bg-cyan-50 p-2.5 text-cyan-600 dark:bg-cyan-500/10 dark:text-cyan-300">
            <Bell size={21} />
          </div>
          <div>
            <h2 className="font-semibold text-slate-900 dark:text-white">Faculty alerts</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">Choose which teaching updates should be highlighted.</p>
          </div>
        </div>
        <p className="mb-4 ml-12 text-xs text-slate-400">These preferences are saved in this browser.</p>

        <div className="divide-y divide-slate-100 dark:divide-slate-700">
          {[
            ['submissions', 'New student submissions', 'Alert me when a student submits assignment or project work.'],
            ['liveClasses', 'Live-class reminders', 'Highlight upcoming classes and schedule changes.'],
            ['support', 'Student support alerts', 'Alert me when a student support record needs attention.'],
            ['announcements', 'Announcement updates', 'Show delivery and publishing updates for announcements.'],
          ].map(([key, title, description]) => (
            <div key={key} className="flex items-center justify-between gap-4 py-4">
              <div>
                <p className="font-medium text-slate-900 dark:text-white">{title}</p>
                <p className="text-sm text-slate-500 dark:text-slate-400">{description}</p>
              </div>
              <SettingToggle
                checked={preferences[key as PreferenceKey]}
                onChange={() => updatePreference(key as PreferenceKey)}
                label={title}
              />
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-800">
        <div className="mb-5 flex items-start gap-3">
          <div className="rounded-xl bg-amber-50 p-2.5 text-amber-600 dark:bg-amber-500/10 dark:text-amber-300">
            <LockKeyhole size={21} />
          </div>
          <div>
            <h2 className="font-semibold text-slate-900 dark:text-white">Account security</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">Protect your faculty account and teaching data.</p>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
            <h3 className="font-medium text-slate-900 dark:text-white">Change password</h3>
            <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">Use at least 8 characters.</p>
            <div className="space-y-3">
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  className="input pr-11"
                  placeholder="New password"
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((current) => !current)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              <input
                type={showPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                className="input"
                placeholder="Confirm new password"
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={updatePassword}
                disabled={updatingPassword || !newPassword || !confirmPassword}
                className="btn-primary inline-flex items-center gap-2"
              >
                {updatingPassword ? <Loader2 className="animate-spin" size={16} /> : <LockKeyhole size={16} />}
                Update password
              </button>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
            <div className="flex items-start gap-3">
              <Laptop className="mt-0.5 shrink-0 text-blue-600" size={21} />
              <div>
                <h3 className="font-medium text-slate-900 dark:text-white">Other signed-in devices</h3>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  End every other active session if you used a shared or lost device. This device stays signed in.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={signOutOtherDevices}
              disabled={signingOutOthers}
              className="btn-secondary mt-4 inline-flex items-center gap-2"
            >
              {signingOutOthers ? <Loader2 className="animate-spin" size={16} /> : <LogOut size={16} />}
              Sign out other devices
            </button>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 dark:border-amber-900 dark:bg-amber-500/10">
        <h2 className="font-semibold text-amber-900 dark:text-amber-200">Account access</h2>
        <p className="mt-1 text-sm text-amber-800 dark:text-amber-300">
          Faculty accounts contain course and student records. Contact an administrator if your account should be suspended or deactivated.
        </p>
      </section>
    </div>
  );
}
