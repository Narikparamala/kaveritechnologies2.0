import { useState, useEffect } from 'react';
import { Settings, Sun, Moon, Lock, Eye, EyeOff, CheckCircle, Info, Globe, Copy, Linkedin, Github, FileText, ExternalLink } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { PageHeader } from '../../components/common/PageHeader';
import { useTheme } from '../../contexts/ThemeContext';
import { useToast } from '../../components/ui/Toast';
import { supabase } from '../../lib/supabase';
import { QRCodeSVG } from 'qrcode.react';
import { PushNotificationCard } from '../../components/settings/PushNotificationCard';

export default function SettingsPage() {
  const { theme, setTheme } = useTheme();
  const { success, error: toastError } = useToast();
  const [pwForm, setPwForm] = useState({ current: '', newPw: '', confirm: '' });
  const [showPw, setShowPw] = useState(false);
  const [changingPw, setChangingPw] = useState(false);
  const [showPwSection, setShowPwSection] = useState(false);
  const [hasPassword, setHasPassword] = useState<boolean | null>(null);

  const { profile, refreshProfile } = useAuth();
  const [linkForm, setLinkForm] = useState({
    linkedin_url: profile?.linkedin_url ?? '',
    github_url: profile?.github_url ?? '',
    resume_url: profile?.resume_url ?? '',
  });
  const [savingLinks, setSavingLinks] = useState(false);
  const [isPublic, setIsPublic] = useState(profile?.profile_public ?? false);
  const [togglingPublic, setTogglingPublic] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (profile) {
      setLinkForm({
        linkedin_url: profile.linkedin_url ?? '',
        github_url: profile.github_url ?? '',
        resume_url: profile.resume_url ?? '',
      });
      setIsPublic(profile.profile_public ?? false);
    }
  }, [profile?.id, profile?.linkedin_url, profile?.github_url, profile?.resume_url, profile?.profile_public]);

  const publicUrl = profile?.profile_slug ? `${window.location.origin}/u/${profile.profile_slug}` : null;

  const isValidUrl = (value: string) => {
    if (!value.trim()) return true; // empty is fine
    try {
      const u = new URL(value);
      return u.protocol === 'https:' || u.protocol === 'http:';
    } catch {
      return false;
    }
  };

  const handleSaveLinks = async () => {
    if (!profile) return;
    for (const [key, value] of Object.entries(linkForm)) {
      if (!isValidUrl(value)) {
        toastError('Invalid link', `${key.replace('_url', '')} must be a full URL starting with https://`);
        return;
      }
    }
    setSavingLinks(true);
    const { error: err } = await supabase
      .from('profiles')
      .update({
        linkedin_url: linkForm.linkedin_url.trim() || null,
        github_url: linkForm.github_url.trim() || null,
        resume_url: linkForm.resume_url.trim() || null,
      })
      .eq('id', profile.id);
    if (err) {
      toastError('Save failed', err.message);
    } else {
      await refreshProfile();
      success('Profile links saved!');
    }
    setSavingLinks(false);
  };

  const handleTogglePublic = async () => {
    if (!profile || togglingPublic) return;
    const next = !isPublic;
    setTogglingPublic(true);
    const { error: err } = await supabase
      .from('profiles')
      .update({ profile_public: next })
      .eq('id', profile.id);
    if (err) {
      toastError('Could not update', err.message);
    } else {
      setIsPublic(next);
      await refreshProfile();
      success(next ? 'Profile is now public!' : 'Profile set to private');
    }
    setTogglingPublic(false);
  };

  const handleCopyUrl = async () => {
    if (!publicUrl) return;
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toastError('Copy failed', 'Please copy the URL manually.');
    }
  };

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

        {/* Push notifications (web push via FCM) */}
        <PushNotificationCard />

        {/* Public profile */}
        <div className="card p-6">
          <h2 className="font-bold text-slate-900 dark:text-white mb-2">Public Profile</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-5">
            Add your links and portfolio. When your profile is public, anyone with your link — including CEOs and HRs we share it with — can see your performance, projects and coding results. Your email and phone number are never shown.
          </p>

          {/* Privacy toggle */}
          <div className={`rounded-2xl border p-4 mb-5 flex items-start justify-between gap-4 ${isPublic ? 'border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/30' : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60'}`}>
            <div className="flex items-start gap-3">
              <Globe size={18} className={isPublic ? 'text-emerald-600 mt-0.5' : 'text-slate-400 mt-0.5'} />
              <div>
                <p className="text-sm font-medium text-slate-900 dark:text-white">Public profile {isPublic ? '· ON' : '· OFF'}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {isPublic
                    ? 'Anyone with your link can view your performance page.'
                    : 'Only you, faculty and admins can see your details.'}
                </p>
              </div>
            </div>
            <button
              onClick={handleTogglePublic}
              disabled={togglingPublic}
              aria-label="Toggle public profile"
              className={`w-11 h-6 rounded-full transition-colors flex-shrink-0 relative ${isPublic ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'} ${togglingPublic ? 'opacity-60' : ''}`}
            >
              <div className={`w-5 h-5 bg-white rounded-full shadow absolute top-0.5 left-0.5 transition-transform`} style={{ transform: isPublic ? 'translateX(20px)' : 'translateX(0)' }} />
            </button>
          </div>

          {/* Shareable URL */}
          {publicUrl && (
            <div className="rounded-2xl border border-primary-200 bg-primary-50 dark:border-primary-800 dark:bg-primary-900/20 p-4 mb-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-primary-700 dark:text-primary-300 mb-2">Your shareable profile URL</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-xs bg-white dark:bg-slate-900 rounded-lg px-3 py-2 text-slate-700 dark:text-slate-300 truncate border border-slate-200 dark:border-slate-700">
                  {publicUrl}
                </code>
                <button onClick={handleCopyUrl} className="btn-primary text-xs flex items-center gap-1.5 flex-shrink-0">
                  {copied ? <CheckCircle size={13} /> : <Copy size={13} />} {copied ? 'Copied!' : 'Copy'}
                </button>
                <a href={publicUrl} target="_blank" rel="noreferrer" className="btn-secondary text-xs flex items-center gap-1.5 flex-shrink-0">
                  <ExternalLink size={13} /> View
                </a>
              </div>
              <div className="flex items-center gap-4 mt-3">
                <div className="bg-white p-2 rounded-xl border border-slate-200 dark:border-slate-700 flex-shrink-0">
                  <QRCodeSVG value={publicUrl} size={84} level="M" />
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Scan this with a phone to open your profile — show it at placements once your profile is public.
                </p>
              </div>
              {!isPublic && (
                <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">
                  ⚠ Turn on the public toggle above, or people who open this link will see "Profile not available".
                </p>
              )}
            </div>
          )}

          {/* Links form */}
          <div className="space-y-4">
            <div>
              <label className="label" htmlFor="pf-linkedin">
                <Linkedin size={13} className="inline mr-1.5" />LinkedIn Profile URL
              </label>
              <input
                id="pf-linkedin"
                type="url"
                className="input"
                placeholder="https://www.linkedin.com/in/your-handle"
                value={linkForm.linkedin_url}
                onChange={e => setLinkForm(f => ({ ...f, linkedin_url: e.target.value }))}
              />
            </div>
            <div>
              <label className="label" htmlFor="pf-github">
                <Github size={13} className="inline mr-1.5" />GitHub Profile URL
              </label>
              <input
                id="pf-github"
                type="url"
                className="input"
                placeholder="https://github.com/your-username"
                value={linkForm.github_url}
                onChange={e => setLinkForm(f => ({ ...f, github_url: e.target.value }))}
              />
            </div>
            <div>
              <label className="label" htmlFor="pf-resume">
                <FileText size={13} className="inline mr-1.5" />Resume Link (Google Drive, Dropbox...)
              </label>
              <input
                id="pf-resume"
                type="url"
                className="input"
                placeholder="https://drive.google.com/your-resume-link"
                value={linkForm.resume_url}
                onChange={e => setLinkForm(f => ({ ...f, resume_url: e.target.value }))}
              />
            </div>
            <button onClick={handleSaveLinks} disabled={savingLinks} className="btn-primary text-sm flex items-center gap-2">
              {savingLinks ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <CheckCircle size={14} />}
              Save Links
            </button>
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
