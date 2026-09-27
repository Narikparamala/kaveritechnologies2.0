import { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  Video, Calendar, Clock, Users, Link, Save, Loader2, AlertCircle,
  CheckCircle2, LogOut, RefreshCw, ExternalLink, Plus, Trash2,
  Lock, Unlock, FileText, BookOpen, Code, HelpCircle, Download,
} from 'lucide-react';
import { PageHeader } from '../../components/common/PageHeader';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../components/ui/Toast';
import { supabase } from '../../lib/supabase';
import {
  createSession, updateSession, getFacultySessions, isValidGoogleMeetUrl,
  getGoogleConnectionStatus, getGoogleOAuthUrl, disconnectGoogleAccount, createGoogleMeet,
  getSessionResources, addSessionResource, updateSessionResource, deleteSessionResource,
  type CreateSessionInput,
} from '../../services/liveSessions';
import type { Course, Chapter, Lesson, SessionResource, SessionResourceType } from '../../types/database';

export default function FacultyLiveSessionFormPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const [searchParams] = useSearchParams();
  const { profile } = useAuth();
  const { success, error: showError } = useToast();
  const navigate = useNavigate();
  const isEdit = Boolean(sessionId);
  const requestedCourseId = searchParams.get('courseId');
  const requestedLessonId = searchParams.get('lessonId');
  const prefillCompleted = useRef(false);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [googleConnected, setGoogleConnected] = useState(false);
  const [googleEmail, setGoogleEmail] = useState<string | null>(null);
  const [googleLoading, setGoogleLoading] = useState(true);
  const [meetGenerating, setMeetGenerating] = useState(false);
  const [courses, setCourses] = useState<Course[]>([]);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [lessons, setLessons] = useState<Lesson[]>([]);

  const [form, setForm] = useState({
    course_id: '',
    chapter_id: '',
    lesson_id: '',
    title: '',
    description: '',
    session_date: '',
    session_time: '',
    duration_minutes: 60,
    google_meet_url: '',
    preparation_notes: '',
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  // Materials / recording manager (edit mode)
  const [resources, setResources] = useState<SessionResource[]>([]);
  const [resourcesLoading, setResourcesLoading] = useState(false);
  const [showResourceForm, setShowResourceForm] = useState(false);
  const [resourceSaving, setResourceSaving] = useState(false);
  const [resourceForm, setResourceForm] = useState<{
    title: string;
    resource_type: SessionResourceType;
    external_url: string;
    content: string;
    is_locked: boolean;
  }>({ title: '', resource_type: 'slides', external_url: '', content: '', is_locked: true });

  const loadResources = async () => {
    if (!sessionId) return;
    setResourcesLoading(true);
    try {
      const rows = await getSessionResources(sessionId);
      setResources(rows);
    } catch {
      setResources([]);
    } finally {
      setResourcesLoading(false);
    }
  };

  useEffect(() => {
    if (isEdit && sessionId && !loading) {
      loadResources();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEdit, sessionId, loading]);

  const handleAddResource = async () => {
    if (!sessionId || !resourceForm.title.trim()) {
      showError('Resource title is required.');
      return;
    }
    setResourceSaving(true);
    try {
      await addSessionResource(sessionId, {
        title: resourceForm.title.trim(),
        resource_type: resourceForm.resource_type,
        external_url: resourceForm.external_url.trim() || undefined,
        content: resourceForm.content.trim() || undefined,
        is_locked: resourceForm.is_locked,
      });
      setResourceForm({ title: '', resource_type: 'slides', external_url: '', content: '', is_locked: true });
      setShowResourceForm(false);
      await loadResources();
      success(resourceForm.resource_type === 'recording'
        ? 'Recording added. Students will see it once you unlock it.'
        : 'Material added.');
    } catch (err: any) {
      showError(err.message || 'Failed to add resource.');
    } finally {
      setResourceSaving(false);
    }
  };

  const handleToggleResourceLock = async (resource: SessionResource) => {
    try {
      await updateSessionResource(resource.id, { is_locked: !resource.is_locked });
      await loadResources();
    } catch (err: any) {
      showError(err.message || 'Failed to update resource.');
    }
  };

  const handleDeleteResource = async (resource: SessionResource) => {
    if (!confirm(`Delete "${resource.title}"? This cannot be undone.`)) return;
    try {
      await deleteSessionResource(resource.id);
      await loadResources();
    } catch (err: any) {
      showError(err.message || 'Failed to delete resource.');
    }
  };

  const resourceTypeLabel = (t: SessionResourceType) => t.replace(/_/g, ' ');

  const checkGoogleConnection = useCallback(async () => {
    if (!profile) return;
    setGoogleLoading(true);
    try {
      const status = await getGoogleConnectionStatus(profile.id);
      setGoogleConnected(status.connected);
      setGoogleEmail(status.google_email);
    } catch {
      setGoogleConnected(false);
    } finally {
      setGoogleLoading(false);
    }
  }, [profile]);

  // Handle OAuth callback: ?google_connected=1&google_email=...
  useEffect(() => {
    if (searchParams.get('google_connected') === '1') {
      const email = searchParams.get('google_email');
      setGoogleConnected(true);
      setGoogleEmail(email);
      success('Google account connected successfully!');
      // Clean up URL params without navigation
      const url = new URL(window.location.href);
      url.searchParams.delete('google_connected');
      url.searchParams.delete('google_email');
      window.history.replaceState({}, '', url.toString());
    }
  }, [searchParams]);

  const loadCourses = async () => {
    if (!profile) return;
    try {
      const { data: facultyCourses } = await supabase
        .from('course_faculty')
        .select('course_id')
        .eq('faculty_id', profile.id);
      if (!facultyCourses?.length) { setCourses([]); return; }
      const courseIds = facultyCourses.map(fc => fc.course_id);
      const { data } = await supabase.from('courses').select('*').in('id', courseIds);
      setCourses((data || []) as Course[]);
    } catch (err) {
      console.error('Failed to load courses:', err);
    }
  };

  const loadChapters = async (courseId: string) => {
    if (!courseId) { setChapters([]); setLessons([]); return; }
    const { data } = await supabase.from('chapters').select('*').eq('course_id', courseId).order('order_index');
    setChapters((data ?? []) as Chapter[]);
    setLessons([]);
  };

  const loadLessons = async (chapterId: string) => {
    if (!chapterId) { setLessons([]); return; }
    const { data } = await supabase.from('lessons').select('*').eq('chapter_id', chapterId).order('order_index');
    setLessons((data ?? []) as Lesson[]);
  };

  const prefillFromLesson = async () => {
    setLoading(true);
    try {
      let requestedLesson: Lesson | null = null;
      if (requestedLessonId) {
        const { data, error } = await supabase
          .from('lessons')
          .select('*')
          .eq('id', requestedLessonId)
          .maybeSingle();
        if (error) throw error;
        requestedLesson = data as Lesson | null;
      }

      const courseId = requestedLesson?.course_id || requestedCourseId || '';
      const chapterId = requestedLesson?.chapter_id || '';
      if (courseId) await loadChapters(courseId);
      if (chapterId) await loadLessons(chapterId);

      setForm(current => ({
        ...current,
        course_id: courseId,
        chapter_id: chapterId,
        lesson_id: requestedLesson?.id || '',
        title: current.title || (requestedLesson ? `${requestedLesson.title} - Live Class` : ''),
        description: current.description || requestedLesson?.explanation || '',
        duration_minutes: requestedLesson?.duration_minutes || current.duration_minutes,
      }));
    } catch (err: any) {
      console.error('Failed to prefill live session:', err);
      showError(err.message || 'Could not load the selected lesson.');
    } finally {
      setLoading(false);
    }
  };

  const loadSession = async () => {
    if (!profile || !sessionId) return;
    setLoading(true);
    try {
      const sessions = await getFacultySessions(profile.id);
      const session = sessions.find(s => s.id === sessionId);
      if (session) {
        const sessionDate = new Date(session.session_date);
        setForm({
          course_id: session.course_id,
          chapter_id: session.chapter_id ?? '',
          lesson_id: session.lesson_id ?? '',
          title: session.title,
          description: session.description || '',
          session_date: sessionDate.toISOString().split('T')[0],
          session_time: sessionDate.toTimeString().slice(0, 5),
          duration_minutes: session.duration_minutes,
          google_meet_url: session.google_meet_url || '',
          preparation_notes: session.preparation_notes || '',
        });
        if (session.course_id) await loadChapters(session.course_id);
        if (session.chapter_id) await loadLessons(session.chapter_id);
      }
    } catch (err) {
      console.error('Failed to load session:', err);
      showError('Failed to load session details.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!profile) return;
    loadCourses();
    checkGoogleConnection();
    if (isEdit && sessionId) {
      loadSession();
    } else if (!prefillCompleted.current && (requestedCourseId || requestedLessonId)) {
      prefillCompleted.current = true;
      prefillFromLesson();
    }
  }, [profile?.id, sessionId, requestedCourseId, requestedLessonId]);

  const handleConnectGoogle = async () => {
    if (!profile) return;
    setGoogleLoading(true);
    try {
      const redirectUri = `${window.location.origin}${window.location.pathname}${window.location.search}`;
      const authUrl = await getGoogleOAuthUrl(profile.id, redirectUri);
      if (!authUrl) {
        showError('Could not get Google authorization URL. Ensure GOOGLE_CLIENT_ID is configured.');
        return;
      }
      window.location.href = authUrl;
    } catch (err: any) {
      showError(err.message || 'Failed to initiate Google connection.');
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleDisconnectGoogle = async () => {
    if (!profile) return;
    setGoogleLoading(true);
    try {
      await disconnectGoogleAccount(profile.id);
      setGoogleConnected(false);
      setGoogleEmail(null);
      success('Google account disconnected.');
    } catch {
      showError('Failed to disconnect Google account.');
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleGenerateMeet = async (sessionIdForMeet: string) => {
    if (!profile || !form.title || !form.session_date || !form.session_time) return;
    setMeetGenerating(true);
    try {
      const { data: { session: authSession } } = await supabase.auth.getSession();
      const accessToken = authSession?.access_token ?? '';
      const sessionDateTime = new Date(`${form.session_date}T${form.session_time}`);
      const result = await createGoogleMeet({
        faculty_id: profile.id,
        session_id: sessionIdForMeet,
        title: form.title,
        description: form.description || undefined,
        start_time: sessionDateTime.toISOString(),
        duration_minutes: form.duration_minutes,
        access_token: accessToken,
      });
      setForm(f => ({ ...f, google_meet_url: result.google_meet_url }));
      success('Google Meet link generated!');
    } catch (err: any) {
      showError(err.message || 'Failed to generate Google Meet link.');
    } finally {
      setMeetGenerating(false);
    }
  };

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!form.course_id) newErrors.course_id = 'Please select a course';
    if (!form.title.trim()) newErrors.title = 'Session title is required';
    if (!form.session_date) newErrors.session_date = 'Please select a date';
    if (!form.session_time) newErrors.session_time = 'Please select a time';
    if (form.duration_minutes < 15 || form.duration_minutes > 480) {
      newErrors.duration_minutes = 'Duration must be between 15 and 480 minutes';
    }
    if (form.google_meet_url && !isValidGoogleMeetUrl(form.google_meet_url)) {
      newErrors.google_meet_url = 'Invalid Google Meet URL. Must start with https://meet.google.com/';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate() || !profile) return;

    setSaving(true);
    try {
      const sessionDateTime = new Date(`${form.session_date}T${form.session_time}`);
      const input: CreateSessionInput = {
        course_id: form.course_id,
        chapter_id: form.chapter_id || undefined,
        lesson_id: form.lesson_id || undefined,
        title: form.title.trim(),
        description: form.description.trim() || undefined,
        session_date: sessionDateTime.toISOString(),
        duration_minutes: form.duration_minutes,
        google_meet_url: form.google_meet_url.trim() || undefined,
        preparation_notes: form.preparation_notes.trim() || undefined,
      };

      if (isEdit && sessionId) {
        await updateSession(sessionId, input);

        // Recover sessions that were saved before their generated Meet link
        // could be persisted. Saving the edit generates and stores the link.
        if (googleConnected && !form.google_meet_url.trim()) {
          await handleGenerateMeet(sessionId);
        }

        success('Session updated successfully!');
        navigate('/faculty/live-classes');
      } else {
        const newSession = await createSession(input, profile.id);
        success('Live session scheduled!');

        // Auto-generate Meet link if Google is connected and no URL was manually entered
        if (googleConnected && !form.google_meet_url.trim()) {
          await handleGenerateMeet(newSession.id);
        }

        navigate('/faculty/live-classes');
      }
    } catch (err: any) {
      console.error('Failed to save session:', err);
      showError(err.message || 'Failed to save session.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="animate-spin text-primary-600" size={32} />
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 max-w-3xl mx-auto animate-fade-in">
      <PageHeader
        title={isEdit ? 'Edit Live Session' : 'Schedule Live Session'}
        subtitle="Set up a Google Meet class for your students"
      />

      <form onSubmit={handleSubmit} className="space-y-6 mt-6">
        {/* Google Calendar Connection */}
        <div className="card p-6">
          <h3 className="font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
            <Video size={18} className="text-primary-600" />
            Google Calendar
          </h3>

          {googleLoading ? (
            <div className="flex items-center gap-2 text-slate-400 text-sm">
              <Loader2 size={14} className="animate-spin" /> Checking connection...
            </div>
          ) : googleConnected ? (
            <div className="flex items-center justify-between p-3 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800">
              <div className="flex items-center gap-3">
                <CheckCircle2 size={18} className="text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-emerald-900 dark:text-emerald-100">Connected</p>
                  <p className="text-xs text-emerald-700 dark:text-emerald-300">{googleEmail}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleDisconnectGoogle}
                className="flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-300 hover:text-red-600 transition-colors"
              >
                <LogOut size={13} /> Disconnect
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Connect your Google account to automatically generate Google Meet links when you schedule a class.
              </p>
              <button
                type="button"
                onClick={handleConnectGoogle}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
                Connect Google Account
              </button>
            </div>
          )}
        </div>

        {/* Session Details */}
        <div className="card p-6">
          <h3 className="font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
            <Calendar size={18} className="text-primary-600" />
            Session Details
          </h3>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Course <span className="text-red-500">*</span>
              </label>
              <select
                className={`input-field ${errors.course_id ? 'border-red-500' : ''}`}
                value={form.course_id}
                onChange={e => {
                  const id = e.target.value;
                  setForm(f => ({ ...f, course_id: id, chapter_id: '', lesson_id: '' }));
                  loadChapters(id);
                }}
                disabled={isEdit}
              >
                <option value="">Select a course</option>
                {courses.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
              </select>
              {errors.course_id && <p className="text-xs text-red-500 mt-1">{errors.course_id}</p>}
            </div>

            {chapters.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Chapter (optional)
                </label>
                <select
                  className="input-field"
                  value={form.chapter_id}
                  onChange={e => {
                    const id = e.target.value;
                    setForm(f => ({ ...f, chapter_id: id, lesson_id: '' }));
                    loadLessons(id);
                  }}
                >
                  <option value="">— Select chapter —</option>
                  {chapters.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
                </select>
              </div>
            )}

            {lessons.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Lesson (optional)
                </label>
                <select
                  className="input-field"
                  value={form.lesson_id}
                  onChange={e => setForm(f => ({ ...f, lesson_id: e.target.value }))}
                >
                  <option value="">— Select lesson —</option>
                  {lessons.map(l => <option key={l.id} value={l.id}>{l.title}</option>)}
                </select>
                <p className="text-xs text-slate-400 mt-1">Linking to a lesson lets students see this class in their lesson view.</p>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Session Title <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                className={`input-field ${errors.title ? 'border-red-500' : ''}`}
                placeholder="e.g., Introduction to Python Functions"
                value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              />
              {errors.title && <p className="text-xs text-red-500 mt-1">{errors.title}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Description</label>
              <textarea
                className="input-field min-h-[100px]"
                placeholder="Describe what students will learn in this session..."
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              />
            </div>
          </div>
        </div>

        {/* Schedule */}
        <div className="card p-6">
          <h3 className="font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
            <Clock size={18} className="text-primary-600" />
            Schedule
          </h3>

          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Date <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                className={`input-field ${errors.session_date ? 'border-red-500' : ''}`}
                value={form.session_date}
                onChange={e => setForm(f => ({ ...f, session_date: e.target.value }))}
                min={new Date().toISOString().split('T')[0]}
              />
              {errors.session_date && <p className="text-xs text-red-500 mt-1">{errors.session_date}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Time <span className="text-red-500">*</span>
              </label>
              <input
                type="time"
                className={`input-field ${errors.session_time ? 'border-red-500' : ''}`}
                value={form.session_time}
                onChange={e => setForm(f => ({ ...f, session_time: e.target.value }))}
              />
              {errors.session_time && <p className="text-xs text-red-500 mt-1">{errors.session_time}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Duration <span className="text-red-500">*</span>
              </label>
              <select
                className={`input-field ${errors.duration_minutes ? 'border-red-500' : ''}`}
                value={form.duration_minutes}
                onChange={e => setForm(f => ({ ...f, duration_minutes: parseInt(e.target.value) }))}
              >
                {[30, 45, 60, 75, 90, 120, 150, 180].map(d => (
                  <option key={d} value={d}>{d} minutes</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Google Meet URL */}
        <div className="card p-6">
          <h3 className="font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
            <Link size={18} className="text-primary-600" />
            Google Meet Link
          </h3>

          {googleConnected ? (
            <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 mb-4 text-sm text-blue-800 dark:text-blue-200">
              When you save this session, a Google Meet link will be automatically generated using your connected account.
              You can also enter a link manually below.
            </div>
          ) : (
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 mb-4 text-sm text-slate-600 dark:text-slate-400">
              Connect your Google account above to auto-generate Meet links, or paste one manually.
            </div>
          )}

          <div className="space-y-2">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
              Google Meet URL {!googleConnected && <span className="text-slate-400">(manual)</span>}
            </label>
            <div className="flex gap-2">
              <input
                type="url"
                className={`input-field flex-1 ${errors.google_meet_url ? 'border-red-500' : ''}`}
                placeholder="https://meet.google.com/xxx-xxxx-xxx"
                value={form.google_meet_url}
                onChange={e => setForm(f => ({ ...f, google_meet_url: e.target.value }))}
              />
              {form.google_meet_url && isValidGoogleMeetUrl(form.google_meet_url) && (
                <a
                  href={form.google_meet_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-600 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                >
                  <ExternalLink size={14} /> Test
                </a>
              )}
            </div>
            {errors.google_meet_url && (
              <p className="text-xs text-red-500 flex items-center gap-1">
                <AlertCircle size={12} /> {errors.google_meet_url}
              </p>
            )}
            {isEdit && googleConnected && sessionId && (
              <button
                type="button"
                onClick={() => handleGenerateMeet(sessionId)}
                disabled={meetGenerating || !form.title || !form.session_date || !form.session_time}
                className="flex items-center gap-2 text-sm text-primary-600 hover:text-primary-700 disabled:opacity-40 mt-1"
              >
                {meetGenerating ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
                Regenerate Meet link
              </button>
            )}
          </div>
        </div>

        {/* Preparation Notes */}
        <div className="card p-6">
          <h3 className="font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
            <Users size={18} className="text-primary-600" />
            Preparation Notes (Optional)
          </h3>
          <textarea
            className="input-field min-h-[100px]"
            placeholder="e.g., Complete Chapter 2 exercises, have your Python environment ready..."
            value={form.preparation_notes}
            onChange={e => setForm(f => ({ ...f, preparation_notes: e.target.value }))}
          />
        </div>

        {/* Materials & Recording manager (edit mode only) */}
        {isEdit && sessionId && (
          <div className="card p-6">
            <div className="flex items-center justify-between mb-1">
              <h3 className="font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                <FileText size={18} className="text-primary-600" />
                Materials & Recording
              </h3>
              <button
                type="button"
                onClick={() => setShowResourceForm(v => !v)}
                className="btn-secondary text-xs flex items-center gap-1.5 py-1.5 px-3"
              >
                <Plus size={14} />
                Add Material
              </button>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
              Add slides, notes, code examples or a class recording. Each item stays locked
              until you unlock it — students only ever see unlocked items.
            </p>

            {showResourceForm && (
              <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-4 mb-4 space-y-3 bg-slate-50/50 dark:bg-slate-900/40">
                <div className="grid md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Title *</label>
                    <input
                      type="text"
                      className="input-field py-2 text-sm"
                      placeholder="e.g., Session slides"
                      value={resourceForm.title}
                      onChange={e => setResourceForm(f => ({ ...f, title: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Type</label>
                    <select
                      className="input-field py-2 text-sm capitalize"
                      value={resourceForm.resource_type}
                      onChange={e => setResourceForm(f => ({ ...f, resource_type: e.target.value as SessionResourceType }))}
                    >
                      {(['slides', 'notes', 'practice_questions', 'code_example', 'quiz', 'assignment', 'downloadable', 'recording'] as SessionResourceType[]).map(t => (
                        <option key={t} value={t} className="capitalize">{resourceTypeLabel(t)}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                    External URL {resourceForm.resource_type === 'recording' ? '(Google Drive / YouTube / HTTPS recording link)' : '(optional)'}
                  </label>
                  <input
                    type="url"
                    className="input-field py-2 text-sm"
                    placeholder="https://..."
                    value={resourceForm.external_url}
                    onChange={e => setResourceForm(f => ({ ...f, external_url: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Content (optional)</label>
                  <textarea
                    className="input-field py-2 text-sm min-h-[80px] font-mono"
                    placeholder="Paste notes or code for content-type materials..."
                    value={resourceForm.content}
                    onChange={e => setResourceForm(f => ({ ...f, content: e.target.value }))}
                  />
                </div>
                <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                  <input
                    type="checkbox"
                    checked={resourceForm.is_locked}
                    onChange={e => setResourceForm(f => ({ ...f, is_locked: e.target.checked }))}
                    className="h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                  />
                  Keep locked until I unlock it
                </label>
                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    onClick={handleAddResource}
                    disabled={resourceSaving}
                    className="btn-primary text-xs flex items-center gap-1.5 py-2 px-4"
                  >
                    {resourceSaving ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
                    {resourceForm.resource_type === 'recording' ? 'Add Recording' : 'Add Material'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowResourceForm(false)}
                    className="btn-secondary text-xs py-2 px-4"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {resourcesLoading ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="animate-spin text-primary-500" size={18} />
              </div>
            ) : resources.length === 0 ? (
              <p className="text-sm text-slate-400 dark:text-slate-500 py-4 text-center">
                No materials yet. Add slides, notes, or a recording to share with students.
              </p>
            ) : (
              <div className="space-y-2">
                {resources.map(resource => {
                  const Icon = resource.resource_type === 'slides'
                    ? FileText
                    : resource.resource_type === 'notes' || resource.resource_type === 'practice_questions' || resource.resource_type === 'quiz'
                      ? HelpCircle
                      : resource.resource_type === 'code_example'
                        ? Code
                        : resource.resource_type === 'recording'
                          ? Video
                          : resource.resource_type === 'downloadable'
                            ? Download
                            : BookOpen;
                  return (
                    <div key={resource.id} className="flex items-center gap-3 rounded-xl border border-slate-200 dark:border-slate-700 p-3">
                      <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${resource.resource_type === 'recording' ? 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400' : 'bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400'}`}>
                        <Icon size={16} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-900 dark:text-white truncate">{resource.title}</p>
                        <p className="text-xs text-slate-400 capitalize">{resourceTypeLabel(resource.resource_type)}</p>
                      </div>
                      {resource.resource_type === 'recording' && !resource.is_locked && (
                        <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                          <CheckCircle2 size={12} /> Published
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => handleToggleResourceLock(resource)}
                        title={resource.is_locked ? 'Unlock for students' : 'Lock from students'}
                        className={`flex items-center gap-1.5 text-xs rounded-lg px-2.5 py-1.5 border transition-colors ${
                          resource.is_locked
                            ? 'text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-800 hover:bg-amber-50 dark:hover:bg-amber-900/20'
                            : 'text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800 hover:bg-emerald-50 dark:hover:bg-emerald-900/20'
                        }`}
                      >
                        {resource.is_locked ? <Lock size={12} /> : <Unlock size={12} />}
                        {resource.is_locked ? 'Locked' : 'Unlocked'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteResource(resource)}
                        className="p-2 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                        title="Delete"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        <div className="flex gap-3">
          <button type="submit" disabled={saving} className="btn-primary flex items-center gap-2">
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            {isEdit ? 'Update Session' : 'Schedule Session'}
          </button>
          <button type="button" onClick={() => navigate('/faculty/live-classes')} className="btn-secondary">
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
