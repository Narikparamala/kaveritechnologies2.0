import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Upload, FileText, ListChecks, Presentation, Download, CheckCircle2, XCircle, Loader2, Sparkles, Wand2, ArrowLeft, ExternalLink } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { getSecureJudgeLanguages } from '../../services/secureGrading';
import { getCourseChapters, getChapterLessonsAll } from '../../services/faculty';
import {
  QUESTIONS_CSV_TEMPLATE,
  QUIZZES_CSV_TEMPLATE,
  LESSONS_CSV_TEMPLATE,
  parseQuestionRows,
  parseQuizRows,
  parseLessonRows,
  parseSlidePracticeBlocks,
  validateQuestionRows,
  importValidatedQuestions,
  importQuizRows,
  importLessonRows,
  slugify,
  type ImportIssue,
  type ImportSummary,
  type QuestionRow,
  type QuizRow,
  type ValidatedQuestion,
} from '../../lib/contentImport';

type Tab = 'slides' | 'questions' | 'quizzes' | 'lessons' | 'ai';

const TABS: { id: Tab; label: string; icon: typeof FileText; description: string }[] = [
  { id: 'slides', label: 'Slides → Practice', icon: Wand2, description: 'Paste a lesson\'s slide content — every "Practice time" block becomes a validated coding question, plus an optional MCQ quiz, all attached to the lesson as drafts.' },
  { id: 'questions', label: 'Coding Questions', icon: FileText, description: 'One CSV = a full question bank. Every question is auto-validated by executing its reference solution before import.' },
  { id: 'quizzes', label: 'Quizzes', icon: ListChecks, description: 'One CSV = MCQ / true-false / short-answer quizzes, grouped by quiz title. Imported as drafts for review.' },
  { id: 'lessons', label: 'Lessons + Slides', icon: Presentation, description: 'One CSV = chapters, lessons, and slide/video materials. Canva links are resolved and embedded automatically.' },
  { id: 'ai', label: 'AI Drafts', icon: Sparkles, description: 'Describe a topic — the AI drafts questions with solutions and tests. Drafts go through the same validation before import; nothing publishes itself.' },
];

function downloadTemplate(content: string, filename: string) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function IssueList({ issues }: { issues: ImportIssue[] }) {
  if (issues.length === 0) return null;
  return (
    <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
      <p className="font-semibold">Row issues ({issues.length})</p>
      <ul className="mt-1 max-h-40 space-y-1 overflow-y-auto">
        {issues.map((issue, i) => (
          <li key={i}>
            Row {issue.row} · {issue.title}: {issue.message}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function ContentImportPage() {
  const [tab, setTab] = useState<Tab>('slides');
  const [csv, setCsv] = useState('');
  const [courseId, setCourseId] = useState('');
  const [courses, setCourses] = useState<{ id: string; title: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [progressLabel, setProgressLabel] = useState('');
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [validated, setValidated] = useState<ValidatedQuestion[] | null>(null);
  const [fatal, setFatal] = useState('');
  const [profile, setProfile] = useState<{ id: string; role: string } | null>(null);
  const [aiTopic, setAiTopic] = useState('');
  const [aiCount, setAiCount] = useState(5);
  const [aiDifficulty, setAiDifficulty] = useState<'easy' | 'medium' | 'hard' | 'mixed'>('mixed');
  const [aiBusy, setAiBusy] = useState(false);

  // Slides → Practice state
  const [slidesStage, setSlidesStage] = useState<'pick' | 'generated'>('pick');
  const [slidesBackup, setSlidesBackup] = useState('');
  const [chapters, setChapters] = useState<{ id: string; title: string }[]>([]);
  const [chapterId, setChapterId] = useState('');
  const [lessons, setLessons] = useState<{ id: string; title: string; chapter_id: string | null }[]>([]);
  const [lessonId, setLessonId] = useState('');
  const [includeQuiz, setIncludeQuiz] = useState(true);
  const [draftRows, setDraftRows] = useState<QuestionRow[] | null>(null);
  const [pendingQuizRows, setPendingQuizRows] = useState<QuizRow[]>([]);
  const [slidesSummary, setSlidesSummary] = useState<{ created: number; quizCreated: number; failed: number; lessonTitle: string; chapterTitle: string } | null>(null);
  const [genWarning, setGenWarning] = useState('');

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) return;
      supabase
        .from('profiles')
        .select('id, role')
        .eq('id', data.user.id)
        .single()
        .then(({ data: p }) => setProfile(p ? { id: p.id, role: p.role } : null));
    });
  }, []);

  useEffect(() => {
    supabase
      .from('courses')
      .select('id, title')
      .order('created_at', { ascending: false })
      .limit(200)
      .then(({ data }) => setCourses(data ?? []));
  }, []);

  // Slide pickers: chapters follow the course, lessons follow the chapter.
  useEffect(() => {
    setChapters([]); setChapterId(''); setLessons([]); setLessonId('');
    if (!courseId) return;
    let cancelled = false;
    getCourseChapters(courseId)
      .then(chs => { if (!cancelled) setChapters(chs.map(c => ({ id: c.id, title: c.title }))); })
      .catch(() => { if (!cancelled) setChapters([]); });
    return () => { cancelled = true; };
  }, [courseId]);

  useEffect(() => {
    setLessons([]); setLessonId('');
    if (!chapterId) return;
    let cancelled = false;
    getChapterLessonsAll(chapterId)
      .then(ls => { if (!cancelled) setLessons(ls.map(l => ({ id: l.id, title: l.title, chapter_id: l.chapter_id }))); })
      .catch(() => { if (!cancelled) setLessons([]); });
    return () => { cancelled = true; };
  }, [chapterId]);

  const reset = useCallback(() => {
    setSummary(null);
    setValidated(null);
    setFatal('');
    setProgressLabel('');
    setSlidesSummary(null);
  }, []);

  const isStaff = profile?.role === 'admin' || profile?.role === 'faculty' || profile?.role === 'super_admin';

  const handleFile = (file: File) => {
    reset();
    const reader = new FileReader();
    reader.onload = () => {
      setCsv(String(reader.result ?? ''));
      setSlidesStage('pick');
    };
    reader.readAsText(file);
  };

  const slideStats = useMemo(
    () => parseSlidePracticeBlocks(slidesStage === 'generated' ? slidesBackup : csv),
    [slidesStage, slidesBackup, csv],
  );

  const validateQuestions = useCallback(async () => {
    setBusy(true);
    reset();
    try {
      // In the slides flow the drafts arrive as structured rows already — only
      // the plain CSV tabs need parsing.
      const usingDrafts = slidesStage === 'generated' && draftRows !== null && draftRows.length > 0;
      const { rows, issues } = usingDrafts ? { rows: draftRows, issues: [] as ImportIssue[] } : parseQuestionRows(csv);
      if (rows.length === 0) {
        setFatal(issues[0]?.message ?? 'No valid rows found in the CSV.');
        setSummary({ created: 0, failed: 0, issues });
        return;
      }
      // The active grading backend decides the valid language id (901 builtin,
      // 71 go-judge, Judge0 ids otherwise) — ask it rather than guessing.
      const languages = await getSecureJudgeLanguages();
      const python = languages.find(l => /^Python/i.test(l.name));
      if (!python) throw new Error('No Python runtime available on the grading runner.');
      const languageId = python.id;
      const results = await validateQuestionRows(rows, languageId, (done, total, title) =>
        setProgressLabel(`Validating ${done}/${total}: ${title}`),
      );
      setValidated(results);
      setSummary({
        created: 0,
        failed: results.filter(r => !r.ok).length,
        issues: [...issues, ...results.filter(r => !r.ok).map(r => ({ row: r.row.rowNumber, title: r.row.title, message: r.error ?? 'Validation failed' }))],
      });
    } catch (e) {
      setFatal(e instanceof Error ? e.message : 'Validation failed.');
    } finally {
      setBusy(false);
    }
  }, [csv, reset, slidesStage, draftRows]);

  const generateFromSlides = useCallback(async () => {
    if (!csv.trim() || !lessonId) return;
    setBusy(true);
    reset();
    setGenWarning('');
    setProgressLabel('Reading the slides and drafting questions…');
    try {
      const lesson = lessons.find(l => l.id === lessonId);
      const chapter = chapters.find(c => c.id === lesson?.chapter_id);
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error('Session expired — please sign in again.');
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-from-slides`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({
          slides: csv,
          chapterLabel: chapter?.title ?? '',
          lessonLabel: lesson?.title ?? '',
          includeQuiz,
        }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? `Generation failed (${res.status})`);
      const rawQuestions = Array.isArray(body?.questions) ? body.questions : [];
      if (rawQuestions.length === 0) throw new Error('The AI returned no questions.');
      const rows: QuestionRow[] = rawQuestions
        .map((q: any, i: number) => ({
          rowNumber: i + 1,
          title: String(q.title ?? '').trim(),
          slug: slugify(String(q.title ?? 'question')),
          problemStatement: String(q.problemStatement ?? '').trim(),
          inputFormat: String(q.inputFormat ?? '').trim(),
          outputFormat: String(q.outputFormat ?? '').trim(),
          starterCode: '',
          referenceSolution: String(q.referenceSolution ?? '').replace(/\r\n/g, '\n').trim(),
          explanation: String(q.explanation ?? '').trim(),
          hints: Array.isArray(q.hints) ? q.hints.map((h: unknown) => String(h)).filter(Boolean) : [],
          difficulty: q.difficulty === 'medium' ? 'medium' : q.difficulty === 'hard' ? 'hard' : 'easy',
          topic: String(q.topic ?? '').trim() || 'Python Basics',
          subtopic: String(q.subtopic ?? '').trim(),
          defaultMarks: 10,
          publish: false,
          tests: Array.isArray(q.tests)
            ? q.tests
                .map((t: any) => ({
                  input: String(t.input ?? '').replace(/\r\n/g, '\n'),
                  expected: String(t.expected ?? '').replace(/\r\n/g, '\n').trimEnd(),
                  hidden: t.hidden === true,
                  weight: 1,
                }))
                .filter((t: any) => t.expected !== '')
            : [],
        }))
        .filter((r: QuestionRow) => r.title && r.problemStatement && r.referenceSolution && r.tests.length > 0);
      if (rows.length === 0) throw new Error('The AI returned no usable questions. Try again.');
      const quizTitle = `${lesson?.title ?? 'Lesson'} Practice Quiz`;
      const quizRows: QuizRow[] = Array.isArray(body?.quiz?.questions)
        ? body.quiz.questions
            .map((q: any, i: number) => ({
              rowNumber: i + 1,
              quizTitle,
              questionText: String(q.questionText ?? '').trim(),
              questionType: 'mcq' as const,
              options: Array.isArray(q.options)
                ? q.options.map((o: any) => ({ text: String(o?.text ?? '').trim(), correct: o?.correct === true }))
                : [],
              explanation: String(q.explanation ?? '').trim(),
              points: 1,
            }))
            .filter((r: QuizRow) => r.questionText && r.options.length >= 2 && r.options.some(o => o.correct))
        : [];
      setSlidesBackup(csv);
      setDraftRows(rows);
      setPendingQuizRows(quizRows);
      setCsv(rows.map(r => `✓ ${r.title} — ${r.difficulty} · ${r.tests.length} test${r.tests.length === 1 ? '' : 's'}\n   ${r.problemStatement}`).join('\n\n'));
      setSlidesStage('generated');
      if (body.warning) setGenWarning(body.warning);
    } catch (e) {
      setFatal(e instanceof Error ? e.message : 'Generation failed.');
    } finally {
      setBusy(false);
      setProgressLabel('');
    }
  }, [csv, lessonId, lessons, chapters, includeQuiz, reset]);

  const backToSlides = useCallback(() => {
    setCsv(slidesBackup);
    setSlidesBackup('');
    setSlidesStage('pick');
    setDraftRows(null);
    setPendingQuizRows([]);
    setGenWarning('');
    setSlidesSummary(null);
    reset();
  }, [slidesBackup, reset]);

  const doImport = useCallback(async () => {
    if (!profile) return;
    // Questions and slides import the pre-validated set; quizzes/lessons parse the CSV directly.
    if ((tab === 'questions' || tab === 'slides') && !validated) return;
    if ((tab === 'quizzes' || tab === 'lessons' || tab === 'slides') && !courseId) {
      setFatal('Choose a course first.');
      return;
    }
    setBusy(true);
    setProgressLabel('Importing…');
    try {
      const lesson = lessons.find(l => l.id === lessonId);
      const chapter = chapters.find(c => c.id === lesson?.chapter_id);
      const quizCount = tab === 'slides' ? pendingQuizRows.length : 0;
      let result: ImportSummary;
      if (tab === 'questions') {
        result = await importValidatedQuestions(validated!, profile.id);
      } else if (tab === 'slides') {
        result = await importValidatedQuestions(validated!, profile.id, {
          lessonId: lessonId || null,
          chapterId: lessonId ? null : chapterId || null,
        });
        // Attach the generated quiz (if any) to the same lesson.
        if (pendingQuizRows.length > 0) {
          const quizResult = await importQuizRows(pendingQuizRows, courseId, profile.id, {
            lessonId: lessonId || null,
            chapterId: lessonId ? null : chapterId || null,
          });
          result = {
            created: result.created + quizResult.created,
            failed: result.failed + quizResult.failed,
            issues: [...result.issues, ...quizResult.issues],
          };
        }
      } else if (tab === 'quizzes') {
        const { rows, issues } = parseQuizRows(csv);
        result = await importQuizRows(rows, courseId, profile.id);
        result.issues = [...issues, ...result.issues];
      } else {
        const { rows, issues } = parseLessonRows(csv);
        result = await importLessonRows(rows, courseId);
        result.issues = [...issues, ...result.issues];
      }
      const createdNow = result;
      setSummary(createdNow);
      setValidated(null);
      setSlidesSummary({
        created: result.created - quizCount,
        quizCreated: quizCount,
        failed: createdNow.failed,
        lessonTitle: lesson?.title ?? '',
        chapterTitle: chapter?.title ?? '',
      });
      if (createdNow.failed === 0) {
        setCsv('');
        if (tab === 'slides') {
          setSlidesBackup('');
          setSlidesStage('pick');
          setDraftRows(null);
          setPendingQuizRows([]);
        }
      }
    } catch (e) {
      setFatal(e instanceof Error ? e.message : 'Import failed.');
    } finally {
      setBusy(false);
      setProgressLabel('');
    }
  }, [validated, profile, tab, courseId, csv, pendingQuizRows, lessonId, chapterId]);

  const generateWithAi = useCallback(async () => {
    if (!aiTopic.trim()) return;
    setAiBusy(true);
    setFatal('');
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error('Session expired — please sign in again.');
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-questions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ topic: aiTopic, count: aiCount, difficulty: aiDifficulty }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? `Generation failed (${res.status})`);
      setCsv(body.csv ?? '');
      setTab('questions');
      setSummary(null);
      setValidated(null);
    } catch (e) {
      setFatal(e instanceof Error ? e.message : 'Generation failed.');
    } finally {
      setAiBusy(false);
    }
  }, [aiTopic, aiCount, aiDifficulty]);

  const activeTab = useMemo(() => TABS.find(t => t.id === tab)!, [tab]);

  if (!profile) {
    return <div className="p-8 text-sm text-slate-500 dark:text-slate-400">Loading…</div>;
  }
  if (!isStaff) {
    return <div className="p-8 text-sm text-slate-500 dark:text-slate-400">Staff only.</div>;
  }

  const template = tab === 'questions' ? QUESTIONS_CSV_TEMPLATE : tab === 'quizzes' ? QUIZZES_CSV_TEMPLATE : tab === 'lessons' ? LESSONS_CSV_TEMPLATE : null;
  const templateName = tab === 'questions' ? 'questions-template.csv' : tab === 'quizzes' ? 'quizzes-template.csv' : 'lessons-template.csv';
  const uploadAccept = tab === 'slides' ? '.txt,.md,.csv,text/plain' : '.csv,text/csv';
  const slidesReady = tab === 'slides' && slidesStage === 'pick' && !!csv.trim() && !!lessonId;
  const lesson = lessons.find(l => l.id === lessonId);
  const chapter = chapters.find(c => c.id === lesson?.chapter_id);
  const textareaPlaceholder =
    tab === 'slides'
      ? `Paste the lesson's slide content here — the dump with separators like:\n\n======================================================================\nSLIDE 35\n======================================================================\n\n…including every "Practice time" block. Each practice block becomes one coding question.`
      : template ?? '';

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Content Import</h1>
        <p className="mt-1 text-sm text-slate-600">
          Stop adding things one by one. Paste a lesson's slides or one spreadsheet and the platform does the rest —
          questions are even auto-validated by running them before import.
        </p>
      </div>

      {/* Tabs */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => { setTab(t.id); reset(); }}
            className={`rounded-xl border p-4 text-left transition ${
              tab === t.id ? 'border-primary-500 bg-primary-50 ring-2 ring-primary-200 dark:bg-primary-900/20 dark:ring-primary-800' : 'border-slate-200 bg-white dark:bg-slate-800 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
            }`}
          >
            <t.icon className="h-5 w-5 text-primary-600 dark:text-primary-400" />
            <p className="mt-2 font-semibold text-slate-900">{t.label}</p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{t.description}</p>
          </button>
        ))}
      </div>

      {/* Course picker for quizzes/lessons */}
      {tab !== 'questions' && tab !== 'ai' && tab !== 'slides' && (
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200">Course</label>
          <select
            value={courseId}
            onChange={e => { setCourseId(e.target.value); reset(); }}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:bg-slate-800 dark:text-slate-100 dark:[color-scheme:dark]"
          >
            <option value="">— choose a course —</option>
            {courses.map(c => (
              <option key={c.id} value={c.id}>{c.title}</option>
            ))}
          </select>
        </div>
      )}

      {/* AI generation */}
      {tab === 'ai' && (
        <div className="rounded-xl border border-teal-200 bg-teal-50 p-4">
          <p className="font-semibold text-teal-900">Draft questions with AI</p>
          <p className="mt-1 text-xs text-teal-700">
            The AI drafts questions with reference solutions and test cases. Every draft is then
            <strong> executed and validated</strong> before you can import it — the AI never publishes anything.
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto_auto]">
            <input
              value={aiTopic}
              onChange={e => setAiTopic(e.target.value)}
              placeholder="e.g. for loops and range() — give students variety"
              className="rounded-lg border border-teal-300 px-3 py-2 text-sm"
            />
            <select
              value={aiCount}
              onChange={e => setAiCount(Number(e.target.value))}
              className="rounded-lg border border-teal-300 px-3 py-2 text-sm"
            >
              {[3, 5, 10, 15, 20].map(n => <option key={n} value={n}>{n} questions</option>)}</select>
            <select
              value={aiDifficulty}
              onChange={e => setAiDifficulty(e.target.value as typeof aiDifficulty)}
              className="rounded-lg border border-teal-300 px-3 py-2 text-sm"
            >
              <option value="mixed">Mixed difficulty</option>
              <option value="easy">Easy</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard</option>
            </select>
          </div>
          <button
            onClick={generateWithAi}
            disabled={aiBusy || aiTopic.trim().length < 3}
            className="mt-3 inline-flex items-center gap-2 rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {aiBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {aiBusy ? 'Drafting…' : 'Generate drafts'}
          </button>
          <p className="mt-2 text-xs text-teal-600">Drafts land in the Coding Questions tab — review, validate, then import.</p>
        </div>
      )}

      {/* Slides → Practice panel */}
      {tab === 'slides' && (
        <div className="rounded-xl border border-violet-200 bg-violet-50 p-4 dark:border-violet-800 dark:bg-violet-950/40">
          <p className="font-semibold text-violet-900 dark:text-violet-200">Turn slide content into practice — automatically</p>
          <p className="mt-1 text-xs text-violet-700 dark:text-violet-300">
            Pick the course, chapter and lesson, paste the lesson's slide content, and generate. Every
            "Practice time" block becomes a coding question with a reference solution and test cases
            (the slide's own example becomes the first visible test), plus an optional MCQ quiz —
            all attached to that lesson as <strong>drafts</strong>. Everything is executed and validated
            before import; nothing publishes itself.
          </p>

          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-violet-800 dark:text-violet-300">Course</label>
              <select
                value={courseId}
                onChange={e => { setCourseId(e.target.value); reset(); }}
                className="w-full rounded-lg border border-violet-300 bg-white px-3 py-2 text-sm text-slate-900 dark:bg-slate-800 dark:text-slate-100 dark:[color-scheme:dark] disabled:opacity-50"
              >
                <option value="">— choose a course —</option>
                {courses.map(c => (
                  <option key={c.id} value={c.id}>{c.title}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-violet-800 dark:text-violet-300">Chapter</label>
              <select
                value={chapterId}
                onChange={e => setChapterId(e.target.value)}
                disabled={!courseId}
                className="w-full rounded-lg border border-violet-300 bg-white px-3 py-2 text-sm text-slate-900 dark:bg-slate-800 dark:text-slate-100 dark:[color-scheme:dark] disabled:opacity-50"
              >
                <option value="">— choose a chapter —</option>
                {chapters.map(c => (
                  <option key={c.id} value={c.id}>{c.title}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-violet-800 dark:text-violet-300">Lesson</label>
              <select
                value={lessonId}
                onChange={e => setLessonId(e.target.value)}
                disabled={!chapterId}
                className="w-full rounded-lg border border-violet-300 bg-white px-3 py-2 text-sm text-slate-900 dark:bg-slate-800 dark:text-slate-100 dark:[color-scheme:dark] disabled:opacity-50"
              >
                <option value="">— choose a lesson —</option>
                {lessons.map(l => (
                  <option key={l.id} value={l.id}>{l.title}</option>
                ))}
              </select>
            </div>
          </div>

          <label className="mt-3 inline-flex items-center gap-2 text-sm text-violet-900 dark:text-violet-200">
            <input
              type="checkbox"
              checked={includeQuiz}
              onChange={e => setIncludeQuiz(e.target.checked)}
              className="h-4 w-4 rounded border-violet-400 text-violet-600"
            />
            Also draft a quiz for this lesson
          </label>
        </div>
      )}

      {/* CSV / slides input */}
      <div>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <label className="text-sm font-medium text-slate-700 dark:text-slate-200">
            {tab === 'slides' ? (slidesStage === 'generated' ? 'Generated questions (review below, then validate)' : 'Paste the slide content') : 'Paste your CSV'}
          </label>
          <div className="flex flex-wrap items-center gap-2">
            {tab === 'slides' && slidesStage === 'pick' && csv.trim() && (
              <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${
                slideStats.practiceCount > 0
                  ? 'bg-emerald-100 text-emerald-800'
                  : 'bg-amber-100 text-amber-800'
              }`}>
                {slideStats.slideCount > 0 && <>{slideStats.slideCount} slide{slideStats.slideCount === 1 ? '' : 's'} · </>}
                {slideStats.practiceCount > 0
                  ? `${slideStats.practiceCount} practice block${slideStats.practiceCount === 1 ? '' : 's'} detected`
                  : 'no "Practice time" blocks detected — the AI will fit exercises to the concepts'}
              </span>
            )}
            {tab === 'slides' && slidesStage === 'generated' && (
              <button
                onClick={backToSlides}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700"
              >
                <ArrowLeft className="h-3.5 w-3.5" /> Edit slides
              </button>
            )}
            {template && (
              <button
                onClick={() => downloadTemplate(template, templateName)}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700"
              >
                <Download className="h-3.5 w-3.5" /> Template
              </button>
            )}
            <label className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700">
              <Upload className="h-3.5 w-3.5" /> Upload file
              <input type="file" accept={uploadAccept} className="hidden" onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />
            </label>
          </div>
        </div>
        <textarea
          value={csv}
          onChange={e => { setCsv(e.target.value); reset(); }}
          rows={tab === 'slides' ? 14 : 10}
          readOnly={tab === 'slides' && slidesStage === 'generated'}
          spellCheck={false}
          placeholder={textareaPlaceholder}
          className="w-full rounded-lg border border-slate-300 bg-white p-3 font-mono text-xs text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
        />
      </div>

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-3">
        {tab === 'slides' && slidesStage === 'pick' && (
          <button
            onClick={generateFromSlides}
            disabled={busy || !slidesReady}
            className="inline-flex items-center gap-2 rounded-lg bg-violet-600 hover:bg-violet-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
            Generate questions{includeQuiz ? ' + quiz' : ''}
          </button>
        )}
        {(tab === 'questions' || (tab === 'slides' && slidesStage === 'generated')) && !validated && (
          <button
            onClick={validateQuestions}
            disabled={busy || !csv.trim()}
            className="inline-flex items-center gap-2 rounded-lg bg-primary-600 hover:bg-primary-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            Validate &amp; preview
          </button>
        )}
        {(tab === 'questions' || (tab === 'slides' && slidesStage === 'generated')) && validated && (
          <>
            <button
              onClick={doImport}
              disabled={busy || validated.every(v => !v.ok)}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              Import {validated.filter(v => v.ok).length} validated question{validated.filter(v => v.ok).length === 1 ? '' : 's'}{tab === 'slides' && pendingQuizRows.length > 0 ? ' + quiz' : ''}
            </button>
            <button onClick={() => { setValidated(null); setSummary(null); }} className="rounded-lg border border-slate-300 px-4 py-2 text-sm">
              Back
            </button>
          </>
        )}
        {(tab === 'quizzes' || tab === 'lessons') && (
          <button
            onClick={doImport}
            disabled={busy || !csv.trim() || !courseId}
            className="inline-flex items-center gap-2 rounded-lg bg-primary-600 hover:bg-primary-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            Import
          </button>
        )}
        {busy && progressLabel && <span className="text-sm text-slate-600">{progressLabel}</span>}
      </div>

      {tab === 'slides' && slidesStage === 'pick' && csv.trim() && !lessonId && (
        <p className="text-sm text-violet-700">Pick the course, chapter and lesson above to enable generation.</p>
      )}

      {fatal && (
        <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800">{fatal}</div>
      )}

      {genWarning && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">{genWarning}</div>
      )}

      {/* Question validation results */}
      {validated && (
        <div className="card rounded-xl p-4">
          <p className="font-semibold text-slate-900">Validation results</p>
          {tab === 'slides' && pendingQuizRows.length > 0 && (
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              A draft quiz{chapter ? ` for ${chapter.title}` : ''}{lesson ? ` · ${lesson.title}` : ''} will be attached on import.
            </p>
          )}
          <div className="mt-3 space-y-2">
            {validated.map(v => (
              <div key={v.row.rowNumber} className="flex items-start gap-2 text-sm">
                {v.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />}
                <div>
                  <p className="font-medium text-slate-900">{v.row.title}</p>
                  {!v.ok && <p className="text-xs text-red-700">{v.error}</p>}
                  {v.ok && v.testResults && (
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {v.testResults.filter(t => t.passed).length}/{v.testResults.length} tests passed by execution
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {slidesSummary && (
        <div className="card rounded-xl p-4 text-sm">
          <p className="font-semibold text-emerald-700">
            Imported {slidesSummary.created} draft question{slidesSummary.created === 1 ? '' : 's'}
            {slidesSummary.quizCreated > 0 && <> + a {slidesSummary.quizCreated}-question quiz</>}
            {slidesSummary.failed > 0 && <span className="text-red-700"> · {slidesSummary.failed} failed</span>}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {slidesSummary.chapterTitle && <>{slidesSummary.chapterTitle} · </>}
            {slidesSummary.lessonTitle || 'selected lesson'} — nothing is published yet. Review and publish from the lesson's Coding Practice tab.
          </p>
          {slidesSummary.created > 0 && courseId && lessonId && (
            <Link
              to={`/faculty/courses/${courseId}/builder?practiceLesson=${lessonId}`}
              className="mt-3 inline-flex items-center gap-1 font-medium text-primary-600 underline hover:text-primary-700 dark:text-primary-400"
            >
              Open this lesson's Coding Practice manager <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          )}
        </div>
      )}

      {summary && !validated && <IssueList issues={summary.issues} />}
      {summary && validated && (
        <div className="card rounded-xl p-4 text-sm">
          <p>
            Imported <span className="font-semibold text-emerald-700">{summary.created}</span>
            {summary.failed > 0 && <> · failed <span className="font-semibold text-red-700">{summary.failed}</span></>}
            {tab === 'slides' && <span className="text-slate-500"> (as drafts)</span>}
          </p>
          <IssueList issues={summary.issues} />
          {tab === 'slides' && summary.created > 0 && courseId && lessonId && (
            <Link
              to={`/faculty/courses/${courseId}/builder?practiceLesson=${lessonId}`}
              className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-primary-600 underline hover:text-primary-700 dark:text-primary-400"
            >
              Open this lesson's Coding Practice manager <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          )}
        </div>
      )}

      <p className="text-xs text-slate-500 dark:text-slate-400">
        Need a place to see the results? <Link to="/faculty/questions" className="text-primary-600 dark:text-primary-400 underline">Faculty question bank →</Link>
      </p>
    </div>
  );
}
