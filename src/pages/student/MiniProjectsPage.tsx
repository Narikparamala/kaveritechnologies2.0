import { lazy, Suspense, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  AlertTriangle, ArrowLeft, BadgeCheck, CheckCircle2, Code2, Cpu,
  Loader2, RefreshCw, Send, Terminal, XCircle,
} from 'lucide-react';
import { PageHeader } from '../../components/common/PageHeader';
import { Badge } from '../../components/ui/Badge';
import { EmptyState } from '../../components/ui/EmptyState';
import { useToast } from '../../components/ui/Toast';
import { supabase } from '../../lib/supabase';
import { getSecureJudgeLanguages, type JudgeLanguage } from '../../services/secureGrading';

const MonacoEditor = lazy(() =>
  import('@monaco-editor/react').then(module => ({ default: module.default })),
);

type VsCodeAssignment = {
  id: string;
  assignment_key: string;
  title: string;
  topic: string | null;
  question: string;
  language: string;
  file_name: string | null;
  starter_code: string | null;
  marks: number;
};

type SubmissionRow = {
  id: string;
  assignment_key: string;
  verification_status: string | null;
  verified_passed: number | null;
  verified_total: number | null;
  verified_score: number | null;
  verified_summary: string | null;
  status: string;
  submitted_at: string;
};

type VisibleTest = {
  id: string;
  input_text: string | null;
  expected_output: string;
  is_hidden: boolean;
  position: number;
};

type SampleResult = {
  id: string;
  passed: boolean;
  input: string;
  expected: string;
  actual: string;
  stderr?: string;
};

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && error !== null && 'message' in error) return String(error.message);
  return 'Something went wrong';
}

async function invokeSecureGrader<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('secure-grade', { body });
  if (error) {
    const context = error.context as Response | undefined;
    if (context) {
      try {
        const payload = await context.clone().json();
        if (payload?.error) throw new Error(String(payload.error));
      } catch (parseError) {
        if (parseError instanceof Error && parseError.message !== 'Unexpected end of JSON input') throw parseError;
      }
    }
    throw error;
  }
  return data as T;
}

export default function MiniProjectsPage() {
  const { assignmentId } = useParams<{ assignmentId?: string }>();
  const navigate = useNavigate();

  if (assignmentId) {
    return <ProjectWorkspace assignmentId={assignmentId} onBack={() => navigate('/student/mini-projects')} />;
  }
  return <ProjectList onOpen={id => navigate(`/student/mini-projects/${id}`)} />;
}

function ProjectList({ onOpen }: { onOpen: (id: string) => void }) {
  const { error: toastError } = useToast();
  const [assignments, setAssignments] = useState<VsCodeAssignment[]>([]);
  const [submissions, setSubmissions] = useState<SubmissionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      setLoadError(null);
      try {
        // Same tables the VS Code extension uses. RLS resolves which published
        // assignments are released to the student's active batches.
        const [assignmentsResult, submissionsResult] = await Promise.all([
          supabase
            .from('coding_vscode_assignments')
            .select('id,assignment_key,title,topic,question,language,file_name,starter_code,marks')
            .eq('is_published', true)
            .order('assignment_key'),
          supabase
            .from('coding_vscode_submissions')
            .select('id,assignment_key,verification_status,verified_passed,verified_total,verified_score,verified_summary,status,submitted_at'),
        ]);
        if (assignmentsResult.error) throw assignmentsResult.error;
        if (submissionsResult.error) throw submissionsResult.error;
        if (active) {
          setAssignments((assignmentsResult.data ?? []) as VsCodeAssignment[]);
          setSubmissions((submissionsResult.data ?? []) as SubmissionRow[]);
        }
      } catch (error) {
        if (active) setLoadError(errorMessage(error));
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => { active = false; };
  }, [toastError]);

  // Latest submission per assignment_key — the completion signal shared with the extension.
  const latestByKey = useMemo(() => {
    const map = new Map<string, SubmissionRow>();
    for (const row of submissions) {
      const existing = map.get(row.assignment_key);
      if (!existing || row.submitted_at > existing.submitted_at) {
        map.set(row.assignment_key, row);
      }
    }
    return map;
  }, [submissions]);

  if (loading) {
    return (
      <div className="mx-auto max-w-7xl animate-fade-in p-6 lg:p-8">
        <PageHeader title="Mini Projects" subtitle="Loading your projects…" icon={Code2} />
        <div className="grid gap-4 md:grid-cols-2">
          {[1, 2, 3, 4].map(item => <div key={item} className="h-48 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-800" />)}
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="mx-auto max-w-7xl animate-fade-in p-6 lg:p-8">
        <PageHeader title="Mini Projects" subtitle="Solve coding projects right here in the browser" icon={Code2} />
        <EmptyState icon={AlertTriangle} title="Could not load projects" description={loadError} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl animate-fade-in p-6 lg:p-8">
      <PageHeader
        title="Mini Projects"
        subtitle="Solve coding projects here in the browser — your progress stays in sync with the VS Code extension"
        icon={Code2}
      />

      <div className="mb-4 flex items-center justify-between text-sm text-slate-500 dark:text-slate-400">
        <span>{assignments.length} project{assignments.length === 1 ? '' : 's'}</span>
        <span>Complete a project here or in VS Code — both stay in sync</span>
      </div>

      {assignments.length === 0 ? (
        <EmptyState
          icon={Code2}
          title="No projects released yet"
          description="Projects released to your batch by faculty will appear here and in the VS Code extension."
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {assignments.map(assignment => {
            const submission = latestByKey.get(assignment.assignment_key);
            const verified = submission?.verification_status === 'verified';
            const allPassed = verified && submission.verified_passed === submission.verified_total;
            const inProgress = submission?.verification_status === 'pending' || submission?.verification_status === 'error';
            return (
              <button
                key={assignment.id}
                onClick={() => onOpen(assignment.id)}
                className="card group flex min-h-48 flex-col p-5 text-left transition hover:-translate-y-0.5 hover:border-primary-400 hover:shadow-xl"
              >
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary-50 text-primary-600 dark:bg-primary-900/30">
                    <Code2 size={20} />
                  </div>
                  {verified && (
                    allPassed
                      ? <Badge variant="success"><BadgeCheck size={12} className="mr-1 inline" />Completed</Badge>
                      : <Badge variant="warning">Attempted</Badge>
                  )}
                  {inProgress && <Badge variant="info">Submitted</Badge>}
                </div>
                <h2 className="text-lg font-bold text-slate-900 transition group-hover:text-primary-600 dark:text-white">
                  {assignment.title}
                </h2>
                {assignment.topic && <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-slate-400">{assignment.topic}</p>}
                <p className="mt-2 line-clamp-2 text-sm text-slate-500 dark:text-slate-400">{assignment.question}</p>
                <div className="mt-auto flex items-center justify-between pt-4 text-xs text-slate-400">
                  <span className="inline-flex items-center gap-1"><Terminal size={12} /> {assignment.language}</span>
                  <span className="inline-flex items-center gap-1"><Cpu size={12} /> {assignment.marks} marks</span>
                </div>
                {verified && (
                  <p className="mt-2 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                    {allPassed
                      ? `You already completed this project — score ${submission.verified_score}/${assignment.marks}`
                      : `Attempted — best so far: ${submission.verified_passed}/${submission.verified_total} hidden tests`}
                  </p>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ProjectWorkspace({ assignmentId, onBack }: { assignmentId: string; onBack: () => void }) {
  const { success, error: toastError } = useToast();
  const [assignment, setAssignment] = useState<VsCodeAssignment | null>(null);
  const [tests, setTests] = useState<VisibleTest[]>([]);
  const [languages, setLanguages] = useState<JudgeLanguage[]>([]);
  const [selectedLanguageId, setSelectedLanguageId] = useState<number | null>(null);
  const [code, setCode] = useState('');
  const [results, setResults] = useState<SampleResult[]>([]);
  const [running, setRunning] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submission, setSubmission] = useState<SubmissionRow | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const assignmentResult = await supabase
        .from('coding_vscode_assignments')
        .select('id,assignment_key,title,topic,question,language,file_name,starter_code,marks')
        .eq('id', assignmentId)
        .eq('is_published', true)
        .maybeSingle();
      if (assignmentResult.error) throw assignmentResult.error;
      const loadedAssignment = assignmentResult.data as VsCodeAssignment | null;
      if (!loadedAssignment) { setNotFound(true); return; }

      const [testsResult, submissionsResult, languagesResult] = await Promise.all([
        supabase
          .from('coding_vscode_test_cases')
          .select('id,input_text,expected_output,is_hidden,position')
          .eq('assignment_id', assignmentId)
          .eq('is_hidden', false)
          .order('position'),
        supabase
          .from('coding_vscode_submissions')
          .select('id,assignment_key,verification_status,verified_passed,verified_total,verified_score,verified_summary,status,submitted_at')
          .eq('assignment_key', loadedAssignment.assignment_key)
          .order('submitted_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
        getSecureJudgeLanguages(),
      ]);
      if (testsResult.error) throw testsResult.error;
      if (submissionsResult.error) throw submissionsResult.error;

      setAssignment(loadedAssignment);
      setTests((testsResult.data ?? []) as VisibleTest[]);
      setSubmission((submissionsResult.data ?? null) as SubmissionRow | null);

      const python = languagesResult.find(language => /^Python \(3\./i.test(language.name)) ?? languagesResult[0];
      if (python) {
        setLanguages(languagesResult);
        setSelectedLanguageId(python.id);
        setCode(loadedAssignment.starter_code ?? '# Write your solution here\n');
      }
    } catch (error) {
      setLoadError(errorMessage(error));
    }
  }, [assignmentId]);

  useEffect(() => {
    setNotFound(false);
    setLoadError(null);
    void load();
  }, [load]);

  const runSampleTests = async () => {
    if (!assignment || !code.trim() || !selectedLanguageId) return;
    setRunning(true);
    setResults([]);
    try {
      // Visible tests run through the same secure execution path the portal
      // practice uses; hidden tests stay server-side for the submit action.
      const { securelyRunCustom } = await import('../../services/secureGrading');
      const nextResults: SampleResult[] = [];
      for (const test of tests) {
        const response = await securelyRunCustom(code, test.input_text ?? '', selectedLanguageId);
        const result = response.result;
        const actual = (result.actual ?? '').replace(/\r\n/g, '\n').trimEnd();
        const expected = (test.expected_output ?? '').replace(/\r\n/g, '\n').trimEnd();
        nextResults.push({
          id: test.id,
          passed: result.passed || (result.status === 'accepted' && actual === expected),
          input: test.input_text ?? '',
          expected,
          actual: actual || result.stderr || '',
          stderr: result.stderr,
        });
      }
      setResults(nextResults);
    } catch (error) {
      toastError('Sample tests could not run', errorMessage(error));
    } finally {
      setRunning(false);
    }
  };

  const submitSolution = async () => {
    if (!assignment || !code.trim()) return;
    setSubmitting(true);
    try {
      // Insert through the same RLS-guarded REST path the VS Code extension uses.
      const { data: authData } = await supabase.auth.getUser();
      const insertResult = await supabase.from('coding_vscode_submissions').insert({
        student_id: authData.user?.id,
        assignment_key: assignment.assignment_key,
        language: assignment.language,
        file_name: assignment.file_name ?? 'main.py',
        code,
        status: 'submitted',
      }).select('id').single();
      if (insertResult.error) throw insertResult.error;
      const submissionId = insertResult.data.id as string;

      // Grade through the same server-verified pipeline (hidden tests, runner).
      const gradeResult = await invokeSecureGrader<{ verified: boolean; hiddenPassed: number; hiddenTotal: number; allPassed: boolean; verifiedScore: number; verifiedSummary: string }>({
        kind: 'vscode',
        submissionId,
      });

      if (gradeResult.verified) {
        setSubmission({
          id: submissionId,
          assignment_key: assignment.assignment_key,
          verification_status: 'verified',
          verified_passed: gradeResult.hiddenPassed,
          verified_total: gradeResult.hiddenTotal,
          verified_score: gradeResult.verifiedScore,
          verified_summary: gradeResult.verifiedSummary,
          status: 'submitted',
        });
      }
      if (gradeResult.allPassed) {
        success('Project verified!', `All ${gradeResult.hiddenTotal} hidden tests passed securely.`);
      } else {
        success('Submitted', `${gradeResult.hiddenPassed} of ${gradeResult.hiddenTotal} hidden tests passed. Try again anytime.`);
      }
    } catch (error) {
      toastError('Could not submit project', errorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  if (notFound) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 bg-slate-50 dark:bg-slate-950">
        <EmptyState icon={XCircle} title="Project not found" description="This project may not be released to your batch." />
        <button onClick={onBack} className="btn-secondary">Back to Mini Projects</button>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 bg-slate-50 dark:bg-slate-950">
        <EmptyState icon={AlertTriangle} title="Could not open project" description={loadError} />
        <button onClick={onBack} className="btn-secondary">Back to Mini Projects</button>
      </div>
    );
  }

  if (!assignment) {
    return <div className="flex h-screen items-center justify-center bg-slate-950"><Loader2 className="animate-spin text-primary-500" /></div>;
  }

  const verified = submission?.verification_status === 'verified';
  const allPassed = verified && submission?.verified_passed === submission?.verified_total;

  return (
    <div className="flex h-screen min-h-0 flex-col overflow-hidden bg-slate-50 dark:bg-slate-950">
      <header className="z-10 flex h-14 flex-none items-center justify-between border-b border-slate-200 bg-white px-3 dark:border-slate-800 dark:bg-slate-900 sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <button onClick={onBack} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" title="Back to Mini Projects">
            <ArrowLeft size={19} />
          </button>
          <div className="min-w-0">
            <h1 className="truncate font-bold text-slate-900 dark:text-white">{assignment.title}</h1>
            <p className="text-xs text-slate-500">{assignment.language} · {assignment.marks} marks · main.py</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {verified && (
            <span className={`hidden items-center gap-1.5 text-xs font-semibold sm:flex ${allPassed ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
              <BadgeCheck size={15} />
              {allPassed ? `Completed ${submission.verified_score}/${assignment.marks}` : `${submission.verified_passed}/${submission.verified_total} tests`}
            </span>
          )}
          <button disabled={submitting || running || !code.trim()} onClick={() => void submitSolution()} className="btn-primary flex items-center gap-2 !px-4 !py-2 text-sm">
            {submitting ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            Submit
          </button>
        </div>
      </header>

      {verified && (
        <div className="flex items-center gap-2.5 border-b border-emerald-800/60 bg-emerald-950/40 px-4 py-2.5 text-xs text-emerald-200">
          <BadgeCheck size={15} className="flex-none text-emerald-400" />
          <span className="min-w-0 flex-1">
            {allPassed
              ? `You already completed this project — all ${submission.verified_total} hidden tests passed. You can still improve your solution and resubmit.`
              : `${submission.verified_summary}. Improve your code and submit again.`}
          </span>
        </div>
      )}

      <div className="grid min-h-0 flex-1 grid-rows-[minmax(360px,auto)_minmax(560px,auto)] overflow-y-auto lg:grid-cols-[var(--split,47%)_7px_minmax(0,1fr)] lg:grid-rows-1 lg:overflow-hidden lg:[--split:45%]">
        <section className="overflow-y-auto p-5 lg:p-7">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <Badge variant="info">{assignment.marks} marks</Badge>
            {assignment.topic && <Badge variant="default">{assignment.topic}</Badge>}
          </div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">{assignment.title}</h2>
          <p className="mt-4 whitespace-pre-wrap leading-7 text-slate-700 dark:text-slate-300">{assignment.question}</p>

          {tests.length > 0 && (
            <div className="mt-6">
              <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-500">Examples</h3>
              <div className="space-y-3">
                {tests.map((test, index) => (
                  <div key={test.id} className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
                    <div className="bg-slate-100 px-4 py-2 text-xs font-semibold text-slate-500 dark:bg-slate-800">Example {index + 1}</div>
                    <div className="grid gap-4 p-4 text-sm sm:grid-cols-2">
                      <div><span className="text-xs uppercase text-slate-400">Input</span><pre className="mt-1 whitespace-pre-wrap text-slate-800 dark:text-slate-200">{test.input_text || '(no input)'}</pre></div>
                      <div><span className="text-xs uppercase text-slate-400">Expected</span><pre className="mt-1 whitespace-pre-wrap text-emerald-600">{test.expected_output}</pre></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        <section className="flex min-h-[560px] min-w-0 flex-col bg-slate-950 lg:min-h-0">
          <div className="flex h-11 flex-none items-center justify-between border-b border-slate-800 px-4">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-300">
              <Terminal size={14} className="text-primary-400" />
              <span>{assignment.file_name ?? 'main.py'}</span>
            </div>
            {selectedLanguageId && (
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                {languages.find(language => language.id === selectedLanguageId)?.name ?? ''}
              </span>
            )}
          </div>
          <div className="min-h-[280px] flex-1 lg:min-h-0">
            <Suspense fallback={<div className="flex h-full items-center justify-center text-slate-400">Loading editor...</div>}>
              <MonacoEditor
                height="100%"
                language="python"
                theme="vs-dark"
                value={code}
                onChange={value => setCode(value ?? '')}
                options={{
                  minimap: { enabled: false },
                  fontSize: 14,
                  automaticLayout: true,
                  padding: { top: 14 },
                  scrollBeyondLastLine: false,
                  wordWrap: 'on',
                }}
              />
            </Suspense>
          </div>

          <div className="flex h-[320px] min-h-[240px] flex-none flex-col border-t border-slate-800 bg-slate-900 lg:h-[40%]">
            <div className="flex flex-none items-center justify-between border-b border-slate-800 px-3 py-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-300">
                <Eye size={13} className="text-primary-400" /> Sample test results
              </div>
              <button disabled={running || submitting || tests.length === 0 || !selectedLanguageId} onClick={() => void runSampleTests()} className="btn-secondary flex items-center gap-2 !px-3 !py-1.5 text-xs">
                {running ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} Run Sample Tests
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              {results.length === 0 ? (
                <div className="flex h-full min-h-32 flex-col items-center justify-center text-center text-slate-500">
                  <CheckCircle2 size={24} className="mb-2 text-slate-600" />
                  <p className="text-sm">Run sample tests to check your code before submitting.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {results.map((result, index) => (
                    <div key={result.id} className={`rounded-lg border p-2.5 text-xs ${result.passed ? 'border-emerald-800/70 bg-emerald-950/20' : 'border-red-800/70 bg-red-950/20'}`}>
                      <div className={`flex items-center gap-2 font-semibold ${result.passed ? 'text-emerald-400' : 'text-red-400'}`}>
                        {result.passed ? <CheckCircle2 size={13} /> : <XCircle size={13} />} Sample {index + 1}: {result.passed ? 'PASSED' : 'FAILED'}
                      </div>
                      <div className="mt-2 grid gap-2 sm:grid-cols-3">
                        <div className="rounded bg-slate-950/60 p-2"><span className="text-[10px] uppercase text-slate-500">Input</span><pre className="mt-1 whitespace-pre-wrap font-mono text-[11px] text-slate-200">{result.input || '(no input)'}</pre></div>
                        <div className="rounded bg-slate-950/60 p-2"><span className="text-[10px] uppercase text-slate-500">Expected</span><pre className="mt-1 whitespace-pre-wrap font-mono text-[11px] text-emerald-300">{result.expected}</pre></div>
                        <div className="rounded bg-slate-950/60 p-2"><span className="text-[10px] uppercase text-slate-500">Your Output</span><pre className="mt-1 whitespace-pre-wrap font-mono text-[11px] text-slate-200">{result.actual || '(no output)'}</pre></div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}


