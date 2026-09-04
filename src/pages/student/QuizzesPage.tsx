import { useEffect, useState, useRef, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  HelpCircle, Trophy, Clock, CheckCircle, XCircle, ChevronRight, ChevronLeft,
  AlertTriangle, ArrowLeft, Flag, Send, Code, Image,
} from 'lucide-react';
import { PageHeader } from '../../components/common/PageHeader';
import { EmptyState } from '../../components/ui/EmptyState';
import { Modal } from '../../components/ui/Modal';
import { ProgressBar } from '../../components/ui/ProgressBar';
import { useToast } from '../../components/ui/Toast';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import type { Quiz, QuizQuestion, QuizOption, Course } from '../../types/database';

type QuizWithCourse = Quiz & { course: Course };
type QuestionWithOptions = QuizQuestion & { options: QuizOption[] };

export default function QuizzesPage() {
  const { profile } = useAuth();
  const { success, error: toastError } = useToast();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const practiceMode = searchParams.get('practice') === '1';
  const requestedQuizId = searchParams.get('quizId');
  const returnTo = searchParams.get('returnTo') ?? '/faculty/quizzes';
  const [quizzes, setQuizzes] = useState<QuizWithCourse[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeQuiz, setActiveQuiz] = useState<QuizWithCourse | null>(null);
  const [questions, setQuestions] = useState<QuestionWithOptions[]>([]);
  const [answers, setAnswers] = useState<Map<string, string[]>>(new Map());
  const [textAnswers, setTextAnswers] = useState<Map<string, string>>(new Map());
  const [flagged, setFlagged] = useState<Set<string>>(new Set());
  const [submitted, setSubmitted] = useState(false);
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [qIdx, setQIdx] = useState(0);
  const [showNav, setShowNav] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const submitQuizRef = useRef<() => void>();

  useEffect(() => {
    if (!profile) return;
    const load = async () => {
      if (practiceMode && requestedQuizId) {
        const { data, error } = await supabase
          .from('quizzes')
          .select('*, course:courses(*)')
          .eq('id', requestedQuizId)
          .eq('is_published', true)
          .maybeSingle();
        if (error) {
          console.error(error);
          setQuizzes([]);
          setLoading(false);
          return;
        }
        setQuizzes(data ? [data as QuizWithCourse] : []);
        setLoading(false);
        return;
      }

      const { data: enrData } = await supabase.from('course_enrollments').select('course_id').eq('student_id', profile.id);
      const courseIds = (enrData ?? []).map((e: any) => e.course_id);
      if (!courseIds.length) { setLoading(false); return; }
      const { data: qData } = await supabase
        .from('quizzes').select('*, course:courses(*)')
        .in('course_id', courseIds).eq('is_published', true);
      setQuizzes((qData ?? []) as any);
      setLoading(false);
    };
    load();
  }, [profile, practiceMode, requestedQuizId]);

  const startQuiz = async (quiz: QuizWithCourse) => {
    // RPC path: staff RPC includes answers (faculty practice mode); the
    // student RPC never returns is_correct / correct_answer_text.
    const fn = practiceMode ? 'get_quiz_questions_staff' : 'get_quiz_questions_for_student';
    const { data: qData, error: qErr } = await supabase.rpc(fn, { p_quiz_id: quiz.id });
    if (qErr) { toastError(qErr.message); return; }
    setQuestions((qData ?? []) as any);
    setActiveQuiz(quiz);
    setAnswers(new Map());
    setTextAnswers(new Map());
    setFlagged(new Set());
    setSubmitted(false);
    setScore(0);
    setQIdx(0);
    setShowNav(false);
    setTimeLeft(quiz.time_limit_minutes ? quiz.time_limit_minutes * 60 : null);
  };

  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (timeLeft === null || submitted || !activeQuiz) return;
    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev === null || prev <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          submitQuizRef.current?.();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [activeQuiz, submitted, timeLeft !== null]);

  const formatTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  const selectAnswer = (questionId: string, optionId: string, type: string) => {
    if (submitted) return;
    setAnswers(prev => {
      const next = new Map(prev);
      if (type === 'mcq' || type === 'true_false') {
        next.set(questionId, [optionId]);
      } else {
        const current = next.get(questionId) ?? [];
        if (current.includes(optionId)) {
          next.set(questionId, current.filter(id => id !== optionId));
        } else {
          next.set(questionId, [...current, optionId]);
        }
      }
      return next;
    });
  };

  const setTextAnswer = (questionId: string, value: string) => {
    if (submitted) return;
    setTextAnswers(prev => new Map(prev).set(questionId, value));
  };

  const toggleFlag = (questionId: string) => {
    setFlagged(prev => {
      const next = new Set(prev);
      if (next.has(questionId)) next.delete(questionId); else next.add(questionId);
      return next;
    });
  };

  const isAnswered = (q: QuestionWithOptions) => {
    if (['fill_in_blank', 'code_output', 'coding'].includes(q.question_type)) {
      return !!(textAnswers.get(q.id) ?? '').trim();
    }
    return (answers.get(q.id) ?? []).length > 0;
  };

  const submitQuiz = useCallback(async () => {
    if (!activeQuiz || !profile) return;
    if (timerRef.current) clearInterval(timerRef.current);

    const timeTaken = activeQuiz.time_limit_minutes && timeLeft !== null
      ? activeQuiz.time_limit_minutes * 60 - timeLeft : null;

    if (practiceMode) {
      // Staff practice mode: client-side grading with full answer data (no record).
      let totalPoints = 0;
      let earnedPoints = 0;
      questions.forEach(q => {
        totalPoints += q.points;
        if (['fill_in_blank', 'code_output'].includes(q.question_type)) {
          const ans = (textAnswers.get(q.id) ?? '').trim().toLowerCase();
          const correct = (q.correct_answer_text ?? '').trim().toLowerCase();
          if (ans === correct) earnedPoints += q.points;
        } else if (q.question_type === 'coding') {
          // Coding questions need manual grading
        } else {
          const selected = answers.get(q.id) ?? [];
          const correctIds = q.options.filter(o => o.is_correct).map(o => o.id);
          if (selected.length === correctIds.length && selected.every(id => correctIds.includes(id))) {
            earnedPoints += q.points;
          }
        }
      });

      const pct = totalPoints > 0 ? (earnedPoints / totalPoints) * 100 : 0;
      setScore(pct);
      setSubmitted(true);
      success(`Practice complete: ${Math.round(pct)}%. No attempt, XP, or progress was recorded.`);
      return;
    }

    // Student path: authoritative server-side grading. The browser never
    // holds is_correct/correct_answer_text, so it cannot fabricate a score.
    const answersPayload: Record<string, { selected?: string[]; text?: string }> = {};
    questions.forEach(q => {
      if (['fill_in_blank', 'code_output', 'coding'].includes(q.question_type)) {
        answersPayload[q.id] = { text: textAnswers.get(q.id) ?? '' };
      } else {
        answersPayload[q.id] = { selected: answers.get(q.id) ?? [] };
      }
    });

    const { data, error } = await supabase.rpc('submit_quiz_attempt', {
      p_quiz_id: activeQuiz.id,
      p_answers: answersPayload,
      p_time_taken_seconds: timeTaken,
    });
    if (error) {
      toastError(error.message);
      return;
    }
    setScore(data.score);
    setSubmitted(true);
    if (data.passed) {
      success(`Quiz passed! +${data.xp_reward} XP`);
    } else {
      success(`Quiz submitted: ${Math.round(data.score)}%`);
    }
  }, [activeQuiz, profile, questions, answers, textAnswers, timeLeft, success, practiceMode, toastError]);

  useEffect(() => { submitQuizRef.current = submitQuiz; }, [submitQuiz]);

  const currentQ = questions[qIdx];
  const answeredCount = questions.filter(q => isAnswered(q)).length;
  const flaggedCount = flagged.size;

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto animate-fade-in">
      {practiceMode && (
        <button onClick={() => navigate(returnTo)} className="flex items-center gap-1.5 text-sm text-primary-600 hover:text-primary-700 mb-4 transition-colors">
          <ArrowLeft size={14} /> Back to Faculty Quizzes
        </button>
      )}
      {practiceMode && (
        <div className="mb-5 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-100">
          <strong>Faculty Practice Mode</strong>
          <p className="mt-1">Answer and submit this quiz exactly as a student would. No attempt, grade, XP, or progress will be recorded.</p>
        </div>
      )}
      <PageHeader title="Quizzes" subtitle={practiceMode ? 'Try this quiz exactly as a student would' : 'Test your Python knowledge and earn XP'} icon={HelpCircle} />

      {loading ? (
        <div className="space-y-4">{[1, 2, 3].map(i => <div key={i} className="h-20 bg-slate-100 dark:bg-slate-800 rounded-2xl animate-pulse" />)}</div>
      ) : quizzes.length === 0 ? (
        <EmptyState icon={HelpCircle} title="No quizzes available" description={practiceMode ? 'This quiz is unavailable or not published.' : 'Enroll in courses to access quizzes.'} />
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {quizzes.map(quiz => (
            <div key={quiz.id} className="card-hover p-5">
              <div className="flex items-start justify-between gap-2 mb-3">
                <h3 className="font-bold text-slate-900 dark:text-white">{quiz.title}</h3>
                <span className="text-xs bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 px-2 py-0.5 rounded-full font-medium flex-shrink-0">{practiceMode ? 'Practice' : `+${quiz.xp_reward} XP`}</span>
              </div>
              <p className="text-xs text-primary-600 dark:text-primary-400 mb-2">{quiz.course?.title}</p>
              {quiz.description && <p className="text-xs text-slate-500 dark:text-slate-400 mb-3 line-clamp-2">{quiz.description}</p>}
              <div className="flex gap-3 text-xs text-slate-400 mb-4">
                {quiz.time_limit_minutes && <span className="flex items-center gap-1"><Clock size={11} /> {quiz.time_limit_minutes}m</span>}
                <span>Pass: {quiz.pass_percentage}%</span>
              </div>
              <button onClick={() => startQuiz(quiz)} className="btn-primary w-full text-sm py-2">{practiceMode ? 'Practice Quiz' : 'Start Quiz'}</button>
            </div>
          ))}
        </div>
      )}

      {/* Quiz Taking Modal */}
      <Modal open={!!activeQuiz} onClose={() => { if (submitted) setActiveQuiz(null); }} title="" size="xl" className="!max-w-5xl">
        {activeQuiz && !submitted && questions.length > 0 && currentQ ? (
          <div className="flex flex-col" style={{ minHeight: '70vh', maxHeight: '80vh' }}>
            {/* Header bar */}
            <div className="flex items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-700 flex-shrink-0">
              <div className="flex items-center gap-3">
                <h2 className="font-bold text-slate-900 dark:text-white text-lg truncate">{activeQuiz.title}</h2>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0">
                {timeLeft !== null && (
                  <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold ${timeLeft <= 60 ? 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 animate-pulse' : timeLeft <= 300 ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'}`}>
                    <Clock size={14} />
                    {formatTime(timeLeft)}
                    {timeLeft <= 60 && <AlertTriangle size={12} />}
                  </div>
                )}
                <button onClick={() => setShowNav(!showNav)} className="btn-ghost text-xs py-1.5 px-2.5 relative">
                  Q{qIdx + 1}/{questions.length}
                  {flaggedCount > 0 && (
                    <span className="absolute -top-1 -right-1 w-4 h-4 bg-amber-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">{flaggedCount}</span>
                  )}
                </button>
              </div>
            </div>

            <div className="flex flex-1 overflow-hidden mt-4 gap-4">
              {/* Question navigation panel (toggled) */}
              {showNav && (
                <div className="w-48 flex-shrink-0 border-r border-slate-200 dark:border-slate-700 pr-4 overflow-y-auto">
                  <p className="text-xs font-medium text-slate-500 mb-3 uppercase tracking-wider">Questions</p>
                  <div className="grid grid-cols-5 gap-1.5">
                    {questions.map((q, i) => {
                      const answered = isAnswered(q);
                      const isFlagged = flagged.has(q.id);
                      const isCurrent = i === qIdx;
                      return (
                        <button
                          key={q.id}
                          onClick={() => { setQIdx(i); setShowNav(false); }}
                          className={`w-8 h-8 rounded-lg text-xs font-semibold relative transition-all ${
                            isCurrent ? 'bg-primary-600 text-white ring-2 ring-primary-300'
                            : answered ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                          }`}
                        >
                          {i + 1}
                          {isFlagged && <Flag size={8} className="absolute -top-0.5 -right-0.5 text-amber-500 fill-amber-500" />}
                        </button>
                      );
                    })}
                  </div>
                  <div className="mt-4 space-y-1.5 text-xs text-slate-500">
                    <div className="flex items-center gap-2"><div className="w-3 h-3 rounded bg-emerald-100 dark:bg-emerald-900/30" /> Answered ({answeredCount})</div>
                    <div className="flex items-center gap-2"><div className="w-3 h-3 rounded bg-slate-100 dark:bg-slate-800" /> Unanswered ({questions.length - answeredCount})</div>
                    {flaggedCount > 0 && <div className="flex items-center gap-2"><Flag size={10} className="text-amber-500 fill-amber-500" /> Flagged ({flaggedCount})</div>}
                  </div>
                </div>
              )}

              {/* Main question area */}
              <div className="flex-1 overflow-y-auto">
                {/* Progress */}
                <div className="flex items-center gap-3 mb-4">
                  <ProgressBar value={qIdx + 1} max={questions.length} size="sm" className="flex-1" />
                  <span className="text-xs text-slate-400 flex-shrink-0">{qIdx + 1} / {questions.length}</span>
                </div>

                {/* Question header */}
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">Q{qIdx + 1}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${currentQ.difficulty === 'easy' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : currentQ.difficulty === 'hard' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'}`}>{currentQ.difficulty}</span>
                    <span className="text-[10px] text-slate-400">{currentQ.points} pt{currentQ.points > 1 ? 's' : ''}</span>
                  </div>
                  <button
                    onClick={() => toggleFlag(currentQ.id)}
                    className={`p-1.5 rounded-lg transition-colors ${flagged.has(currentQ.id) ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-600' : 'text-slate-400 hover:text-amber-500 hover:bg-amber-50'}`}
                    title="Flag for review"
                  >
                    <Flag size={14} className={flagged.has(currentQ.id) ? 'fill-amber-500' : ''} />
                  </button>
                </div>

                {/* Question text */}
                <h3 className="font-semibold text-slate-900 dark:text-white text-lg mb-4 leading-relaxed">{currentQ.question_text}</h3>

                {/* Code snippet */}
                {currentQ.code_snippet && (
                  <pre className="bg-slate-900 text-emerald-400 p-4 rounded-xl text-sm font-mono overflow-x-auto mb-4 leading-relaxed">{currentQ.code_snippet}</pre>
                )}

                {/* Image */}
                {currentQ.image_url && (
                  <img src={currentQ.image_url} alt="" className="max-w-full max-h-64 rounded-xl mb-4 border border-slate-200 dark:border-slate-700" />
                )}

                {/* Options / input area */}
                {['mcq', 'multiple_select', 'true_false'].includes(currentQ.question_type) ? (
                  <div className="space-y-2.5 mb-6">
                    {currentQ.options.map((opt, oi) => {
                      const selected = (answers.get(currentQ.id) ?? []).includes(opt.id);
                      return (
                        <button
                          key={opt.id}
                          onClick={() => selectAnswer(currentQ.id, opt.id, currentQ.question_type)}
                          className={`w-full text-left p-4 rounded-xl border-2 text-sm font-medium transition-all flex items-center gap-3 ${
                            selected
                              ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300'
                              : 'border-slate-200 dark:border-slate-700 hover:border-primary-300 dark:hover:border-primary-600 text-slate-700 dark:text-slate-300'
                          }`}
                        >
                          <span className={`w-7 h-7 rounded-full border-2 flex items-center justify-center flex-shrink-0 text-xs font-bold ${
                            selected ? 'bg-primary-500 border-primary-500 text-white' : 'border-slate-300 dark:border-slate-600 text-slate-400'
                          }`}>
                            {currentQ.question_type === 'multiple_select' ? (selected ? <CheckCircle size={14} /> : '') : String.fromCharCode(65 + oi)}
                          </span>
                          {opt.option_text}
                        </button>
                      );
                    })}
                  </div>
                ) : ['fill_in_blank', 'code_output'].includes(currentQ.question_type) ? (
                  <div className="mb-6">
                    <input
                      type="text"
                      className="input text-sm"
                      placeholder={currentQ.question_type === 'code_output' ? 'What will be the output?' : 'Type your answer...'}
                      value={textAnswers.get(currentQ.id) ?? ''}
                      onChange={e => setTextAnswer(currentQ.id, e.target.value)}
                    />
                  </div>
                ) : currentQ.question_type === 'coding' && currentQ.enable_playground ? (
                  <div className="mb-6">
                    <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                      <div className="bg-slate-900 px-4 py-2 flex items-center gap-2">
                        <Code size={14} className="text-emerald-400" />
                        <span className="text-xs text-slate-400 font-mono">Python</span>
                      </div>
                      <textarea
                        className="w-full bg-slate-950 text-emerald-400 font-mono text-sm p-4 min-h-[160px] resize-y border-0 focus:outline-none focus:ring-0"
                        placeholder="# Write your Python code here..."
                        value={textAnswers.get(currentQ.id) ?? ''}
                        onChange={e => setTextAnswer(currentQ.id, e.target.value)}
                        spellCheck={false}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="mb-6">
                    <textarea
                      className="input min-h-[100px] resize-none text-sm"
                      placeholder="Write your answer..."
                      value={textAnswers.get(currentQ.id) ?? ''}
                      onChange={e => setTextAnswer(currentQ.id, e.target.value)}
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Bottom navigation */}
            <div className="flex items-center justify-between pt-4 border-t border-slate-200 dark:border-slate-700 flex-shrink-0 mt-auto">
              <button
                disabled={qIdx === 0}
                onClick={() => setQIdx(i => i - 1)}
                className="btn-secondary flex items-center gap-1.5 disabled:opacity-40"
              >
                <ChevronLeft size={14} /> Previous
              </button>
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <span>{answeredCount}/{questions.length} answered</span>
                {flaggedCount > 0 && <span className="text-amber-500">{flaggedCount} flagged</span>}
              </div>
              <div className="flex items-center gap-2">
                {qIdx < questions.length - 1 ? (
                  <button onClick={() => setQIdx(i => i + 1)} className="btn-primary flex items-center gap-1.5">
                    Next <ChevronRight size={14} />
                  </button>
                ) : (
                  <button onClick={submitQuiz} className="btn-primary flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700">
                    <Send size={14} /> Submit Quiz
                  </button>
                )}
              </div>
            </div>
          </div>
        ) : activeQuiz && submitted ? (
          <div className="text-center py-8">
            {score >= (activeQuiz.pass_percentage ?? 70) ? (
              <div className="w-20 h-20 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center mx-auto mb-5">
                <CheckCircle size={40} className="text-emerald-500" />
              </div>
            ) : (
              <div className="w-20 h-20 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mx-auto mb-5">
                <XCircle size={40} className="text-red-500" />
              </div>
            )}
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
              {score >= (activeQuiz.pass_percentage ?? 70) ? 'Congratulations!' : 'Keep Practicing!'}
            </h2>
            <p className="text-slate-500 dark:text-slate-400 mb-6">
              Your score: <strong className="text-xl">{Math.round(score)}%</strong>
              <span className="block text-xs mt-1">Pass mark: {activeQuiz.pass_percentage}%</span>
            </p>
            <div className="max-w-xs mx-auto mb-6">
              <ProgressBar value={score} color={score >= (activeQuiz.pass_percentage ?? 70) ? 'green' : 'amber'} />
            </div>
            {score >= (activeQuiz.pass_percentage ?? 70) && (
              <p className="text-emerald-600 dark:text-emerald-400 text-sm font-medium mb-4">+{activeQuiz.xp_reward} XP earned!</p>
            )}
            <div className="flex gap-3 justify-center">
              <button onClick={() => { startQuiz(activeQuiz); }} className="btn-secondary">Retry Quiz</button>
              <button onClick={() => setActiveQuiz(null)} className="btn-primary">Done</button>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
