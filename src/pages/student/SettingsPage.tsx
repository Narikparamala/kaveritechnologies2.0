import { useState, useEffect } from 'react';
import { Settings, Sun, Moon, Lock, Eye, EyeOff, CheckCircle, Info } from 'lucide-react';
import { PageHeader } from '../../components/common/PageHeader';
import { useTheme } from '../../contexts/ThemeContext';
import { useToast } from '../../components/ui/Toast';
import { supabase } from '../../lib/supabase';

export default function SettingsPage() {
  const { theme, setTheme } = useTheme();
  const { success, error: toastError } = useToast();
  const [pwForm, setPwForm] = useState({ current: '', newPw: '', confirm: '' });
  const [showPw, setShowPw] = useState(false);
  const [changingPw, setChangingPw] = useState(false);
  const [showPwSection, setShowPwSection] = useState(false);
  const [hasPassword, setHasPassword] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      const { data } = await supabase.auth.getUser();
      if (!active || !data.user) return;
      const providers = (data.user.identities ?? []).map(i => i.provider);
      setHasPassword(providers.includes('password') || providers.includes('email'));
    };
    void load();
    return () => { active = false; };
  }, []);

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pwForm.newPw.length < 6) { toastError('Password too short', 'Must be at least 6 characters.'); return; }
    if (pwForm.newPw !== pwForm.confirm) { toastError('Mismatch', 'New passwords do not match.'); return; }
    setChangingPw(true);
    const { error: err } = await supabase.auth.updateUser({ password: pwForm.newPw });
    if (err) {
      toastError('Password update failed', err.message);
    } else {
      success('Password updated!');
      setPwForm({ current: '', newPw: '', confirm: '' });
      setShowPwSection(false);
    }
    setChangingPw(false);
  };

  return (
    <div className="p-6 lg:p-8 max-w-2xl mx-auto animate-fade-in">
      <PageHeader title="Settings" subtitle="Manage your account preferences" icon={Settings} />

      <div className="space-y-6">
        {/* Appearance */}
        <div className="card p-6">
          <h2 className="font-bold text-slate-900 dark:text-white mb-4">Appearance</h2>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => setTheme('light')}
              className={`flex items-center gap-3 p-4 rounded-xl border-2 transition-all ${
                theme === 'light'
                  ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                  : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
              }`}
            >
              <Sun size={18} className={theme === 'light' ? 'text-primary-600' : 'text-slate-400'} />
              <div className="text-left">
                <p className={`font-medium text-sm ${theme === 'light' ? 'text-primary-700 dark:text-primary-300' : 'text-slate-700 dark:text-slate-300'}`}>Light Mode</p>
                <p className="text-xs text-slate-400">Clean, bright interface</p>
              </div>
              {theme === 'light' && <CheckCircle size={16} className="text-primary-600 ml-auto flex-shrink-0" />}
            </button>
            <button
              onClick={() => setTheme('dark')}
              className={`flex items-center gap-3 p-4 rounded-xl border-2 transition-all ${
                theme === 'dark'
                  ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                  : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
              }`}
            >
              <Moon size={18} className={theme === 'dark' ? 'text-primary-600 dark:text-primary-400' : 'text-slate-400'} />
              <div className="text-left">
                <p className={`font-medium text-sm ${theme === 'dark' ? 'text-primary-700 dark:text-primary-300' : 'text-slate-700 dark:text-slate-300'}`}>Dark Mode</p>
                <p className="text-xs text-slate-400">Easy on the eyes</p>
              </div>
              {theme === 'dark' && <CheckCircle size={16} className="text-primary-400 ml-auto flex-shrink-0" />}
            </button>
          </div>
        </div>

        {/* Notification preferences */}
        <div className="card p-6">
          <h2 className="font-bold text-slate-900 dark:text-white mb-4">Notification Preferences</h2>
          <div className="space-y-4">
            {[
              { label: 'Assignment due reminders', desc: 'Get notified 24h before deadlines', on: true },
              { label: 'New announcements', desc: 'Receive in-app notifications for announcements', on: true },
              { label: 'Grading updates', desc: 'Know when your submissions have been graded', on: true },
              { label: 'Course updates', desc: 'Be notified when new content is added', on: false },
            ].map(({ label, desc, on }) => (
              <div key={label} className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-300">{label}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{desc}</p>
                </div>
                <button
                  className={`w-11 h-6 rounded-full transition-colors flex-shrink-0 ${on ? 'bg-primary-600' : 'bg-slate-200 dark:bg-slate-700'}`}
                  aria-label={`Toggle ${label}`}
                >
                  <div className={`w-5 h-5 bg-white rounded-full shadow transition-transform ${on ? 'translate-x-5' : 'translate-x-0.5'} mt-0.5 mx-0`} />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Security */}
        <div className="card p-6">
          <h2 className="font-bold text-slate-900 dark:text-white mb-4">Security</h2>
          <button
            onClick={() => setShowPwSection(v => !v)}
            className="w-full flex items-center gap-3 p-4 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors text-left"
          >
            <Lock size={16} className="text-slate-400" />
            <div>
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Change / Set Password</p>
              <p className="text-xs text-slate-400">
                {hasPassword === false
                  ? 'You joined with Google. Set a password to also sign in with email + password.'
                  : 'Update your account password. Your password is stored securely by the sign-in provider — never in plaintext.'}
              </p>
            </div>
          </button>

          {showPwSection && (
            <form onSubmit={handleChangePassword} className="mt-4 space-y-4 animate-fade-in">
              {hasPassword === false && (
                <p className="flex items-start gap-2 text-xs text-primary-700 dark:text-primary-300 bg-primary-50 dark:bg-primary-900/20 rounded-xl p-3">
                  <Info size={14} className="flex-shrink-0 mt-0.5" />
                  <span>Setting a password here lets you sign in with your email and password from now on. You can keep using Google Sign In too.</span>
                </p>
              )}
              <div>
                <label className="label" htmlFor="new-pw">New Password</label>
                <div className="relative">
                  <input
                    id="new-pw"
                    type={showPw ? 'text' : 'password'}
                    className="input pr-12"
                    placeholder="Enter new password"
                    value={pwForm.newPw}
                    onChange={e => setPwForm(f => ({ ...f, newPw: e.target.value }))}
                    minLength={6}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw(v => !v)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
              <div>
                <label className="label" htmlFor="confirm-new-pw">Confirm New Password</label>
                <input
                  id="confirm-new-pw"
                  type="password"
                  className="input"
                  placeholder="Repeat new password"
                  value={pwForm.confirm}
                  onChange={e => setPwForm(f => ({ ...f, confirm: e.target.value }))}
                  required
                />
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => { setShowPwSection(false); setPwForm({ current: '', newPw: '', confirm: '' }); }}
                  className="btn-secondary text-sm"
                >
                  Cancel
                </button>
                <button type="submit" disabled={changingPw} className="btn-primary text-sm flex items-center gap-2">
                  {changingPw ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : null}
                  Update Password
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Danger Zone */}
        <div className="card p-6 border border-red-100 dark:border-red-900/30">
          <h2 className="font-bold text-red-600 dark:text-red-400 mb-2">Danger Zone</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
            Account deletion is permanent and cannot be undone. All your progress, certificates, and data will be lost.
          </p>
          <p className="text-sm text-slate-600 dark:text-slate-400 bg-red-50 dark:bg-red-900/20 p-3 rounded-xl">
            To delete your account, contact us at{' '}
            <a href="mailto:kaveritech2022@gmail.com" className="text-primary-600 dark:text-primary-400 underline">kaveritech2022@gmail.com</a>
          </p>
        </div>
      </div>
    </div>
  );
}
