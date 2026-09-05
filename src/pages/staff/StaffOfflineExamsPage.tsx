import { useCallback, useEffect, useState } from 'react';
import { FileText, Send, UserCheck, Users, CalendarDays, Clock, ClipboardList } from 'lucide-react';
import { PageHeader } from '../../components/common/PageHeader';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { EmptyState } from '../../components/ui/EmptyState';
import { useToast } from '../../components/ui/Toast';
import { supabase } from '../../lib/supabase';

type ExamRow = {
  id: string;
  title: string;
  course_id: string | null;
  batch_label: string | null;
  exam_date: string | null;
  start_time: string | null;
  duration_minutes: number | null;
  max_marks: number | null;
  status: string;
  external_paper_id: string | null;
  course: { id: string; title: string } | null;
  results?: { id: string; status: string }[];
};

type RosterStudent = {
  student_id: string;
  full_name: string | null;
  email: string | null;
  marks: string;
  remarks: string;
};

const STATUS_BADGE: Record<string, { label: string; variant: 'default' | 'success' | 'warning' | 'error' | 'info' | 'teal' }> = {
  scheduled: { label: 'Scheduled', variant: 'info' },
  conducted: { label: 'Conducted', variant: 'default' },
  results_pending: { label: 'Results pending', variant: 'warning' },
  results_published: { label: 'Published', variant: 'success' },
  cancelled: { label: 'Cancelled', variant: 'error' },
  draft: { label: 'Draft', variant: 'default' },
};

function formatDate(value: string | null): string {
  if (!value) return '—';
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function StaffOfflineExamsPage({ admin = false }: { admin?: boolean }) {
  const { success, error: toastError, warning } = useToast();
  const [exams, setExams] = useState<ExamRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<ExamRow | null>(null);
  const [roster, setRoster] = useState<RosterStudent[]>([]);
  const [rosterLoading, setRosterLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [publishTarget, setPublishTarget] = useState<ExamRow | null>(null);
  const [publishing, setPublishing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('offline_exams')
      .select('*, course:courses(id,title), results:offline_exam_results(id,status)')
      .order('exam_date', { ascending: false });
    if (error) { toastError('Load failed', error.message); setLoading(false); return; }
    setExams((data ?? []) as ExamRow[]);
    setLoading(false);
  }, [toastError]);

  useEffect(() => { void load(); }, [load]);

  const openEntry = async (exam: ExamRow) => {
    setSelected(exam);
    setRosterLoading(true);
    setRoster([]);
    try {
      if (exam.course_id) {
        const { data, error } = await supabase
          .from('course_enrollments')
          .select('student_id, student:profiles(full_name,email)')
          .eq('course_id', exam.course_id)
          .eq('access_status', 'active')
          .order('enrolled_at', { ascending: true });
        if (error) throw error;
        const rows: RosterStudent[] = (data ?? []).map((e: any) => ({
          student_id: e.student_id,
          full_name: e.student?.full_name ?? 'Student',
          email: e.student?.email ?? '',
          marks: '',
          remarks: '',
        }));
        setRoster(rows);
      } else {
        setRoster([]);
        warning('No course linked', 'This exam has no linked course, so a roster of enrolled students cannot be auto-loaded.');
      }
    } catch (e: any) {
      toastError('Roster load failed', e?.message ?? 'Could not load enrolled students');
    } finally {
      setRosterLoading(false);
    }
  };

  const saveResults = async () => {
    if (!selected) return;
    const entries = roster
      .filter(r => r.marks.trim() !== '')
      .map(r => ({
        student_id: r.student_id,
        marks_obtained: Number(r.marks),
        remarks: r.remarks.trim() || null,
      }));
    if (entries.length === 0) {
      warning('Nothing to save', 'Enter marks for at least one student first.');
      return;
    }
    const invalid = entries.find(e => Number.isNaN(e.marks_obtained) || e.marks_obtained < 0
      || (selected.max_marks != null && e.marks_obtained > selected.max_marks));
    if (invalid) {
      toastError('Invalid marks', 'Marks must be a number between 0 and the exam maximum.');
      return;
    }
    setSaving(true);
    const { data, error } = await supabase.rpc('save_offline_exam_results', {
      p_exam_id: selected.id,
      p_results: entries,
    });
    setSaving(false);
    if (error) {
      toastError('Save failed', error.message);
      return;
    }
    success('Results saved', `${(data as any)?.saved ?? entries.length} result(s) stored privately. Publish when ready.`);
    setSelected(null);
    await load();
  };

  const publish = async () => {
    if (!publishTarget) return;
    setPublishing(true);
    const { data, error } = await supabase.rpc('publish_offline_exam_results', { p_exam_id: publishTarget.id });
    setPublishing(false);
    if (error) {
      toastError('Publish failed', error.message);
      return;
    }
    success('Results published', `${(data as any)?.published ?? 0} student(s) can now see their marks.`);
    setPublishTarget(null);
    await load();
  };

  if (loading) return <div className="p-6 lg:p-8"><p className="text-slate-500">Loading offline exams…</p></div>;

  const canEnter = (e: ExamRow) => e.status === 'scheduled' || e.status === 'conducted' || e.status === 'results_pending';
  const evaluatedCount = (e: ExamRow) => (e.results ?? []).filter(r => r.status === 'evaluated').length;

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto animate-fade-in">
      <PageHeader
        title="Offline Exams"
        subtitle={admin
          ? 'All offline exams synced from the Question Paper system, with result entry and publication across courses.'
          : 'Offline exams for your courses. Record marks privately, then publish so students can see their results.'}
      />

      {exams.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={FileText}
            title="No offline exams yet"
            description="When a paper is finalized in the Question Paper system it syncs here automatically. Exams appear for the course they are linked to."
          />
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-slate-400 border-b border-slate-100 dark:border-slate-800">
                  <th className="px-5 py-3 font-medium">Exam</th>
                  <th className="px-5 py-3 font-medium">Course</th>
                  <th className="px-5 py-3 font-medium">Date</th>
                  <th className="px-5 py-3 font-medium">Marks</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium">Results</th>
                  <th className="px-5 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {exams.map(exam => {
                  const evaluated = evaluatedCount(exam);
                  const published = (exam.results ?? []).filter(r => r.status === 'published').length;
                  return (
                    <tr key={exam.id} className="border-b border-slate-50 dark:border-slate-800/60 last:border-0 align-top">
                      <td className="px-5 py-3">
                        <p className="font-medium text-slate-900 dark:text-white">{exam.title}</p>
                        {exam.external_paper_id && (
                          <p className="text-[11px] text-slate-400 mt-0.5">Paper {exam.external_paper_id.slice(0, 8)}</p>
                        )}
                      </td>
                      <td className="px-5 py-3 text-slate-600 dark:text-slate-400">
                        {exam.course?.title ?? '—'}
                        {exam.batch_label ? <span className="block text-xs text-slate-400">{exam.batch_label}</span> : null}
                      </td>
                      <td className="px-5 py-3 text-slate-600 dark:text-slate-400 whitespace-nowrap">
                        {formatDate(exam.exam_date)}
                        {exam.start_time ? <span className="block text-xs text-slate-400">{exam.start_time.slice(0, 5)}</span> : null}
                      </td>
                      <td className="px-5 py-3 text-slate-600 dark:text-slate-400">{exam.max_marks ?? '—'}</td>
                      <td className="px-5 py-3">
                        <Badge variant={STATUS_BADGE[exam.status]?.variant ?? 'default'}>
                          {STATUS_BADGE[exam.status]?.label ?? exam.status}
                        </Badge>
                      </td>
                      <td className="px-5 py-3 text-slate-600 dark:text-slate-400 whitespace-nowrap">
                        {exam.status === 'results_published'
                          ? <span className="text-emerald-600 dark:text-emerald-400">{published} published</span>
                          : <span>{evaluated} entered</span>}
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2 flex-wrap">
                          {canEnter(exam) && (
                            <button
                              onClick={() => void openEntry(exam)}
                              className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-900/40 px-3 py-1.5 text-xs font-medium text-indigo-600 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 transition-colors"
                            >
                              <ClipboardList size={13} /> {evaluated > 0 ? 'Edit results' : 'Enter results'}
                            </button>
                          )}
                          {exam.status === 'results_pending' && evaluated > 0 && (
                            <button
                              onClick={() => setPublishTarget(exam)}
                              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-900/40 px-3 py-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 transition-colors"
                            >
                              <Send size={13} /> Publish
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Marks entry */}
      <Modal open={Boolean(selected)} onClose={() => setSelected(null)} title={selected ? `Enter results — ${selected.title}` : undefined} size="xl">
        <div className="mb-4 flex items-center gap-4 text-sm text-slate-500 flex-wrap">
          <span className="flex items-center gap-1.5"><CalendarDays size={14} /> {formatDate(selected?.exam_date ?? null)}</span>
          <span className="flex items-center gap-1.5"><Clock size={14} /> {selected?.duration_minutes ? `${selected.duration_minutes} min` : '—'}</span>
          <span className="flex items-center gap-1.5"><UserCheck size={14} /> Max marks {selected?.max_marks ?? '—'}</span>
          <span className="text-xs">Marks stay private until you publish the exam results.</span>
        </div>

        {rosterLoading ? (
          <p className="text-sm text-slate-500 py-6">Loading enrolled students…</p>
        ) : roster.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No actively enrolled students"
            description="The roster comes from students actively enrolled in the linked course. Enroll students first, then come back to enter results."
          />
        ) : (
          <div className="overflow-y-auto max-h-[50vh] border border-slate-100 dark:border-slate-700 rounded-xl">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white dark:bg-slate-800">
                <tr className="text-left text-xs uppercase tracking-wide text-slate-400 border-b border-slate-100 dark:border-slate-800">
                  <th className="px-4 py-2.5 font-medium">Student</th>
                  <th className="px-4 py-2.5 font-medium w-28">Marks / {selected?.max_marks ?? '—'}</th>
                  <th className="px-4 py-2.5 font-medium">Remarks (optional)</th>
                </tr>
              </thead>
              <tbody>
                {roster.map((student, index) => (
                  <tr key={student.student_id} className="border-b border-slate-50 dark:border-slate-800/60 last:border-0">
                    <td className="px-4 py-2">
                      <p className="font-medium text-slate-900 dark:text-white">{student.full_name}</p>
                      <p className="text-xs text-slate-500">{student.email}</p>
                    </td>
                    <td className="px-4 py-2">
                      <input
                        type="number"
                        min={0}
                        max={selected?.max_marks ?? undefined}
                        step="0.01"
                        value={student.marks}
                        onChange={e => {
                          const next = [...roster];
                          next[index] = { ...student, marks: e.target.value };
                          setRoster(next);
                        }}
                        placeholder="—"
                        className="w-full rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </td>
                    <td className="px-4 py-2">
                      <input
                        type="text"
                        value={student.remarks}
                        onChange={e => {
                          const next = [...roster];
                          next[index] = { ...student, remarks: e.target.value };
                          setRoster(next);
                        }}
                        placeholder="Optional note"
                        className="w-full rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-5 flex justify-end gap-3">
          <button
            onClick={() => setSelected(null)}
            className="rounded-xl px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => void saveResults()}
            disabled={saving || rosterLoading || roster.length === 0}
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {saving ? 'Saving…' : `Save ${roster.filter(r => r.marks.trim() !== '').length} result(s)`}
          </button>
        </div>
      </Modal>

      {/* Publish confirmation */}
      <Modal open={Boolean(publishTarget)} onClose={() => setPublishTarget(null)} title="Publish results?" size="sm">
        <p className="text-sm text-slate-600 dark:text-slate-400 mb-5">
          Publishing makes the entered marks for <span className="font-medium text-slate-900 dark:text-white">{publishTarget?.title}</span> visible to
          each student. This cannot be undone from the student side.
        </p>
        <div className="flex justify-end gap-3">
          <button
            onClick={() => setPublishTarget(null)}
            className="rounded-xl px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => void publish()}
            disabled={publishing}
            className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors"
          >
            {publishing ? 'Publishing…' : 'Publish results'}
          </button>
        </div>
      </Modal>
    </div>
  );
}
