import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, Archive, BookOpen, CalendarClock, Clock3, Eye, Layers3,
  Loader2, Megaphone, Pencil, Pin, Plus, Send, Trash2, Users,
} from 'lucide-react';
import { PageHeader } from '../../components/common/PageHeader';
import { Badge } from '../../components/ui/Badge';
import { EmptyState } from '../../components/ui/EmptyState';
import { Modal } from '../../components/ui/Modal';
import { useToast } from '../../components/ui/Toast';
import { useAuth } from '../../contexts/AuthContext';
import { formatRelativeTime } from '../../lib/utils';
import {
  createFacultyAnnouncement, deleteFacultyAnnouncement, getFacultyAnnouncements,
  getFacultyAnnouncementSetup, updateFacultyAnnouncement, updateFacultyAnnouncementStatus,
  type AnnouncementAudience, type AnnouncementInput, type AnnouncementPriority,
  type AnnouncementStatus, type FacultyAnnouncement, type FacultyAnnouncementTarget,
} from '../../services/facultyAnnouncements';
import type { Course } from '../../types/database';

type Filter = 'all' | AnnouncementStatus;
interface FormState {
  title: string; content: string; audience_type: AnnouncementAudience;
  course_id: string; batch_id: string; status: 'draft' | 'published' | 'scheduled';
  priority: AnnouncementPriority; publish_at: string; expires_at: string; is_pinned: boolean;
}

const emptyForm: FormState = {
  title: '', content: '', audience_type: 'all_students', course_id: '', batch_id: '',
  status: 'published', priority: 'normal', publish_at: '', expires_at: '', is_pinned: false,
};
const statusVariant: Record<AnnouncementStatus, 'default' | 'success' | 'warning' | 'info'> = {
  draft: 'default', published: 'success', scheduled: 'info', archived: 'warning',
};
const priorityVariant: Record<AnnouncementPriority, 'default' | 'warning' | 'error'> = {
  normal: 'default', important: 'warning', urgent: 'error',
};

function dateTimeLocal(value: string | null) {
  if (!value) return '';
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}
function toIso(value: string) { return value ? new Date(value).toISOString() : null; }
function prettyDate(value: string | null) {
  if (!value) return 'Not set';
  return new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}
function isSchemaError(message: string) {
  return /schema cache|announcement_reads|audience_type|batch_id|publish_at/i.test(message);
}

function getErrorMessage(caught: unknown) {
  if (caught instanceof Error) return caught.message;
  if (typeof caught === 'string') return caught;
  if (caught && typeof caught === 'object') {
    const error = caught as { message?: unknown; details?: unknown; hint?: unknown; code?: unknown };
    const parts = [error.message, error.details, error.hint]
      .filter((value): value is string => typeof value === 'string' && value.trim().length > 0);
    if (parts.length > 0) {
      const code = typeof error.code === 'string' && error.code ? ` (${error.code})` : '';
      return `${parts.join(' ')}${code}`;
    }
    try { return JSON.stringify(caught); } catch { /* Fall through to the friendly fallback. */ }
  }
  return 'An unexpected error occurred. Please try again.';
}

export default function AnnouncementsPage() {
  const { profile } = useAuth();
  const { error: showError, success: showSuccess, warning: showWarning } = useToast();
  const isAdmin = profile?.role === 'super_admin';
  const [announcements, setAnnouncements] = useState<FacultyAnnouncement[]>([]);
  const [courses, setCourses] = useState<Pick<Course, 'id' | 'title'>[]>([]);
  const [batches, setBatches] = useState<FacultyAnnouncementTarget[]>([]);
  const [filter, setFilter] = useState<Filter>('all');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [schemaMissing, setSchemaMissing] = useState(false);
  const [editing, setEditing] = useState<FacultyAnnouncement | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [readersFor, setReadersFor] = useState<FacultyAnnouncement | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);

  const load = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    try {
      const [setup, items] = await Promise.all([
        getFacultyAnnouncementSetup(profile.id, isAdmin), getFacultyAnnouncements(profile.id, isAdmin),
      ]);
      setCourses(setup.courses); setBatches(setup.batches); setAnnouncements(items); setSchemaMissing(false);
    } catch (caught) {
      const message = getErrorMessage(caught);
      setSchemaMissing(isSchemaError(message)); showError('Announcements could not load', message);
    } finally { setLoading(false); }
  }, [isAdmin, profile, showError]);

  useEffect(() => { void load(); }, [load]);
  const filtered = useMemo(() => announcements.filter(item => filter === 'all' || item.status === filter), [announcements, filter]);
  const totals = useMemo(() => ({
    total: announcements.length,
    published: announcements.filter(item => item.status === 'published').length,
    scheduled: announcements.filter(item => item.status === 'scheduled').length,
    reads: announcements.reduce((sum, item) => sum + (item.reads?.length ?? 0), 0),
  }), [announcements]);

  function openCreate() {
    setEditing(null); setForm({ ...emptyForm, audience_type: isAdmin ? 'platform' : 'all_students' }); setShowForm(true);
  }
  function openEdit(item: FacultyAnnouncement) {
    setEditing(item);
    setForm({
      title: item.title, content: item.content, audience_type: item.audience_type,
      course_id: item.course_id ?? '', batch_id: item.batch_id ?? '',
      status: item.status === 'archived' ? 'draft' : item.status, priority: item.priority,
      publish_at: dateTimeLocal(item.publish_at), expires_at: dateTimeLocal(item.expires_at), is_pinned: item.is_pinned,
    });
    setShowForm(true);
  }
  function validateForm() {
    if (!form.title.trim() || !form.content.trim()) return 'Add a title and message.';
    if (form.audience_type === 'course' && !form.course_id) return 'Choose a course.';
    if (form.audience_type === 'batch' && !form.batch_id) return 'Choose a batch.';
    if (form.status === 'scheduled' && !form.publish_at) return 'Choose a publishing date and time.';
    if (form.status === 'scheduled' && new Date(form.publish_at) <= new Date()) return 'Scheduled time must be in the future.';
    if (form.expires_at) {
      const expiry = new Date(form.expires_at);
      if (form.status === 'published' && expiry <= new Date()) return 'Expiry must be in the future. Choose a later time or leave expiry empty.';
      if (form.status === 'scheduled' && expiry <= new Date(form.publish_at)) return 'Expiry must be later than the scheduled publishing time.';
    }
    return null;
  }
  async function save() {
    if (!profile) return;
    const validation = validateForm();
    if (validation) { showWarning('Check announcement details', validation); return; }
    const now = new Date().toISOString();
    const input: AnnouncementInput = {
      title: form.title.trim(), content: form.content.trim(), audience_type: form.audience_type,
      course_id: form.audience_type === 'course' ? form.course_id : null,
      batch_id: form.audience_type === 'batch' ? form.batch_id : null,
      status: form.status, priority: form.priority,
      publish_at: form.status === 'published' ? now : form.status === 'scheduled' ? toIso(form.publish_at) : null,
      published_at: form.status === 'published' ? (editing?.published_at ?? now) : null,
      expires_at: toIso(form.expires_at), is_pinned: form.is_pinned,
    };
    setSaving(true);
    try {
      if (editing) {
        await updateFacultyAnnouncement(editing.id, profile.id, input, isAdmin); showSuccess('Announcement updated');
      } else {
        await createFacultyAnnouncement(profile.id, input);
        showSuccess(form.status === 'draft' ? 'Draft saved' : form.status === 'scheduled' ? 'Announcement scheduled' : 'Announcement published');
      }
      setShowForm(false); setEditing(null); await load();
    } catch (caught) {
      const message = getErrorMessage(caught);
      setSchemaMissing(isSchemaError(message)); showError('Could not save announcement', message);
    } finally { setSaving(false); }
  }
  async function changeStatus(item: FacultyAnnouncement, status: AnnouncementStatus) {
    if (!profile) return;
    try {
      await updateFacultyAnnouncementStatus(item.id, profile.id, status, isAdmin);
      showSuccess(status === 'published' ? 'Announcement published' : 'Announcement archived'); await load();
    } catch (caught) { showError('Status could not be changed', getErrorMessage(caught)); }
  }
  async function remove(item: FacultyAnnouncement) {
    if (!profile || !window.confirm(`Delete “${item.title}”? This cannot be undone.`)) return;
    try {
      await deleteFacultyAnnouncement(item.id, profile.id, isAdmin); showSuccess('Announcement deleted');
      setAnnouncements(current => current.filter(value => value.id !== item.id));
    } catch (caught) { showError('Announcement could not be deleted', getErrorMessage(caught)); }
  }
  function targetLabel(item: FacultyAnnouncement) {
    if (item.audience_type === 'platform') return 'Entire platform';
    if (item.audience_type === 'all_students') return 'All my students';
    if (item.audience_type === 'course') return item.course?.title ?? 'Course';
    return item.batch?.name ?? 'Batch';
  }

  return (
    <div className="p-6 lg:p-8 max-w-6xl mx-auto animate-fade-in">
      <PageHeader title="Announcements" subtitle="Publish timely updates to courses, batches, and students" icon={Megaphone}
        action={<button onClick={openCreate} className="btn-primary flex items-center gap-2"><Plus size={16} /> New Announcement</button>} />

      {schemaMissing && <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-900 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200 flex items-start gap-3">
        <AlertTriangle size={20} className="mt-0.5 flex-shrink-0" /><div><p className="font-semibold">Database upgrade required</p><p className="text-sm opacity-80">Apply the faculty announcements migration, then refresh this page.</p></div>
      </div>}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {[
          { label: 'Total', value: totals.total, icon: Megaphone, color: 'text-blue-500' },
          { label: 'Published', value: totals.published, icon: Send, color: 'text-emerald-500' },
          { label: 'Scheduled', value: totals.scheduled, icon: CalendarClock, color: 'text-violet-500' },
          { label: 'Student reads', value: totals.reads, icon: Eye, color: 'text-amber-500' },
        ].map(metric => <div key={metric.label} className="card p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-700 flex items-center justify-center"><metric.icon size={19} className={metric.color} /></div>
          <div><p className="text-xl font-bold text-slate-900 dark:text-white">{metric.value}</p><p className="text-xs text-slate-500">{metric.label}</p></div>
        </div>)}
      </div>

      <div className="flex gap-2 overflow-x-auto pb-2 mb-4">
        {(['all', 'published', 'scheduled', 'draft', 'archived'] as Filter[]).map(value => <button key={value} onClick={() => setFilter(value)} className={filter === value ? 'btn-primary py-2 capitalize' : 'btn-secondary py-2 capitalize'}>{value}</button>)}
      </div>

      {loading ? <div className="py-20 flex justify-center text-blue-500"><Loader2 className="animate-spin" size={28} /></div>
        : filtered.length === 0 ? <EmptyState icon={Megaphone} title={filter === 'all' ? 'No announcements yet' : `No ${filter} announcements`} description="Create a focused update and choose exactly who should receive it." action={<button onClick={openCreate} className="btn-primary">Create Announcement</button>} />
        : <div className="space-y-4">{filtered.map(item => <article key={item.id} className="card p-5 border-l-4 border-l-blue-500">
          <div className="flex flex-col md:flex-row md:items-start gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2 mb-2">{item.is_pinned && <Pin size={14} className="text-blue-500 fill-blue-500" />}<h3 className="font-bold text-slate-900 dark:text-white">{item.title}</h3><Badge variant={statusVariant[item.status]}>{item.status}</Badge>{item.priority !== 'normal' && <Badge variant={priorityVariant[item.priority]}>{item.priority}</Badge>}</div>
              <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed whitespace-pre-wrap mb-4">{item.content}</p>
              <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-slate-500">
                <span className="flex items-center gap-1.5">{item.audience_type === 'course' ? <BookOpen size={14} /> : item.audience_type === 'batch' ? <Layers3 size={14} /> : <Users size={14} />}{targetLabel(item)}</span>
                <span className="flex items-center gap-1.5"><Clock3 size={14} /> {formatRelativeTime(item.created_at)}</span>
                {item.status === 'scheduled' && <span className="flex items-center gap-1.5 text-blue-500"><CalendarClock size={14} /> {prettyDate(item.publish_at)}</span>}
                {item.expires_at && <span>Expires {prettyDate(item.expires_at)}</span>}
              </div>
            </div>
            <div className="flex md:flex-col lg:flex-row items-center gap-1 md:justify-end">
              <button onClick={() => setReadersFor(item)} className="btn-ghost px-2.5 py-2 text-slate-500" title="View readers"><span className="flex items-center gap-1"><Eye size={15} /> {item.reads?.length ?? 0}</span></button>
              {item.status !== 'published' && item.status !== 'archived' && <button onClick={() => void changeStatus(item, 'published')} className="btn-ghost px-2.5 py-2 text-emerald-600" title="Publish now"><Send size={15} /></button>}
              <button onClick={() => openEdit(item)} className="btn-ghost px-2.5 py-2 text-blue-500" title="Edit"><Pencil size={15} /></button>
              {item.status !== 'archived' && <button onClick={() => void changeStatus(item, 'archived')} className="btn-ghost px-2.5 py-2 text-amber-600" title="Archive"><Archive size={15} /></button>}
              <button onClick={() => void remove(item)} className="btn-ghost px-2.5 py-2 text-red-500" title="Delete"><Trash2 size={15} /></button>
            </div>
          </div>
        </article>)}</div>}

      <Modal open={showForm} onClose={() => !saving && setShowForm(false)} title={editing ? 'Edit Announcement' : 'New Announcement'} size="lg" className="max-h-[92vh]">
        <div className="space-y-4 max-h-[72vh] overflow-y-auto pr-1">
          <div><label className="label">Title *</label><input className="input" maxLength={140} placeholder="What should students know?" value={form.title} onChange={event => setForm(value => ({ ...value, title: event.target.value }))} /></div>
          <div><label className="label">Message *</label><textarea className="input min-h-[130px] resize-y" maxLength={5000} placeholder="Write a clear update for students..." value={form.content} onChange={event => setForm(value => ({ ...value, content: event.target.value }))} /></div>
          <div className="grid sm:grid-cols-2 gap-4"><div><label className="label">Audience *</label><select className="input" value={form.audience_type} onChange={event => setForm(value => ({ ...value, audience_type: event.target.value as AnnouncementAudience, course_id: '', batch_id: '' }))}>
            {isAdmin && <option value="platform">Entire platform</option>}{!isAdmin && <option value="all_students">All my students</option>}<option value="course">Specific course</option><option value="batch">Specific batch</option>
          </select></div><div><label className="label">Priority</label><select className="input" value={form.priority} onChange={event => setForm(value => ({ ...value, priority: event.target.value as AnnouncementPriority }))}><option value="normal">Normal</option><option value="important">Important</option><option value="urgent">Urgent</option></select></div></div>
          {form.audience_type === 'course' && <div><label className="label">Course *</label><select className="input" value={form.course_id} onChange={event => setForm(value => ({ ...value, course_id: event.target.value }))}><option value="">Select a course</option>{courses.map(course => <option key={course.id} value={course.id}>{course.title}</option>)}</select></div>}
          {form.audience_type === 'batch' && <div><label className="label">Batch *</label><select className="input" value={form.batch_id} onChange={event => setForm(value => ({ ...value, batch_id: event.target.value }))}><option value="">Select a batch</option>{batches.map(batch => <option key={batch.id} value={batch.id}>{batch.name}{batch.course_title ? ` — ${batch.course_title}` : ''}</option>)}</select></div>}
          <div className="grid sm:grid-cols-2 gap-4"><div><label className="label">Publishing</label><select className="input" value={form.status} onChange={event => setForm(value => ({ ...value, status: event.target.value as FormState['status'] }))}><option value="published">Publish now</option><option value="scheduled">Schedule</option><option value="draft">Save as draft</option></select></div>{form.status === 'scheduled' && <div><label className="label">Publish date & time *</label><input type="datetime-local" className="input" value={form.publish_at} onChange={event => setForm(value => ({ ...value, publish_at: event.target.value }))} /></div>}</div>
          <div><label className="label">Expiry date & time (optional)</label><input type="datetime-local" className="input" value={form.expires_at} onChange={event => setForm(value => ({ ...value, expires_at: event.target.value }))} /><p className="text-xs text-slate-400 mt-1">After expiry, students will no longer see this announcement.</p></div>
          <label className="flex items-center gap-3 rounded-xl border border-slate-200 dark:border-slate-700 p-3 cursor-pointer"><input type="checkbox" checked={form.is_pinned} onChange={event => setForm(value => ({ ...value, is_pinned: event.target.checked }))} /><span><span className="block text-sm font-medium text-slate-800 dark:text-slate-100">Pin this announcement</span><span className="block text-xs text-slate-500">Pinned updates remain above other messages.</span></span></label>
          <div className="flex gap-3 justify-end pt-2"><button disabled={saving} onClick={() => setShowForm(false)} className="btn-secondary">Cancel</button><button disabled={saving} onClick={() => void save()} className="btn-primary flex items-center gap-2">{saving ? <Loader2 size={16} className="animate-spin" /> : form.status === 'scheduled' ? <CalendarClock size={16} /> : <Send size={16} />}{editing ? 'Update Announcement' : form.status === 'draft' ? 'Save Draft' : form.status === 'scheduled' ? 'Schedule' : 'Publish'}</button></div>
        </div>
      </Modal>

      <Modal open={Boolean(readersFor)} onClose={() => setReadersFor(null)} title="Student reads" size="md">
        {!readersFor?.reads?.length ? <div className="text-center py-8"><Eye size={30} className="mx-auto text-slate-300 mb-3" /><p className="font-medium text-slate-800 dark:text-slate-100">No students have read this yet</p><p className="text-sm text-slate-500 mt-1">Readers will appear after the student announcement inbox is connected.</p></div>
          : <div className="space-y-2 max-h-80 overflow-y-auto">{readersFor.reads.map(read => <div key={read.user_id} className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 dark:bg-slate-700/50 p-3"><div className="min-w-0"><p className="text-sm font-medium text-slate-800 dark:text-white truncate">{read.reader?.full_name ?? read.reader?.email ?? 'Student'}</p><p className="text-xs text-slate-500 truncate">{read.reader?.email}</p></div><span className="text-xs text-slate-400 whitespace-nowrap">{prettyDate(read.read_at)}</span></div>)}</div>}
      </Modal>
    </div>
  );
}
