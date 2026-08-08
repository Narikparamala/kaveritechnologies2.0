import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  Calendar,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  FileText,
  Info,
  Loader2,
  Play,
  Save,
  Send,
  XCircle,
} from 'lucide-react';
import { PageHeader } from '../../components/common/PageHeader';
import { Badge } from '../../components/ui/Badge';
import { EmptyState } from '../../components/ui/EmptyState';
import { Modal } from '../../components/ui/Modal';
import { useToast } from '../../components/ui/Toast';
import { useAuth } from '../../contexts/AuthContext';
import { runPython } from '../../services/pythonExecution';
import { formatDate } from '../../lib/utils';
import {
  createSubmission,
  getAssignmentById,
  getAssignmentQuestions,
  getQuestionSubmissions,
  getStudentAssignments,
  getStudentSubmission,
  getTestCases,
  saveQuestionSubmission,
  submitAssignment,
} from '../../services/assignments';
import type {
  Assignment,
  AssignmentQuestion,
  AssignmentQuestionSubmission,
  AssignmentSubmission,
  AssignmentTestCase,
  Course,
} from '../../types/database';

const MonacoEditor = lazy(() => import('@monaco-editor/react').then(module => ({ default: module.default })));

type AssignmentListItem = Assignment & {
  course: Course;
  submission: AssignmentSubmission | null;
};

type AssignmentDetails = Assignment & { course: Course };

type TestResult = {
  input: string | null;
  expected: string;
  actual: string;
  passed: boolean;
  hidden: boolean;
};

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && error !== null && 'message' in error) {
    return String(error.message);
  }
  return 'Something went wrong';
}

function normalizeOutput(value: string) {
  return value.replace(/\r\n/g, '\n').trim();
}

async function executeTest(code: string, testCase: AssignmentTestCase): Promise<TestResult> {
  const testCode = testCase.input_data
    ? `import sys\nfrom io import StringIO\nsys.stdin = StringIO(${JSON.stringify(testCase.input_data)})\n${code}`
    : code;
  const result = await runPython(testCode);
  const actual = result.success
    ? normalizeOutput(result.output ?? '')
    : `Error: ${result.error || 'Execution failed'}`;
  const expected = normalizeOutput(testCase.expected_output);

  return {
    input: testCase.input_data,
    expected,
    actual,
    passed: result.success && actual === expected,
    hidden: testCase.is_hidden,
  };
}

export default function AssignmentsPage() {
  const { assignmentId } = useParams<{ assignmentId?: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const returnTo = searchParams.get('returnTo');
  const listPath = returnTo ?? '/student/assignments';

  if (assignmentId) {
    return (
      <AssignmentWorkspace
        assignmentId={assignmentId}
        onBack={() => navigate(listPath)}
        onSubmitted={() => navigate(listPath)}
      />
    );
  }

  return (
    <AssignmentList
      onOpen={id => navigate(`/student/assignments/${id}${returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : ''}`)}
    />
  );
}

function AssignmentList({ onOpen }: { onOpen: (id: string) => void }) {
  const { profile } = useAuth();
  const { error: toastError } = useToast();
  const [assignments, setAssignments] = useState<AssignmentListItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile) return;
    let active = true;
    getStudentAssignments(profile.id)
      .then(items => { if (active) setAssignments(items); })
      .catch(error => toastError('Could not load assignments', errorMessage(error)))
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [profile, toastError]);

  const statusBadge = (assignment: AssignmentListItem) => {
    const submission = assignment.submission;
    if (!submission) return <Badge variant="default">Not Started</Badge>;
    if (submission.status === 'draft') return <Badge variant="warning">Draft Saved</Badge>;
    if (submission.status === 'submitted') return <Badge variant="info">Submitted</Badge>;
    if (submission.status === 'graded') return <Badge variant="success">Graded</Badge>;
    return <Badge variant="default">{submission.status}</Badge>;
  };

  return (
    <div className="mx-auto max-w-7xl animate-fade-in p-6 lg:p-8">
      <PageHeader title="Assignments" subtitle="Solve coding questions and submit your work" icon={FileText} />
      {loading ? (
        <div className="grid gap-4">
          {[1, 2, 3].map(item => <div key={item} className="h-28 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-800" />)}
        </div>
      ) : assignments.length === 0 ? (
        <EmptyState icon={FileText} title="No assignments yet" description="Published assignments will appear here." />
      ) : (
        <div className="grid gap-4">
          {assignments.map(assignment => (
            <button key={assignment.id} onClick={() => onOpen(assignment.id)} className="card flex w-full items-start gap-4 p-5 text-left transition hover:border-primary-400 hover:shadow-lg">
              <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-primary-50 dark:bg-primary-900/30">
                <FileText size={19} className="text-primary-600" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-slate-900 dark:text-white">{assignment.title}</span>
                  {statusBadge(assignment)}
                </div>
                <p className="mb-1 text-xs text-primary-600">{assignment.course?.title}</p>
                <p className="line-clamp-1 text-sm text-slate-500">{assignment.description || 'Coding assignment'}</p>
              </div>
              <div className="flex flex-shrink-0 flex-col items-end gap-2">
                {assignment.due_date && <span className="flex items-center gap-1 text-xs text-slate-400"><Calendar size={12} />{formatDate(assignment.due_date)}</span>}
                <span className="flex items-center gap-1 text-xs text-primary-600">Start Coding <ChevronRight size={13} /></span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function AssignmentWorkspace({
  assignmentId,
  onBack,
  onSubmitted,
}: {
  assignmentId: string;
  onBack: () => void;
  onSubmitted: () => void;
}) {
  const { profile } = useAuth();
  const { success, error: toastError } = useToast();
  const [assignment, setAssignment] = useState<AssignmentDetails | null>(null);
  const [questions, setQuestions] = useState<AssignmentQuestion[]>([]);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [submission, setSubmission] = useState<AssignmentSubmission | null>(null);
  const [answers, setAnswers] = useState<Record<string, Partial<AssignmentQuestionSubmission>>>({});
  const [visibleTests, setVisibleTests] = useState<Record<string, AssignmentTestCase[]>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [customInput, setCustomInput] = useState('');
  const [consoleText, setConsoleText] = useState('');
  const [runResults, setRunResults] = useState<TestResult[]>([]);

  const currentQuestion = questions[questionIndex];

  const loadWorkspace = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    try {
      const [assignmentData, questionData, submissionData] = await Promise.all([
        getAssignmentById(assignmentId),
        getAssignmentQuestions(assignmentId),
        getStudentSubmission(assignmentId, profile.id),
      ]);
      if (!assignmentData) throw new Error('Assignment not found');

      setAssignment(assignmentData);
      setQuestions(questionData);
      setSubmission(submissionData);

      if (submissionData) {
        const savedAnswers = await getQuestionSubmissions(submissionData.id);
        setAnswers(Object.fromEntries(savedAnswers.map(answer => [answer.question_id, answer])));
      }

      const entries = await Promise.all(
        questionData.map(async question => [question.id, await getTestCases(assignmentId, question.id, false)] as const),
      );
      setVisibleTests(Object.fromEntries(entries));
    } catch (error) {
      toastError('Could not open assignment', errorMessage(error));
    } finally {
      setLoading(false);
    }
  }, [assignmentId, profile, toastError]);

  useEffect(() => {
    void loadWorkspace();
  }, [loadWorkspace]);

  const updateCode = (value: string) => {
    if (!currentQuestion) return;
    setAnswers(current => ({
      ...current,
      [currentQuestion.id]: {
        ...current[currentQuestion.id],
        submitted_code: value,
      },
    }));
  };

  const ensureSubmission = async () => {
    if (submission) return submission;
    if (!profile || !assignment) throw new Error('Student or assignment is missing');
    const created = await createSubmission(assignment.id, profile.id);
    setSubmission(created);
    return created;
  };

  const saveCurrentDraft = async () => {
    if (!currentQuestion || !answers[currentQuestion.id]) return;
    setSaving(true);
    try {
      const currentSubmission = await ensureSubmission();
      await saveQuestionSubmission({
        ...answers[currentQuestion.id],
        submission_id: currentSubmission.id,
        question_id: currentQuestion.id,
      });
    } catch (error) {
      toastError('Autosave failed', errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    if (!currentQuestion || !answers[currentQuestion.id]) return;
    const timer = window.setTimeout(() => { void saveCurrentDraft(); }, 1500);
    return () => window.clearTimeout(timer);
  }, [answers, currentQuestion?.id]);

  const runVisibleTests = async () => {
    if (!currentQuestion) return;
    const code = answers[currentQuestion.id]?.submitted_code ?? currentQuestion.starter_code ?? '';
    if (!code.trim()) {
      toastError('No code', 'Write some Python code before running it.');
      return;
    }

    setRunning(true);
    setRunResults([]);
    setConsoleText('Running your code...');
    try {
      const tests = visibleTests[currentQuestion.id] ?? [];
      if (tests.length === 0) {
        const result = await runPython(code);
        setConsoleText(result.success ? result.output || '(no output)' : `Error: ${result.error}`);
        return;
      }

      const results: TestResult[] = [];
      for (const test of tests) results.push(await executeTest(code, test));
      setRunResults(results);
      const passed = results.filter(result => result.passed).length;
      setConsoleText(`${passed} of ${results.length} visible test cases passed. You can change your code and run it again.`);
    } catch (error) {
      setConsoleText(`Error: ${errorMessage(error)}`);
    } finally {
      setRunning(false);
    }
  };

  const runWithCustomInput = async () => {
    if (!currentQuestion) return;
    const code = answers[currentQuestion.id]?.submitted_code ?? currentQuestion.starter_code ?? '';
    if (!code.trim()) {
      toastError('No code', 'Write some Python code before running it.');
      return;
    }

    setRunning(true);
    setRunResults([]);
    setConsoleText('Running with your custom input...');
    try {
      const runnableCode = customInput.length > 0
        ? `import sys\nfrom io import StringIO\nsys.stdin = StringIO(${JSON.stringify(customInput)})\n${code}`
        : code;
      const result = await runPython(runnableCode);
      const actualOutput = result.success
        ? result.output || '(no output)'
        : `Error: ${result.error || 'Execution failed'}`;
      setConsoleText(
        `CUSTOM RUN\n\nInput:\n${customInput || '(no input)'}\n\nYour Output:\n${actualOutput}`,
      );
    } catch (error) {
      setConsoleText(`Custom run error: ${errorMessage(error)}`);
    } finally {
      setRunning(false);
    }
  };

  const evaluateAndSubmit = async () => {
    if (!assignment || !profile) return;
    setSubmitting(true);
    setConfirmSubmit(false);
    setRunResults([]);
    setConsoleText('Checking all visible and hidden test cases...');

    try {
      const currentSubmission = await ensureSubmission();
      let totalTests = 0;
      let passedTests = 0;
      let firstFailedQuestion = -1;

      for (let index = 0; index < questions.length; index += 1) {
        const question = questions[index];
        const code = answers[question.id]?.submitted_code ?? question.starter_code ?? '';
        const tests = await getTestCases(assignment.id, question.id, true);
        const results: TestResult[] = [];

        if (code.trim()) {
          for (const test of tests) results.push(await executeTest(code, test));
        }

        const questionPassed = results.filter(result => result.passed).length;
        totalTests += tests.length;
        passedTests += questionPassed;
        if ((tests.length === 0 || questionPassed !== tests.length) && firstFailedQuestion === -1) {
          firstFailedQuestion = index;
        }

        await saveQuestionSubmission({
          ...answers[question.id],
          submission_id: currentSubmission.id,
          question_id: question.id,
          submitted_code: code,
          execution_output: JSON.stringify(results),
          passed_test_cases: questionPassed,
          total_test_cases: tests.length,
        });
      }

      if (totalTests === 0) {
        toastError('Cannot submit', 'This assignment does not have test cases yet.');
        setConsoleText('Submission stopped: no test cases are configured.');
        return;
      }

      if (passedTests !== totalTests) {
        if (firstFailedQuestion >= 0) setQuestionIndex(firstFailedQuestion);
        setConsoleText(`SUBMISSION FAILED\n${passedTests} of ${totalTests} test cases passed.\nFix your code and submit again.`);
        toastError('Tests failed', `${totalTests - passedTests} test case(s) failed. Your assignment was not submitted.`);
        return;
      }

      await submitAssignment(currentSubmission.id);
      setConsoleText(`ACCEPTED\nAll ${totalTests} test cases passed.`);
      success('All test cases passed!', 'Your assignment was submitted successfully.');
      window.setTimeout(onSubmitted, 900);
    } catch (error) {
      toastError('Submission failed', errorMessage(error));
      setConsoleText(`Submission error: ${errorMessage(error)}`);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="p-8 text-center text-slate-400">Loading assignment...</div>;
  if (!assignment || !currentQuestion) return <div className="p-8 text-center text-slate-400">Assignment is not available.</div>;

  const code = answers[currentQuestion.id]?.submitted_code ?? currentQuestion.starter_code ?? '';

  return (
    <div className="flex h-screen flex-col bg-white dark:bg-slate-950">
      <header className="z-10 flex h-14 items-center justify-between border-b border-slate-200 bg-white px-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="rounded-lg p-2 hover:bg-slate-100 dark:hover:bg-slate-800"><ChevronLeft size={20} /></button>
          <div><h1 className="text-sm font-semibold">{assignment.title}</h1><p className="text-[10px] uppercase tracking-wider text-slate-400">{assignment.course?.title}</p></div>
        </div>
        <div className="flex items-center gap-3">
          <span className={`flex items-center gap-1 text-xs ${saving ? 'text-amber-500' : 'text-emerald-500'}`}><Save size={12} />{saving ? 'Saving...' : 'Saved'}</span>
          <button className="btn-primary flex items-center gap-2 !px-4 !py-2 text-xs" disabled={submitting} onClick={() => setConfirmSubmit(true)}><Send size={14} /> Submit</button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <section className="w-1/2 overflow-y-auto border-r border-slate-200 bg-slate-50/50 p-6 dark:border-slate-800 dark:bg-slate-900/50">
          <div className="mb-5 flex items-center justify-between"><Badge variant="info">Coding Question</Badge><span className="text-xs text-slate-400">Question {questionIndex + 1} of {questions.length}</span></div>
          <h2 className="text-2xl font-bold">{currentQuestion.title}</h2>
          <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-slate-600 dark:text-slate-300">{currentQuestion.problem_statement}</p>
          {currentQuestion.instructions && <div className="mt-5 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-700 dark:border-blue-800 dark:bg-blue-900/20 dark:text-blue-300"><strong className="mb-1 flex items-center gap-1"><Info size={14} /> Instructions</strong>{currentQuestion.instructions}</div>}
          <div className="mt-6 grid gap-4">
            {currentQuestion.input_format && <div><h3 className="mb-2 text-xs font-bold uppercase text-slate-400">Input Format</h3><div className="whitespace-pre-wrap rounded-xl bg-slate-100 p-4 font-mono text-sm dark:bg-slate-800">{currentQuestion.input_format}</div></div>}
            {currentQuestion.output_format && <div><h3 className="mb-2 text-xs font-bold uppercase text-slate-400">Output Format</h3><div className="whitespace-pre-wrap rounded-xl bg-slate-100 p-4 font-mono text-sm dark:bg-slate-800">{currentQuestion.output_format}</div></div>}
          </div>
          <h3 className="mb-3 mt-6 text-xs font-bold uppercase text-slate-400">Examples</h3>
          <div className="space-y-3">
            {(visibleTests[currentQuestion.id] ?? []).map((test, index) => <div key={test.id} className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800"><div className="bg-slate-100 px-3 py-2 text-[10px] font-bold uppercase text-slate-500 dark:bg-slate-800">Example {index + 1}</div><div className="grid gap-3 p-4 font-mono text-xs md:grid-cols-2"><pre>Input:{'\n'}{test.input_data || '(none)'}</pre><pre className="text-emerald-500">Expected:{'\n'}{test.expected_output}</pre></div></div>)}
          </div>
        </section>

        <section className="flex w-1/2 flex-col bg-slate-950">
          <div className="min-h-0 flex-1">
            <Suspense fallback={<div className="flex h-full items-center justify-center text-slate-400">Loading code editor...</div>}>
              <MonacoEditor height="100%" language="python" theme="vs-dark" value={code} onChange={value => updateCode(value ?? '')} options={{ fontSize: 14, minimap: { enabled: false }, scrollBeyondLastLine: false, padding: { top: 16 }, automaticLayout: true }} />
            </Suspense>
          </div>
          <div className="flex h-80 flex-col border-t border-slate-800 bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-800 px-4 py-2"><span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Input, Output & Test Results</span><button className="btn-secondary flex items-center gap-2 !px-3 !py-1.5 text-xs" disabled={running || submitting} onClick={runVisibleTests}>{running ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}Run Sample Tests</button></div>
            <div className="flex items-end gap-3 border-b border-slate-800 p-3">
              <div className="flex-1">
                <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-400">Custom Input</label>
                <textarea
                  className="h-16 w-full resize-none rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-xs text-slate-200 outline-none focus:border-primary-500"
                  value={customInput}
                  onChange={event => setCustomInput(event.target.value)}
                  placeholder={'Example:\n10\n20'}
                />
              </div>
              <button className="btn-primary flex items-center gap-2 !px-3 !py-2 text-xs" disabled={running || submitting} onClick={runWithCustomInput}>{running ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}Run Custom Input</button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 text-xs">
              {consoleText && <pre className="mb-4 whitespace-pre-wrap font-mono text-slate-300">{consoleText}</pre>}
              <div className="space-y-3">
                {runResults.map((result, index) => <div key={index} className={`rounded-xl border p-3 ${result.passed ? 'border-emerald-700/50 bg-emerald-900/20' : 'border-red-700/50 bg-red-900/20'}`}><div className={`mb-2 flex items-center gap-2 font-semibold ${result.passed ? 'text-emerald-400' : 'text-red-400'}`}>{result.passed ? <CheckCircle2 size={14} /> : <XCircle size={14} />}Test Case {index + 1}: {result.passed ? 'PASSED' : 'FAILED'}</div><div className="grid gap-2 font-mono text-slate-300 md:grid-cols-3"><pre>Input:{'\n'}{result.input || '(none)'}</pre><pre>Expected:{'\n'}{result.expected}</pre><pre className={result.passed ? 'text-emerald-300' : 'text-red-300'}>Your Output:{'\n'}{result.actual || '(no output)'}</pre></div></div>)}
              </div>
              {!consoleText && runResults.length === 0 && <span className="text-slate-500">Run your code to see its actual output and test results.</span>}
            </div>
          </div>
          <footer className="flex h-14 items-center justify-between border-t border-slate-800 bg-slate-900 px-4">
            <button className="btn-secondary flex items-center gap-1 text-xs disabled:opacity-30" disabled={questionIndex === 0} onClick={() => { setQuestionIndex(index => index - 1); setRunResults([]); setConsoleText(''); }}><ChevronLeft size={15} /> Previous</button>
            <div className="flex gap-1.5">{questions.map((_, index) => <span key={index} className={`h-2 w-2 rounded-full ${index === questionIndex ? 'bg-primary-600' : 'bg-slate-700'}`} />)}</div>
            {questionIndex < questions.length - 1 ? <button className="btn-secondary flex items-center gap-1 text-xs" onClick={() => { setQuestionIndex(index => index + 1); setRunResults([]); setConsoleText(''); }}>Next <ChevronRight size={15} /></button> : <button className="btn-primary flex items-center gap-2 text-xs" onClick={() => setConfirmSubmit(true)}>Review & Submit <Send size={14} /></button>}
          </footer>
        </section>
      </div>

      <Modal open={confirmSubmit} onClose={() => setConfirmSubmit(false)} title="Run final submission tests">
        <div className="space-y-5">
          <p className="text-sm leading-6 text-slate-600 dark:text-slate-300">Submitting will run every visible and hidden test case. If any test fails, you can correct your code and submit again.</p>
          <div className="rounded-xl bg-slate-50 p-4 text-sm dark:bg-slate-900"><div className="flex justify-between"><span>Questions</span><strong>{questions.length}</strong></div><div className="mt-2 flex justify-between"><span>Current status</span><strong>{submission?.status === 'submitted' ? 'Submitted' : 'Draft'}</strong></div></div>
          <div className="flex justify-end gap-3"><button className="btn-secondary" onClick={() => setConfirmSubmit(false)}>Keep Coding</button><button className="btn-primary flex items-center gap-2" disabled={submitting} onClick={evaluateAndSubmit}>{submitting ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}Run Tests & Submit</button></div>
        </div>
      </Modal>
    </div>
  );
}
