import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Upload, FileText, ListChecks, Presentation, Download, CheckCircle2, XCircle, Loader2, Sparkles } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { getSecureJudgeLanguages } from '../../services/secureGrading';
import {
  QUESTIONS_CSV_TEMPLATE,
  QUIZZES_CSV_TEMPLATE,
  LESSONS_CSV_TEMPLATE,
  parseQuestionRows,
  parseQuizRows,
  parseLessonRows,
  validateQuestionRows,
  importValidatedQuestions,
  importQuizRows,
  importLessonRows,
  type ImportIssue,
  type ImportSummary,
  type ValidatedQuestion,
} from '../../lib/contentImport';

type Tab = 'questions' | 'quizzes' | 'lessons' | 'ai';

const TABS: { id: Tab; label: string; icon: typeof FileText; description: string }[] = [
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
  const [tab, setTab] = useState<Tab>('questions');
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

  const reset = useCallback(() => {
    setSummary(null);
    setValidated(null);
    setFatal('');
    setProgressLabel('');
  }, []);

  const isStaff = profile?.role === 'admin' || profile?.role === 'faculty' || profile?.role === 'super_admin';

  const handleFile = (file: File) => {
    reset();
    const reader = new FileReader();
    reader.onload = () => setCsv(String(reader.result ?? ''));
    reader.readAsText(file);
  };

  const validateQuestions = useCallback(async () => {
    setBusy(true);
    reset();
    try {
      const { rows, issues } = parseQuestionRows(csv);
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
  }, [csv, reset]);

  const doImport = useCallback(async () => {
    if (!profile) return;
    // Questions import the pre-validated set; quizzes/lessons parse the CSV directly.
    if (tab === 'questions' && !validated) return;
    if ((tab === 'quizzes' || tab === 'lessons') && !courseId) {
      setFatal('Choose a course first.');
      return;
    }
    setBusy(true);
    setProgressLabel('Importing…');
    try {
      let result: ImportSummary;
      if (tab === 'questions') {
        result = await importValidatedQuestions(validated, profile.id);
      } else if (tab === 'quizzes') {
        const { rows, issues } = parseQuizRows(csv);
        result = await importQuizRows(rows, courseId, profile.id);
        result.issues = [...issues, ...result.issues];
      } else {
        const { rows, issues } = parseLessonRows(csv);
        result = await importLessonRows(rows, courseId);
        result.issues = [...issues, ...result.issues];
      }
      setSummary(result);
      setValidated(tab === 'questions' ? validated : null);
      if (result.failed === 0) setCsv('');
    } catch (e) {
      setFatal(e instanceof Error ? e.message : 'Import failed.');
    } finally {
      setBusy(false);
      setProgressLabel('');
    }
  }, [validated, profile, tab, courseId, csv]);

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
    return <div className="p-8 text-sm text-slate-500">Loading…</div>;
  }
  if (!isStaff) {
    return    <div className="p-8 text-sm text-slate-500">Staff only.</div>;
  }

  const template = tab === 'questions' ? QUESTIONS_CSV_TEMPLATE : tab === 'quizzes' ? QUIZZES_CSV_TEMPLATE : LESSONS_CSV_TEMPLATE;
  const templateName = tab === 'questions' ? 'questions-template.csv' : tab === 'quizzes' ? 'quizzes-template.csv' : 'lessons-template.csv';

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Content Import</h1>
        <p className="mt-1 text-sm text-slate-600">
          Stop adding things one by one. Paste one spreadsheet and the platform does the rest — questions are even
          auto-validated by running them before import.
        </p>
      </div>

      {/* Tabs */}
      <div className="grid gap-3 sm:grid-cols-3">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => { setTab(t.id); reset(); }}
            className={`rounded-xl border p-4 text-left transition ${
              tab === t.id ? 'border-indigo-500 bg-indigo-50 ring-2 ring-indigo-200' : 'border-slate-200 bg-white hover:border-slate-300'
            }`}
          >
            <t.icon className="h-5 w-5 text-indigo-600" />
            <p className="mt-2 font-semibold text-slate-900">{t.label}</p>
            <p className="mt-1 text-xs text-slate-500">{t.description}</p>
          </button>
        ))}
      </div>

      {/* Course picker for quizzes/lessons */}
      {tab !== 'questions' && tab !== 'ai' && (
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Course</label>
          <select
            value={courseId}
            onChange={e => { setCourseId(e.target.value); reset(); }}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
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
        <div className="rounded-xl border border-purple-200 bg-purple-50 p-4">
          <p className="font-semibold text-purple-900">Draft questions with AI</p>
          <p className="mt-1 text-xs text-purple-700">
            The AI drafts questions with reference solutions and test cases. Every draft is then
            <strong> executed and validated</strong> before you can import it — the AI never publishes anything.
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto_auto]">
            <input
              value={aiTopic}
              onChange={e => setAiTopic(e.target.value)}
              placeholder="e.g. for loops and range() — give students variety"
              className="rounded-lg border border-purple-300 px-3 py-2 text-sm"
            />
            <select
              value={aiCount}
              onChange={e => setAiCount(Number(e.target.value))}
              className="rounded-lg border border-purple-300 px-3 py-2 text-sm"
            >
              {[3, 5, 10, 15, 20].map(n => <option key={n} value={n}>{n} questions</option>)}</select>
            <select
              value={aiDifficulty}
              onChange={e => setAiDifficulty(e.target.value as typeof aiDifficulty)}
              className="rounded-lg border border-purple-300 px-3 py-2 text-sm"
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
            className="mt-3 inline-flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {aiBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {aiBusy ? 'Drafting…' : 'Generate drafts'}
          </button>
          <p className="mt-2 text-xs text-purple-600">Drafts land in the Coding Questions tab — review, validate, then import.</p>
        </div>
      )}

      {/* CSV input */}
      <div>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <label className="text-sm font-medium text-slate-700">Paste your CSV</label>
          <div className="flex gap-2">
            <button
              onClick={() => downloadTemplate(template, templateName)}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              <Download className="h-3.5 w-3.5" /> Template
            </button>
            <label className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50">
              <Upload className="h-3.5 w-3.5" /> Upload file
              <input type="file" accept=".csv,text/csv" className="hidden" onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />
            </label>
          </div>
        </div>
        <textarea
          value={csv}
          onChange={e => { setCsv(e.target.value); reset(); }}
          rows={10}
          spellCheck={false}
          placeholder={template}
          className="w-full rounded-lg border border-slate-300 p-3 font-mono text-xs"
        />
      </div>

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-3">
        {tab === 'questions' && !validated && (
          <button
            onClick={validateQuestions}
            disabled={busy || !csv.trim()}
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            Validate &amp; preview
          </button>
        )}
        {tab === 'questions' && validated && (
          <>
            <button
              onClick={doImport}
              disabled={busy || validated.every(v => !v.ok)}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              Import {validated.filter(v => v.ok).length} validated question{validated.filter(v => v.ok).length === 1 ? '' : 's'}
            </button>
            <button onClick={() => { setValidated(null); setSummary(null); }} className="rounded-lg border border-slate-300 px-4 py-2 text-sm">
              Back
            </button>
          </>
        )}
        {tab !== 'questions' && (
          <button
            onClick={doImport}
            disabled={busy || !csv.trim() || !courseId}
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            Import
          </button>
        )}
        {busy && progressLabel && <span className="text-sm text-slate-600">{progressLabel}</span>}
      </div>

      {fatal && (
        <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800">{fatal}</div>
      )}

      {/* Question validation results */}
      {validated && (
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="font-semibold text-slate-900">Validation results</p>
          <div className="mt-3 space-y-2">
            {validated.map(v => (
              <div key={v.row.rowNumber} className="flex items-start gap-2 text-sm">
                {v.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />}
                <div>
                  <p className="font-medium text-slate-900">{v.row.title}</p>
                  {!v.ok && <p className="text-xs text-red-700">{v.error}</p>}
                  {v.ok && v.testResults && (
                    <p className="text-xs text-slate-500">
                      {v.testResults.filter(t => t.passed).length}/{v.testResults.length} tests passed by execution
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {summary && !validated && <IssueList issues={summary.issues} />}
      {summary && validated && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm">
          <p>
            Imported <span className="font-semibold text-emerald-700">{summary.created}</span>
            {summary.failed > 0 && <> · failed <span className="font-semibold text-red-700">{summary.failed}</span></>}
          </p>
          <IssueList issues={summary.issues} />
        </div>
      )}

      <p className="text-xs text-slate-500">
        Need a place to see the results? <Link to="/faculty/questions" className="text-indigo-600 underline">Faculty question bank →</Link>
      </p>
    </div>
  );
}
