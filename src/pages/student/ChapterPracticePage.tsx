import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, CircleDashed, CheckCircle2, PenLine } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../components/ui/Toast';
import { EmptyState } from '../../components/ui/EmptyState';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';

type ChapterQuestion = {
  id: string;
  title: string;
  difficulty: string;
  default_marks: number;
  chapter_order_index: number | null;
  topic: string | null;
};

type AttemptRow = {
  question_id: string;
  passed_test_cases: number | null;
  total_test_cases: number | null;
  status: string;
  first_solved_at: string | null;
};

/**
 * CCBP-style chapter practice list: every published coding question in the
 * chapter, in faculty-defined order, with the student's test-case/score/state
 * columns. Tapping a row opens the question editor to practice and submit.
 * Access is enforced server-side by get_chapter_coding_questions (staff or
 * enrolled in the chapter's course).
 */
export default function ChapterPracticePage() {
  const { courseId, chapterId } = useParams<{ courseId: string; chapterId: string }>();
  const { profile } = useAuth();
  const { error: toastError } = useToast();
  const [chapterTitle, setChapterTitle] = useState('');
  const [questions, setQuestions] = useState<ChapterQuestion[]>([]);
  const [attempts, setAttempts] = useState<Map<string, AttemptRow>>(new Map());
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!chapterId || !profile) return;
    let active = true;

    const load = async () => {
      setLoading(true);
      try {
        const [rpcRes, chRes, attemptsRes] = await Promise.all([
          supabase.rpc('get_chapter_coding_questions', { p_chapter_id: chapterId }),
          supabase.from('chapters').select('title').eq('id', chapterId).maybeSingle(),
          supabase.from('coding_question_attempts')
            .select('question_id, passed_test_cases, total_test_cases, status, first_solved_at'),
        ]);

        if (!active) return;
        if (rpcRes.error) throw rpcRes.error;
        const qs = (rpcRes.data ?? []) as ChapterQuestion[];
        if (!qs.length) setNotFound(true);
        setQuestions(qs);
        setChapterTitle((chRes.data as any)?.title ?? '');

        const map = new Map<string, AttemptRow>();
        for (const a of (attemptsRes.data ?? []) as AttemptRow[]) map.set(a.question_id, a);
        setAttempts(map);
      } catch (e: any) {
        if (active) toastError('Could not load chapter practice', e.message);
      } finally {
        if (active) setLoading(false);
      }
    };

    load();
    return () => { active = false; };
  }, [chapterId, profile]);

  const renderRow = (q: ChapterQuestion, idx: number) => {
    const attempt = attempts.get(q.id);
    const solved = Boolean(attempt?.first_solved_at) || attempt?.status === 'solved';
    const attempted = Boolean(attempt) && !solved;
    const passed = attempt?.passed_test_cases ?? 0;
    const total = attempt?.total_test_cases ?? 0;

    return (
      <Link
        key={q.id}
        to={`/student/coding-practice/${q.id}?chapter=${chapterId}&course=${courseId}`}
        className="block rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-5 py-4 mb-3 transition-all hover:border-primary-300 dark:hover:border-primary-600 hover:shadow-sm"
      >
        <div className="flex items-center gap-4">
          {/* Question */}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">{idx + 1}. {q.title}</p>
            {q.topic && <p className="text-xs text-slate-400 mt-0.5">{q.topic}</p>}
          </div>
          {/* Difficulty */}
          <div className="w-20 flex-shrink-0 hidden sm:block">
            <span className={`text-xs font-medium ${q.difficulty === 'hard' ? 'text-red-500' : q.difficulty === 'medium' ? 'text-amber-500' : 'text-emerald-500'}`}>{q.difficulty.charAt(0).toUpperCase() + q.difficulty.slice(1)}</span>
          </div>
          {/* Testcases passed */}
          <div className="w-28 flex-shrink-0 hidden md:block">
            {attempted || solved ? (
              <div>
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">{passed}/{total || '—'}</p>
                <div className="h-1 w-20 bg-slate-100 dark:bg-slate-800 rounded-full mt-1 overflow-hidden">
                  <div className={`h-full rounded-full ${solved ? 'bg-emerald-500' : 'bg-amber-500'}`} style={{ width: total ? `${(passed / total) * 100}%` : '0%' }} />
                </div>
              </div>
            ) : (
              <span className="text-xs text-slate-400">—</span>
            )}
          </div>
          {/* Score */}
          <div className="w-16 flex-shrink-0 hidden md:block">
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">{solved ? `${q.default_marks}/${q.default_marks}` : attempted ? '0' : '—'}</p>
            <p className="text-[10px] text-slate-400">of {q.default_marks}</p>
          </div>
          {/* Status */}
          <div className="w-24 flex-shrink-0">
            {solved ? (
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400"><CheckCircle2 size={13} /> SOLVED</span>
            ) : attempted ? (
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-600 dark:text-amber-400"><PenLine size={13} /> ATTEMPTED</span>
            ) : (
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-400"><CircleDashed size={13} /> NEW</span>
            )}
          </div>
          {/* Open arrow */}
          <div className="w-9 h-9 rounded-full border-2 border-primary-500 text-primary-600 dark:text-primary-400 flex items-center justify-center flex-shrink-0">
            <ArrowRight size={16} />
          </div>
        </div>
      </Link>
    );
  };

  if (loading) return <LoadingSpinner fullPage />;

  return (
    <div className="p-6 lg:p-8 max-w-5xl mx-auto animate-fade-in">
      <div className="flex items-center gap-2 mb-4">
        <Link
          to={`/student/course/${courseId}`}
          className="flex items-center gap-1.5 text-sm text-primary-600 hover:text-primary-700"
        >
          <ArrowLeft size={14} /> Back to course
        </Link>
      </div>
      <div className="mb-2 text-sm text-slate-400">{chapterTitle || 'Chapter'} › Coding Practice</div>
      <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-1">Coding Practice</h1>
      <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">Points are awarded based on your score in coding questions. Tap a question to open the editor and submit.</p>

      {/* Header row (CCBP layout) */}
      {questions.length > 0 && (
        <div className="hidden md:flex items-center gap-4 px-5 py-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          <div className="flex-1">Question</div>
          <div className="w-20 hidden sm:block">Difficulty</div>
          <div className="w-28">Testcases passed</div>
          <div className="w-16">Score</div>
          <div className="w-24">Status</div>
          <div className="w-9" />
        </div>
      )}

      {notFound || questions.length === 0 ? (
        <EmptyState icon={CircleDashed} title="No practice questions here yet" description="Your faculty hasn't added coding practice to this chapter. Check back after the next class." />
      ) : (
        questions.map(renderRow)
      )}
    </div>
  );
}
