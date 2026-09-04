import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import {
  BookOpen,
  Camera,
  CalendarClock,
  Edit2,
  Layers3,
  Loader2,
  Mail,
  Phone,
  Save,
  ShieldCheck,
  Trash2,
  Upload,
  User,
  Users,
  X,
} from 'lucide-react';
import { PageHeader } from '../../components/common/PageHeader';
import { Badge } from '../../components/ui/Badge';
import { StatCard } from '../../components/ui/StatCard';
import { useToast } from '../../components/ui/Toast';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';

type TeachingStats = {
  courses: number;
  batches: number;
  students: number;
  upcomingSessions: number;
};

const EMPTY_STATS: TeachingStats = {
  courses: 0,
  batches: 0,
  students: 0,
  upcomingSessions: 0,
};

const AVATAR_BUCKET = 'profile-avatars';
const MAX_AVATAR_SIZE = 5 * 1024 * 1024;
const ALLOWED_AVATAR_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export default function FacultyProfilePage() {
  const { profile, refreshProfile } = useAuth();
  const { success, error: toastError } = useToast();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [stats, setStats] = useState<TeachingStats>(EMPTY_STATS);
  const [form, setForm] = useState({
    full_name: '',
    phone: '',
    bio: '',
  });

  useEffect(() => {
    if (!profile) return;

    setForm({
      full_name: profile.full_name ?? '',
      phone: profile.phone ?? '',
      bio: profile.bio ?? '',
    });
  }, [profile]);

  useEffect(() => {
    return () => {
      if (avatarPreview) URL.revokeObjectURL(avatarPreview);
    };
  }, [avatarPreview]);

  const loadTeachingStats = useCallback(async () => {
    if (!profile) return;

    setStatsLoading(true);
    try {
      const today = new Date().toISOString().slice(0, 10);
      const [coursesResult, batchesResult, sessionsResult] = await Promise.all([
        supabase
          .from('course_faculty')
          .select('course_id')
          .eq('faculty_id', profile.id),
        supabase
          .from('batch_faculty')
          .select('batch_id')
          .eq('faculty_id', profile.id),
        supabase
          .from('live_sessions')
          .select('id', { count: 'exact', head: true })
          .eq('created_by', profile.id)
          .gte('session_date', today)
          .neq('status', 'completed')
          .neq('status', 'cancelled'),
      ]);

      if (coursesResult.error) throw coursesResult.error;
      if (batchesResult.error) throw batchesResult.error;
      if (sessionsResult.error) throw sessionsResult.error;

      const courseIds = Array.from(new Set((coursesResult.data ?? []).map(row => row.course_id)));
      const batchIds = Array.from(new Set((batchesResult.data ?? []).map(row => row.batch_id)));
      const studentIds = new Set<string>();

      if (courseIds.length > 0) {
        const { data, error } = await supabase
          .from('course_enrollments')
          .select('student_id')
          .in('course_id', courseIds)
          .eq('access_status', 'active');

        if (error) throw error;
        for (const enrollment of data ?? []) studentIds.add(enrollment.student_id);
      }

      if (batchIds.length > 0) {
        const { data, error } = await supabase
          .from('batch_students')
          .select('student_id')
          .in('batch_id', batchIds)
          .eq('status', 'active');

        if (error) throw error;
        for (const batchStudent of data ?? []) studentIds.add(batchStudent.student_id);
      }

      setStats({
        courses: courseIds.length,
        batches: batchIds.length,
        students: studentIds.size,
        upcomingSessions: sessionsResult.count ?? 0,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to load teaching statistics.';
      toastError('Could not load profile statistics', message);
      setStats(EMPTY_STATS);
    } finally {
      setStatsLoading(false);
    }
  }, [profile, toastError]);

  useEffect(() => {
    void loadTeachingStats();
  }, [loadTeachingStats]);

  const memberSince = useMemo(() => {
    if (!profile?.created_at) return 'Not available';

    const date = new Date(profile.created_at);
    if (Number.isNaN(date.getTime())) return 'Not available';

    return new Intl.DateTimeFormat('en-IN', {
      month: 'long',
      year: 'numeric',
    }).format(date);
  }, [profile?.created_at]);

  if (!profile) return null;

  const clearAvatarSelection = () => {
    setAvatarFile(null);
    setAvatarPreview(null);
    if (avatarInputRef.current) avatarInputRef.current.value = '';
  };

  const handleAvatarSelected = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!ALLOWED_AVATAR_TYPES.includes(file.type)) {
      toastError('Unsupported photo', 'Choose a JPG, PNG, or WebP image.');
      event.target.value = '';
      return;
    }

    if (file.size > MAX_AVATAR_SIZE) {
      toastError('Photo is too large', 'Choose an image smaller than 5 MB.');
      event.target.value = '';
      return;
    }

    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  };

  const handleUploadAvatar = async () => {
    if (!avatarFile) {
      toastError('Choose a photo', 'Select a JPG, PNG, or WebP image first.');
      return;
    }

    setAvatarBusy(true);
    const extension = avatarFile.type === 'image/png'
      ? 'png'
      : avatarFile.type === 'image/webp'
        ? 'webp'
        : 'jpg';
    const fileName = `avatar-${crypto.randomUUID()}.${extension}`;
    const objectPath = `${profile.id}/${fileName}`;

    try {
      const { data: existingFiles, error: listError } = await supabase.storage
        .from(AVATAR_BUCKET)
        .list(profile.id, { limit: 20 });

      if (listError) throw listError;

      const { error: uploadError } = await supabase.storage
        .from(AVATAR_BUCKET)
        .upload(objectPath, avatarFile, {
          cacheControl: '3600',
          contentType: avatarFile.type,
          upsert: false,
        });

      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase.storage
        .from(AVATAR_BUCKET)
        .getPublicUrl(objectPath);

      const avatarUrl = `${publicUrlData.publicUrl}?v=${Date.now()}`;
      const { data: updatedProfile, error: profileError } = await supabase
        .from('profiles')
        .update({
          avatar_url: avatarUrl,
        })
        .eq('id', profile.id)
        .select('id')
        .maybeSingle();

      if (profileError || !updatedProfile) {
        await supabase.storage.from(AVATAR_BUCKET).remove([objectPath]);
        throw profileError ?? new Error('Your profile photo could not be saved.');
      }

      const stalePaths = (existingFiles ?? [])
        .filter(file => file.name !== fileName)
        .map(file => `${profile.id}/${file.name}`);

      if (stalePaths.length > 0) {
        await supabase.storage.from(AVATAR_BUCKET).remove(stalePaths);
      }

      await refreshProfile();
      clearAvatarSelection();
      success('Profile photo updated');
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
        .update({
          avatar_url: null,
        })
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
          .remove(files.map(file => `${profile.id}/${file.name}`));
      }

      await refreshProfile();
      clearAvatarSelection();
      success('Profile photo removed');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to remove your profile photo.';
      toastError('Remove failed', message);
    } finally {
      setAvatarBusy(false);
    }
  };

  const handleCancel = () => {
    setForm({
      full_name: profile.full_name ?? '',
      phone: profile.phone ?? '',
      bio: profile.bio ?? '',
    });
    clearAvatarSelection();
    setEditing(false);
  };

  const handleSave = async () => {
    const fullName = form.full_name.trim();
    if (!fullName) {
      toastError('Validation', 'Full name is required.');
      return;
    }

    setSaving(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .update({
          full_name: fullName,
          phone: form.phone.trim() || null,
          bio: form.bio.trim() || null,
        })
        .eq('id', profile.id)
        .select('id')
        .maybeSingle();

      if (error) throw error;
      if (!data) throw new Error('Your profile could not be updated. Please check profile permissions.');

      await refreshProfile();
      setEditing(false);
      success('Faculty profile updated');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to update your profile.';
      toastError('Save failed', message);
    } finally {
      setSaving(false);
    }
  };

  const roleLabel = profile.role === 'faculty'
    ? 'Faculty / Trainer'
    : profile.role.replace(/_/g, ' ');

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto animate-fade-in">
      <PageHeader
        title="Faculty Profile"
        subtitle="Manage your faculty identity and review your teaching overview"
        icon={User}
        action={
          !editing ? (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="btn-primary flex items-center gap-2 px-4"
            >
              <Edit2 size={16} /> Edit Profile
            </button>
          ) : undefined
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard title="My Courses" value={statsLoading ? '—' : stats.courses} icon={BookOpen} />
        <StatCard
          title="My Batches"
          value={statsLoading ? '—' : stats.batches}
          icon={Layers3}
          iconBg="bg-violet-50 dark:bg-violet-900/30"
          iconColor="text-violet-600 dark:text-violet-400"
        />
        <StatCard
          title="Active Students"
          value={statsLoading ? '—' : stats.students}
          icon={Users}
          iconBg="bg-teal-50 dark:bg-teal-900/30"
          iconColor="text-teal-600 dark:text-teal-400"
        />
        <StatCard
          title="Upcoming Sessions"
          value={statsLoading ? '—' : stats.upcomingSessions}
          icon={CalendarClock}
          iconBg="bg-amber-50 dark:bg-amber-900/30"
          iconColor="text-amber-600 dark:text-amber-400"
        />
      </div>

      <div className="grid lg:grid-cols-[minmax(0,1.6fr)_minmax(280px,0.8fr)] gap-6">
        <section className="card p-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5 mb-8 pb-8 border-b border-slate-100 dark:border-slate-700">
            <div className="flex flex-col items-center gap-2 flex-shrink-0">
              <div className="relative w-20 h-20 rounded-2xl overflow-hidden bg-gradient-to-br from-primary-500 to-teal-500 flex items-center justify-center shadow-glow-blue">
                {avatarPreview || profile.avatar_url ? (
                  <img
                    src={avatarPreview || profile.avatar_url || undefined}
                    alt="Faculty profile"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span className="text-3xl font-extrabold text-white">
                    {profile.full_name?.charAt(0).toUpperCase() ?? 'F'}
                  </span>
                )}

                {editing && (
                  <button
                    type="button"
                    onClick={() => avatarInputRef.current?.click()}
                    disabled={avatarBusy}
                    aria-label="Choose profile photo"
                    className="absolute inset-0 flex items-center justify-center bg-slate-950/55 text-white opacity-0 hover:opacity-100 focus:opacity-100 transition-opacity"
                  >
                    <Camera size={22} />
                  </button>
                )}
              </div>

              <input
                ref={avatarInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleAvatarSelected}
                className="hidden"
              />

              {editing && (
                <button
                  type="button"
                  onClick={() => avatarInputRef.current?.click()}
                  disabled={avatarBusy}
                  className="text-xs font-semibold text-primary-600 dark:text-primary-400 hover:underline disabled:opacity-50"
                >
                  Choose photo
                </button>
              )}
            </div>

            <div className="flex-1 min-w-0">
              <h2 className="text-xl font-bold text-slate-900 dark:text-white truncate">
                {profile.full_name || 'Faculty member'}
              </h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 truncate">{profile.email}</p>
              <div className="mt-2">
                <Badge variant="teal">{roleLabel}</Badge>
              </div>

              {editing && (
                <div className="flex flex-wrap items-center gap-2 mt-3">
                  {avatarFile && (
                    <button
                      type="button"
                      onClick={() => void handleUploadAvatar()}
                      disabled={avatarBusy || saving}
                      className="btn-secondary flex items-center gap-2 text-xs px-3 py-2"
                    >
                      {avatarBusy ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                      {avatarBusy ? 'Uploading...' : 'Upload Photo'}
                    </button>
                  )}

                  {avatarPreview && (
                    <button
                      type="button"
                      onClick={clearAvatarSelection}
                      disabled={avatarBusy}
                      className="btn-ghost text-xs px-3 py-2"
                    >
                      Discard
                    </button>
                  )}

                  {profile.avatar_url && !avatarPreview && (
                    <button
                      type="button"
                      onClick={() => void handleRemoveAvatar()}
                      disabled={avatarBusy || saving}
                      className="btn-ghost flex items-center gap-1.5 text-xs px-3 py-2 text-red-600 dark:text-red-400"
                    >
                      {avatarBusy ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                      Remove photo
                    </button>
                  )}

                  <span className="text-[11px] text-slate-400">JPG, PNG, or WebP · max 5 MB</span>
                </div>
              )}
            </div>

            {editing && (
              <div className="flex gap-2 flex-shrink-0">
                <button
                  type="button"
                  onClick={handleCancel}
                  disabled={saving || avatarBusy}
                  className="btn-ghost flex items-center gap-2 text-sm"
                >
                  <X size={15} /> Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void handleSave()}
                  disabled={saving || avatarBusy}
                  className="btn-primary flex items-center gap-2 text-sm"
                >
                  {saving ? (
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <Save size={15} />
                  )}
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            )}
          </div>

          <div className="space-y-5">
            <div>
              <label className="label" htmlFor="faculty-profile-name">
                <User size={13} className="inline mr-1.5" />Full Name
              </label>
              {editing ? (
                <input
                  id="faculty-profile-name"
                  className="input"
                  value={form.full_name}
                  onChange={event => setForm(current => ({ ...current, full_name: event.target.value }))}
                  placeholder="Your full name"
                  maxLength={100}
                />
              ) : (
                <p className="text-slate-800 dark:text-slate-200 font-medium px-1 py-2">
                  {profile.full_name || 'Not provided'}
                </p>
              )}
            </div>

            <div>
              <label className="label" htmlFor="faculty-profile-phone">
                <Phone size={13} className="inline mr-1.5" />Phone Number
              </label>
              {editing ? (
                <input
                  id="faculty-profile-phone"
                  type="tel"
                  className="input"
                  value={form.phone}
                  onChange={event => setForm(current => ({ ...current, phone: event.target.value }))}
                  placeholder="Your phone number"
                  maxLength={30}
                />
              ) : (
                <p className="text-slate-800 dark:text-slate-200 font-medium px-1 py-2">
                  {profile.phone || 'Not provided'}
                </p>
              )}
            </div>

            <div>
              <label className="label" htmlFor="faculty-profile-bio">Professional Bio</label>
              {editing ? (
                <textarea
                  id="faculty-profile-bio"
                  className="input min-h-[130px] resize-y"
                  value={form.bio}
                  onChange={event => setForm(current => ({ ...current, bio: event.target.value }))}
                  placeholder="Describe your teaching experience, specializations, and approach..."
                  maxLength={1000}
                />
              ) : (
                <p className="text-sm leading-relaxed text-slate-700 dark:text-slate-300 px-1 py-2 whitespace-pre-wrap">
                  {profile.bio || 'Add a short professional bio so students and administrators know your areas of expertise.'}
                </p>
              )}
              {editing && (
                <p className="text-xs text-slate-400 text-right mt-1">{form.bio.length}/1000</p>
              )}
            </div>
          </div>
        </section>

        <aside className="card p-6 h-fit">
          <div className="flex items-center gap-2 mb-5">
            <ShieldCheck size={18} className="text-primary-600 dark:text-primary-400" />
            <h2 className="font-bold text-slate-900 dark:text-white">Faculty Account</h2>
          </div>

          <dl className="space-y-5">
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1">Email</dt>
              <dd className="flex items-start gap-2 text-sm text-slate-800 dark:text-slate-200 break-all">
                <Mail size={15} className="mt-0.5 flex-shrink-0 text-slate-400" />
                {profile.email}
              </dd>
              <p className="text-xs text-slate-400 mt-1">Email cannot be changed from this page.</p>
            </div>

            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1">Role</dt>
              <dd className="text-sm font-medium capitalize text-slate-800 dark:text-slate-200">{roleLabel}</dd>
            </div>

            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1">Account Status</dt>
              <dd>
                <Badge variant={profile.is_active ? 'success' : 'error'}>
                  {profile.is_active ? 'Active' : 'Inactive'}
                </Badge>
              </dd>
            </div>

            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1">Faculty Since</dt>
              <dd className="text-sm font-medium text-slate-800 dark:text-slate-200">{memberSince}</dd>
            </div>
          </dl>
        </aside>
      </div>
    </div>
  );
}
