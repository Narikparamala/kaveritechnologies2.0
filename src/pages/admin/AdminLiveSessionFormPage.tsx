import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Video, Calendar, Clock, Link, Save, Loader2, HelpCircle, ExternalLink } from 'lucide-react';
import { PageHeader } from '../../components/common/PageHeader';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../components/ui/Toast';
import { supabase } from '../../lib/supabase';
import {
  createSession, updateSession, getAllSessions, isValidGoogleMeetUrl,
  type CreateSessionInput
} from '../../services/liveSessions';
import type { Course } from '../../types/database';

export default function AdminLiveSessionFormPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const { profile } = useAuth();
  const { success, error: showError } = useToast();
  const navigate = useNavigate();
  const isEdit = Boolean(sessionId);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [courses, setCourses] = useState<Course[]>([]);

  const [form, setForm] = useState({
    course_id: '',
    title: '',
    description: '',
    session_date: '',
    session_time: '',
    duration_minutes: 60,
    google_meet_url: '',
    preparation_notes: '',
    slides_unlocked: false,
    materials_unlocked: false,
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    loadCourses();
    if (isEdit && sessionId) {
      loadSession();
    }
  }, [sessionId]);

  const loadCourses = async () => {
    const { data } = await supabase.from('courses').select('*').order('title');
    setCourses((data || []) as Course[]);
  };

  const loadSession = async () => {
    setLoading(true);
    try {
      const sessions = await getAllSessions({});
      const session = sessions.find(s => s.id === sessionId);
      if (session) {
        const sessionDate = new Date(session.session_date);
        setForm({
          course_id: session.course_id,
          title: session.title,
          description: session.description || '',
          session_date: sessionDate.toISOString().split('T')[0],
          session_time: sessionDate.toTimeString().slice(0, 5),
          duration_minutes: session.duration_minutes,
          google_meet_url: session.google_meet_url || '',
          preparation_notes: session.preparation_notes || '',
          slides_unlocked: session.slides_unlocked,
          materials_unlocked: session.materials_unlocked,
        });
      }
    } catch (err) {
      showError('Failed to load session.');
    } finally {
      setLoading(false);
    }
  };

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!form.course_id) newErrors.course_id = 'Please select a course';
    if (!form.title.trim()) newErrors.title = 'Title is required';
    if (!form.session_date) newErrors.session_date = 'Date is required';
    if (!form.session_time) newErrors.session_time = 'Time is required';
    if (form.google_meet_url && !isValidGoogleMeetUrl(form.google_meet_url)) {
      newErrors.google_meet_url = 'Invalid Google Meet URL';
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
      const input = {
        course_id: form.course_id,
        title: form.title.trim(),
        description: form.description.trim() || undefined,
        session_date: sessionDateTime.toISOString(),
        duration_minutes: form.duration_minutes,
        google_meet_url: form.google_meet_url.trim() || undefined,
        preparation_notes: form.preparation_notes.trim() || undefined,
      };

      if (isEdit && sessionId) {
        await updateSession(sessionId, { ...input, slides_unlocked: form.slides_unlocked, materials_unlocked: form.materials_unlocked });
        success('Session updated!');
      } else {
        await createSession(input, profile.id);
        success('Live session created!');
      }
      navigate('/admin/live-classes');
    } catch (err: any) {
      showError(err.message || 'Failed to save session.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-96"><Loader2 className="animate-spin text-primary-600" size={32} /></div>;
  }

  return (
    <div className="p-6 lg:p-8 max-w-3xl mx-auto animate-fade-in">
      <PageHeader
        title={isEdit ? 'Edit Live Session' : 'Create Live Session'}
        subtitle="Set up a Google Meet class"
      />

      <form onSubmit={handleSubmit} className="space-y-6 mt-6">
        <div className="card p-6">
          <h3 className="font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
            <Video size={18} className="text-primary-600" />
            Session Details
          </h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1.5">Course <span className="text-red-500">*</span></label>
              <select
                className={`input-field ${errors.course_id ? 'border-red-500' : ''}`}
                value={form.course_id}
                onChange={e => setForm(f => ({ ...f, course_id: e.target.value }))}
              >
                <option value="">Select course</option>
                {courses.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
              </select>
              {errors.course_id && <p className="text-xs text-red-500 mt-1">{errors.course_id}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">Title <span className="text-red-500">*</span></label>
              <input
                type="text"
                className={`input-field ${errors.title ? 'border-red-500' : ''}`}
                placeholder="Session title"
                value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">Description</label>
              <textarea
                className="input-field min-h-[80px]"
                placeholder="What students will learn..."
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              />
            </div>
          </div>
        </div>

        <div className="card p-6">
          <h3 className="font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
            <Calendar size={18} className="text-primary-600" />
            Schedule
          </h3>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1.5">Date <span className="text-red-500">*</span></label>
              <input
                type="date"
                className={`input-field ${errors.session_date ? 'border-red-500' : ''}`}
                value={form.session_date}
                onChange={e => setForm(f => ({ ...f, session_date: e.target.value }))}
                min={new Date().toISOString().split('T')[0]}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">Time <span className="text-red-500">*</span></label>
              <input
                type="time"
                className={`input-field ${errors.session_time ? 'border-red-500' : ''}`}
                value={form.session_time}
                onChange={e => setForm(f => ({ ...f, session_time: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">Duration</label>
              <select
                className="input-field"
                value={form.duration_minutes}
                onChange={e => setForm(f => ({ ...f, duration_minutes: parseInt(e.target.value) }))}
              >
                {[30, 45, 60, 75, 90, 120, 150, 180].map(d => <option key={d} value={d}>{d} min</option>)}
              </select>
            </div>
          </div>
        </div>

        <div className="card p-6">
          <h3 className="font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
            <Link size={18} className="text-primary-600" />
            Google Meet Link
          </h3>
          <div className="p-4 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 mb-4">
            <div className="flex items-start gap-3">
              <HelpCircle size={18} className="text-blue-600 flex-shrink-0" />
              <div className="text-sm">
                <p className="text-blue-900 dark:text-blue-100 font-medium">Get a Google Meet link:</p>
                <ol className="list-decimal list-inside text-blue-700 dark:text-blue-300 mt-1 space-y-0.5">
                  <li>Go to Google Calendar or Google Meet</li>
                  <li>Create a new meeting</li>
                  <li>Copy the link (starts with https://meet.google.com/)</li>
                </ol>
                <a href="https://meet.google.com" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-blue-700 font-medium mt-2 hover:underline">
                  <ExternalLink size={14} /> Open Google Meet
                </a>
              </div>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">Google Meet URL</label>
            <input
              type="url"
              className={`input-field ${errors.google_meet_url ? 'border-red-500' : ''}`}
              placeholder="https://meet.google.com/xxx-xxxx-xxx"
              value={form.google_meet_url}
              onChange={e => setForm(f => ({ ...f, google_meet_url: e.target.value }))}
            />
            {errors.google_meet_url && <p className="text-xs text-red-500 mt-1">{errors.google_meet_url}</p>}
          </div>
        </div>

        {isEdit && (
          <div className="card p-6">
            <h3 className="font-semibold text-slate-900 dark:text-white mb-4">Material Unlock Status</h3>
            <div className="space-y-3">
              <label className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={form.slides_unlocked}
                  onChange={e => setForm(f => ({ ...f, slides_unlocked: e.target.checked }))}
                  className="w-4 h-4 rounded border-slate-300"
                />
                <span className="text-sm text-slate-700 dark:text-slate-300">Slides unlocked for students</span>
              </label>
              <label className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={form.materials_unlocked}
                  onChange={e => setForm(f => ({ ...f, materials_unlocked: e.target.checked }))}
                  className="w-4 h-4 rounded border-slate-300"
                />
                <span className="text-sm text-slate-700 dark:text-slate-300">Materials unlocked for students</span>
              </label>
            </div>
          </div>
        )}

        <div className="flex gap-3">
          <button type="submit" disabled={saving} className="btn-primary flex items-center gap-2">
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            {isEdit ? 'Update Session' : 'Create Session'}
          </button>
          <button type="button" onClick={() => navigate('/admin/live-classes')} className="btn-secondary">Cancel</button>
        </div>
      </form>
    </div>
  );
}
