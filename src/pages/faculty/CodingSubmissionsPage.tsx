import { useCallback, useEffect, useMemo, useState } from 'react';
import { Code2, ChevronLeft, ChevronRight, Download, RefreshCw, Save } from 'lucide-react';
import { PageHeader } from '../../components/common/PageHeader';
import { Badge } from '../../components/ui/Badge';
import { EmptyState } from '../../components/ui/EmptyState';
import { Modal } from '../../components/ui/Modal';
import { useToast } from '../../components/ui/Toast';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { formatDate } from '../../lib/utils';

const PAGE_SIZE = 100;

type Source = 'vscode' | 'practice';

type Outcome = 'pass' | 'fail' | 'pending';

type TrackerRow = {
  key: string;
  source: Source;
  studentId: string;
  studentName: string;
  studentEmail: string | null;
  itemTitle: string;
  itemKey: string | null;
  language: string | null;
  submittedAt: string | null;
  outcome: Outcome;
  scoreLabel: string;
  code: string | null;
  detail: string | null;
  maxMarks: number | null;
  teacherScore: number | null;
  teacherFeedback: string | null;
  reviewStatus: string | null;
};

type VscodeRow = {
  id: string;
  student_id: string;
  student_name_snapshot: string | null;
  assignment_key: string;
  assignment_title: string;
  language: string;
  submitted_at: string | null;
  verification_status: string | null;
  verified_passed: number | null;
  verified_total: number | null;
  verified_score: number | null;
  max_marks: number | null;
  code: string;
  verified_summary: string | null;
  teacher_score: number | null;
  teacher_feedback: string | null;
  review_status: string | null;
  student: { full_name: string | null; email: string | null } | null;
};

type PracticeRow = {
  id: string;
  student_id: string;
  status: string;
  passed_test_cases: number | null;
  total_test_cases: number | null;
  first_solved_at: string | null;
  last_attempted_at: string | null;
  submitted_code: string | null;
  question: { title: string | null; slug: string | null; difficulty: string | null } | null;
  student: { full_name: string | null; email: string | null } | null;
};

const SOURCE_LABEL: Record<Source, string> = {
  vscode: 'VS Code / Mini Project',
  practice: 'Practice',
};

function outcomeFromVscode(row: VscodeRow): { outcome: Outcome; label: string } {
  const status = (row.verification_status ?? '').toLowerCase();
  if (status === 'verified') {
    const passed = row.verified_passed ?? 0;
    const total = row.verified_total ?? 0;
    const score = row.verified_score ?? (total > 0 && passed === total ? row.max_marks ?? 0 : 0);
    if (total > 0 && passed >= total) {
      return { outcome: 'pass', label: `${Number(score)}/${Number(row.max_marks ?? score)}` };
    }
    return { outcome: 'fail', label: `${Number(score)}/${Number(row.max_marks ?? 0)} (${passed}/${total} tests)` };
  }
  if (status === 'pending' || status === 'running' || status === '') {
    return { outcome: 'pending', label: 'Awaiting verification' };
  }
  return { outcome: 'fail', label: 'Verification failed' };
}

function outcomeFromPractice(row: PracticeRow): { outcome: Outcome; label: string } {
  if (row.status === 'solved') {
    const passed = row.passed_test_cases ?? 0;
    const total = row.total_test_cases ?? 0;
    return { outcome: 'pass', label: total > 0 ? `${passed}/${total} tests` : 'Solved' };
  }
  if (row.status === 'started' || row.status === 'attempted') {
    return { outcome: 'pending', label: 'In progress' };
  }
  return { outcome: 'pending', label: row.status || 'Unknown' };
}

export default function CodingSubmissionsPage() {
  const { error: toastError, success } = useToast();
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'super_admin';
  const [rows, setRows] = useState<TrackerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [sourceFilter, setSourceFilter] = useState<'all' | Source>('all');
  const [outcomeFilter, setOutcomeFilter] = useState<'all' | Outcome>('all');
  const [search, setSearch] = useState('');
  const [detail, setDetail] = useState<TrackerRow | null>(null);
  const [reviewForm, setReviewForm] = useState<{ score: string; feedback: string }>({ score: '', feedback: '' });
  const [savingReview, setSavingReview] = useState(false);
  // Faculty see only their own batches' students; admins see everyone.
  // Empty adminScopedIds means "no restriction" for admins.
  const [scopedStudentIds, setScopedStudentIds] = useState<Set<string> | 'all' | null>(null);

  // Resolve the faculty's batches → student IDs (RLS already limits
  // batch_students reads to the signed-in faculty's batches). Admins skip this.
  useEffect(() => {
    let active = true;
    const resolveScope = async () => {
      if (isAdmin) {
        if (active) setScopedStudentIds('all');
        return;
      }
      if (!profile) return;
      try {
        const { data: facultyBatches, error } = await supabase
          .from('batch_faculty')
          .select('batch_id')
          .eq('faculty_id', profile.id);
        if (error) throw error;
        const batchIds = (facultyBatches ?? []).map(b => b.batch_id);
        if (!batchIds.length) {
          if (active) setScopedStudentIds(new Set());
          return;
        }
        const { data: students, error: studentsError } = await supabase
          .from('batch_students')
          .select('student_id')
          .in('batch_id', batchIds);
        if (studentsError) throw studentsError;
        if (active) setScopedStudentIds(new Set((students ?? []).map(s => s.student_id)));
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : 'Failed to resolve batch scope';
        toastError('Error', message);
        if (active) setScopedStudentIds(new Set());
      }
    };
    resolveScope();
    return () => { active = false; };
  }, [isAdmin, profile, toastError]);

  const load = useCallback(async () => {
    // Wait until the batch scope is resolved (null = still resolving).
    if (scopedStudentIds === null) return;
    setLoading(true);
    try {
      const from = page * PAGE_SIZE;
      // Scope is pushed into the queries so counts and pagination match what
      // the viewer is allowed to see ('all' for admins, otherwise batch students).
      const scopeFilter = <T extends { in: (col: string, vals: string[]) => T }>(query: T): T =>
        scopedStudentIds === 'all' || scopedStudentIds.size === 0
          ? query
          : query.in('student_id', [...scopedStudentIds]);
      const [vscodeResult, practiceResult] = await Promise.all([
        scopeFilter(
          supabase
            .from('coding_vscode_submissions')
            .select(
              `id,student_id,student_name_snapshot,assignment_key,assignment_title,language,submitted_at,
               verification_status,verified_passed,verified_total,verified_score,max_marks,code,verified_summary,
               teacher_score,teacher_feedback,review_status,
               student:profiles!coding_vscode_submissions_student_id_fkey(full_name,email)`,
              { count: 'exact' },
            )
            .order('submitted_at', { ascending: false, nullsFirst: false })
            .range(from, from + PAGE_SIZE - 1),
        ),
        scopeFilter(
          supabase
            .from('coding_question_attempts')
            .select(
              `id,student_id,status,passed_test_cases,total_test_cases,first_solved_at,last_attempted_at,submitted_code,
               question:coding_questions(title,slug,difficulty),
               student:profiles!coding_question_attempts_student_id_fkey(full_name,email)`,
              { count: 'exact' },
            )
            .order('last_attempted_at', { ascending: false, nullsFirst: false })
            .range(from, from + PAGE_SIZE - 1),
        ),
      ]);

      if (vscodeResult.error) throw vscodeResult.error;
      if (practiceResult.error) throw practiceResult.error;

      const vscodeRows: TrackerRow[] = (vscodeResult.data as unknown as VscodeRow[] ?? [])
        .map(row => {
        const { outcome, label } = outcomeFromVscode(row);
        return {
          key: `vscode:${row.id}`,
          source: 'vscode' as const,
          studentId: row.student_id,
          studentName: row.student?.full_name ?? row.student_name_snapshot ?? 'Unknown student',
          studentEmail: row.student?.email ?? null,
          itemTitle: row.assignment_title,
          itemKey: row.assignment_key,
          language: row.language,
          submittedAt: row.submitted_at,
          outcome,
          scoreLabel: label,
          code: row.code,
          detail: row.verified_summary,
          maxMarks: row.max_marks == null ? null : Number(row.max_marks),
          teacherScore: row.teacher_score == null ? null : Number(row.teacher_score),
          teacherFeedback: row.teacher_feedback,
          reviewStatus: row.review_status,
        };
      });

      const practiceRows: TrackerRow[] = (practiceResult.data as unknown as PracticeRow[] ?? [])
        .map(row => {
        const { outcome, label } = outcomeFromPractice(row);
        return {
          key: `practice:${row.id}`,
          source: 'practice' as const,
          studentId: row.student_id,
          studentName: row.student?.full_name ?? 'Unknown student',
          studentEmail: row.student?.email ?? null,
          itemTitle: row.question?.title ?? 'Untitled question',
          itemKey: row.question?.slug,
          language: null,
          submittedAt: row.last_attempted_at ?? row.first_solved_at,
          outcome,
          scoreLabel: label,
          code: row.submitted_code,
          detail: row.question?.difficulty ? `Difficulty: ${row.question.difficulty}` : null,
          maxMarks: null,
          teacherScore: null,
          teacherFeedback: null,
          reviewStatus: null,
        };
      });

      setRows([...vscodeRows, ...practiceRows]);
      setTotal((vscodeResult.count ?? 0) + (practiceResult.count ?? 0));
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Failed to load submissions';
      toastError('Error', message);
    } finally {
      setLoading(false);
    }
  }, [page, toastError, scopedStudentIds]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    return rows.filter(row => {
      if (sourceFilter !== 'all' && row.source !== sourceFilter) return false;
      if (outcomeFilter !== 'all' && row.outcome !== outcomeFilter) return false;
      if (search.trim()) {
        const needle = search.trim().toLowerCase();
        const haystack = `${row.studentName} ${row.studentEmail ?? ''} ${row.itemTitle} ${row.itemKey ?? ''}`.toLowerCase();
        if (!haystack.includes(needle)) return false;
      }
      return true;
    });
  }, [rows, sourceFilter, outcomeFilter, search]);

  const stats = useMemo(() => {
    const counts = { pass: 0, fail: 0, pending: 0 };
    for (const row of filtered) counts[row.outcome] += 1;
    return counts;
  }, [filtered]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const openDetail = (row: TrackerRow) => {
    setDetail(row);
    setReviewForm({
      score: row.teacherScore == null ? '' : String(row.teacherScore),
      feedback: row.teacherFeedback ?? '',
    });
  };

  const saveReview = async () => {
    if (!detail || !profile) return;
    if (detail.source !== 'vscode') return;
    const maxMarks = detail.maxMarks ?? 0;
    const raw = reviewForm.score.trim();
    let teacherScore: number | null = null;
    if (raw !== '') {
      const parsed = Number(raw);
      if (!Number.isFinite(parsed) || parsed < 0 || parsed > maxMarks) {
        toastError('Invalid score', `Score must be between 0 and ${maxMarks}.`);
        return;
      }
      teacherScore = parsed;
    }
    setSavingReview(true);
    try {
      const { error } = await supabase
        .from('coding_vscode_submissions')
        .update({
          teacher_score: teacherScore,
          teacher_feedback: reviewForm.feedback.trim() || null,
          reviewed_by: profile.id,
          reviewed_at: new Date().toISOString(),
          review_status: 'reviewed',
        })
        .eq('id', detail.key.replace('vscode:', ''));
      if (error) throw error;
      success('Review saved');
      setDetail(null);
      await load();
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Failed to save review';
      toastError('Error', message);
    } finally {
      setSavingReview(false);
    }
  };

  const exportCsv = () => {
    const header = ['Student', 'Email', 'Source', 'Item', 'Key', 'Language', 'Submitted', 'Outcome', 'Verified Score', 'Teacher Score', 'Teacher Feedback'];
    const escape = (value: string | number | null) => {
      const text = value == null ? '' : String(value);
      return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    };
    const lines = [header.join(',')];
    for (const row of filtered) {
      lines.push([
        escape(row.studentName),
        escape(row.studentEmail),
        escape(SOURCE_LABEL[row.source]),
        escape(row.itemTitle),
        escape(row.itemKey),
        escape(row.language),
        escape(row.submittedAt ? formatDate(row.submittedAt) : ''),
        escape(row.scoreLabel),
        escape(row.outcome === 'pass' ? row.scoreLabel : ''),
        escape(row.teacherScore == null ? '' : String(row.teacherScore)),
        escape(row.teacherFeedback),
      ].join(','));
    }
    const blob = new Blob(['\ufeff' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `coding-submissions-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto animate-fade-in">
      <PageHeader
        title="Coding Submissions"
        subtitle="Track VS Code extension, mini-project and practice submissions with verified scores"
        icon={Code2}
      />

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="flex rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
          {(['all', 'vscode', 'practice'] as const).map(value => (
            <button
              key={value}
              onClick={() => setSourceFilter(value)}
              className={`px-4 py-2 text-xs font-semibold transition ${
                sourceFilter === value
                  ? 'bg-primary-600 text-white'
                  : 'bg-white dark:bg-slate-900 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
            >
              {value === 'all' ? 'All sources' : SOURCE_LABEL[value]}
            </button>
          ))}
        </div>
        <select
          value={outcomeFilter}
          onChange={e => setOutcomeFilter(e.target.value as typeof outcomeFilter)}
          className="input py-2 text-xs w-auto"
        >
          <option value="all">All outcomes</option>
          <option value="pass">Passed / Solved</option>
          <option value="fail">Failed verification</option>
          <option value="pending">Pending / In progress</option>
        </select>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search student or title…"
          className="input py-2 text-xs w-56"
        />
        <button onClick={load} className="btn-secondary py-2 px-3 text-xs flex items-center gap-1.5">
          <RefreshCw size={13} /> Refresh
        </button>
        <button
          onClick={exportCsv}
          disabled={filtered.length === 0}
          className="btn-secondary py-2 px-3 text-xs flex items-center gap-1.5 disabled:opacity-40"
        >
          <Download size={13} /> Export CSV
        </button>
        {!isAdmin && (
          <span className="text-[11px] text-slate-400">
            Showing students from your batches only
          </span>
        )}
      </div>

      {/* Stats */}
      <div className="flex flex-wrap gap-2 mb-5 text-xs">
        <Badge variant="success">Passed / Solved: {stats.pass}</Badge>
        <Badge variant="danger">Failed: {stats.fail}</Badge>
        <Badge variant="warning">Pending: {stats.pending}</Badge>
        <Badge variant="default">Showing {filtered.length} of {total} latest</Badge>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-16 bg-slate-100 dark:bg-slate-800 rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={Code2} title="No coding submissions match these filters yet" />
      ) : (
        <div className="grid gap-2">
          {filtered.map(row => (
            <button
              key={row.key}
              onClick={() => openDetail(row)}
              className="card p-4 flex items-center justify-between gap-4 text-left hover:border-primary-300 transition"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                  <span className="font-semibold text-slate-900 dark:text-white text-sm">{row.studentName}</span>
                  <Badge variant={row.source === 'vscode' ? 'info' : 'default'} className="text-[10px]">
                    {SOURCE_LABEL[row.source]}
                  </Badge>
                  {row.outcome === 'pass' && <Badge variant="success" className="text-[10px]">✓ {row.scoreLabel}</Badge>}
                  {row.outcome === 'fail' && <Badge variant="danger" className="text-[10px]">{row.scoreLabel}</Badge>}
                  {row.outcome === 'pending' && <Badge variant="warning" className="text-[10px]">{row.scoreLabel}</Badge>}
                  {row.reviewStatus === 'reviewed' && <Badge variant="default" className="text-[10px]">Reviewed</Badge>}
                </div>
                <p className="text-xs text-primary-600 dark:text-primary-400 truncate">{row.itemTitle}</p>
                <p className="text-[11px] text-slate-400">
                  {row.submittedAt ? `Submitted ${formatDate(row.submittedAt)}` : 'Not submitted yet'}
                  {row.studentEmail ? ` · ${row.studentEmail}` : ''}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && !loading && (
        <div className="flex items-center justify-center gap-3 mt-5 text-xs text-slate-500">
          <button
            disabled={page === 0}
            onClick={() => setPage(p => Math.max(0, p - 1))}
            className="btn-secondary py-1.5 px-3 disabled:opacity-40 flex items-center gap-1"
          >
            <ChevronLeft size={13} /> Prev
          </button>
          <span>Page {page + 1} of {totalPages}</span>
          <button
            disabled={page >= totalPages - 1}
            onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
            className="btn-secondary py-1.5 px-3 disabled:opacity-40 flex items-center gap-1"
          >
            Next <ChevronRight size={13} />
          </button>
        </div>
      )}

      {/* Detail modal */}
      <Modal open={!!detail} onClose={() => setDetail(null)} title="Submission detail" size="xl">
        {detail && (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-4 p-4 rounded-2xl bg-slate-50 dark:bg-slate-800">
              <div>
                <h4 className="font-bold text-slate-900 dark:text-white">{detail.studentName}</h4>
                <p className="text-xs text-slate-500">{detail.studentEmail}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-slate-400 uppercase tracking-wider">{SOURCE_LABEL[detail.source]}</p>
                <p className="text-sm font-medium">{detail.itemTitle}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 text-sm">
              <Badge variant={detail.outcome === 'pass' ? 'success' : detail.outcome === 'fail' ? 'danger' : 'warning'}>
                {detail.scoreLabel}
              </Badge>
              {detail.language && <Badge variant="default">{detail.language}</Badge>}
              {detail.itemKey && <span className="text-xs text-slate-400 font-mono">{detail.itemKey}</span>}
            </div>
            {detail.detail && <p className="text-sm text-slate-500">{detail.detail}</p>}
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase mb-1">Submitted code</p>
              <pre className="p-4 rounded-xl bg-slate-900 text-slate-100 font-mono text-xs overflow-auto max-h-[50vh]">
                {detail.code ?? 'No code submitted'}
              </pre>
            </div>
            {detail.source === 'vscode' && (
              <div className="space-y-3 p-4 rounded-2xl border border-slate-200 dark:border-slate-700">
                <p className="text-xs font-bold text-slate-400 uppercase">Teacher review</p>
                <div className="grid grid-cols-[120px_1fr] gap-3 items-start">
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">
                      Score {detail.maxMarks != null ? `(0–${detail.maxMarks})` : ''}
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={detail.maxMarks ?? undefined}
                      step="0.5"
                      className="input py-1.5 text-sm"
                      placeholder={detail.maxMarks != null ? `out of ${detail.maxMarks}` : 'score'}
                      value={reviewForm.score}
                      onChange={e => setReviewForm(f => ({ ...f, score: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Feedback</label>
                    <input
                      type="text"
                      className="input py-1.5 text-sm"
                      placeholder="Feedback for the student…"
                      value={reviewForm.feedback}
                      onChange={e => setReviewForm(f => ({ ...f, feedback: e.target.value }))}
                    />
                  </div>
                </div>
                <div className="flex justify-end">
                  <button onClick={saveReview} disabled={savingReview} className="btn-primary text-xs py-2 px-4 flex items-center gap-1.5">
                    {savingReview ? 'Saving…' : <><Save size={13} /> Save review</>}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
