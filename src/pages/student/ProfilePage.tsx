import { useState, useEffect, useRef } from 'react';
import { User, Mail, Phone, Edit2, Save, X, Zap, Flame, Trophy, Share2, Globe, CheckCircle, Camera, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
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
  const navigate = useNavigate();
  const [copiedShare, setCopiedShare] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
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

  const publicUrl = profile.profile_slug ? `${window.location.origin}/u/${profile.profile_slug}` : null;

  const handleShareProfile = async () => {
    if (!publicUrl) return;
    if (!profile.profile_public) {
      toastError('Your profile is private', 'Turn on "Public profile" in Settings first — taking you there.');
      navigate('/student/settings');
      return;
    }
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopiedShare(true);
      success('Profile link copied!', 'Share it with recruiters — anyone with the link can view it.');
      setTimeout(() => setCopiedShare(false), 2000);
    } catch {
      toastError('Copy failed', publicUrl);
    }
  };

  const AVATAR_BUCKET = 'profile-avatars';

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      toastError('Unsupported format', 'Please choose a JPG, PNG, or WebP image.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toastError('Image too large', 'Please choose an image under 5 MB.');
      return;
    }
    setAvatarPreview(URL.createObjectURL(file));
    void handleAvatarUpload(file);
  };

  const handleAvatarUpload = async (file: File) => {
    setAvatarBusy(true);
    const extension = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
    const fileName = `avatar-${crypto.randomUUID()}.${extension}`;
    const objectPath = `${profile.id}/${fileName}`;

    try {
      const { data: existingFiles, error: listError } = await supabase.storage
        .from(AVATAR_BUCKET)
        .list(profile.id, { limit: 20 });
      if (listError) throw listError;

      const { error: uploadError } = await supabase.storage
        .from(AVATAR_BUCKET)
        .upload(objectPath, file, { cacheControl: '3600', contentType: file.type, upsert: false });
      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase.storage
        .from(AVATAR_BUCKET)
        .getPublicUrl(objectPath);
      const avatarUrl = `${publicUrlData.publicUrl}?v=${Date.now()}`;

      const { data: updatedProfile, error: profileError } = await supabase
        .from('profiles')
        .update({ avatar_url: avatarUrl })
        .eq('id', profile.id)
        .select('id')
        .maybeSingle();
      if (profileError || !updatedProfile) {
        await supabase.storage.from(AVATAR_BUCKET).remove([objectPath]);
        throw profileError ?? new Error('Your profile photo could not be saved.');
      }

      const stalePaths = (existingFiles ?? [])
        .filter(f => f.name !== fileName)
        .map(f => `${profile.id}/${f.name}`);
      if (stalePaths.length > 0) {
        await supabase.storage.from(AVATAR_BUCKET).remove(stalePaths);
      }

      await refreshProfile();
      setAvatarPreview(null);
      success('Profile photo updated!');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to upload your profile photo.';
      toastError('Photo upload failed', message);
    } finally {
      setAvatarBusy(false);
    }
  };

  const handleRemoveAvatar = async () => {
    setAvatarBusy(true);
    try {
      const { data: updatedProfile, error: profileError } = await supabase
        .from('profiles')
        .update({ avatar_url: null })
        .eq('id', profile.id)
        .select('id')
        .maybeSingle();
      if (profileError) throw profileError;
      if (!updatedProfile) throw new Error('Your profile photo could not be removed.');

      const { data: files, error: listError } = await supabase.storage
        .from(AVATAR_BUCKET)
        .list(profile.id, { limit: 20 });
      if (!listError && files && files.length > 0) {
        await supabase.storage
          .from(AVATAR_BUCKET)
          .remove(files.map(f => `${profile.id}/${f.name}`));
      }

      await refreshProfile();
      setAvatarPreview(null);
      success('Profile photo removed');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to remove your profile photo.';
      toastError('Remove failed', message);
    } finally {
      setAvatarBusy(false);
    }
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
            <div className="w-20 h-20 rounded-full overflow-hidden bg-gradient-to-br from-primary-500 to-teal-500 flex items-center justify-center ring-4 ring-white dark:ring-slate-800 shadow-lg">
              {avatarPreview || profile.avatar_url ? (
                <img src={(avatarPreview || profile.avatar_url) || undefined} alt={profile.full_name ?? 'Profile'} className="w-full h-full object-cover" />
              ) : (
                <span className="text-3xl font-extrabold text-white">
                  {profile.full_name?.charAt(0).toUpperCase() ?? 'U'}
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={() => avatarInputRef.current?.click()}
              disabled={avatarBusy}
              title={profile.avatar_url ? 'Change photo' : 'Add photo'}
              className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-primary-600 text-white flex items-center justify-center shadow-md hover:bg-primary-700 disabled:opacity-60 border-2 border-white dark:border-slate-800"
            >
              {avatarBusy ? <Loader2 size={14} className="animate-spin" /> : <Camera size={14} />}
            </button>
            {profile.avatar_url && !avatarBusy && (
              <button
                type="button"
                onClick={handleRemoveAvatar}
                title="Remove photo"
                className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-white dark:bg-slate-700 text-slate-500 dark:text-slate-300 flex items-center justify-center shadow hover:text-red-600 border border-slate-200 dark:border-slate-600"
              >
                <X size={12} />
              </button>
            )}
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={handleAvatarChange}
            />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">{profile.full_name}</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">{profile.email}</p>
            <div className="mt-2">
              <Badge variant={profile.role === 'super_admin' ? 'error' : profile.role === 'faculty' ? 'teal' : 'info'}>
                {roleLabel[profile.role] ?? profile.role}
              </Badge>
              {profile.role === 'student' && publicUrl && (
                profile.profile_public ? (
                  <button
                    onClick={handleShareProfile}
                    className="mt-2 flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 hover:underline"
                    title={publicUrl}
                  >
                    <Globe size={12} /> Public profile is ON — tap Share to copy your link
                  </button>
                ) : (
                  <button
                    onClick={() => navigate('/student/settings')}
                    className="mt-2 flex items-center gap-1.5 text-xs text-slate-400 hover:text-primary-600 hover:underline"
                  >
                    <Globe size={12} /> Profile is private — make it public in Settings to share with recruiters
                  </button>
                )
              )}
            </div>
          </div>
          <div className="flex-shrink-0">
            {!editing ? (
              <div className="flex items-center gap-2">
                {publicUrl && (
                  <button onClick={handleShareProfile} className="btn-primary flex items-center gap-2 text-sm">
                    {copiedShare ? <CheckCircle size={14} /> : <Share2 size={14} />}
                    {copiedShare ? 'Copied!' : 'Share Profile'}
                  </button>
                )}
                <button onClick={() => setEditing(true)} className="btn-secondary flex items-center gap-2 text-sm">
                  <Edit2 size={14} /> Edit Profile
                </button>
              </div>
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
