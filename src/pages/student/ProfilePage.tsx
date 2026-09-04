import { useState, useEffect } from 'react';
import { User, Mail, Phone, Edit2, Save, X, Zap, Flame, Trophy } from 'lucide-react';
import { PageHeader } from '../../components/common/PageHeader';
import { ProgressBar } from '../../components/ui/ProgressBar';
import { Badge } from '../../components/ui/Badge';
import { useToast } from '../../components/ui/Toast';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { calculateXPLevel } from '../../lib/utils';

export default function ProfilePage() {
  const { profile, refreshProfile } = useAuth();
  const { success, error: toastError } = useToast();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    full_name: '',
    phone: '',
    bio: '',
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (profile) {
      setForm({
        full_name: profile.full_name ?? '',
        phone: profile.phone ?? '',
        bio: profile.bio ?? '',
      });
    }
  }, [profile]);

  if (!profile) return null;

  const { level, progress, nextLevelXP } = calculateXPLevel(profile.xp_points);

  const handleSave = async () => {
    if (!form.full_name.trim()) { toastError('Validation', 'Full name is required.'); return; }
    setSaving(true);
    const { error: err } = await supabase
      .from('profiles')
      .update({
        full_name: form.full_name.trim(),
        phone: form.phone.trim() || null,
        bio: form.bio.trim() || null,
      })
      .eq('id', profile.id);

    if (err) {
      toastError('Save failed', err.message);
    } else {
      await refreshProfile();
      success('Profile updated!');
      setEditing(false);
    }
    setSaving(false);
  };

  const handleCancel = () => {
    setForm({
      full_name: profile.full_name ?? '',
      phone: profile.phone ?? '',
      bio: profile.bio ?? '',
    });
    setEditing(false);
  };

  const roleLabel: Record<string, string> = {
    student: 'Student',
    faculty: 'Faculty / Trainer',
    super_admin: 'Super Administrator',
  };

  return (
    <div className="p-6 lg:p-8 max-w-3xl mx-auto animate-fade-in">
      <PageHeader title="My Profile" subtitle="Manage your personal information and view your progress" icon={User} />

      <div className="card p-6 mb-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5 mb-8 pb-8 border-b border-slate-100 dark:border-slate-700">
          <div className="relative flex-shrink-0">
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-primary-500 to-teal-500 flex items-center justify-center shadow-glow-blue">
              <span className="text-3xl font-extrabold text-white">
                {profile.full_name?.charAt(0).toUpperCase() ?? 'U'}
              </span>
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">{profile.full_name}</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">{profile.email}</p>
            <div className="mt-2">
              <Badge variant={profile.role === 'super_admin' ? 'error' : profile.role === 'faculty' ? 'teal' : 'info'}>
                {roleLabel[profile.role] ?? profile.role}
              </Badge>
            </div>
          </div>
          <div className="flex-shrink-0">
            {!editing ? (
              <button onClick={() => setEditing(true)} className="btn-secondary flex items-center gap-2 text-sm">
                <Edit2 size={14} /> Edit Profile
              </button>
            ) : (
              <div className="flex gap-2">
                <button onClick={handleCancel} className="btn-ghost flex items-center gap-1 text-sm">
                  <X size={14} /> Cancel
                </button>
                <button onClick={handleSave} disabled={saving} className="btn-primary flex items-center gap-2 text-sm">
                  {saving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Save size={14} />}
                  Save
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          <div className="text-center p-4 rounded-xl bg-amber-50 dark:bg-amber-900/20">
            <div className="flex items-center justify-center gap-1.5 mb-1">
              <Zap size={16} className="text-amber-500" />
              <span className="font-bold text-lg text-slate-900 dark:text-white">{profile.xp_points.toLocaleString()}</span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">Total XP</p>
          </div>
          <div className="text-center p-4 rounded-xl bg-orange-50 dark:bg-orange-900/20">
            <div className="flex items-center justify-center gap-1.5 mb-1">
              <Flame size={16} className="text-orange-500" />
              <span className="font-bold text-lg text-slate-900 dark:text-white">{profile.streak_days}</span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">Day Streak</p>
          </div>
          <div className="text-center p-4 rounded-xl bg-primary-50 dark:bg-primary-900/20">
            <div className="flex items-center justify-center gap-1.5 mb-1">
              <Trophy size={16} className="text-primary-600" />
              <span className="font-bold text-lg text-slate-900 dark:text-white">Lv. {level}</span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">Level</p>
          </div>
        </div>

        {/* XP Progress */}
        <div className="mb-8">
          <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400 mb-2">
            <span>Level {level}</span>
            <span>{profile.xp_points.toLocaleString()} / {nextLevelXP.toLocaleString()} XP → Level {level + 1}</span>
          </div>
          <ProgressBar value={progress} size="md" color="teal" />
        </div>

        {/* Fields */}
        <div className="space-y-5">
          <div>
            <label className="label" htmlFor="prof-name">
              <User size={13} className="inline mr-1.5" />Full Name
            </label>
            {editing ? (
              <input
                id="prof-name"
                className="input"
                value={form.full_name}
                onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))}
                placeholder="Your full name"
              />
            ) : (
              <p className="text-slate-800 dark:text-slate-200 font-medium px-1 py-2">{profile.full_name || '—'}</p>
            )}
          </div>

          <div>
            <label className="label">
              <Mail size={13} className="inline mr-1.5" />Email Address
            </label>
            <p className="text-slate-800 dark:text-slate-200 font-medium px-1 py-2">{profile.email}</p>
            <p className="text-xs text-slate-400 -mt-1">Email address cannot be changed here.</p>
          </div>

          <div>
            <label className="label" htmlFor="prof-phone">
              <Phone size={13} className="inline mr-1.5" />Phone Number
            </label>
            {editing ? (
              <input
                id="prof-phone"
                type="tel"
                className="input"
                value={form.phone}
                onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                placeholder="Your phone number"
              />
            ) : (
              <p className="text-slate-800 dark:text-slate-200 font-medium px-1 py-2">{profile.phone || '—'}</p>
            )}
          </div>

          <div>
            <label className="label" htmlFor="prof-bio">Bio</label>
            {editing ? (
              <textarea
                id="prof-bio"
                className="input min-h-[100px] resize-none"
                value={form.bio}
                onChange={e => setForm(f => ({ ...f, bio: e.target.value }))}
                placeholder="Tell us about yourself — your goals, background, or interests..."
              />
            ) : (
              <p className="text-slate-700 dark:text-slate-300 px-1 py-2 text-sm leading-relaxed">{profile.bio || '—'}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
