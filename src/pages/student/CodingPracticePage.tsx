import { lazy, Suspense, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  Building2,
  CheckCircle2,
  Clock3,
  Code2,
  Cpu,
  Eye,
  EyeOff,
  Filter,
  Flame,
  GripVertical,
  Loader2,
  Play,
  RefreshCw,
  Search,
  Send,
  Tag,
  Terminal,
  XCircle,
} from 'lucide-react';
import { PageHeader } from '../../components/common/PageHeader';
import { Badge } from '../../components/ui/Badge';
import { EmptyState } from '../../components/ui/EmptyState';
import { useToast } from '../../components/ui/Toast';
import { supabase } from '../../lib/supabase';
import {
  getSecureJudgeLanguages,
  securelyGradePractice,
  securelyRunCustom,
  securelyRunSamples,
  type JudgeLanguage,
  type SecureCustomResult,
  type SecurePracticeResult,
  type SecureTestResult,
} from '../../services/secureGrading';

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
  language: string;
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

type ResultTab = 'tests' | 'custom' | 'output';

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && error !== null && 'message' in error) {
    return String(error.message);
  }
  return 'Something went wrong';
}

function languageDetails(name: string) {
  const normalized = name.toLowerCase();
  if (normalized.includes('typescript')) return { monaco: 'typescript', file: 'main.ts', comment: '// ' };
  if (normalized.includes('javascript')) return { monaco: 'javascript', file: 'main.js', comment: '// ' };
  if (normalized.includes('python')) return { monaco: 'python', file: 'main.py', comment: '# ' };
  if (normalized.includes('c++')) return { monaco: 'cpp', file: 'main.cpp', comment: '// ' };
  if (/^c \(/.test(normalized)) return { monaco: 'c', file: 'main.c', comment: '// ' };
  if (normalized.includes('c#')) return { monaco: 'csharp', file: 'Main.cs', comment: '// ' };
  if (normalized.includes('java')) return { monaco: 'java', file: 'Main.java', comment: '// ' };
  if (normalized.includes('kotlin')) return { monaco: 'kotlin', file: 'Main.kt', comment: '// ' };
  if (normalized.includes('go ')) return { monaco: 'go', file: 'main.go', comment: '// ' };
  if (normalized.includes('rust')) return { monaco: 'rust', file: 'main.rs', comment: '// ' };
  if (normalized.includes('ruby')) return { monaco: 'ruby', file: 'main.rb', comment: '# ' };
  if (normalized.includes('php')) return { monaco: 'php', file: 'main.php', comment: '// ' };
  if (normalized.includes('swift')) return { monaco: 'swift', file: 'main.swift', comment: '// ' };
  if (normalized.includes('bash')) return { monaco: 'shell', file: 'main.sh', comment: '# ' };
  if (normalized.includes('sql')) return { monaco: 'sql', file: 'query.sql', comment: '-- ' };
  return { monaco: 'plaintext', file: 'main.txt', comment: '// ' };
}

function starterCodeFor(question: CodingQuestion, language: JudgeLanguage) {
  if (/^Python \(3\./i.test(language.name) && question.starter_code) return question.starter_code;
  return `${languageDetails(language.name).comment}Write your ${language.name} solution here\n`;
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
        subtitle="Solve interview problems in any runtime installed on the Kaveri Judge0 server"
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
  const { success, error: toastError } = useToast();
  const splitContainerRef = useRef<HTMLDivElement>(null);
  const [question, setQuestion] = useState<CodingQuestion | null>(null);
  const [testCases, setTestCases] = useState<QuestionTestCase[]>([]);
  const [languages, setLanguages] = useState<JudgeLanguage[]>([]);
  const [selectedLanguageId, setSelectedLanguageId] = useState<number | null>(null);
  const [codeByLanguage, setCodeByLanguage] = useState<Record<number, string>>({});
  const [code, setCode] = useState('');
  const [customInput, setCustomInput] = useState('');
  const [customOutput, setCustomOutput] = useState('');
  const [customResult, setCustomResult] = useState<SecureCustomResult | null>(null);
  const [results, setResults] = useState<SecureTestResult[]>([]);
  const [finalResult, setFinalResult] = useState<SecurePracticeResult | null>(null);
  const [resultTab, setResultTab] = useState<ResultTab>('tests');
  const [problemPaneWidth, setProblemPaneWidth] = useState(47);
  const [resizing, setResizing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [questionError, setQuestionError] = useState<string | null>(null);
  const [graderError, setGraderError] = useState<string | null>(null);
  const [checkingLanguages, setCheckingLanguages] = useState(false);
  const attemptRef = useRef<{ submitted_code: string | null; language_id: number | null } | null>(null);

  useEffect(() => {
    let active = true;

    const applyGraderLanguages = async (
      loadedQuestion: CodingQuestion,
      previousAttempt: { submitted_code: string | null; language_id: number | null } | null,
      loadedTests: QuestionTestCase[],
    ) => {
      let judgeLanguages: JudgeLanguage[] = [];
      try {
        judgeLanguages = await getSecureJudgeLanguages();
        if (judgeLanguages.length === 0) throw new Error('No grading languages were returned.');
      } catch (error) {
        // The grader is unavailable, but the question itself is fine: keep the
        // problem readable and editable, with runs/submits disabled.
        if (active) setGraderError(errorMessage(error));
        if (active) setLanguages([]);
        if (active) setSelectedLanguageId(null);
        if (active) {
          const pythonStarter = loadedQuestion.language.toLowerCase().startsWith('python')
            ? loadedQuestion.starter_code ?? '# Write your Python solution here\n'
            : loadedQuestion.starter_code ?? '';
          setCode(previousAttempt?.submitted_code ?? pythonStarter);
          setCodeByLanguage({});
          setCustomInput(loadedTests.find(test => !test.is_hidden)?.input_data ?? '');
        }
        return;
      }

      const previousLanguage = judgeLanguages.find(language => language.id === previousAttempt?.language_id);
      const preferredLanguage = previousLanguage
        ?? judgeLanguages.find(language => language.name.toLowerCase().startsWith(loadedQuestion.language.toLowerCase()))
        ?? judgeLanguages.find(language => /^Python \(3\./i.test(language.name))
        ?? judgeLanguages[0];
      if (!preferredLanguage) {
        if (active) setGraderError('No compatible grading language is available.');
        if (active) { setLanguages([]); setSelectedLanguageId(null); }
        return;
      }
      if (!active) return;

      setLanguages(judgeLanguages);
      setSelectedLanguageId(preferredLanguage.id);
      const initialCode = (previousLanguage && previousAttempt?.submitted_code)
        || starterCodeFor(loadedQuestion, preferredLanguage);
      setCode(initialCode);
      setCodeByLanguage({ [preferredLanguage.id]: initialCode });
      setCustomInput(loadedTests.find(test => !test.is_hidden)?.input_data ?? '');
    };

    const load = async () => {
      setLoading(true);
      setNotFound(false);
      setQuestionError(null);
      setGraderError(null);
      try {
        // Phase 1 - safe question content. Only the safe RPC deciding there is
        // no such question may produce a "Question not found" state.
        const [questionResponse, testsResponse, attemptResponse] = await Promise.all([
          supabase.rpc('get_student_coding_questions', { p_question_id: questionId }),
          supabase
            .from('coding_question_test_cases')
            .select('*')
            .eq('question_id', questionId)
            .eq('is_hidden', false)
            .order('order_index', { ascending: true }),
          supabase
            .from('coding_question_attempts')
            .select('submitted_code,language_id')
            .eq('question_id', questionId)
            .maybeSingle(),
        ]);

        if (questionResponse.error) throw questionResponse.error;
        if (testsResponse.error) throw testsResponse.error;
        if (attemptResponse.error) throw attemptResponse.error;

        const loadedQuestion = questionResponse.data?.[0] as CodingQuestion | undefined;
        if (!loadedQuestion) {
          if (active) { setNotFound(true); setQuestion(null); }
          return;
        }
        const loadedTests = (testsResponse.data ?? []) as QuestionTestCase[];
        const previousAttempt = attemptResponse.data as { submitted_code: string | null; language_id: number | null } | null;
        attemptRef.current = previousAttempt;
        if (!active) return;

        setQuestion(loadedQuestion);
        setTestCases(loadedTests);

        // Phase 2 - grader/language discovery is best-effort and must never
        // prevent the question itself from rendering.
        await applyGraderLanguages(loadedQuestion, previousAttempt, loadedTests);
      } catch (error) {
        if (!active) return;
        setQuestion(null);
        setQuestionError(errorMessage(error));
      } finally {
        if (active) setLoading(false);
      }
    };

    void load();
    return () => { active = false; };
  }, [questionId, toastError]);

  const retryGrader = async () => {
    if (!question || checkingLanguages) return;
    setCheckingLanguages(true);
    setGraderError(null);
    try {
      const judgeLanguages = await getSecureJudgeLanguages();
      if (judgeLanguages.length === 0) throw new Error('No grading languages were returned.');
      const previousAttempt = attemptRef.current;
      const previousLanguage = judgeLanguages.find(language => language.id === previousAttempt?.language_id);
      const preferredLanguage = previousLanguage
        ?? judgeLanguages.find(language => language.name.toLowerCase().startsWith(question.language.toLowerCase()))
        ?? judgeLanguages.find(language => /^Python \(3\./i.test(language.name))
        ?? judgeLanguages[0];
      if (!preferredLanguage) throw new Error('No compatible grading language is available.');
      setLanguages(judgeLanguages);
      setSelectedLanguageId(preferredLanguage.id);
      // Keep whatever code the student already sees or typed.
      setCodeByLanguage(current => ({ ...current, [preferredLanguage.id]: code }));
    } catch (error) {
      setGraderError(errorMessage(error));
      setLanguages([]);
      setSelectedLanguageId(null);
    } finally {
      setCheckingLanguages(false);
    }
  };

  useEffect(() => {
    if (!resizing) return;

    const handlePointerMove = (event: PointerEvent) => {
      const container = splitContainerRef.current;
      if (!container) return;
      const bounds = container.getBoundingClientRect();
      const nextWidth = ((event.clientX - bounds.left) / bounds.width) * 100;
      setProblemPaneWidth(Math.min(70, Math.max(30, nextWidth)));
    };
    const stopResizing = () => setResizing(false);

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', stopResizing, { once: true });

    return () => {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', stopResizing);
    };
  }, [resizing]);

  const visibleTests = testCases.filter(test => !test.is_hidden);
  const selectedLanguage = languages.find(language => language.id === selectedLanguageId) ?? null;
  // When the grader is unavailable we still render a Python workspace (the
  // practice bank is Python) so the problem stays readable and editable.
  const displayLanguage = selectedLanguage
    ?? ((!languages.length && !!question && question.language.toLowerCase().startsWith('python'))
      ? { id: 0, name: 'Python (3.x)' }
      : null);
  const editorLanguage = languageDetails(displayLanguage?.name ?? 'Plain Text');

  const changeLanguage = (nextLanguageId: number) => {
    if (!question || nextLanguageId === selectedLanguageId) return;
    const nextLanguage = languages.find(language => language.id === nextLanguageId);
    if (!nextLanguage) return;

    const nextCodes = selectedLanguageId == null
      ? codeByLanguage
      : { ...codeByLanguage, [selectedLanguageId]: code };
    const nextCode = nextCodes[nextLanguageId] ?? starterCodeFor(question, nextLanguage);
    setCodeByLanguage({ ...nextCodes, [nextLanguageId]: nextCode });
    setSelectedLanguageId(nextLanguageId);
    setCode(nextCode);
    setResults([]);
    setFinalResult(null);
    setCustomOutput('');
    setCustomResult(null);
    setResultTab('tests');
  };

  const runCustomInput = async () => {
    if (!code.trim() || !selectedLanguageId) return;
    setRunning(true);
    setFinalResult(null);
    setCustomResult(null);
    setResultTab('output');
    setCustomOutput('Running...');
    try {
      const response = await securelyRunCustom(code, customInput, selectedLanguageId);
      setCustomResult(response);
      const output = response.result.passed
        ? response.result.actual
        : response.result.stderr || response.result.actual || statusLabel(response.result.status);
      setCustomOutput(output || '(Program finished without output)');
    } catch (error) {
      setCustomResult(null);
      setCustomOutput(`Error: ${errorMessage(error)}`);
    } finally {
      setRunning(false);
    }
  };

  const runSampleTests = async () => {
    if (!question || !code.trim() || !selectedLanguageId) return;
    setRunning(true);
    setFinalResult(null);
    setCustomResult(null);
    setResults([]);
    setResultTab('tests');
    try {
      const response = await securelyRunSamples(question.id, code, selectedLanguageId);
      setResults(response.tests.filter(test => !test.hidden));
    } catch (error) {
      toastError('Sample tests could not run', errorMessage(error));
      setCustomOutput(`Sample test error: ${errorMessage(error)}`);
      setResultTab('output');
    } finally {
      setRunning(false);
    }
  };

  const submitSolution = async () => {
    if (!question || !code.trim() || !selectedLanguageId) return;
    setSubmitting(true);
    setFinalResult(null);
    setCustomResult(null);
    setResultTab('tests');
    try {
      const result = await securelyGradePractice(question.id, code, selectedLanguageId);
      setFinalResult(result);
      if (result.allPassed) {
        success('Solution verified!', 'All visible and hidden tests passed securely.');
      } else {
        toastError('Final tests failed', `${result.total - result.passed} final test case(s) failed. Hidden test details remain protected.`);
      }
    } catch (error) {
      toastError('Could not securely grade solution', errorMessage(error));
      setCustomOutput(`Secure grading error: ${errorMessage(error)}`);
      setResultTab('output');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <div className="flex h-screen items-center justify-center bg-slate-950"><Loader2 className="animate-spin text-primary-500" /></div>;
  }

  if (questionError) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 bg-slate-950">
        <EmptyState icon={AlertTriangle} title="Could not open question" description={questionError} />
        <button onClick={onBack} className="btn-secondary">Back to Coding Practice</button>
      </div>
    );
  }

  if (!question) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 bg-slate-950">
        <EmptyState
          icon={XCircle}
          title={notFound ? 'Question not found' : 'Question unavailable'}
          description={notFound ? 'This question may have been unpublished. Return to Coding Practice and select another question.' : 'Return to Coding Practice and select another question.'}
        />
        <button onClick={onBack} className="btn-secondary">Back to Coding Practice</button>
      </div>
    );
  }

  return (
    <div className="flex h-screen min-h-0 flex-col overflow-hidden bg-slate-50 dark:bg-slate-950">
      <header className="z-10 flex h-14 flex-none items-center justify-between border-b border-slate-200 bg-white px-3 dark:border-slate-800 dark:bg-slate-900 sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <button onClick={onBack} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" title="Back to question bank">
            <ArrowLeft size={19} />
          </button>
          <div className="min-w-0">
            <h1 className="truncate font-bold text-slate-900 dark:text-white">{question.title}</h1>
            <p className="text-xs text-slate-500">{question.topic} · {question.difficulty} · {editorLanguage.file}</p>
          </div>
        </div>
        <button disabled={submitting || running || !selectedLanguageId} onClick={() => void submitSolution()} className="btn-primary flex items-center gap-2 !px-4 !py-2 text-sm">
          {submitting ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
          Submit
        </button>
      </header>

      {graderError && (
        <div className="flex items-start gap-2.5 border-b border-amber-800/60 bg-amber-950/40 px-4 py-2.5 text-xs text-amber-200">
          <AlertTriangle size={15} className="mt-0.5 flex-none text-amber-400" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold">Secure grading is currently unavailable.</p>
            <p className="mt-0.5">You can still read the problem and edit your code, but running and submitting are disabled until grading is back.</p>
            <p className="mt-0.5 break-words text-amber-300/80">{graderError}</p>
          </div>
          <button
            onClick={() => void retryGrader()}
            disabled={checkingLanguages}
            className="flex flex-none items-center gap-1.5 rounded-lg border border-amber-700/60 px-2.5 py-1.5 font-semibold text-amber-200 transition hover:bg-amber-800/40 disabled:opacity-60"
          >
            {checkingLanguages ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
            Retry
          </button>
        </div>
      )}

      <div
        ref={splitContainerRef}
        style={{ '--problem-pane-width': `${problemPaneWidth}%` } as CSSProperties}
        className="grid min-h-0 flex-1 grid-rows-[minmax(420px,auto)_minmax(720px,auto)] overflow-y-auto lg:grid-cols-[var(--problem-pane-width)_7px_minmax(0,1fr)] lg:grid-rows-1 lg:overflow-hidden"
      >
        <section className="overflow-y-auto p-5 lg:p-7">
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

        <button
          type="button"
          role="separator"
          aria-label="Resize problem and editor panes"
          aria-orientation="vertical"
          aria-valuemin={30}
          aria-valuemax={70}
          aria-valuenow={Math.round(problemPaneWidth)}
          onPointerDown={() => setResizing(true)}
          onKeyDown={event => {
            if (event.key === 'ArrowLeft') setProblemPaneWidth(width => Math.max(30, width - 2));
            if (event.key === 'ArrowRight') setProblemPaneWidth(width => Math.min(70, width + 2));
          }}
          className="group relative hidden cursor-col-resize items-center justify-center border-x border-slate-300 bg-slate-200 outline-none hover:bg-primary-500 focus-visible:bg-primary-500 dark:border-slate-700 dark:bg-slate-800 lg:flex"
        >
          <span className="absolute flex h-12 w-5 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-500 shadow-sm group-hover:border-primary-400 group-hover:text-primary-600 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-400">
            <GripVertical size={14} />
          </span>
        </button>

        <section className="flex min-h-[720px] min-w-0 flex-col bg-slate-950 lg:min-h-0">
          <div className="flex h-11 flex-none items-center justify-between border-b border-slate-800 px-4">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-300">
              <Terminal size={14} className="text-primary-400" />
              <span>{editorLanguage.file}</span>
            </div>
            <label className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              <span className="hidden sm:inline">Language</span>
              <select
                value={selectedLanguageId ?? ''}
                disabled={!languages.length || running || submitting}
                onChange={event => changeLanguage(Number(event.target.value))}
                className="max-w-64 rounded-md border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs font-medium normal-case tracking-normal text-slate-200 outline-none focus:border-primary-500"
                aria-label="Programming language"
              >
                {languages.length === 0 && (
                  <option value="">{checkingLanguages ? 'Checking languages…' : graderError ? 'Grading unavailable' : 'Loading languages…'}</option>
                )}
                {languages.map(language => <option key={language.id} value={language.id}>{language.name}</option>)}
              </select>
            </label>
          </div>
          <div className="min-h-[320px] flex-1 lg:min-h-0">
            <Suspense fallback={<div className="flex h-full items-center justify-center text-slate-400">Loading editor...</div>}>
              <MonacoEditor
                height="100%"
                language={editorLanguage.monaco}
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

          <div className="flex h-[390px] min-h-[300px] flex-none flex-col border-t border-slate-800 bg-slate-900 lg:h-[44%]">
            <div className="flex flex-none flex-wrap items-center justify-between gap-2 border-b border-slate-800 px-3 py-2">
              <div className="flex items-center gap-1" role="tablist" aria-label="Code execution panels">
                <PanelTab active={resultTab === 'tests'} onClick={() => setResultTab('tests')}>
                  Test Results
                  {(finalResult || results.length > 0) && (
                    <span className="rounded bg-slate-700 px-1.5 py-0.5 text-[10px]">
                      {finalResult?.total ?? results.length}
                    </span>
                  )}
                </PanelTab>
                <PanelTab active={resultTab === 'custom'} onClick={() => setResultTab('custom')}>Input</PanelTab>
                <PanelTab active={resultTab === 'output'} onClick={() => setResultTab('output')}>Output</PanelTab>
              </div>
              <div className="flex gap-2">
                <button disabled={running || submitting || visibleTests.length === 0 || !selectedLanguageId} onClick={() => void runSampleTests()} className="btn-secondary flex items-center gap-2 !px-3 !py-1.5 text-xs">
                  {running ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />} Run Sample Tests
                </button>
                <button disabled={running || submitting || !selectedLanguageId} onClick={() => void runCustomInput()} className="btn-primary flex items-center gap-2 !px-3 !py-1.5 text-xs">
                  {running ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />} Run Input
                </button>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              {resultTab === 'tests' && (
                <TestResultsPanel
                  finalResult={finalResult}
                  sampleResults={results}
                  running={running}
                  submitting={submitting}
                  maxScore={question.default_marks}
                />
              )}

              {resultTab === 'custom' && (
                <div className="flex h-full min-h-48 flex-col gap-3">
                  <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400" htmlFor="practice-custom-input">
                    Standard input
                  </label>
                  <textarea
                    id="practice-custom-input"
                    className="min-h-28 flex-1 resize-none rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-sm text-slate-100 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20"
                    value={customInput}
                    onChange={event => setCustomInput(event.target.value)}
                    placeholder={'Enter input exactly as the program should receive it.\nExample:\n5\n7'}
                  />
                  <div className="flex justify-end">
                    <button disabled={running || submitting || !selectedLanguageId} onClick={() => void runCustomInput()} className="btn-primary flex items-center gap-2 !px-4 !py-2 text-xs">
                      {running ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}
                      Execute Code
                    </button>
                  </div>
                </div>
              )}

              {resultTab === 'output' && (
                <div className="h-full rounded-lg border border-slate-800 bg-slate-950 p-3">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                      <Terminal size={13} /> Program output
                    </div>
                    {customResult && (
                      <div className="flex items-center gap-3 text-[11px] text-slate-400">
                        <span className={customResult.result.passed ? 'text-emerald-400' : 'text-red-400'}>
                          {statusLabel(customResult.result.status)}
                        </span>
                        {customResult.result.timeMs != null && <span>{customResult.result.timeMs} ms</span>}
                        {customResult.result.memoryKb != null && <span>{customResult.result.memoryKb} KB</span>}
                      </div>
                    )}
                  </div>
                  <pre className="max-h-full overflow-auto whitespace-pre-wrap font-mono text-sm text-slate-100">
                    {customOutput || 'Run with custom input to see stdout and errors here.'}
                  </pre>
                </div>
              )}
            </div>
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

function PanelTab({ active, children, onClick }: { active: boolean; children: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition ${active ? 'bg-slate-700 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'}`}
    >
      {children}
    </button>
  );
}

function TestResultsPanel({
  finalResult,
  sampleResults,
  running,
  submitting,
  maxScore,
}: {
  finalResult: SecurePracticeResult | null;
  sampleResults: SecureTestResult[];
  running: boolean;
  submitting: boolean;
  maxScore: number;
}) {
  if (running || submitting) {
    return (
      <div className="flex h-full min-h-44 flex-col items-center justify-center gap-3 text-slate-400" role="status">
        <Loader2 size={24} className="animate-spin text-primary-400" />
        <p className="text-sm">{submitting ? 'Running visible and protected hidden tests…' : 'Running sample tests…'}</p>
      </div>
    );
  }

  if (finalResult) {
    return <SecureFinalResults result={finalResult} maxScore={maxScore} />;
  }

  if (sampleResults.length > 0) {
    const passed = sampleResults.filter(result => result.passed).length;
    return (
      <div className="space-y-3">
        <ResultSummary
          passed={passed}
          total={sampleResults.length}
          title={passed === sampleResults.length ? 'All sample tests passed' : 'Some sample tests failed'}
          description="These are the visible examples from the question. Submit to run the complete protected test set."
        />
        {sampleResults.map((result, index) => (
          <VisibleTestCard
            key={result.id}
            label={`Sample Test ${index + 1}`}
            passed={result.passed}
            input={result.input ?? ''}
            expected={result.expected ?? ''}
            actual={result.actual || result.stderr || ''}
            status={result.status}
            timeMs={result.timeMs}
            memoryKb={result.memoryKb}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-44 flex-col items-center justify-center text-center text-slate-500">
      <CheckCircle2 size={28} className="mb-3 text-slate-600" />
      <p className="text-sm font-medium text-slate-300">No test run yet</p>
      <p className="mt-1 max-w-sm text-xs leading-5">Run Sample Tests to compare expected and actual output, or Submit to run all visible and hidden tests securely.</p>
    </div>
  );
}

function SecureFinalResults({ result, maxScore }: { result: SecurePracticeResult; maxScore: number }) {
  let visibleIndex = 0;
  let hiddenIndex = 0;

  return (
    <div className="space-y-3" aria-live="polite">
      <ResultSummary
        passed={result.passed}
        total={result.total}
        title={result.allPassed ? 'All test cases passed' : 'Final test cases failed'}
        description={result.allPassed
          ? 'Your solution passed every visible and protected hidden test.'
          : 'Review the visible results below. Hidden test data remains protected.'}
      >
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
          <Metric label="Visible" value={`${result.visiblePassed}/${result.visibleTotal}`} />
          <Metric label="Hidden" value={`${result.hiddenPassed}/${result.hiddenTotal}`} />
          <Metric label="Score" value={`${result.score}/${maxScore}`} />
          <Metric label="Peak time" value={`${result.maxTimeMs} ms`} />
          <Metric label="Peak memory" value={`${result.maxMemoryKb} KB`} />
        </div>
      </ResultSummary>

      {result.tests.map(test => {
        const displayIndex = test.hidden ? ++hiddenIndex : ++visibleIndex;
        return <SecureTestCard key={test.id} test={test} displayIndex={displayIndex} />;
      })}
    </div>
  );
}

function ResultSummary({
  passed,
  total,
  title,
  description,
  children,
}: {
  passed: number;
  total: number;
  title: string;
  description: string;
  children?: ReactNode;
}) {
  const allPassed = total > 0 && passed === total;
  return (
    <div className={`rounded-xl border p-3 ${allPassed ? 'border-emerald-700/60 bg-emerald-950/30' : 'border-red-700/60 bg-red-950/30'}`}>
      <div className="flex items-start gap-3">
        {allPassed
          ? <CheckCircle2 size={20} className="mt-0.5 flex-none text-emerald-400" />
          : <AlertTriangle size={20} className="mt-0.5 flex-none text-red-400" />}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className={`font-semibold ${allPassed ? 'text-emerald-300' : 'text-red-300'}`}>{title}</p>
            <span className="text-xs font-semibold text-slate-300">{passed} of {total} passed</span>
          </div>
          <p className="mt-1 text-xs leading-5 text-slate-400">{description}</p>
          {children}
        </div>
      </div>
    </div>
  );
}

function SecureTestCard({ test, displayIndex }: { test: SecureTestResult; displayIndex: number }) {
  const label = test.hidden ? `Hidden Test ${displayIndex}` : `Visible Test ${displayIndex}`;
  return (
    <div className={`rounded-xl border p-3 ${test.passed ? 'border-emerald-800/70 bg-emerald-950/20' : 'border-red-800/70 bg-red-950/20'}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className={`flex items-center gap-2 text-sm font-semibold ${test.passed ? 'text-emerald-400' : 'text-red-400'}`}>
          {test.hidden ? <EyeOff size={15} /> : <Eye size={15} />}
          {label}: {test.passed ? 'PASSED' : statusLabel(test.status)}
        </div>
        <div className="flex gap-3 text-[11px] text-slate-500">
          {test.timeMs != null && <span className="flex items-center gap-1"><Clock3 size={11} />{test.timeMs} ms</span>}
          {test.memoryKb != null && <span className="flex items-center gap-1"><Cpu size={11} />{test.memoryKb} KB</span>}
        </div>
      </div>

      {test.hidden ? (
        <p className="mt-2 text-xs text-slate-500">Input, expected output, and actual output are hidden to protect the final assessment.</p>
      ) : (
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <ResultValue label="Input" value={test.input || '(no input)'} />
          <ResultValue label="Expected" value={test.expected || '(no output)'} />
          <ResultValue label="Your Output" value={test.actual || test.stderr || '(no output)'} tone={test.passed ? 'success' : 'error'} />
        </div>
      )}
    </div>
  );
}

function VisibleTestCard({
  label,
  passed,
  input,
  expected,
  actual,
  status,
  timeMs,
  memoryKb,
}: {
  label: string;
  passed: boolean;
  input: string;
  expected: string;
  actual: string;
  status: SecureTestResult['status'];
  timeMs: number | null;
  memoryKb: number | null;
}) {
  return (
    <div className={`rounded-xl border p-3 ${passed ? 'border-emerald-800/70 bg-emerald-950/20' : 'border-red-800/70 bg-red-950/20'}`}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className={`flex items-center gap-2 text-sm font-semibold ${passed ? 'text-emerald-400' : 'text-red-400'}`}>
          {passed ? <CheckCircle2 size={15} /> : <XCircle size={15} />}
          {label}: {passed ? 'PASSED' : statusLabel(status)}
        </div>
        <div className="flex gap-3 text-[11px] text-slate-500">
          {timeMs != null && <span className="flex items-center gap-1"><Clock3 size={11} />{timeMs} ms</span>}
          {memoryKb != null && <span className="flex items-center gap-1"><Cpu size={11} />{memoryKb} KB</span>}
        </div>
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        <ResultValue label="Input" value={input || '(no input)'} />
        <ResultValue label="Expected" value={expected || '(no output)'} />
        <ResultValue label="Your Output" value={actual || '(no output)'} tone={passed ? 'success' : 'error'} />
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-950/50 px-2.5 py-2">
      <p className="text-[10px] uppercase tracking-wider text-slate-500">{label}</p>
      <p className="mt-0.5 text-xs font-semibold text-slate-200">{value}</p>
    </div>
  );
}

function statusLabel(status: SecureTestResult['status']) {
  return ({
    accepted: 'PASSED',
    wrong_answer: 'WRONG ANSWER',
    time_limit: 'TIME LIMIT',
    memory_limit: 'MEMORY LIMIT',
    output_limit: 'OUTPUT LIMIT',
    compile_error: 'COMPILATION ERROR',
    runtime_error: 'RUNTIME ERROR',
    internal_error: 'JUDGE ERROR',
    execution_error: 'EXECUTION ERROR',
  } as const)[status];
}

function ResultValue({ label, value, tone = 'default' }: { label: string; value: string; tone?: 'default' | 'success' | 'error' }) {
  const toneClass = tone === 'success' ? 'text-emerald-300' : tone === 'error' ? 'text-red-300' : 'text-slate-200';
  return (
    <div className="min-w-0 rounded-lg border border-slate-800 bg-slate-950/70 p-2.5">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{label}</span>
      <pre className={`mt-1 max-h-28 overflow-auto whitespace-pre-wrap break-words font-mono text-xs ${toneClass}`}>{value}</pre>
    </div>
  );
}
