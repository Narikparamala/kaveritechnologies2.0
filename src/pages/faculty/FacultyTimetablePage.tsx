import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ChevronLeft, ChevronRight, CalendarDays, Clock, Video, Users, Plus, Loader2,
  AlertTriangle, ShieldCheck,
} from 'lucide-react';
import { PageHeader } from '../../components/common/PageHeader';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../components/ui/Toast';
import { supabase } from '../../lib/supabase';
import { createSession } from '../../services/liveSessions';
import {
  getTimetable, getRosterWithAttendance, markAttendance, markAllPresent,
  releaseToAbsentees, getNextSlotOccurrence, getFacultyBatches, slotMinutes, toLocalIso,
  type TimetableItem, type RosterEntry, type AttendanceStatus,
} from '../../services/batchLiveClasses';
import { Modal } from '../../components/ui/Modal';

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function todayIso(): string {
  return toLocalIso(new Date());
}

function shiftDate(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return toLocalIso(d);
}

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

type ScheduleBatch = { id: string; name: string; course_id: string | null };

export default function FacultyTimetablePage() {
  const { profile } = useAuth();
  const { success, error: showError } = useToast();
  const [day, setDay] = useState(todayIso());
  const [items, setItems] = useState<TimetableItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Schedule-class modal state
  const [showSchedule, setShowSchedule] = useState(false);
  const [batches, setBatches] = useState<ScheduleBatch[]>([]);
  const [lessons, setLessons] = useState<{ id: string; title: string }[]>([]);
  const [scheduleForm, setScheduleForm] = useState({ batch_id: '', lesson_id: '', date: todayIso(), time: '10:00', duration: 60, unlocks_lesson: true, google_meet_url: '' });
  const [slotHint, setSlotHint] = useState<string>('');
  const [scheduling, setScheduling] = useState(false);

  // Attendance modal state
  const [attendanceSession, setAttendanceSession] = useState<TimetableItem | null>(null);
  const [roster, setRoster] = useState<RosterEntry[]>([]);
  const [rosterLoading, setRosterLoading] = useState(false);
  const [attendanceBusy, setAttendanceBusy] = useState(false);

  const loadDay = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    try {
      setItems(await getTimetable(profile.id, day, day));
    } catch (e) {
      showError(e instanceof Error ? e.message : 'Failed to load the timetable.');
    } finally {
      setLoading(false);
    }
  }, [profile, day, showError]);

  useEffect(() => { void loadDay(); }, [loadDay]);

  const loadBatches = useCallback(async () => {
    if (!profile) return;
    try {
      setBatches(await getFacultyBatches(profile.id));
    } catch {
      /* empty picker on failure; the modal still opens */
    }
  }, [profile]);

  const openScheduleModal = () => {
    setScheduleForm(f => ({ ...f, date: day, batch_id: '', lesson_id: '' }));
    setLessons([]);
    setSlotHint('');
    setShowSchedule(true);
    void loadBatches();
  };

  // Batch chosen → prefill date/time/duration from its next slot occurrence
  // and load the course's lessons for the lesson picker.
  const pickBatch = async (batchId: string) => {
    setScheduleForm(f => ({ ...f, batch_id: batchId, lesson_id: '' }));
    setSlotHint('');
    setLessons([]);
    const batch = batches.find(b => b.id === batchId);
    if (batch?.course_id) {
      const { data } = await supabase.from('lessons').select('id, title').eq('course_id', batch.course_id).eq('is_published', true).order('order_index');
      setLessons(data ?? []);
    }
    try {
      const slot = await getNextSlotOccurrence(batchId, todayIso());
      if (slot) {
        setScheduleForm(f => ({ ...f, date: slot.date, time: slot.start_time, duration: slotMinutes(slot.start_time, slot.end_time) }));
        setSlotHint(`Prefilled from the batch's ${WEEKDAYS[new Date(`${slot.date}T00:00:00`).getDay()]} slot (${slot.start_time}–${slot.end_time}).`);
      } else {
        setSlotHint('This batch has no weekly slots yet — pick a time; the admin can add slots from the batch page.');
      }
    } catch {
      /* keep manual values */
    }
  };

  const submitSchedule = async () => {
    if (!profile || !scheduleForm.batch_id || !scheduleForm.date || !scheduleForm.time) return;
    setScheduling(true);
    try {
      const batch = batches.find(b => b.id === scheduleForm.batch_id);
      if (!batch?.course_id) throw new Error('The batch has no course linked — ask the admin to set one.');
      const sessionDateTime = new Date(`${scheduleForm.date}T${scheduleForm.time}`);
      await createSession({
        course_id: batch.course_id,
        batch_id: scheduleForm.batch_id,
        lesson_id: scheduleForm.lesson_id || null,
        unlocks_lesson: scheduleForm.unlocks_lesson && !!scheduleForm.lesson_id,
        title: lessons.find(l => l.id === scheduleForm.lesson_id)?.title
          ? `Class: ${lessons.find(l => l.id === scheduleForm.lesson_id)!.title}`
          : `Class — ${batch.name}`,
        session_date: sessionDateTime.toISOString(),
        duration_minutes: scheduleForm.duration,
        google_meet_url: scheduleForm.google_meet_url.trim() || undefined,
      }, profile.id);
      success('Class scheduled.');
      setShowSchedule(false);
      if (scheduleForm.date === day) void loadDay();
    } catch (e) {
      showError(e instanceof Error ? e.message : 'Failed to schedule the class.');
    } finally {
      setScheduling(false);
    }
  };

  const openAttendance = async (item: TimetableItem) => {
    if (!item.batch_id || !item.session_id) return;
    setAttendanceSession(item);
    setRosterLoading(true);
    try {
      setRoster(await getRosterWithAttendance(item.session_id, item.batch_id));
    } catch (e) {
      showError(e instanceof Error ? e.message : 'Failed to load the roster.');
    } finally {
      setRosterLoading(false);
    }
  };

  const setStudentStatus = async (studentId: string, status: AttendanceStatus) => {
    if (!attendanceSession?.session_id || !profile) return;
    setAttendanceBusy(true);
    try {
      await markAttendance(attendanceSession.session_id, studentId, status, profile.id);
      setRoster(rs => rs.map(r => (r.student_id === studentId ? { ...r, attendance_status: status } : r)));
    } catch (e) {
      showError(e instanceof Error ? e.message : 'Failed to mark attendance.');
    } finally {
      setAttendanceBusy(false);
    }
  };

  const allPresent = async () => {
    if (!attendanceSession?.session_id || !attendanceSession.batch_id || !profile) return;
    setAttendanceBusy(true);
    try {
      await markAllPresent(attendanceSession.session_id, attendanceSession.batch_id, profile.id);
      setRoster(rs => rs.map(r => ({ ...r, attendance_status: 'attended' })));
      success('Everyone marked present.');
    } catch (e) {
      showError(e instanceof Error ? e.message : 'Failed to mark attendance.');
    } finally {
      setAttendanceBusy(false);
    }
  };

  const absentCount = roster.filter(r => r.attendance_status !== 'attended').length;

  const releaseAbsentees = async () => {
    if (!attendanceSession?.session_id || !attendanceSession.unlocks_lesson) return;
    setAttendanceBusy(true);
    try {
      const released = await releaseToAbsentees(attendanceSession.session_id);
      success(released > 0 ? `Lesson released to ${released} student${released === 1 ? '' : 's'}.` : 'Everyone already has the lesson.');
    } catch (e) {
      showError(e instanceof Error ? e.message : 'Release failed.');
    } finally {
      setAttendanceBusy(false);
    }
  };

  const dayLabel = useMemo(
    () => new Date(`${day}T00:00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' }),
    [day],
  );
  const isToday = day === todayIso();
  const sessionCount = items.filter(i => i.kind === 'session').length;
  const hasClash = items.some(i => i.clash);

  return (
    <div className="p-6 lg:p-8 max-w-4xl mx-auto animate-fade-in">
      <PageHeader
        title="My Timetable"
        subtitle="Your batch slots and live classes for the day — clashes are flagged."
      />

      <div className="flex flex-wrap items-center justify-between gap-3 mt-6">
        <div className="flex items-center gap-2">
          <button onClick={() => setDay(d => shiftDate(d, -1))} className="btn-secondary p-2" title="Previous day"><ChevronLeft size={16} /></button>
          <div className="text-center min-w-44">
            <p className="text-sm font-semibold text-slate-900 dark:text-white">{dayLabel}</p>
            {isToday && <p className="text-[11px] text-primary-600 dark:text-primary-400">today</p>}
          </div>
          <button onClick={() => setDay(d => shiftDate(d, 1))} className="btn-secondary p-2" title="Next day"><ChevronRight size={16} /></button>
          {!isToday && <button onClick={() => setDay(todayIso())} className="btn-secondary text-xs py-1.5 px-2.5">Today</button>}
        </div>
        <div className="flex items-center gap-2">
          {sessionCount > 0 && <span className="text-xs text-slate-400">{sessionCount} class{sessionCount === 1 ? '' : 'es'}</span>}
          {hasClash && (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-100 dark:text-amber-300 dark:bg-amber-900/40 rounded-full px-2.5 py-1">
              <AlertTriangle size={12} /> overlapping items
            </span>
          )}
          <button onClick={openScheduleModal} className="btn-primary text-sm flex items-center gap-1.5">
            <Plus size={15} /> Schedule class
          </button>
        </div>
      </div>

      <div className="mt-4 space-y-2">
        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="animate-spin text-primary-500" size={28} /></div>
        ) : items.length === 0 ? (
          <div className="card p-10 text-center">
            <CalendarDays className="mx-auto text-slate-300 mb-2" size={28} />
            <p className="text-sm text-slate-500">Nothing scheduled for this day.</p>
          </div>
        ) : (
          items.map(item => (
            <div
              key={`${item.kind}-${item.session_id ?? item.title}-${item.starts_at}`}
              className={`card p-4 flex items-center gap-3 ${item.clash ? 'border-amber-300 dark:border-amber-700' : ''}`}
            >
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${item.kind === 'session' ? 'bg-primary-50 dark:bg-primary-900/20' : 'bg-slate-100 dark:bg-slate-800'}`}>
                {item.kind === 'session' ? <Video size={18} className="text-primary-600" /> : <Clock size={18} className="text-slate-400" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">{item.title}</p>
                  {item.clash && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase text-amber-700 bg-amber-100 dark:text-amber-300 dark:bg-amber-900/40 rounded-full px-2 py-0.5">
                      <AlertTriangle size={10} /> clash
                    </span>
                  )}
                  {item.kind === 'session' && item.unlocks_lesson && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase text-emerald-700 bg-emerald-100 dark:text-emerald-300 dark:bg-emerald-900/40 rounded-full px-2 py-0.5">
                      <ShieldCheck size={10} /> unlocks lesson
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  {timeLabel(item.starts_at)} – {timeLabel(item.ends_at)} · {item.batch_name}
                  {item.kind === 'slot' && ' · recurring slot'}
                  {item.lesson_title && ` · ${item.lesson_title}`}
                </p>
              </div>
              {item.kind === 'session' && item.session_id && (
                <button onClick={() => openAttendance(item)} className="btn-secondary text-xs py-1.5 px-3 flex items-center gap-1.5 flex-shrink-0">
                  <Users size={13} /> Attendance
                </button>
              )}
            </div>
          ))
        )}
      </div>

      {/* Schedule class modal */}
      <Modal open={showSchedule} onClose={() => setShowSchedule(false)} title="Schedule a class" size="md">
        <div className="space-y-4">
          <div>
            <label className="label">Batch *</label>
            <select className="input" value={scheduleForm.batch_id} onChange={e => void pickBatch(e.target.value)}>
              <option value="">Select a batch…</option>
              {batches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
            {slotHint && <p className="text-xs text-slate-400 mt-1">{slotHint}</p>}
          </div>
          <div>
            <label className="label">Lesson</label>
            <select className="input" value={scheduleForm.lesson_id} onChange={e => setScheduleForm(f => ({ ...f, lesson_id: e.target.value }))} disabled={!scheduleForm.batch_id}>
              <option value="">No lesson (standalone class)</option>
              {lessons.map(l => <option key={l.id} value={l.id}>{l.title}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="label">Date</label>
              <input type="date" className="input" value={scheduleForm.date} onChange={e => setScheduleForm(f => ({ ...f, date: e.target.value }))} />
            </div>
            <div>
              <label className="label">Start</label>
              <input type="time" className="input" value={scheduleForm.time} onChange={e => setScheduleForm(f => ({ ...f, time: e.target.value }))} />
            </div>
            <div>
              <label className="label">Duration</label>
              <select className="input" value={scheduleForm.duration} onChange={e => setScheduleForm(f => ({ ...f, duration: Number(e.target.value) }))}>
                {[30, 45, 60, 75, 90, 120, 150, 180].map(d => <option key={d} value={d}>{d} min</option>)}
              </select>
            </div>
          </div>
          {scheduleForm.lesson_id && (
            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                checked={scheduleForm.unlocks_lesson}
                onChange={e => setScheduleForm(f => ({ ...f, unlocks_lesson: e.target.checked }))}
                className="w-4 h-4 mt-0.5 rounded border-slate-300"
              />
              <span className="text-sm text-slate-700 dark:text-slate-300">
                Attending unlocks the lesson
                <span className="block text-xs text-slate-400">Present students get the lesson released automatically.</span>
              </span>
            </label>
          )}
          <div>
            <label className="label">Google Meet URL (optional)</label>
            <input className="input" placeholder="https://meet.google.com/xxx-xxxx-xxx" value={scheduleForm.google_meet_url} onChange={e => setScheduleForm(f => ({ ...f, google_meet_url: e.target.value }))} />
          </div>
          <div className="flex gap-3 justify-end">
            <button onClick={() => setShowSchedule(false)} className="btn-secondary text-sm">Cancel</button>
            <button
              onClick={submitSchedule}
              disabled={scheduling || !scheduleForm.batch_id}
              className="btn-primary text-sm flex items-center gap-2 disabled:opacity-50"
            >
              {scheduling ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
              Schedule
            </button>
          </div>
        </div>
      </Modal>

      {/* Attendance modal */}
      <Modal open={!!attendanceSession} onClose={() => setAttendanceSession(null)} title={`Attendance — ${attendanceSession?.title ?? ''}`} size="md">
        <div className="space-y-4">
          {attendanceSession?.unlocks_lesson && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/40 p-3 flex items-center justify-between gap-3">
              <p className="text-xs text-emerald-800 dark:text-emerald-300">
                Present students already have the lesson. {absentCount > 0 ? `${absentCount} not marked present.` : 'Everyone is marked present.'}
              </p>
              <button
                onClick={releaseAbsentees}
                disabled={attendanceBusy || absentCount === 0}
                className="btn-primary text-xs py-1.5 px-3 flex items-center gap-1.5 flex-shrink-0 disabled:opacity-50"
              >
                <ShieldCheck size={13} /> Release to absentees
              </button>
            </div>
          )}
          {rosterLoading ? (
            <div className="flex justify-center py-10"><Loader2 className="animate-spin text-primary-500" size={24} /></div>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <p className="text-xs text-slate-400">{roster.length} student{roster.length === 1 ? '' : 's'} in the batch</p>
                <button onClick={allPresent} disabled={attendanceBusy || roster.length === 0} className="btn-secondary text-xs py-1.5 px-3 flex items-center gap-1.5 disabled:opacity-50">
                  {attendanceBusy ? <Loader2 size={13} className="animate-spin" /> : null} Mark all present
                </button>
              </div>
              <div className="max-h-80 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
                {roster.map(r => (
                  <div key={r.student_id} className="flex items-center gap-3 px-4 py-2.5">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-900 dark:text-white truncate">{r.full_name || r.email}</p>
                      {r.full_name && <p className="text-xs text-slate-400 truncate">{r.email}</p>}
                    </div>
                    <StatusChip label="Present" active={r.attendance_status === 'attended'} tone="emerald" disabled={attendanceBusy} onClick={() => void setStudentStatus(r.student_id, 'attended')} />
                    <StatusChip label="Late" active={r.attendance_status === 'registered'} tone="amber" disabled={attendanceBusy} onClick={() => void setStudentStatus(r.student_id, 'registered')} />
                    <StatusChip label="Excused" active={r.attendance_status === 'excused'} tone="sky" disabled={attendanceBusy} onClick={() => void setStudentStatus(r.student_id, 'excused')} />
                    <StatusChip label="Absent" active={r.attendance_status === 'absent'} tone="red" disabled={attendanceBusy} onClick={() => void setStudentStatus(r.student_id, 'absent')} />
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </Modal>
    </div>
  );
}

const TONES: Record<string, string> = {
  emerald: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
  amber: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  sky: 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300',
  red: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
};

function StatusChip({ label, active, tone, disabled, onClick }: {
  label: string; active: boolean; tone: string; disabled: boolean; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={label}
      className={`text-[10px] font-bold uppercase tracking-wide rounded-full px-2 py-1 transition-colors flex-shrink-0 disabled:opacity-60 ${
        active ? TONES[tone] : 'text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
      }`}
    >
      {active ? label : label[0]}
    </button>
  );
}
