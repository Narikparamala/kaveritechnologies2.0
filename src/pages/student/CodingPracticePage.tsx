import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Building2,
  CheckCircle2,
  Code2,
  Filter,
  Flame,
  Loader2,
  Play,
  Search,
  Send,
  Tag,
  XCircle,
} from 'lucide-react';
import { PageHeader } from '../../components/common/PageHeader';
import { Badge } from '../../components/ui/Badge';
import { EmptyState } from '../../components/ui/EmptyState';
import { useToast } from '../../components/ui/Toast';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { runPython } from '../../services/pythonExecution';

const MonacoEditor = lazy(() =>
  import('@monaco-editor/react').then(module => ({ default: module.default })),
);

type Difficulty = 'easy' | 'medium' | 'hard';

type CodingQuestion = {
  id: string;
  title: string;
  slug: string;
  problem_statement: string;
  instructions: string | null;
  input_format: string | null;
  output_format: string | null;
  constraints_text: string | null;
  starter_code: string | null;
  explanation: string | null;
  hints: string[];
  difficulty: Difficulty;
  topic: string;
  subtopic: string | null;
  tags: string[];
  company_tags: string[];
  frequency_score: number;
  default_marks: number;
  is_published: boolean;
};

type QuestionTestCase = {
  id: string;
  question_id: string;
  input_data: string | null;
  expected_output: string;
  is_hidden: boolean;
  weight: number;
  order_index: number;
};

type TestResult = {
  id: string;
  input: string;
  expected: string;
  actual: string;
  hidden: boolean;
  passed: boolean;
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

function codeWithInput(code: string, input: string) {
  return `import sys\nfrom io import StringIO\nsys.stdin = StringIO(${JSON.stringify(input)})\n${code}`;
}

async function executeCode(code: string, input: string) {
  const result = await runPython(codeWithInput(code, input));
  if (!result.success) throw new Error(result.error || 'Code execution failed');
  return normalizeOutput(result.output ?? '');
}

async function executeTest(code: string, testCase: QuestionTestCase): Promise<TestResult> {
  try {
    const actual = await executeCode(code, testCase.input_data ?? '');
    const expected = normalizeOutput(testCase.expected_output);
    return {
      id: testCase.id,
      input: testCase.input_data ?? '',
      expected,
      actual,
      hidden: testCase.is_hidden,
      passed: actual === expected,
    };
  } catch (error) {
    return {
      id: testCase.id,
      input: testCase.input_data ?? '',
      expected: normalizeOutput(testCase.expected_output),
      actual: `Error: ${errorMessage(error)}`,
      hidden: testCase.is_hidden,
      passed: false,
    };
  }
}

export default function CodingPracticePage() {
  const { questionId } = useParams<{ questionId?: string }>();
  const navigate = useNavigate();

  if (questionId) {
    return <QuestionWorkspace questionId={questionId} onBack={() => navigate('/student/coding-practice')} />;
  }

  return <QuestionBank onOpen={id => navigate(`/student/coding-practice/${id}`)} />;
}

function QuestionBank({ onOpen }: { onOpen: (id: string) => void }) {
  const { error: toastError } = useToast();
  const [questions, setQuestions] = useState<CodingQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [difficulty, setDifficulty] = useState('all');
  const [topic, setTopic] = useState('all');

  useEffect(() => {
    let active = true;

    const load = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase.rpc('get_student_coding_questions', {
          p_question_id: null,
        });

        if (error) throw error;
        if (active) setQuestions((data ?? []) as CodingQuestion[]);
      } catch (error) {
        toastError('Could not load coding questions', errorMessage(error));
      } finally {
        if (active) setLoading(false);
      }
    };

    void load();
    return () => { active = false; };
  }, [toastError]);

  const topics = useMemo(
    () => Array.from(new Set(questions.map(question => question.topic))).sort(),
    [questions],
  );

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return questions.filter(question => {
      const matchesSearch = !query || [
        question.title,
        question.problem_statement,
        question.topic,
        question.subtopic ?? '',
        ...question.tags,
        ...question.company_tags,
      ].some(value => value.toLowerCase().includes(query));
      const matchesDifficulty = difficulty === 'all' || question.difficulty === difficulty;
      const matchesTopic = topic === 'all' || question.topic === topic;
      return matchesSearch && matchesDifficulty && matchesTopic;
    });
  }, [questions, search, difficulty, topic]);

  const difficultyBadge = (value: Difficulty) => {
    if (value === 'easy') return <Badge variant="success">Easy</Badge>;
    if (value === 'medium') return <Badge variant="warning">Medium</Badge>;
    return <Badge variant="error">Hard</Badge>;
  };

  return (
    <div className="mx-auto max-w-7xl animate-fade-in p-6 lg:p-8">
      <PageHeader
        title="Coding Practice"
        subtitle="Practice reusable Python questions and prepare for technical interviews"
        icon={Code2}
      />

      <section className="card mb-6 p-4">
        <div className="grid gap-3 lg:grid-cols-[1fr_220px_220px]">
          <label className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input
              className="input w-full pl-10"
              placeholder="Search title, topic, tag or company pattern..."
              value={search}
              onChange={event => setSearch(event.target.value)}
            />
          </label>

          <label className="relative">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
            <select className="input w-full pl-10" value={difficulty} onChange={event => setDifficulty(event.target.value)}>
              <option value="all">All difficulties</option>
              <option value="easy">Easy</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard</option>
            </select>
          </label>

          <select className="input w-full" value={topic} onChange={event => setTopic(event.target.value)}>
            <option value="all">All topics</option>
            {topics.map(item => <option key={item} value={item}>{item}</option>)}
          </select>
        </div>
      </section>

      <div className="mb-4 flex items-center justify-between text-sm text-slate-500 dark:text-slate-400">
        <span>{filtered.length} question{filtered.length === 1 ? '' : 's'}</span>
        <span>Your practice attempts are unlimited</span>
      </div>

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2">
          {[1, 2, 3, 4].map(item => (
            <div key={item} className="h-56 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-800" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={Search} title="No matching questions" description="Try a different search or filter." />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {filtered.map(question => (
            <button
              key={question.id}
              onClick={() => onOpen(question.id)}
              className="card group flex min-h-56 flex-col p-5 text-left transition hover:-translate-y-0.5 hover:border-primary-400 hover:shadow-xl"
            >
              <div className="mb-4 flex items-start justify-between gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary-50 text-primary-600 dark:bg-primary-900/30">
                  <Code2 size={20} />
                </div>
                {difficultyBadge(question.difficulty)}
              </div>

              <h2 className="text-lg font-bold text-slate-900 transition group-hover:text-primary-600 dark:text-white">
                {question.title}
              </h2>
              <p className="mt-2 line-clamp-2 text-sm text-slate-500 dark:text-slate-400">
                {question.problem_statement}
              </p>

              <div className="mt-auto pt-5">
                <div className="flex flex-wrap gap-2 text-xs">
                  <span className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2.5 py-1 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                    <Tag size={12} /> {question.topic}
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-lg bg-orange-50 px-2.5 py-1 text-orange-600 dark:bg-orange-900/20 dark:text-orange-300">
                    <Flame size={12} /> Pattern score {question.frequency_score}
                  </span>
                </div>
                {question.company_tags.length > 0 && (
                  <div className="mt-3 flex items-center gap-2 truncate text-xs text-slate-400">
                    <Building2 size={13} />
                    <span className="truncate">Patterns: {question.company_tags.join(', ')}</span>
                  </div>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function QuestionWorkspace({ questionId, onBack }: { questionId: string; onBack: () => void }) {
  const { profile } = useAuth();
  const { success, error: toastError } = useToast();
  const [question, setQuestion] = useState<CodingQuestion | null>(null);
  const [testCases, setTestCases] = useState<QuestionTestCase[]>([]);
  const [code, setCode] = useState('');
  const [customInput, setCustomInput] = useState('');
  const [customOutput, setCustomOutput] = useState('');
  const [results, setResults] = useState<TestResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;

    const load = async () => {
      setLoading(true);
      try {
        const [questionResponse, testsResponse] = await Promise.all([
          supabase.rpc('get_student_coding_questions', { p_question_id: questionId }),
          supabase
            .from('coding_question_test_cases')
            .select('*')
            .eq('question_id', questionId)
            .eq('is_hidden', false)
            .order('order_index', { ascending: true }),
        ]);

        if (questionResponse.error) throw questionResponse.error;
        if (testsResponse.error) throw testsResponse.error;

        const loadedQuestion = questionResponse.data?.[0] as CodingQuestion | undefined;
        if (!loadedQuestion) throw new Error('Coding question is unavailable.');
        const loadedTests = (testsResponse.data ?? []) as QuestionTestCase[];
        if (!active) return;

        setQuestion(loadedQuestion);
        setTestCases(loadedTests);
        setCode(loadedQuestion.starter_code || '# Write your Python code here\n');
        setCustomInput(loadedTests.find(test => !test.is_hidden)?.input_data ?? '');
      } catch (error) {
        toastError('Could not open question', errorMessage(error));
      } finally {
        if (active) setLoading(false);
      }
    };

    void load();
    return () => { active = false; };
  }, [questionId, toastError]);

  const visibleTests = testCases.filter(test => !test.is_hidden);

  const runCustomInput = async () => {
    if (!code.trim()) return;
    setRunning(true);
    setCustomOutput('Running...');
    try {
      const output = await executeCode(code, customInput);
      setCustomOutput(output || '(Program finished without output)');
    } catch (error) {
      setCustomOutput(`Error: ${errorMessage(error)}`);
    } finally {
      setRunning(false);
    }
  };

  const runSampleTests = async () => {
    if (!code.trim()) return;
    setRunning(true);
    try {
      setResults(await Promise.all(visibleTests.map(test => executeTest(code, test))));
    } finally {
      setRunning(false);
    }
  };

  const submitSolution = async () => {
    if (!question || !code.trim()) return;
    setSubmitting(true);
    try {
      const allResults = await Promise.all(testCases.map(test => executeTest(code, test)));
      setResults(allResults.filter(result => !result.hidden));
      const passed = allResults.filter(result => result.passed).length;
      const visibleTestsPassed = passed === allResults.length && allResults.length > 0;

      if (profile) {
        const { data: previous } = await supabase
          .from('coding_question_attempts')
          .select('attempts_count, first_solved_at')
          .eq('question_id', question.id)
          .eq('student_id', profile.id)
          .maybeSingle();

        const { error } = await supabase.from('coding_question_attempts').upsert({
          question_id: question.id,
          student_id: profile.id,
          submitted_code: code,
          // Browser results are provisional. Verified solved status is reserved
          // for the future isolated grading service or an authorised reviewer.
          status: 'attempted',
          attempts_count: Number(previous?.attempts_count ?? 0) + 1,
          passed_test_cases: 0,
          total_test_cases: 0,
          last_execution_output: allResults.map(result => result.actual).join('\n---\n'),
          first_solved_at: previous?.first_solved_at,
          last_attempted_at: new Date().toISOString(),
        }, { onConflict: 'question_id,student_id' });

        if (error) throw error;
      }

      if (visibleTestsPassed) {
        success('Visible tests passed!', 'Your practice attempt was saved. Verified grading will run securely later.');
      } else {
        toastError('Tests failed', `${allResults.length - passed} of ${allResults.length} test case(s) failed. Change your code and try again.`);
      }
    } catch (error) {
      toastError('Could not submit solution', errorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <div className="flex min-h-[500px] items-center justify-center"><Loader2 className="animate-spin text-primary-500" /></div>;
  }

  if (!question) {
    return <EmptyState icon={XCircle} title="Question not found" description="Return to Coding Practice and select another question." />;
  }

  return (
    <div className="min-h-full bg-slate-50 dark:bg-slate-950">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex min-w-0 items-center gap-3">
          <button onClick={onBack} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" title="Back to question bank">
            <ArrowLeft size={19} />
          </button>
          <div className="min-w-0">
            <h1 className="truncate font-bold text-slate-900 dark:text-white">{question.title}</h1>
            <p className="text-xs text-slate-500">{question.topic} · {question.difficulty}</p>
          </div>
        </div>
        <button disabled={submitting || running} onClick={() => void submitSolution()} className="btn-primary flex items-center gap-2">
          {submitting ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
          Submit
        </button>
      </header>

      <div className="grid min-h-[calc(100vh-150px)] xl:grid-cols-2">
        <section className="overflow-y-auto border-r border-slate-200 p-5 dark:border-slate-800 lg:p-7">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <Badge variant={question.difficulty === 'easy' ? 'success' : question.difficulty === 'medium' ? 'warning' : 'error'}>
              {question.difficulty}
            </Badge>
            <Badge variant="info">{question.default_marks} marks</Badge>
            {question.tags.slice(0, 3).map(item => <Badge key={item} variant="default">{item}</Badge>)}
          </div>

          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">{question.title}</h2>
          <p className="mt-4 whitespace-pre-wrap leading-7 text-slate-700 dark:text-slate-300">{question.problem_statement}</p>

          {question.instructions && <InfoBlock title="Instructions" content={question.instructions} />}
          {question.input_format && <InfoBlock title="Input Format" content={question.input_format} />}
          {question.output_format && <InfoBlock title="Output Format" content={question.output_format} />}
          {question.constraints_text && <InfoBlock title="Constraints" content={question.constraints_text} />}

          {visibleTests.length > 0 && (
            <div className="mt-6">
              <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-500">Examples</h3>
              <div className="space-y-3">
                {visibleTests.map((test, index) => (
                  <div key={test.id} className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
                    <div className="bg-slate-100 px-4 py-2 text-xs font-semibold text-slate-500 dark:bg-slate-800">Example {index + 1}</div>
                    <div className="grid gap-4 p-4 text-sm sm:grid-cols-2">
                      <div><span className="text-xs uppercase text-slate-400">Input</span><pre className="mt-1 whitespace-pre-wrap text-slate-800 dark:text-slate-200">{test.input_data || '(no input)'}</pre></div>
                      <div><span className="text-xs uppercase text-slate-400">Expected</span><pre className="mt-1 whitespace-pre-wrap text-emerald-600">{test.expected_output}</pre></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {question.hints.length > 0 && (
            <details className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/50 dark:bg-amber-900/10">
              <summary className="cursor-pointer font-semibold text-amber-700 dark:text-amber-300">Need a hint?</summary>
              <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-amber-700 dark:text-amber-200">
                {question.hints.map(hint => <li key={hint}>{hint}</li>)}
              </ul>
            </details>
          )}
        </section>

        <section className="flex min-h-[700px] flex-col bg-slate-950">
          <div className="border-b border-slate-800 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Python Editor</div>
          <div className="min-h-[360px] flex-1">
            <Suspense fallback={<div className="flex h-full items-center justify-center text-slate-400">Loading editor...</div>}>
              <MonacoEditor
                height="100%"
                language="python"
                theme="vs-dark"
                value={code}
                onChange={value => setCode(value ?? '')}
                options={{ minimap: { enabled: false }, fontSize: 14, automaticLayout: true, padding: { top: 14 } }}
              />
            </Suspense>
          </div>

          <div className="border-t border-slate-800 bg-slate-900 p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-400">Input, output & tests</span>
              <div className="flex gap-2">
                <button disabled={running} onClick={() => void runSampleTests()} className="btn-secondary flex items-center gap-2 text-sm">
                  {running ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />} Sample Tests
                </button>
                <button disabled={running} onClick={() => void runCustomInput()} className="btn-primary flex items-center gap-2 text-sm">
                  <Play size={14} /> Run Input
                </button>
              </div>
            </div>

            <textarea
              className="input min-h-20 w-full resize-y font-mono text-sm"
              value={customInput}
              onChange={event => setCustomInput(event.target.value)}
              placeholder="Enter custom input here..."
            />

            {customOutput && (
              <div className="mt-3 rounded-xl bg-slate-950 p-3">
                <p className="mb-1 text-xs font-semibold uppercase text-slate-500">Your output</p>
                <pre className="max-h-36 overflow-auto whitespace-pre-wrap text-sm text-slate-100">{customOutput}</pre>
              </div>
            )}

            {results.length > 0 && (
              <div className="mt-3 space-y-2">
                <p className="text-sm text-slate-300">{results.filter(result => result.passed).length} of {results.length} visible tests passed</p>
                {results.map((result, index) => (
                  <div key={result.id} className={`rounded-xl border p-3 text-sm ${result.passed ? 'border-emerald-800 bg-emerald-950/40' : 'border-red-800 bg-red-950/40'}`}>
                    <div className={`mb-2 flex items-center gap-2 font-semibold ${result.passed ? 'text-emerald-400' : 'text-red-400'}`}>
                      {result.passed ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
                      Test {index + 1}: {result.passed ? 'PASSED' : 'FAILED'}
                    </div>
                    {!result.passed && (
                      <div className="grid gap-3 text-xs sm:grid-cols-3">
                        <ResultValue label="Input" value={result.input || '(no input)'} />
                        <ResultValue label="Expected" value={result.expected} />
                        <ResultValue label="Your output" value={result.actual} />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function InfoBlock({ title, content }: { title: string; content: string }) {
  return (
    <div className="mt-6">
      <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-500">{title}</h3>
      <div className="whitespace-pre-wrap rounded-xl bg-slate-100 p-4 text-sm leading-6 text-slate-700 dark:bg-slate-800 dark:text-slate-300">{content}</div>
    </div>
  );
}

function ResultValue({ label, value }: { label: string; value: string }) {
  return <div><span className="text-slate-500">{label}</span><pre className="mt-1 whitespace-pre-wrap text-slate-200">{value}</pre></div>;
}
