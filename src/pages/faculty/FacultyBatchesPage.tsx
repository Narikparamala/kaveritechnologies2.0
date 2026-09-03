import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Layers3,
  Plus,
  RefreshCw,
  Send,
  Trash2,
  Users,
  Video,
} from 'lucide-react';
import { PageHeader } from '../../components/common/PageHeader';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { useToast } from '../../components/ui/Toast';
import { useAuth } from '../../contexts/AuthContext';
import {
  createFacultyTeachingWork,
  createFacultyWorkRequest,
  deleteFacultyTeachingWork,
  getFacultyBatchAssignments,
  getFacultyTeachingWork,
  getFacultyWorkPreference,
  getFacultyWorkRequests,
  TEACHING_MODE_LABELS,
  TEACHING_STATUS_LABELS,
  updateFacultyTeachingWork,
  workDurationMinutes,
} from '../../services/facultyTeachingWork';
import type {
  FacultyBatchAssignment,
  FacultyTeachingWork,
  FacultyWorkPreference,
  FacultyWorkRequest,
  FacultyWorkRequestType,
  TeachingWorkMode,
} from '../../types/database';

type Tab = 'work' | 'batches' | 'requests';

const requestLabels: Record<FacultyWorkRequestType, string> = {
  new_assignment: 'New teaching assignment',
  schedule_swap: 'Schedule or trainer swap',
  availability: 'Availability update',
  assistant: 'Add assistant trainer',
  capacity: 'Batch capacity change',
};

const statusVariants = {
  scheduled: 'info',
  in_progress: 'warning',
  completed: 'success',
  cancelled: 'error',
} as const;

const requestVariants = {
  pending: 'warning',
  approved: 'success',
  rejected: 'error',
  completed: 'success',
} as const;

function localDateValue(date = new Date()) {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

function formatDay(date: string) {
  return new Date(`${date}T00:00:00`).toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function formatClock(time: string) {
  const [hour, minute] = time.split(':').map(Number);
  return new Date(2000, 0, 1, hour, minute).toLocaleTimeString('en-IN', {
    hour: 'numeric',
    minute: '2-digit',
  });
}

function errorMessage(error: unknown) {
  if (error && typeof error === 'object' && 'message' in error) return String(error.message);
  return 'Something went wrong.';
}

function isMissingTeachingWorkSchema(error: unknown) {
  const message = errorMessage(error).toLowerCase();
  return message.includes('faculty_teaching_work') || message.includes('faculty_work_requests') ||
    message.includes('schema cache') || message.includes('pgrst205') || message.includes('42p01');
}

export default function FacultyBatchesPage() {
  const { profile } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('work');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [schemaReady, setSchemaReady] = useState(true);
  const [batches, setBatches] = useState<FacultyBatchAssignment[]>([]);
  const [work, setWork] = useState<FacultyTeachingWork[]>([]);
  const [requests, setRequests] = useState<FacultyWorkRequest[]>([]);
  const [preference, setPreference] = useState<FacultyWorkPreference | null>(null);
  const [workModal, setWorkModal] = useState(false);
  const [requestModal, setRequestModal] = useState(false);
  const [workForm, setWorkForm] = useState({
    batchId: '',
    title: '',
    date: localDateValue(),
    startTime: '10:00',
    endTime: '11:00',
    mode: 'live_class' as TeachingWorkMode,
    notes: '',
  });
  const [requestForm, setRequestForm] = useState({
    batchId: '',
    type: 'availability' as FacultyWorkRequestType,
    requestedDate: '',
    details: '',
  });

  const loadData = useCallback(async () => {
    if (!profile?.id) return;
    setLoading(true);
    try {
      const batchData = await getFacultyBatchAssignments(profile.id);
      setBatches(batchData);
    } catch (error) {
      toast.error('Could not load assigned batches', errorMessage(error));
    }

    try {
      const [workData, requestData, preferenceData] = await Promise.all([
        getFacultyTeachingWork(profile.id),
        getFacultyWorkRequests(profile.id),
        getFacultyWorkPreference(profile.id),
      ]);
      setWork(workData);
      setRequests(requestData);
      setPreference(preferenceData);
      setSchemaReady(true);
    } catch (error) {
      if (isMissingTeachingWorkSchema(error)) {
        setSchemaReady(false);
      } else {
        toast.error('Could not load teaching work', errorMessage(error));
      }
    } finally {
      setLoading(false);
    }
  }, [profile?.id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const selectedBatch = batches.find(item => item.batch_id === workForm.batchId);
  const today = localDateValue();
  const activeBatches = batches.filter(item => item.batch.status === 'active');
  const totalStudents = activeBatches.reduce((total, item) => total + item.student_count, 0);
  const todayWork = work.filter(item => item.scheduled_date === today && item.status !== 'cancelled');
  const upcomingWork = work.filter(item => item.scheduled_date >= today && item.status !== 'cancelled');
  const sortedWork = useMemo(() => [...work].sort((a, b) => {
    const aKey = `${a.scheduled_date} ${a.start_time}`;
    const bKey = `${b.scheduled_date} ${b.start_time}`;
    return aKey.localeCompare(bKey);
  }), [work]);
  const upcomingMinutes = upcomingWork.reduce((total, item) => total + workDurationMinutes(item), 0);

  const resetWorkForm = () => setWorkForm({
    batchId: batches[0]?.batch_id ?? '',
    title: '',
    date: localDateValue(),
    startTime: '10:00',
    endTime: '11:00',
    mode: 'live_class',
    notes: '',
  });

  const openWorkModal = () => {
    resetWorkForm();
    setWorkModal(true);
  };

  const handleCreateWork = async () => {
    if (!profile?.id || !workForm.title.trim() || !workForm.date || !workForm.startTime || !workForm.endTime) {
      toast.warning('Complete the required fields', 'Title, date, start time and end time are required.');
      return;
    }
    if (workForm.endTime <= workForm.startTime) {
      toast.warning('Check the time', 'End time must be later than start time.');
      return;
    }
    setSaving(true);
    try {
      await createFacultyTeachingWork({
        faculty_id: profile.id,
        batch_id: selectedBatch?.batch_id ?? null,
        course_id: selectedBatch?.batch.course_id ?? null,
        title: workForm.title.trim(),
        scheduled_date: workForm.date,
        start_time: workForm.startTime,
        end_time: workForm.endTime,
        delivery_mode: workForm.mode,
        notes: workForm.notes.trim() || null,
        created_by: profile.id,
      });
      setWorkModal(false);
      toast.success('Teaching work scheduled', `${TEACHING_MODE_LABELS[workForm.mode]} was added directly.`);
      await loadData();
    } catch (error) {
      const message = errorMessage(error);
      if (message.toLowerCase().includes('overlap')) {
        toast.error('Real schedule conflict', 'This time overlaps another teaching item. Choose a different time.');
      } else if (message.toLowerCase().includes('workload')) {
        toast.error('Daily workload limit reached', message);
      } else if (isMissingTeachingWorkSchema(error)) {
        setSchemaReady(false);
        toast.error('Database setup required', 'Apply the faculty teaching-work migration, then refresh.');
      } else {
        toast.error('Could not schedule teaching work', message);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleModeChange = async (item: FacultyTeachingWork, mode: TeachingWorkMode) => {
    if (!profile?.id) return;
    try {
      await updateFacultyTeachingWork(item.id, profile.id, { delivery_mode: mode });
      setWork(current => current.map(row => row.id === item.id ? { ...row, delivery_mode: mode } : row));
      toast.success('Delivery mode changed', `Now set to ${TEACHING_MODE_LABELS[mode]}. No approval required.`);
    } catch (error) {
      toast.error('Could not change delivery mode', errorMessage(error));
    }
  };

  const handleComplete = async (item: FacultyTeachingWork) => {
    if (!profile?.id) return;
    try {
      await updateFacultyTeachingWork(item.id, profile.id, { status: 'completed' });
      setWork(current => current.map(row => row.id === item.id ? { ...row, status: 'completed' } : row));
      toast.success('Teaching work completed');
    } catch (error) {
      toast.error('Could not complete teaching work', errorMessage(error));
    }
  };

  const handleDelete = async (item: FacultyTeachingWork) => {
    if (!profile?.id || !window.confirm(`Remove “${item.title}” from your schedule?`)) return;
    try {
      await deleteFacultyTeachingWork(item.id, profile.id);
      setWork(current => current.filter(row => row.id !== item.id));
      toast.success('Teaching work removed');
    } catch (error) {
      toast.error('Could not remove teaching work', errorMessage(error));
    }
  };

  const handleRequest = async () => {
    if (!profile?.id || !requestForm.details.trim()) {
      toast.warning('Add request details', 'Explain what coordination you need.');
      return;
    }
    const batch = batches.find(item => item.batch_id === requestForm.batchId);
    setSaving(true);
    try {
      await createFacultyWorkRequest({
        faculty_id: profile.id,
        batch_id: batch?.batch_id ?? null,
        course_id: batch?.batch.course_id ?? null,
        request_type: requestForm.type,
        details: requestForm.details.trim(),
        requested_date: requestForm.requestedDate || null,
      });
      setRequestModal(false);
      setRequestForm({ batchId: '', type: 'availability', requestedDate: '', details: '' });
      toast.success('Coordination request sent');
      await loadData();
    } catch (error) {
      toast.error('Could not send request', errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-5 lg:p-8 max-w-7xl mx-auto animate-fade-in">
      <PageHeader
        title="My Batches & Teaching Work"
        subtitle="Plan Live, Recorded, or Hybrid teaching directly. Only real conflicts and workload limits block scheduling."
        icon={Layers3}
        action={
          <div className="flex flex-wrap justify-end gap-2">
            <button className="btn-secondary" onClick={() => setRequestModal(true)}>
              <Send size={16} /> Coordination request
            </button>
            <button className="btn-primary" onClick={openWorkModal} disabled={!schemaReady}>
              <Plus size={16} /> Add teaching work
            </button>
          </div>
        }
      />

      {!schemaReady && (
        <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200 flex items-start gap-3">
          <AlertTriangle size={20} className="mt-0.5 flex-shrink-0" />
          <div className="flex-1">
            <p className="font-semibold">One database migration is waiting</p>
            <p className="text-sm mt-1 opacity-80">Apply 20260812090000_faculty_teaching_work.sql. Your existing batches remain safe.</p>
          </div>
          <button className="btn-secondary" onClick={loadData}><RefreshCw size={15} /> Retry</button>
        </div>
      )}

      <div className="mb-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-800 dark:bg-emerald-950/30 flex items-start gap-3">
        <CheckCircle2 size={20} className="text-emerald-600 dark:text-emerald-400 mt-0.5 flex-shrink-0" />
        <div>
          <p className="font-semibold text-emerald-900 dark:text-emerald-200">Faculty controls the delivery mode</p>
          <p className="text-sm text-emerald-700 dark:text-emerald-300 mt-0.5">Switch between Live, Recorded, and Hybrid whenever teaching needs change. The platform records the change; admin permission is not required.</p>
          <p className="text-xs text-emerald-700/80 dark:text-emerald-300/80 mt-1">
            Daily safety limit: {preference?.daily_workload_limit_minutes ?? 480} minutes. Only overlapping work or this safety limit can block scheduling.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {[
          { label: 'Active batches', value: activeBatches.length, icon: Layers3, color: 'text-blue-500' },
          { label: 'Active students', value: totalStudents, icon: Users, color: 'text-violet-500' },
          { label: 'Today', value: todayWork.length, icon: CalendarDays, color: 'text-emerald-500' },
          { label: 'Upcoming hours', value: (upcomingMinutes / 60).toFixed(upcomingMinutes % 60 ? 1 : 0), icon: Clock3, color: 'text-amber-500' },
        ].map(stat => (
          <div key={stat.label} className="card p-4">
            <stat.icon size={19} className={`${stat.color} mb-2`} />
            <p className="text-2xl font-bold text-slate-900 dark:text-white">{stat.value}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">{stat.label}</p>
          </div>
        ))}
      </div>

      <div className="flex gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800 w-full sm:w-fit mb-6 overflow-x-auto">
        {([
          ['work', 'Teaching work'],
          ['batches', `My batches (${batches.length})`],
          ['requests', `Requests (${requests.length})`],
        ] as [Tab, string][]).map(([value, label]) => (
          <button key={value} onClick={() => setTab(value)} className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${tab === value ? 'bg-white dark:bg-slate-700 text-primary-600 dark:text-primary-300 shadow-sm' : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'}`}>
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3">{[1, 2, 3].map(item => <div key={item} className="card h-28 animate-pulse bg-slate-100 dark:bg-slate-800" />)}</div>
      ) : tab === 'work' ? (
        <div className="space-y-3">
          {sortedWork.length === 0 ? (
            <div className="card p-10 text-center">
              <CalendarDays size={34} className="mx-auto text-slate-400 mb-3" />
              <h3 className="font-semibold text-slate-900 dark:text-white">No teaching work scheduled</h3>
              <p className="text-sm text-slate-500 mt-1">Add a Live, Recorded, or Hybrid item when you are ready.</p>
              <button className="btn-primary mt-4" onClick={openWorkModal} disabled={!schemaReady}><Plus size={16} /> Add teaching work</button>
            </div>
          ) : sortedWork.map(item => (
            <div key={item.id} className="card p-4 lg:p-5">
              <div className="flex flex-col lg:flex-row lg:items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-primary-50 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400 flex items-center justify-center flex-shrink-0">
                  {item.delivery_mode === 'recorded_video' ? <Video size={22} /> : <CalendarDays size={22} />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold text-slate-900 dark:text-white">{item.title}</h3>
                    <Badge variant={statusVariants[item.status]}>{TEACHING_STATUS_LABELS[item.status]}</Badge>
                    <Badge variant={item.source === 'admin' ? 'default' : 'teal'}>{item.source === 'admin' ? 'Assigned by admin' : 'Added by you'}</Badge>
                  </div>
                  <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                    {item.batch?.name ?? 'Independent work'}{item.course?.title ? ` · ${item.course.title}` : ''}
                  </p>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500 mt-2">
                    <span className="flex items-center gap-1"><CalendarDays size={13} /> {formatDay(item.scheduled_date)}</span>
                    <span className="flex items-center gap-1"><Clock3 size={13} /> {formatClock(item.start_time)}–{formatClock(item.end_time)}</span>
                    <span>{workDurationMinutes(item)} min</span>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <select value={item.delivery_mode} onChange={event => handleModeChange(item, event.target.value as TeachingWorkMode)} className="input py-2 min-w-[145px]" disabled={item.status === 'completed' || item.status === 'cancelled'}>
                    {Object.entries(TEACHING_MODE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                  {(item.delivery_mode === 'live_class' || item.delivery_mode === 'hybrid') && item.status !== 'completed' && (
                    <button className="btn-secondary" onClick={() => navigate(`/faculty/live-classes/create?courseId=${item.course_id ?? ''}`)}><Video size={15} /> Set up Meet</button>
                  )}
                  {(item.delivery_mode === 'recorded_video' || item.delivery_mode === 'hybrid') && item.course_id && item.status !== 'completed' && (
                    <button className="btn-secondary" onClick={() => navigate(`/faculty/courses/${item.course_id}/builder`)}><BookOpen size={15} /> Course builder</button>
                  )}
                  {item.status !== 'completed' && item.status !== 'cancelled' && <button className="btn-primary" onClick={() => handleComplete(item)}><CheckCircle2 size={15} /> Complete</button>}
                  {item.source === 'faculty' && item.status !== 'completed' && <button className="p-2.5 rounded-xl text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30" onClick={() => handleDelete(item)} title="Remove"><Trash2 size={17} /></button>}
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : tab === 'batches' ? (
        <div className="grid md:grid-cols-2 gap-4">
          {batches.length === 0 ? (
            <div className="card p-10 text-center md:col-span-2">
              <Users size={34} className="mx-auto text-slate-400 mb-3" />
              <h3 className="font-semibold text-slate-900 dark:text-white">No batches assigned yet</h3>
              <p className="text-sm text-slate-500 mt-1">Admin-assigned batches will appear here without affecting your choice of teaching mode.</p>
            </div>
          ) : batches.map(item => (
            <div key={item.id} className="card p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex gap-2 items-center flex-wrap">
                    <h3 className="font-semibold text-slate-900 dark:text-white">{item.batch.name}</h3>
                    <Badge variant={item.batch.status === 'active' ? 'success' : 'default'}>{item.batch.status}</Badge>
                  </div>
                  <p className="text-sm text-slate-500 mt-1">{item.batch.course?.title ?? 'No course linked'}</p>
                </div>
                <Badge variant="info">{item.role}</Badge>
              </div>
              <div className="grid grid-cols-3 gap-2 mt-4">
                <div className="rounded-xl bg-slate-50 dark:bg-slate-800 p-3"><p className="font-bold text-slate-900 dark:text-white">{item.student_count}</p><p className="text-xs text-slate-500">Students</p></div>
                <div className="rounded-xl bg-slate-50 dark:bg-slate-800 p-3"><p className="font-bold text-slate-900 dark:text-white">{item.faculty_count}</p><p className="text-xs text-slate-500">Trainers</p></div>
                <div className="rounded-xl bg-slate-50 dark:bg-slate-800 p-3"><p className="font-bold text-slate-900 dark:text-white">{item.batch.max_students}</p><p className="text-xs text-slate-500">Capacity</p></div>
              </div>
              {item.schedules.length > 0 && <div className="mt-4 space-y-1">{item.schedules.map(schedule => <p key={schedule.id} className="text-xs text-slate-500"><Clock3 size={12} className="inline mr-1" /> Day {schedule.day_of_week}: {formatClock(schedule.start_time)}–{formatClock(schedule.end_time)}</p>)}</div>}
              <button className="btn-primary w-full mt-4" onClick={() => { setWorkForm(current => ({ ...current, batchId: item.batch_id })); setWorkModal(true); }}><Plus size={15} /> Plan teaching work</button>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="card p-4 flex items-start gap-3">
            <AlertTriangle size={18} className="text-amber-500 mt-0.5" />
            <p className="text-sm text-slate-600 dark:text-slate-300">Requests are only for coordination—assignments, swaps, availability, assistants, or capacity. Delivery mode changes are direct and never need a request.</p>
          </div>
          {requests.length === 0 ? (
            <div className="card p-10 text-center"><Send size={34} className="mx-auto text-slate-400 mb-3" /><h3 className="font-semibold text-slate-900 dark:text-white">No coordination requests</h3></div>
          ) : requests.map(item => (
            <div key={item.id} className="card p-5 flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="flex-1">
                <div className="flex gap-2 items-center flex-wrap"><h3 className="font-semibold text-slate-900 dark:text-white">{requestLabels[item.request_type]}</h3><Badge variant={requestVariants[item.status]}>{item.status}</Badge></div>
                <p className="text-sm text-slate-600 dark:text-slate-300 mt-2 whitespace-pre-wrap">{item.details}</p>
                <p className="text-xs text-slate-500 mt-2">{item.batch?.name ?? 'General'}{item.requested_date ? ` · Requested for ${formatDay(item.requested_date)}` : ''}</p>
                {item.response_notes && <p className="text-sm mt-3 rounded-xl bg-slate-50 dark:bg-slate-800 p-3"><strong>Admin response:</strong> {item.response_notes}</p>}
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={workModal} onClose={() => setWorkModal(false)} title="Add teaching work" size="lg">
        <div className="max-h-[72vh] overflow-y-auto -m-2 p-2 space-y-4">
          <div className="rounded-xl bg-emerald-50 dark:bg-emerald-950/30 p-3 text-sm text-emerald-800 dark:text-emerald-300">Choose any delivery mode. This saves immediately without admin approval.</div>
          <div><label className="label">Batch (optional)</label><select className="input w-full" value={workForm.batchId} onChange={event => setWorkForm(current => ({ ...current, batchId: event.target.value }))}><option value="">Independent / no batch</option>{batches.map(item => <option key={item.batch_id} value={item.batch_id}>{item.batch.name} · {item.batch.course?.title ?? 'No course'}</option>)}</select></div>
          <div><label className="label">Title *</label><input className="input w-full" value={workForm.title} onChange={event => setWorkForm(current => ({ ...current, title: event.target.value }))} placeholder="e.g., Python loops live class" /></div>
          <div className="grid sm:grid-cols-3 gap-3"><div><label className="label">Date *</label><input type="date" className="input w-full" value={workForm.date} onChange={event => setWorkForm(current => ({ ...current, date: event.target.value }))} /></div><div><label className="label">Start *</label><input type="time" className="input w-full" value={workForm.startTime} onChange={event => setWorkForm(current => ({ ...current, startTime: event.target.value }))} /></div><div><label className="label">End *</label><input type="time" className="input w-full" value={workForm.endTime} onChange={event => setWorkForm(current => ({ ...current, endTime: event.target.value }))} /></div></div>
          <div><label className="label">Delivery mode *</label><div className="grid sm:grid-cols-3 gap-2">{(Object.entries(TEACHING_MODE_LABELS) as [TeachingWorkMode, string][]).map(([value, label]) => <button key={value} type="button" onClick={() => setWorkForm(current => ({ ...current, mode: value }))} className={`rounded-xl border p-3 text-sm font-medium text-left transition-colors ${workForm.mode === value ? 'border-primary-500 bg-primary-50 text-primary-700 dark:bg-primary-950/40 dark:text-primary-300' : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'}`}>{label}</button>)}</div></div>
          <div><label className="label">Notes (optional)</label><textarea className="input w-full min-h-24" value={workForm.notes} onChange={event => setWorkForm(current => ({ ...current, notes: event.target.value }))} placeholder="Preparation, outcomes, recording plan..." /></div>
          <div className="flex justify-end gap-2 pt-2"><button className="btn-secondary" onClick={() => setWorkModal(false)}>Cancel</button><button className="btn-primary" onClick={handleCreateWork} disabled={saving}>{saving ? 'Saving...' : 'Schedule directly'}</button></div>
        </div>
      </Modal>

      <Modal open={requestModal} onClose={() => setRequestModal(false)} title="Coordination request" size="lg">
        <div className="space-y-4">
          <div className="rounded-xl bg-blue-50 dark:bg-blue-950/30 p-3 text-sm text-blue-800 dark:text-blue-300">Use this only when another person or admin action is needed. Live/Recorded/Hybrid changes do not belong here.</div>
          <div className="grid sm:grid-cols-2 gap-3"><div><label className="label">Request type *</label><select className="input w-full" value={requestForm.type} onChange={event => setRequestForm(current => ({ ...current, type: event.target.value as FacultyWorkRequestType }))}>{Object.entries(requestLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div><div><label className="label">Batch (optional)</label><select className="input w-full" value={requestForm.batchId} onChange={event => setRequestForm(current => ({ ...current, batchId: event.target.value }))}><option value="">General request</option>{batches.map(item => <option key={item.batch_id} value={item.batch_id}>{item.batch.name}</option>)}</select></div></div>
          <div><label className="label">Requested date (optional)</label><input type="date" className="input w-full" value={requestForm.requestedDate} onChange={event => setRequestForm(current => ({ ...current, requestedDate: event.target.value }))} /></div>
          <div><label className="label">Details *</label><textarea className="input w-full min-h-28" value={requestForm.details} onChange={event => setRequestForm(current => ({ ...current, details: event.target.value }))} placeholder="Explain the assignment, swap, availability, assistant, or capacity change..." /></div>
          <div className="flex justify-end gap-2"><button className="btn-secondary" onClick={() => setRequestModal(false)}>Cancel</button><button className="btn-primary" onClick={handleRequest} disabled={saving}>{saving ? 'Sending...' : 'Send request'}</button></div>
        </div>
      </Modal>
    </div>
  );
}
