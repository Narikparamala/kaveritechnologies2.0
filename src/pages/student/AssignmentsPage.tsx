import { useEffect, useState, useCallback, lazy, Suspense, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import {
  FileText, Calendar, CheckCircle, AlertCircle, Play, RotateCcw,
  ChevronRight, ChevronLeft, Eye, EyeOff, Info, Lock,
} from 'lucide-react';
import { PageHeader } from '../../components/common/PageHeader';
import { Badge } from '../../components/ui/Badge';
import { EmptyState } from '../../components/ui/EmptyState';
import { Modal } from '../../components/ui/Modal';
import { useToast } from '../../components/ui/Toast';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { runPython, onRuntimeStatus, type RuntimeStatus } from '../../services/pythonExecution';
import { formatDate } from '../../lib/utils';
import type { Assignment, AssignmentSubmission, AssignmentTestCase, Course } from '../../types/database';

const MonacoEditor = lazy(() => import('@monaco-editor/react').then(m => ({ default: m.default })));

type AssignmentWithDetails = Assignment & { course: Course; submission: AssignmentSubmission | null };
type TestResult = { input: string | null; expected: string; actual: string; passed: boolean };
type MobileTab = 'question' | 'code' | 'output' | 'submit';

// ============================================================
// Router shell
// ============================================================
export default function AssignmentsPage() {
  const { assignmentId } = useParams<{ assignmentId?: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const returnTo = searchParams.get('returnTo');
  if (assignmentId) {
    return <AssignmentWorkspace assignmentId={assignmentId} onBack={() => navigate(returnTo ?? '/student/assignments')} returnTo={returnTo} />;
  }
  return <AssignmentList onOpen={(id) => navigate(`/student/assignments/${id}${returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : ''}`)} />;
}

// ============================================================
// Assignment list
// ============================================================
function AssignmentList({ onOpen }: { onOpen: (id: string) => void }) {
  const { profile } = useAuth();
  const [assignments, setAssignments] = useState<AssignmentWithDetails[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile) return;
    (async () => {
      const { data: enrData } = await supabase.from('course_enrollments')
        .select('course_id').eq('student_id', profile.id).eq('access_status', 'active');
      const courseIds = (enrData ?? []).map((e: any) => e.course_id);
      if (!courseIds.length) { setLoading(false); return; }
      const [{ data: asgData }, { data: subData }] = await Promise.all([
        supabase.from('assignments').select('*, course:courses(*)').in('course_id', courseIds).eq('is_published', true).order('due_date', { ascending: true }),
        supabase.from('assignment_submissions').select('*').eq('student_id', profile.id),
      ]);
      const subMap = new Map((subData ?? []).map((s: any) => [s.assignment_id, s]));
      setAssignments((asgData ?? []).map((a: any) => ({ ...a, submission: subMap.get(a.id) ?? null })) as any);
      setLoading(false);
    })();
  }, [profile]);

  const getStatus = (sub: AssignmentSubmission | null, dueDate: string | null) => {
    if (!sub) return dueDate && new Date(dueDate) < new Date()
      ? <span className="badge text-xs bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">Overdue</span>
      : <span className="badge text-xs bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">Pending</span>;
    const v: Record<string, string> = { submitted: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400', graded: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400', returned: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400', draft: 'bg-slate-100 text-slate-400' };
    return <span className={`badge text-xs capitalize ${v[sub.status] ?? 'bg-slate-100 text-slate-400'}`}>{sub.status}</span>;
  };

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto animate-fade-in">
      <PageHeader title="Assignments" subtitle="View and submit your Python coding assignments" icon={FileText} />
      {loading ? (
        <div className="space-y-4">{[1,2,3].map(i=><div key={i} className="h-24 bg-slate-100 dark:bg-slate-800 rounded-2xl animate-pulse" />)}</div>
      ) : assignments.length === 0 ? (
        <EmptyState icon={FileText} title="No assignments yet" description="Enroll in courses to see your assignments here." />
      ) : (
        <div className="space-y-3">
          {assignments.map(asg => (
            <button key={asg.id} onClick={() => onOpen(asg.id)} className="card p-5 flex items-start gap-4 w-full text-left hover:shadow-md transition-shadow">
              <div className="w-10 h-10 rounded-xl bg-primary-50 dark:bg-primary-900/30 flex items-center justify-center flex-shrink-0">
                <FileText size={18} className="text-primary-600 dark:text-primary-400" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className="font-semibold text-slate-900 dark:text-white">{asg.title}</span>
                  {getStatus(asg.submission, asg.due_date)}
                </div>
                <p className="text-xs text-primary-600 dark:text-primary-400 mb-1">{asg.course?.title}</p>
                <p className="text-sm text-slate-500 dark:text-slate-400 line-clamp-1">{asg.problem_statement ?? asg.description}</p>
                {asg.submission?.score != null && <p className="text-sm text-emerald-600 font-medium mt-1">Score: {asg.submission.score}/{asg.max_marks}</p>}
                {asg.submission?.feedback && <p className="text-xs text-slate-500 italic mt-0.5 line-clamp-1">Feedback: {asg.submission.feedback}</p>}
              </div>
              <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                {asg.due_date && <span className="text-xs text-slate-400 flex items-center gap-1"><Calendar size={11} />{formatDate(asg.due_date)}</span>}
                <span className="text-xs text-slate-400">Max: {asg.max_marks}</span>
                <span className="text-primary-600 dark:text-primary-400 text-xs flex items-center gap-1">Python Coding <ChevronRight size={12} /></span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================
// Workspace — detects desktop vs mobile and renders accordingly
// ============================================================
function AssignmentWorkspace({ assignmentId, onBack, returnTo }: { assignmentId: string; onBack: () => void; returnTo?: string | null }) {
  const { profile } = useAuth();
  const { success, error: toastError } = useToast();

  // Shared state
  const [asg, setAsg] = useState<AssignmentWithDetails | null>(null);
  const [testCases, setTestCases] = useState<AssignmentTestCase[]>([]);
  const [submission, setSubmission] = useState<AssignmentSubmission | null>(null);
  const [loading, setLoading] = useState(true);
  const [code, setCode] = useState('');
  const [output, setOutput] = useState('');
  const [running, setRunning] = useState(false);
  const [runtimeStatus, setRuntimeStatus] = useState<RuntimeStatus>('idle');
  const [testResults, setTestResults] = useState<TestResult[]>([]);
  const [showHints, setShowHints] = useState(false);
  const [showSolution, setShowSolution] = useState(false);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [isDesktop, setIsDesktop] = useState(() => window.innerWidth >= 1024);

  useEffect(() => {
    const check = () => setIsDesktop(window.innerWidth >= 1024);
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  useEffect(() => {
    const unsub = onRuntimeStatus(setRuntimeStatus);
    return unsub;
  }, []);

  const load = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    const [{ data: asgData }, { data: tcData }, { data: subData }] = await Promise.all([
      supabase.from('assignments').select('*, course:courses(*)').eq('id', assignmentId).maybeSingle(),
      supabase.from('assignment_test_cases').select('*').eq('assignment_id', assignmentId).eq('is_hidden', false).order('order_index'),
      supabase.from('assignment_submissions').select('*').eq('assignment_id', assignmentId).eq('student_id', profile.id).maybeSingle(),
    ]);
    const a = asgData as any;
    setAsg(a);
    setTestCases((tcData ?? []) as AssignmentTestCase[]);
    setSubmission(subData as any);
    setCode((subData as any)?.submitted_code ?? a?.starter_code ?? '# Write your Python solution here\n');
    setLoading(false);
  }, [assignmentId, profile]);

  useEffect(() => { load(); }, [load]);

  const runCode = async () => {
    if (!code.trim()) return;
    setRunning(true);
    setOutput('Running...');
    setTestResults([]);
    try {
      const result = await runPython(code);
      setOutput(result.output || result.error || '(no output)');
      if (testCases.length > 0) {
        const results: TestResult[] = [];
        for (const tc of testCases) {
          let testCode = code;
          if (tc.input_data) {
            testCode = `import sys\nfrom io import StringIO\nsys.stdin = StringIO(${JSON.stringify(tc.input_data)})\n${code}`;
          }
          const res = await runPython(testCode);
          const actual = (res.output ?? '').trim();
          const expected = tc.expected_output.trim();
          results.push({ input: tc.input_data, expected, actual, passed: actual === expected });
        }
        setTestResults(results);
      }
    } catch (e: any) { setOutput(`Error: ${e.message}`); }
    setRunning(false);
  };

  const resetCode = () => {
    setCode(asg?.starter_code ?? '# Write your Python solution here\n');
    setOutput('');
    setTestResults([]);
  };

  const handleSubmit = async () => {
    if (!profile || !asg) return;
    setSubmitting(true);
    setConfirmSubmit(false);
    try {
      const passedCount = testResults.filter(r => r.passed).length;
      const submissionNum = (submission?.submission_number ?? 0) + 1;
      const { data: existing } = await supabase.from('assignment_submissions')
        .select('id').eq('assignment_id', assignmentId).eq('student_id', profile.id).maybeSingle();

      if (existing) {
        const { error } = await supabase.from('assignment_submissions').update({
          submitted_code: code, submission_text: null, language: 'python',
          execution_output: output, visible_tests_passed: passedCount,
          visible_tests_total: testCases.length, status: 'submitted',
          submitted_at: new Date().toISOString(), submission_number: submissionNum,
          updated_at: new Date().toISOString(), score: null, feedback: null,
          graded_by: null, graded_at: null,
        }).eq('id', (existing as any).id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('assignment_submissions').insert({
          assignment_id: assignmentId, student_id: profile.id, submitted_code: code,
          language: 'python', execution_output: output,
          visible_tests_passed: passedCount, visible_tests_total: testCases.length,
          status: 'submitted', submitted_at: new Date().toISOString(), submission_number: submissionNum,
        });
        if (error) throw error;
      }
      await supabase.from('notifications').insert({
        user_id: asg.created_by, title: 'New Assignment Submission',
        message: `${profile.full_name} submitted ${asg.title}`, type: 'assignment_submission',
      }).then(() => {});
      success('Assignment submitted!', `${passedCount}/${testCases.length} visible tests passed`);
      await load();
    } catch (e: any) { toastError('Submit failed', e.message); }
    setSubmitting(false);
  };

  const canShowSolution = () => {
    if (!asg?.sample_solution) return false;
    const vis = asg.sample_solution_visibility ?? 'never';
    if (vis === 'always') return true;
    if (vis === 'after_submission' && submission) return true;
    if (vis === 'after_grading' && submission?.status === 'graded') return true;
    return false;
  };

  const canResubmit = !submission || (submission.status !== 'graded' && asg?.allow_resubmit);
  const passedCount = testResults.filter(r => r.passed).length;

  if (loading) return <div className="p-8 text-center text-slate-400">Loading assignment...</div>;
  if (!asg) return <div className="p-8 text-center text-slate-400">Assignment not found.</div>;

  const sharedProps = {
    asg, testCases, submission, code, setCode, output, running, runtimeStatus,
    testResults, showHints, setShowHints, showSolution, setShowSolution,
    canShowSolution: canShowSolution(), canResubmit, passedCount,
    confirmSubmit, setConfirmSubmit, submitting, onBack,
    runCode, resetCode, handleSubmit,
  };

  return (
    <>
      {isDesktop
        ? <DesktopWorkspace {...sharedProps} />
        : <MobileWorkspace {...sharedProps} />
      }
    </>
  );
}

// ============================================================
// Shared sub-components
// ============================================================
function ProblemPanel({ asg, testCases, testResults, showHints, setShowHints, showSolution, setShowSolution, canShowSolution }: any) {
  return (
    <div className="p-4 space-y-4 text-sm">
      {asg.problem_statement && (
        <div>
          <p className="font-semibold text-slate-900 dark:text-white mb-2">Problem Statement</p>
          <p className="text-slate-600 dark:text-slate-300 whitespace-pre-wrap">{asg.problem_statement}</p>
        </div>
      )}
      {asg.instructions && (
        <div>
          <p className="font-semibold text-slate-900 dark:text-white mb-2">Instructions</p>
          <p className="text-slate-600 dark:text-slate-300 whitespace-pre-wrap">{asg.instructions}</p>
        </div>
      )}
      {asg.input_format && (
        <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800">
          <p className="font-medium text-slate-700 dark:text-slate-300 mb-1 text-xs uppercase tracking-wide">Input Format</p>
          <p className="text-slate-600 dark:text-slate-400 text-xs">{asg.input_format}</p>
        </div>
      )}
      {asg.output_format && (
        <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800">
          <p className="font-medium text-slate-700 dark:text-slate-300 mb-1 text-xs uppercase tracking-wide">Output Format</p>
          <p className="text-slate-600 dark:text-slate-400 text-xs">{asg.output_format}</p>
        </div>
      )}
      {asg.constraints_text && (
        <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-900/20">
          <p className="font-medium text-amber-700 dark:text-amber-400 mb-1 text-xs uppercase tracking-wide">Constraints</p>
          <p className="text-amber-700 dark:text-amber-400 text-xs">{asg.constraints_text}</p>
        </div>
      )}
      {testCases.length > 0 && (
        <div>
          <p className="font-semibold text-slate-900 dark:text-white mb-2">Examples</p>
          <div className="space-y-2">
            {testCases.map((tc: AssignmentTestCase, idx: number) => (
              <div key={tc.id} className="rounded-xl border border-slate-100 dark:border-slate-700 overflow-hidden text-xs">
                <div className="bg-slate-50 dark:bg-slate-800 px-3 py-1.5 font-medium text-slate-600 dark:text-slate-400">Test Case {idx + 1}</div>
                <div className="p-3 space-y-2">
                  {tc.input_data && <div><span className="text-slate-400">Input:</span><pre className="font-mono mt-0.5">{tc.input_data}</pre></div>}
                  <div><span className="text-slate-400">Expected:</span><pre className="font-mono mt-0.5 text-emerald-700 dark:text-emerald-400">{tc.expected_output}</pre></div>
                  {testResults[idx] && (
                    <div className={`flex items-center gap-1 font-medium ${testResults[idx].passed ? 'text-emerald-600' : 'text-red-500'}`}>
                      {testResults[idx].passed ? <CheckCircle size={12} /> : <AlertCircle size={12} />}
                      {testResults[idx].passed ? 'Passed' : `Failed — Got: ${testResults[idx].actual}`}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
          <p className="text-xs text-slate-400 mt-2 flex items-center gap-1"><Lock size={9} /> Hidden test cases graded by faculty after submission.</p>
        </div>
      )}
      {asg.hints?.length > 0 && (
        <div>
          <button onClick={() => setShowHints(!showHints)} className="text-xs text-amber-600 hover:underline flex items-center gap-1">
            {showHints ? <EyeOff size={11} /> : <Eye size={11} />} {showHints ? 'Hide Hints' : `Show Hints (${asg.hints.length})`}
          </button>
          {showHints && (
            <div className="mt-2 space-y-1">
              {asg.hints.map((h: string, i: number) => (
                <p key={i} className="text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 rounded-lg p-2">Hint {i + 1}: {h}</p>
              ))}
            </div>
          )}
        </div>
      )}
      {canShowSolution && (
        <div>
          <button onClick={() => setShowSolution(!showSolution)} className="text-xs text-emerald-600 hover:underline flex items-center gap-1">
            {showSolution ? <EyeOff size={11} /> : <Eye size={11} />} {showSolution ? 'Hide Solution' : 'Show Sample Solution'}
          </button>
          {showSolution && <pre className="mt-2 text-xs bg-slate-900 text-slate-100 rounded-xl p-3 font-mono overflow-x-auto">{asg.sample_solution}</pre>}
        </div>
      )}
      <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800 space-y-1 text-xs text-slate-500">
        <p>Max marks: <strong>{asg.max_marks}</strong></p>
        {asg.passing_score && <p>Passing score: <strong>{asg.passing_score}</strong></p>}
        {asg.due_date && <p>Due: <strong>{formatDate(asg.due_date)}</strong></p>}
        <p>Resubmission: <strong>{asg.allow_resubmit ? 'Allowed' : 'Not allowed'}</strong></p>
      </div>
    </div>
  );
}

function SubmissionPanel({ submission, asg }: any) {
  return (
    <div className="p-4 space-y-4 text-sm">
      {!submission ? (
        <p className="text-slate-400 text-center py-8">No submission yet. Write your code and submit.</p>
      ) : (
        <>
          <div className="p-3 rounded-xl border border-slate-100 dark:border-slate-700 space-y-2">
            <div className="flex items-center justify-between">
              <span className={`badge capitalize text-xs ${submission.status === 'graded' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'}`}>{submission.status}</span>
              <span className="text-xs text-slate-400">#{submission.submission_number} · {formatDate(submission.submitted_at)}</span>
            </div>
            {submission.visible_tests_total > 0 && (
              <p className="text-xs text-slate-600 dark:text-slate-400">Visible tests: {submission.visible_tests_passed}/{submission.visible_tests_total} passed</p>
            )}
            {submission.score != null && <p className="text-sm font-bold text-emerald-600">Score: {submission.score}/{asg.max_marks}</p>}
            {submission.feedback && <p className="text-xs text-slate-600 dark:text-slate-300 italic">{submission.feedback}</p>}
          </div>
          {submission.submitted_code && (
            <div>
              <p className="font-semibold text-slate-900 dark:text-white mb-2 text-xs">Submitted Code</p>
              <pre className="text-xs bg-slate-900 text-slate-100 rounded-xl p-3 font-mono overflow-x-auto max-h-60">{submission.submitted_code}</pre>
            </div>
          )}
          {submission.execution_output && (
            <div>
              <p className="font-semibold text-slate-900 dark:text-white mb-2 text-xs">Output at Submission</p>
              <pre className="text-xs bg-slate-50 dark:bg-slate-800 rounded-xl p-3 font-mono overflow-x-auto">{submission.execution_output}</pre>
            </div>
          )}
          <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-900/20 text-xs text-blue-700 dark:text-blue-400 flex items-start gap-2">
            <Info size={12} className="flex-shrink-0 mt-0.5" />
            Hidden test-case grading requires a secure server-side execution service. Faculty review is currently enabled.
          </div>
        </>
      )}
    </div>
  );
}

function EditorPanel({ code, setCode, output, running, runtimeStatus, runCode, resetCode, passedCount, testCases, testResults, canResubmit, submitting, submission, setConfirmSubmit, height = '100%', outputHeight = 160, showControls = true }: any) {
  return (
    <div className="flex flex-col h-full overflow-hidden bg-slate-900">
      <div className="flex-1 overflow-hidden min-h-0">
        <Suspense fallback={<div className="flex items-center justify-center h-full text-slate-400 text-sm">Loading editor...</div>}>
          <MonacoEditor
            height={height}
            language="python"
            theme="vs-dark"
            value={code}
            onChange={(v: any) => setCode(v ?? '')}
            options={{
              fontSize: 14, fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
              minimap: { enabled: false }, scrollBeyondLastLine: false,
              lineNumbers: 'on', wordWrap: 'on', automaticLayout: true,
            }}
          />
        </Suspense>
      </div>
      {showControls && (
        <div className="bg-slate-800 border-t border-slate-700 px-3 py-2 flex items-center gap-2 flex-shrink-0 flex-wrap">
          <button onClick={runCode} disabled={running || runtimeStatus === 'loading'} className="btn-primary text-sm flex items-center gap-1.5 py-1.5 disabled:opacity-50">
            {running || runtimeStatus === 'loading' ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Play size={13} />}
            {runtimeStatus === 'loading' ? 'Loading...' : running ? 'Running...' : 'Run Code'}
          </button>
          <button onClick={resetCode} className="btn-ghost text-sm flex items-center gap-1.5 py-1.5 text-slate-300">
            <RotateCcw size={13} /> Reset
          </button>
          {testCases.length > 0 && testResults.length > 0 && (
            <span className={`text-sm font-medium ${passedCount === testCases.length ? 'text-emerald-400' : 'text-amber-400'}`}>
              {passedCount}/{testCases.length} passed
            </span>
          )}
          <div className="flex-1" />
          {canResubmit && (
            <button onClick={() => setConfirmSubmit(true)} disabled={submitting} className="btn-primary text-sm flex items-center gap-1.5 py-1.5 bg-emerald-600 hover:bg-emerald-700">
              {submitting ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <CheckCircle size={13} />}
              {submission ? 'Resubmit' : 'Submit'}
            </button>
          )}
        </div>
      )}
      <div style={{ height: outputHeight }} className="bg-slate-950 border-t border-slate-700 overflow-auto flex-shrink-0">
        <div className="px-4 py-2 text-xs text-slate-500 font-medium border-b border-slate-800">Output</div>
        <pre className="px-4 py-3 text-sm text-slate-300 font-mono whitespace-pre-wrap" style={{ wordBreak: 'break-word' }}>
          {running ? 'Running...' : output || 'Click "Run Code" to execute.'}
        </pre>
      </div>
    </div>
  );
}

// ============================================================
// Desktop: resizable split panels
// ============================================================
const LS_WIDTH_KEY = 'kaveri_assignment_left_width';

function DesktopWorkspace(props: any) {
  const { asg, onBack, submission, setConfirmSubmit, confirmSubmit, submitting, handleSubmit,
    code, setCode, output, running, runtimeStatus, runCode, resetCode, passedCount,
    testCases, testResults, canResubmit, showHints, setShowHints, showSolution, setShowSolution,
    canShowSolution } = props;

  const [leftPct, setLeftPct] = useState<number>(() => {
    const saved = localStorage.getItem(LS_WIDTH_KEY);
    return saved ? parseFloat(saved) : 40;
  });
  const containerRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const [activeLeftTab, setActiveLeftTab] = useState<'problem' | 'submission'>('problem');

  const onMouseDown = () => { dragging.current = true; };
  const onMouseMove = (e: MouseEvent) => {
    if (!dragging.current || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const newPct = ((e.clientX - rect.left) / rect.width) * 100;
    const clamped = Math.min(60, Math.max(25, newPct));
    setLeftPct(clamped);
  };
  const onMouseUp = () => {
    if (dragging.current) {
      dragging.current = false;
      setLeftPct(prev => { localStorage.setItem(LS_WIDTH_KEY, String(prev)); return prev; });
    }
  };

  useEffect(() => {
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => { window.removeEventListener('mousemove', onMouseMove); window.removeEventListener('mouseup', onMouseUp); };
  }, []);

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <WorkspaceHeader asg={asg} submission={submission} onBack={onBack} />

      {/* Body */}
      <div ref={containerRef} className="flex-1 flex overflow-hidden select-none">
        {/* Left panel */}
        <div style={{ width: `${leftPct}%`, minWidth: 300 }} className="flex flex-col overflow-hidden border-r border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900">
          <div className="flex border-b border-slate-100 dark:border-slate-800 flex-shrink-0">
            <button onClick={() => setActiveLeftTab('problem')} className={`flex-1 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${activeLeftTab === 'problem' ? 'border-primary-600 text-primary-600' : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}>Problem</button>
            <button onClick={() => setActiveLeftTab('submission')} className={`flex-1 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${activeLeftTab === 'submission' ? 'border-primary-600 text-primary-600' : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}>
              My Submission {submission && <span className="ml-1 text-xs opacity-60">#{submission.submission_number}</span>}
            </button>
          </div>
          <div className="flex-1 overflow-y-auto">
            {activeLeftTab === 'problem'
              ? <ProblemPanel asg={asg} testCases={testCases} testResults={testResults} showHints={showHints} setShowHints={setShowHints} showSolution={showSolution} setShowSolution={setShowSolution} canShowSolution={canShowSolution} />
              : <SubmissionPanel submission={submission} asg={asg} />
            }
          </div>
        </div>

        {/* Drag divider */}
        <div
          onMouseDown={onMouseDown}
          className="w-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-primary-200 dark:hover:bg-primary-800/60 cursor-col-resize flex-shrink-0 transition-colors active:bg-primary-400"
          title="Drag to resize"
        />

        {/* Right panel */}
        <div style={{ flex: 1, minWidth: 420 }} className="flex flex-col overflow-hidden">
          <EditorPanel
            code={code} setCode={setCode} output={output} running={running} runtimeStatus={runtimeStatus}
            runCode={runCode} resetCode={resetCode} passedCount={passedCount}
            testCases={testCases} testResults={testResults} canResubmit={canResubmit}
            submitting={submitting} submission={submission} setConfirmSubmit={setConfirmSubmit}
            height="calc(100vh - 220px)" outputHeight={160} showControls
          />
        </div>
      </div>

      <ConfirmSubmitModal asg={asg} confirmSubmit={confirmSubmit} setConfirmSubmit={setConfirmSubmit} handleSubmit={handleSubmit} submitting={submitting} passedCount={passedCount} testCases={testCases} />
    </div>
  );
}

// ============================================================
// Mobile: tabbed workspace
// ============================================================
function MobileWorkspace(props: any) {
  const { asg, onBack, submission, setConfirmSubmit, confirmSubmit, submitting, handleSubmit,
    code, setCode, output, running, runtimeStatus, runCode, resetCode, passedCount,
    testCases, testResults, canResubmit, showHints, setShowHints, showSolution, setShowSolution,
    canShowSolution } = props;

  const [tab, setTab] = useState<MobileTab>('question');

  const tabBtn = (key: MobileTab, label: string) => (
    <button
      onClick={() => setTab(key)}
      className={`flex-1 py-3 text-sm font-medium border-b-2 transition-colors ${tab === key ? 'border-primary-600 text-primary-600' : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
    >
      {label}
    </button>
  );

  return (
    <div className="h-full flex flex-col">
      <WorkspaceHeader asg={asg} submission={submission} onBack={onBack} />

      {/* Tab bar */}
      <div className="flex border-b border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 flex-shrink-0 overflow-x-auto">
        {tabBtn('question', 'Question')}
        {tabBtn('code', 'Code')}
        {tabBtn('output', 'Output')}
        {tabBtn('submit', 'Submit')}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto">
        {tab === 'question' && (
          <ProblemPanel asg={asg} testCases={testCases} testResults={testResults} showHints={showHints} setShowHints={setShowHints} showSolution={showSolution} setShowSolution={setShowSolution} canShowSolution={canShowSolution} />
        )}

        {tab === 'code' && (
          <div style={{ height: 'calc(100vh - 200px)' }} className="flex flex-col bg-slate-900">
            <div className="flex-1 min-h-0">
              <Suspense fallback={<div className="flex items-center justify-center h-full text-slate-400 text-sm">Loading editor...</div>}>
                <MonacoEditor
                  height="100%"
                  language="python"
                  theme="vs-dark"
                  value={code}
                  onChange={(v: any) => setCode(v ?? '')}
                  options={{
                    fontSize: 14, fontFamily: "'JetBrains Mono', monospace",
                    minimap: { enabled: false }, scrollBeyondLastLine: false,
                    lineNumbers: 'on', wordWrap: 'on', automaticLayout: true,
                  }}
                />
              </Suspense>
            </div>
            <div className="bg-slate-800 border-t border-slate-700 px-3 py-2 flex items-center gap-2 flex-shrink-0">
              <button onClick={runCode} disabled={running || runtimeStatus === 'loading'} className="btn-primary text-sm flex items-center gap-1.5 py-2 px-4 disabled:opacity-50 flex-1 justify-center">
                {running || runtimeStatus === 'loading' ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Play size={14} />}
                {runtimeStatus === 'loading' ? 'Loading...' : running ? 'Running...' : 'Run Code'}
              </button>
              <button onClick={resetCode} className="btn-ghost text-sm flex items-center gap-1.5 py-2 text-slate-300">
                <RotateCcw size={14} /> Reset
              </button>
            </div>
          </div>
        )}

        {tab === 'output' && (
          <div className="p-4 space-y-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-semibold text-slate-900 dark:text-white">Output</p>
            </div>
            <pre className="text-sm text-slate-300 font-mono whitespace-pre-wrap bg-slate-900 rounded-xl p-4 min-h-[120px] overflow-x-auto" style={{ wordBreak: 'break-word' }}>
              {output || 'Run your code to see output here.'}

            </pre>
            {testCases.length > 0 && testResults.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-semibold text-slate-900 dark:text-white">Test Results ({passedCount}/{testCases.length} passed)</p>
                {testResults.map((r: TestResult, i: number) => (
                  <div key={i} className={`p-3 rounded-xl border text-xs ${r.passed ? 'border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20' : 'border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20'}`}>
                    <div className={`flex items-center gap-1 font-medium mb-1 ${r.passed ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                      {r.passed ? <CheckCircle size={12} /> : <AlertCircle size={12} />}
                      Test {i + 1}: {r.passed ? 'Passed' : 'Failed'}
                    </div>
                    {!r.passed && <p className="text-slate-500">Expected: <code className="font-mono">{r.expected}</code> — Got: <code className="font-mono">{r.actual}</code></p>}
                  </div>
                ))}
                <p className="text-xs text-slate-400 flex items-center gap-1"><Lock size={9} /> Hidden tests are graded by faculty.</p>
              </div>
            )}
            {testCases.length > 0 && testResults.length === 0 && (
              <p className="text-xs text-slate-400">Run your code to see test results.</p>
            )}
          </div>
        )}

        {tab === 'submit' && (
          <div className="p-4 space-y-4">
            {submission && (
              <div className="p-4 rounded-xl border border-slate-100 dark:border-slate-700 space-y-2">
                <div className="flex items-center justify-between">
                  <span className={`badge capitalize text-xs ${submission.status === 'graded' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'}`}>{submission.status}</span>
                  <span className="text-xs text-slate-400">#{submission.submission_number}</span>
                </div>
                {submission.visible_tests_total > 0 && (
                  <p className="text-sm text-slate-600 dark:text-slate-400">Visible tests: {submission.visible_tests_passed}/{submission.visible_tests_total} passed</p>
                )}
                {submission.score != null && (
                  <p className="text-lg font-bold text-emerald-600">Score: {submission.score}/{asg.max_marks}</p>
                )}
                {submission.feedback && (
                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800">
                    <p className="text-xs text-slate-400 mb-1">Faculty Feedback</p>
                    <p className="text-sm text-slate-700 dark:text-slate-300 italic">{submission.feedback}</p>
                  </div>
                )}
              </div>
            )}
            {canResubmit && (
              <div className="space-y-3">
                {testCases.length > 0 && testResults.length > 0 && (
                  <p className={`text-sm font-medium ${passedCount === testCases.length ? 'text-emerald-600' : 'text-amber-600'}`}>
                    {passedCount}/{testCases.length} visible tests passing
                  </p>
                )}
                <button onClick={() => setConfirmSubmit(true)} disabled={submitting} className="w-full btn-primary text-sm flex items-center justify-center gap-2 py-3">
                  {submitting ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <CheckCircle size={16} />}
                  {submission ? 'Resubmit Assignment' : 'Submit Assignment'}
                </button>
                <p className="text-xs text-slate-400 text-center">
                  {asg.allow_resubmit ? 'You can resubmit if needed.' : 'This will be your final submission.'}
                </p>
              </div>
            )}
            {!canResubmit && submission && (
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800 text-sm text-slate-500 text-center">
                Submission finalized. Awaiting faculty review.
              </div>
            )}
            <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-900/20 text-xs text-blue-700 dark:text-blue-400 flex items-start gap-2">
              <Info size={12} className="flex-shrink-0 mt-0.5" />
              Hidden test-case grading requires a secure server-side execution service. Faculty review is currently enabled.
            </div>
          </div>
        )}
      </div>

      <ConfirmSubmitModal asg={asg} confirmSubmit={confirmSubmit} setConfirmSubmit={setConfirmSubmit} handleSubmit={handleSubmit} submitting={submitting} passedCount={passedCount} testCases={testCases} />
    </div>
  );
}

// ============================================================
// Shared workspace header
// ============================================================
function WorkspaceHeader({ asg, submission, onBack }: any) {
  return (
    <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center gap-3 flex-shrink-0">
      <button onClick={onBack} className="btn-ghost py-1.5 px-3 text-sm flex items-center gap-1.5 flex-shrink-0">
        <ChevronLeft size={14} /> <span className="hidden sm:inline">Assignments</span>
      </button>
      <div className="flex-1 min-w-0">
        <h1 className="font-bold text-slate-900 dark:text-white truncate text-sm sm:text-base">{asg.title}</h1>
        <p className="text-xs text-slate-400 truncate">{asg.course?.title}</p>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        {submission && (
          <span className={`badge text-xs capitalize ${submission.status === 'graded' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'}`}>
            {submission.status}
          </span>
        )}
        {submission?.score != null && <span className="text-sm font-bold text-emerald-600">{submission.score}/{asg.max_marks}</span>}
        {asg.due_date && <span className="text-xs text-slate-400 hidden sm:flex items-center gap-1"><Calendar size={11} />Due {formatDate(asg.due_date)}</span>}
      </div>
    </div>
  );
}

// ============================================================
// Shared confirm submit modal
// ============================================================
function ConfirmSubmitModal({ asg, confirmSubmit, setConfirmSubmit, handleSubmit, submitting, passedCount, testCases }: any) {
  return (
    <Modal open={confirmSubmit} onClose={() => setConfirmSubmit(false)} title="Submit Assignment" size="sm">
      <div className="space-y-3">
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Submit your current Python code for <strong>{asg.title}</strong>?
        </p>
        {testCases.length > 0 && (
          <p className={`text-sm font-medium ${passedCount === testCases.length ? 'text-emerald-600' : 'text-amber-600'}`}>
            {passedCount}/{testCases.length} visible tests currently passing.
          </p>
        )}
        <p className="text-xs text-slate-400">
          Hidden test cases will be reviewed by your faculty. {asg.allow_resubmit ? 'You can resubmit if needed.' : 'This submission is final.'}
        </p>
        <div className="flex gap-3 justify-end">
          <button onClick={() => setConfirmSubmit(false)} className="btn-secondary">Cancel</button>
          <button onClick={handleSubmit} disabled={submitting} className="btn-primary flex items-center gap-2">
            {submitting ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <CheckCircle size={14} />}
            Submit
          </button>
        </div>
      </div>
    </Modal>
  );
}
