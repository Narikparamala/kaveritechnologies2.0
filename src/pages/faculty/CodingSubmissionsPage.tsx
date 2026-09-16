import { useCallback, useEffect, useMemo, useState } from 'react';
import { Code2, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import { PageHeader } from '../../components/common/PageHeader';
import { Badge } from '../../components/ui/Badge';
import { EmptyState } from '../../components/ui/EmptyState';
import { Modal } from '../../components/ui/Modal';
import { useToast } from '../../components/ui/Toast';
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
  const { error: toastError } = useToast();
  const [rows, setRows] = useState<TrackerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [sourceFilter, setSourceFilter] = useState<'all' | Source>('all');
  const [outcomeFilter, setOutcomeFilter] = useState<'all' | Outcome>('all');
  const [search, setSearch] = useState('');
  const [detail, setDetail] = useState<TrackerRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const from = page * PAGE_SIZE;
      const [vscodeResult, practiceResult] = await Promise.all([
        supabase
          .from('coding_vscode_submissions')
          .select(
            `id,student_id,student_name_snapshot,assignment_key,assignment_title,language,submitted_at,
             verification_status,verified_passed,verified_total,verified_score,max_marks,code,verified_summary,
             student:profiles!coding_vscode_submissions_student_id_fkey(full_name,email)`,
            { count: 'exact' },
          )
          .order('submitted_at', { ascending: false, nullsFirst: false })
          .range(from, from + PAGE_SIZE - 1),
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
      ]);

      if (vscodeResult.error) throw vscodeResult.error;
      if (practiceResult.error) throw practiceResult.error;

      const vscodeRows: TrackerRow[] = (vscodeResult.data as unknown as VscodeRow[] ?? []).map(row => {
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
        };
      });

      const practiceRows: TrackerRow[] = (practiceResult.data as unknown as PracticeRow[] ?? []).map(row => {
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
  }, [page, toastError]);

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
              onClick={() => setDetail(row)}
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
          </div>
        )}
      </Modal>
    </div>
  );
}
