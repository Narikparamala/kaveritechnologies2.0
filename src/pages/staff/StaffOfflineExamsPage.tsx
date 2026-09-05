import { useCallback, useEffect, useState } from 'react';
import { FileText, Send, UserCheck, Users, CalendarDays, Clock, ClipboardList, Plus, ExternalLink, BookOpen } from 'lucide-react';
import { PageHeader } from '../../components/common/PageHeader';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { EmptyState } from '../../components/ui/EmptyState';
import { useToast } from '../../components/ui/Toast';
import { supabase } from '../../lib/supabase';
import { QUESTION_PAPER_APP_URL, isSatelliteConfigured } from '../../lib/externalLinks';

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

type CourseOption = { id: string; title: string };

type NewExamForm = {
  title: string;
  course_id: string;
  batch_label: string;
  exam_date: string;
  start_time: string;
  duration_minutes: string;
  max_marks: string;
  student_instructions: string;
  external_paper_id: string;
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
  const [showNew, setShowNew] = useState(false);
  const [courses, setCourses] = useState<CourseOption[]>([]);
  const [courseLoading, setCourseLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newForm, setNewForm] = useState<NewExamForm>({
    title: '',
    course_id: '',
    batch_label: '',
    exam_date: '',
    start_time: '',
    duration_minutes: '',
    max_marks: '',
    student_instructions: '',
    external_paper_id: '',
  });

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

  const openNew = async () => {
    setShowNew(true);
    setCourseLoading(true);
    setCourses([]);
    try {
      if (admin) {
        const { data, error } = await supabase
          .from('courses')
          .select('id,title')
          .order('title', { ascending: true });
        if (error) throw error;
        setCourses((data ?? []) as CourseOption[]);
      } else {
        const { data: cf, error: cfError } = await supabase
          .from('course_faculty')
          .select('course_id')
          .eq('faculty_id', (await supabase.auth.getUser()).data.user?.id);
        if (cfError) throw cfError;
        const ids = (cf ?? []).map((c: any) => c.course_id).filter(Boolean);
        if (ids.length) {
          const { data, error } = await supabase
            .from('courses')
            .select('id,title')
            .in('id', ids)
            .order('title', { ascending: true });
          if (error) throw error;
          setCourses((data ?? []) as CourseOption[]);
        }
      }
    } catch (e: any) {
      toastError('Course list failed', e?.message ?? 'Could not load courses');
    } finally {
      setCourseLoading(false);
    }
  };

  const createExam = async () => {
    const title = newForm.title.trim();
    if (!title) {
      toastError('Title required', 'Give the exam a title before creating it.');
      return;
    }
    if (!newForm.course_id && !admin) {
      toastError('Course required', 'Select the course this exam belongs to.');
      return;
    }
    if (newForm.max_marks && (Number.isNaN(Number(newForm.max_marks)) || Number(newForm.max_marks) <= 0)) {
      toastError('Invalid max marks', 'Max marks must be a positive number.');
      return;
    }
    setCreating(true);
    const { error } = await supabase.rpc('create_offline_exam', {
      p_title: title,
      p_course_id: newForm.course_id || null,
      p_batch_label: newForm.batch_label.trim() || null,
      p_exam_date: newForm.exam_date || null,
      p_start_time: newForm.start_time || null,
      p_duration_minutes: newForm.duration_minutes ? Number(newForm.duration_minutes) : null,
      p_max_marks: newForm.max_marks ? Number(newForm.max_marks) : null,
      p_student_instructions: newForm.student_instructions.trim() || null,
      p_external_paper_id: newForm.external_paper_id.trim() || null,
    });
    setCreating(false);
    if (error) {
      const msg = error.message ?? '';
      if (msg.includes('OFFLINE_EXAM_FORBIDDEN')) {
        toastError('Not permitted', 'You can only create exams for courses you are assigned to.');
      } else if (msg.includes('OFFLINE_EXAM_ALREADY_LINKED')) {
        toastError('Already linked', 'An exam for this question paper already exists.');
      } else {
        toastError('Create failed', error.message);
      }
      return;
    }
    success('Exam created', `"${title}" is now visible to enrolled students as an upcoming exam.`);
    setShowNew(false);
    setNewForm({
      title: '', course_id: '', batch_label: '', exam_date: '', start_time: '',
      duration_minutes: '', max_marks: '', student_instructions: '', external_paper_id: '',
    });
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
          ? 'All offline exams across courses — scheduled manually or synced from the Question Paper system — with result entry and publication.'
          : 'Offline exams for your courses. Schedule a new exam, record marks privately, then publish so students can see their results.'}
      />

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <button
          onClick={() => void openNew()}
          className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 transition-colors"
        >
          <Plus size={16} /> New Exam
        </button>
        {isSatelliteConfigured(QUESTION_PAPER_APP_URL) && (
          <a
            href={QUESTION_PAPER_APP_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
          >
            <BookOpen size={16} /> Open Question Paper System
            <ExternalLink size={13} className="text-slate-400" />
          </a>
        )}
      </div>

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

      {/* New exam */}
      <Modal open={showNew} onClose={() => setShowNew(false)} title="Schedule offline exam" size="lg">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Exam title *</label>
            <input
              type="text"
              value={newForm.title}
              onChange={e => setNewForm(f => ({ ...f, title: e.target.value }))}
              placeholder="e.g. Python Fundamentals — Mid-Term"
              className="w-full rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Course</label>
            {courseLoading ? (
              <p className="text-xs text-slate-500 py-2">Loading courses…</p>
            ) : (
              <select
                value={newForm.course_id}
                onChange={e => setNewForm(f => ({ ...f, course_id: e.target.value }))}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">{admin ? 'No course (platform-level exam)' : 'Select course…'}</option>
                {courses.map(c => (
                  <option key={c.id} value={c.id}>{c.title}</option>
                ))}
              </select>
            )}
            <p className="text-[11px] text-slate-400 mt-1">
              Students actively enrolled in this course will see the exam.
            </p>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Batch label</label>
            <input
              type="text"
              value={newForm.batch_label}
              onChange={e => setNewForm(f => ({ ...f, batch_label: e.target.value }))}
              placeholder="e.g. Batch A"
              className="w-full rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Exam date</label>
            <input
              type="date"
              value={newForm.exam_date}
              onChange={e => setNewForm(f => ({ ...f, exam_date: e.target.value }))}
              className="w-full rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Start time</label>
            <input
              type="time"
              value={newForm.start_time}
              onChange={e => setNewForm(f => ({ ...f, start_time: e.target.value }))}
              className="w-full rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Duration (minutes)</label>
            <input
              type="number"
              min={1}
              max={600}
              value={newForm.duration_minutes}
              onChange={e => setNewForm(f => ({ ...f, duration_minutes: e.target.value }))}
              placeholder="90"
              className="w-full rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Max marks</label>
            <input
              type="number"
              min={1}
              step="0.5"
              value={newForm.max_marks}
              onChange={e => setNewForm(f => ({ ...f, max_marks: e.target.value }))}
              placeholder="50"
              className="w-full rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Student instructions (optional)</label>
            <textarea
              value={newForm.student_instructions}
              onChange={e => setNewForm(f => ({ ...f, student_instructions: e.target.value }))}
              rows={2}
              placeholder="Instructions shown to students before the exam (never the questions)."
              className="w-full rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Question Paper link (optional)</label>
            <input
              type="text"
              value={newForm.external_paper_id}
              onChange={e => setNewForm(f => ({ ...f, external_paper_id: e.target.value }))}
              placeholder="Stable paper id from the Question Paper system (paper content stays there)"
              className="w-full rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>
        <p className="mt-4 text-[11px] text-slate-400">
          Question paper content is never stored in the LMS — it remains inside the Question Paper system and is distributed on the exam day.
        </p>
        <div className="mt-5 flex justify-end gap-3">
          <button
            onClick={() => setShowNew(false)}
            className="rounded-xl px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => void createExam()}
            disabled={creating || courseLoading}
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {creating ? 'Creating…' : 'Schedule exam'}
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
