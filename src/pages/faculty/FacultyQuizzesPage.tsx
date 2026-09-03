import { useEffect, useState, useCallback } from 'react';
import {
  HelpCircle, Plus, Edit2, Trash2, Eye, EyeOff, Clock, Trophy, ChevronDown,
  ChevronRight, Check, X, Copy, ArrowUp, ArrowDown, Code, Image,
} from 'lucide-react';
import { PageHeader } from '../../components/common/PageHeader';
import { EmptyState } from '../../components/ui/EmptyState';
import { Modal } from '../../components/ui/Modal';
import { Badge } from '../../components/ui/Badge';
import { useToast } from '../../components/ui/Toast';
import { useAuth } from '../../contexts/AuthContext';
import {
  getFacultyCourses, getFacultyQuizzes, createQuiz, updateQuiz, deleteQuiz,
  getQuizQuestions, createQuestion, updateQuestion, deleteQuestion,
  createOption, updateOption, deleteOption, getQuizAttempts,
} from '../../services/faculty';
import type { Course, Quiz, QuizQuestion, QuizOption, QuizAttempt, Profile } from '../../types/database';

type QuestionWithOptions = QuizQuestion & { options: QuizOption[] };

const QUESTION_TYPES = [
  { value: 'mcq', label: 'Multiple Choice' },
  { value: 'multiple_select', label: 'Multiple Select' },
  { value: 'true_false', label: 'True / False' },
  { value: 'fill_in_blank', label: 'Fill in the Blank' },
  { value: 'code_output', label: 'Code Output' },
  { value: 'coding', label: 'Coding Question' },
] as const;

const DIFFICULTIES = ['easy', 'medium', 'hard'] as const;

const typeLabel = (t: string) => QUESTION_TYPES.find(q => q.value === t)?.label ?? t;

export default function FacultyQuizzesPage() {
  const { profile } = useAuth();
  const { success, error: toastError } = useToast();
  const [courses, setCourses] = useState<Course[]>([]);
  const [quizzes, setQuizzes] = useState<(Quiz & { course: Course })[]>([]);
  const [loading, setLoading] = useState(true);

  // Quiz CRUD
  const [quizModal, setQuizModal] = useState<{ mode: 'create' | 'edit'; quiz?: Quiz } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Quiz | null>(null);
  const [saving, setSaving] = useState(false);
  const [quizForm, setQuizForm] = useState({
    course_id: '', title: '', description: '', pass_percentage: 70,
    time_limit_minutes: '', is_published: false, xp_reward: 50,
  });

  // Question management
  const [manageQuiz, setManageQuiz] = useState<Quiz | null>(null);
  const [questions, setQuestions] = useState<QuestionWithOptions[]>([]);
  const [expandedQuestions, setExpandedQuestions] = useState<Set<string>>(new Set());

  // Question CRUD
  const [questionModal, setQuestionModal] = useState<{ mode: 'create' | 'edit'; question?: QuestionWithOptions } | null>(null);
  const [qForm, setQForm] = useState({
    question_text: '', question_type: 'mcq' as string, explanation: '',
    points: 1, difficulty: 'medium', code_snippet: '', image_url: '',
    enable_playground: false, correct_answer_text: '', time_limit_seconds: '',
    options: [] as { id?: string; option_text: string; is_correct: boolean }[],
  });

  // Option inline editing
  const [optionModal, setOptionModal] = useState<{ questionId: string; option?: QuizOption } | null>(null);
  const [optionForm, setOptionForm] = useState({ option_text: '', is_correct: false });

  // Attempts
  const [attemptsView, setAttemptsView] = useState<Quiz | null>(null);
  const [attempts, setAttempts] = useState<(QuizAttempt & { student: Profile })[]>([]);

  const loadData = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    const [cs, qs] = await Promise.all([getFacultyCourses(profile.id), getFacultyQuizzes(profile.id)]);
    setCourses(cs);
    setQuizzes(qs);
    if (cs.length > 0 && !quizForm.course_id) setQuizForm(f => ({ ...f, course_id: cs[0].id }));
    setLoading(false);
  }, [profile]);

  useEffect(() => { loadData(); }, [loadData]);

  // Quiz handlers
  const handleSaveQuiz = async () => {
    if (!quizModal || !profile) return;
    setSaving(true);
    try {
      if (quizModal.mode === 'create') {
        await createQuiz({
          course_id: quizForm.course_id, title: quizForm.title,
          description: quizForm.description,
          pass_percentage: Number(quizForm.pass_percentage) || 70,
          time_limit_minutes: quizForm.time_limit_minutes ? Number(quizForm.time_limit_minutes) : null,
          is_published: quizForm.is_published, created_by: profile.id,
        });
        success('Quiz created');
      } else if (quizModal.quiz) {
        await updateQuiz(quizModal.quiz.id, {
          title: quizForm.title, description: quizForm.description,
          pass_percentage: Number(quizForm.pass_percentage) || 70,
          time_limit_minutes: quizForm.time_limit_minutes ? Number(quizForm.time_limit_minutes) : null,
          is_published: quizForm.is_published, xp_reward: Number(quizForm.xp_reward) || 50,
        });
        success('Quiz updated');
      }
      setQuizModal(null);
      await loadData();
    } catch (e: any) { toastError(e.message); }
    setSaving(false);
  };

  const handleTogglePublish = async (q: Quiz) => {
    try {
      await updateQuiz(q.id, { is_published: !q.is_published });
      success(q.is_published ? 'Unpublished' : 'Published');
      await loadData();
    } catch (e: any) { toastError(e.message); }
  };

  const handleDeleteQuiz = async () => {
    if (!deleteTarget) return;
    setSaving(true);
    try { await deleteQuiz(deleteTarget.id); success('Quiz deleted'); setDeleteTarget(null); await loadData(); }
    catch (e: any) { toastError(e.message); }
    setSaving(false);
  };

  // Question management
  const refreshQuestions = async (q: Quiz) => {
    const qs = await getQuizQuestions(q.id);
    setQuestions(qs);
  };

  const openManage = async (q: Quiz) => {
    setManageQuiz(q);
    setQuestionModal(null);
    setOptionModal(null);
    const qs = await getQuizQuestions(q.id);
    setQuestions(qs);
    if (qs.length > 0) setExpandedQuestions(new Set([qs[0].id]));
  };

  const needsOptions = (type: string) => ['mcq', 'multiple_select', 'true_false'].includes(type);

  const openQuestionModal = (mode: 'create' | 'edit', question?: QuestionWithOptions) => {
    if (mode === 'edit' && question) {
      setQForm({
        question_text: question.question_text,
        question_type: question.question_type,
        explanation: question.explanation ?? '',
        points: question.points,
        difficulty: question.difficulty ?? 'medium',
        code_snippet: question.code_snippet ?? '',
        image_url: question.image_url ?? '',
        enable_playground: question.enable_playground,
        correct_answer_text: question.correct_answer_text ?? '',
        time_limit_seconds: question.time_limit_seconds?.toString() ?? '',
        options: question.options.map(o => ({ id: o.id, option_text: o.option_text, is_correct: o.is_correct })),
      });
    } else {
      setQForm({
        question_text: '', question_type: 'mcq', explanation: '',
        points: 1, difficulty: 'medium', code_snippet: '', image_url: '',
        enable_playground: false, correct_answer_text: '', time_limit_seconds: '',
        options: [
          { option_text: '', is_correct: true },
          { option_text: '', is_correct: false },
          { option_text: '', is_correct: false },
          { option_text: '', is_correct: false },
        ],
      });
    }
    setQuestionModal({ mode, question });
  };

  const handleQTypeChange = (type: string) => {
    if (type === 'true_false') {
      setQForm(f => ({ ...f, question_type: type, options: [
        { option_text: 'True', is_correct: true },
        { option_text: 'False', is_correct: false },
      ]}));
    } else if (needsOptions(type)) {
      setQForm(f => ({
        ...f, question_type: type,
        options: f.options.length >= 2 ? f.options : [
          { option_text: '', is_correct: true },
          { option_text: '', is_correct: false },
          { option_text: '', is_correct: false },
          { option_text: '', is_correct: false },
        ],
      }));
    } else {
      setQForm(f => ({ ...f, question_type: type, options: [], enable_playground: type === 'coding' }));
    }
  };

  const handleSaveQuestion = async () => {
    if (!questionModal || !manageQuiz) return;
    setSaving(true);
    try {
      const base = {
        question_text: qForm.question_text,
        question_type: qForm.question_type,
        explanation: qForm.explanation || null,
        points: qForm.points,
        difficulty: qForm.difficulty,
        code_snippet: qForm.code_snippet || null,
        image_url: qForm.image_url || null,
        enable_playground: qForm.enable_playground,
        correct_answer_text: qForm.correct_answer_text || null,
        time_limit_seconds: qForm.time_limit_seconds ? Number(qForm.time_limit_seconds) : null,
      };

      if (questionModal.mode === 'create') {
        const q = await createQuestion({ quiz_id: manageQuiz.id, ...base });
        if (needsOptions(qForm.question_type)) {
          for (let i = 0; i < qForm.options.length; i++) {
            const opt = qForm.options[i];
            if (opt.option_text.trim()) {
              await createOption({ question_id: q.id, option_text: opt.option_text, is_correct: opt.is_correct, order_index: i });
            }
          }
        }
        success('Question added');
      } else if (questionModal.question) {
        await updateQuestion(questionModal.question.id, base);
        if (needsOptions(qForm.question_type)) {
          const existingIds = new Set(qForm.options.filter(o => o.id).map(o => o.id!));
          const oldIds = questionModal.question.options.map(o => o.id);
          for (const oldId of oldIds) {
            if (!existingIds.has(oldId)) await deleteOption(oldId);
          }
          for (let i = 0; i < qForm.options.length; i++) {
            const opt = qForm.options[i];
            if (!opt.option_text.trim()) continue;
            if (opt.id) {
              await updateOption(opt.id, { option_text: opt.option_text, is_correct: opt.is_correct, order_index: i });
            } else {
              await createOption({ question_id: questionModal.question.id, option_text: opt.option_text, is_correct: opt.is_correct, order_index: i });
            }
          }
        }
        success('Question updated');
      }
      setQuestionModal(null);
      await refreshQuestions(manageQuiz);
    } catch (e: any) { toastError(e.message); }
    setSaving(false);
  };

  const handleDeleteQuestion = async (qId: string) => {
    if (!manageQuiz) return;
    try { await deleteQuestion(qId); success('Question deleted'); await refreshQuestions(manageQuiz); }
    catch (e: any) { toastError(e.message); }
  };

  const handleDuplicateQuestion = async (q: QuestionWithOptions) => {
    if (!manageQuiz) return;
    setSaving(true);
    try {
      const newQ = await createQuestion({
        quiz_id: manageQuiz.id, question_text: q.question_text + ' (copy)',
        question_type: q.question_type, explanation: q.explanation ?? undefined,
        points: q.points,
      });
      await updateQuestion(newQ.id, {
        difficulty: q.difficulty, code_snippet: q.code_snippet,
        image_url: q.image_url, enable_playground: q.enable_playground,
        correct_answer_text: q.correct_answer_text, time_limit_seconds: q.time_limit_seconds,
      } as any);
      for (const opt of q.options) {
        await createOption({ question_id: newQ.id, option_text: opt.option_text, is_correct: opt.is_correct, order_index: opt.order_index });
      }
      success('Question duplicated');
      await refreshQuestions(manageQuiz);
    } catch (e: any) { toastError(e.message); }
    setSaving(false);
  };

  const handleReorderQuestion = async (qId: string, direction: 'up' | 'down') => {
    if (!manageQuiz) return;
    const idx = questions.findIndex(q => q.id === qId);
    if (idx < 0) return;
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= questions.length) return;
    try {
      await updateQuestion(questions[idx].id, { order_index: swapIdx } as any);
      await updateQuestion(questions[swapIdx].id, { order_index: idx } as any);
      await refreshQuestions(manageQuiz);
    } catch (e: any) { toastError(e.message); }
  };

  const handleToggleCorrect = async (opt: QuizOption) => {
    try { await updateOption(opt.id, { is_correct: !opt.is_correct }); if (manageQuiz) await refreshQuestions(manageQuiz); }
    catch (e: any) { toastError(e.message); }
  };

  const handleSaveOption = async () => {
    if (!optionModal) return;
    setSaving(true);
    try {
      if (optionModal.option) {
        await updateOption(optionModal.option.id, { option_text: optionForm.option_text, is_correct: optionForm.is_correct });
        success('Option updated');
      } else {
        await createOption({ question_id: optionModal.questionId, option_text: optionForm.option_text, is_correct: optionForm.is_correct });
        success('Option added');
      }
      setOptionModal(null);
      if (manageQuiz) await refreshQuestions(manageQuiz);
    } catch (e: any) { toastError(e.message); }
    setSaving(false);
  };

  const handleDeleteOption = async (optId: string) => {
    if (!manageQuiz) return;
    try { await deleteOption(optId); success('Option deleted'); await refreshQuestions(manageQuiz); }
    catch (e: any) { toastError(e.message); }
  };

  const openAttempts = async (q: Quiz) => {
    setAttemptsView(q);
    const atts = await getQuizAttempts(q.id);
    setAttempts(atts);
  };

  const toggleQuestion = (id: string) => {
    setExpandedQuestions(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  if (loading) return <div className="p-8 text-center text-slate-400">Loading...</div>;

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto animate-fade-in">
      <PageHeader title="Quizzes" subtitle="Create and manage quizzes for your courses" icon={HelpCircle} action={
        <button onClick={() => {
          setQuizForm({ course_id: courses[0]?.id ?? '', title: '', description: '', pass_percentage: 70, time_limit_minutes: '', is_published: false, xp_reward: 50 });
          setQuizModal({ mode: 'create' });
        }} disabled={courses.length === 0} className="btn-primary flex items-center gap-2 disabled:opacity-50">
          <Plus size={16} /> Create Quiz
        </button>
      } />

      {courses.length === 0 ? (
        <EmptyState icon={HelpCircle} title="No courses assigned" description="You need to be assigned to courses first." />
      ) : quizzes.length === 0 ? (
        <EmptyState icon={HelpCircle} title="No quizzes yet" description="Create your first quiz to get started." />
      ) : (
        <div className="space-y-3">
          {quizzes.map(q => (
            <div key={q.id} className="card p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <h3 className="font-semibold text-slate-900 dark:text-white">{q.title}</h3>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${q.is_published ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-slate-100 text-slate-400'}`}>
                      {q.is_published ? 'Published' : 'Draft'}
                    </span>
                  </div>
                  <p className="text-xs text-primary-600 dark:text-primary-400 mb-1">{q.course?.title}</p>
                  {q.description && <p className="text-sm text-slate-500 dark:text-slate-400 line-clamp-2">{q.description}</p>}
                  <div className="flex items-center gap-4 text-xs text-slate-400 mt-2">
                    <span>Pass: {q.pass_percentage}%</span>
                    {q.time_limit_minutes && <span className="flex items-center gap-1"><Clock size={11} /> {q.time_limit_minutes}m</span>}
                    <span className="flex items-center gap-1"><Trophy size={11} /> +{q.xp_reward} XP</span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <button onClick={() => openManage(q)} className="btn-secondary text-xs">Manage Questions</button>
                  <button onClick={() => openAttempts(q)} className="btn-secondary text-xs">Attempts</button>
                  <button onClick={() => handleTogglePublish(q)} className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700">
                    {q.is_published ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                  <button onClick={() => {
                    setQuizForm({ course_id: q.course_id, title: q.title, description: q.description ?? '', pass_percentage: q.pass_percentage, time_limit_minutes: q.time_limit_minutes?.toString() ?? '', is_published: q.is_published, xp_reward: q.xp_reward });
                    setQuizModal({ mode: 'edit', quiz: q });
                  }} className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700">
                    <Edit2 size={14} />
                  </button>
                  <button onClick={() => setDeleteTarget(q)} className="p-2 text-red-400 hover:text-red-600 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Quiz Modal */}
      <Modal open={!!quizModal} onClose={() => setQuizModal(null)} title={quizModal?.mode === 'edit' ? 'Edit Quiz' : 'Create Quiz'} size="lg">
        <div className="space-y-4">
          <div>
            <label className="label">Course</label>
            <select className="input" value={quizForm.course_id} onChange={e => setQuizForm(f => ({ ...f, course_id: e.target.value }))} disabled={quizModal?.mode === 'edit'}>
              {courses.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Title</label>
            <input className="input" placeholder="Quiz title..." value={quizForm.title} onChange={e => setQuizForm(f => ({ ...f, title: e.target.value }))} />
          </div>
          <div>
            <label className="label">Description</label>
            <textarea className="input min-h-[60px] resize-none" placeholder="What this quiz covers..." value={quizForm.description} onChange={e => setQuizForm(f => ({ ...f, description: e.target.value }))} />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="label">Pass %</label>
              <input type="number" className="input" value={quizForm.pass_percentage} onChange={e => setQuizForm(f => ({ ...f, pass_percentage: Number(e.target.value) }))} />
            </div>
            <div>
              <label className="label">Time Limit (min)</label>
              <input type="number" className="input" placeholder="No limit" value={quizForm.time_limit_minutes} onChange={e => setQuizForm(f => ({ ...f, time_limit_minutes: e.target.value }))} />
            </div>
            <div>
              <label className="label">XP Reward</label>
              <input type="number" className="input" value={quizForm.xp_reward} onChange={e => setQuizForm(f => ({ ...f, xp_reward: Number(e.target.value) }))} />
            </div>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" className="w-4 h-4 rounded" checked={quizForm.is_published} onChange={e => setQuizForm(f => ({ ...f, is_published: e.target.checked }))} />
            <span className="text-sm text-slate-700 dark:text-slate-300">Publish immediately</span>
          </label>
          <div className="flex gap-3 justify-end">
            <button onClick={() => setQuizModal(null)} className="btn-secondary">Cancel</button>
            <button onClick={handleSaveQuiz} disabled={saving || !quizForm.title} className="btn-primary disabled:opacity-50">
              {quizModal?.mode === 'edit' ? 'Update' : 'Create'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Manage Questions Modal */}
      <Modal open={!!manageQuiz && !questionModal && !optionModal} onClose={() => setManageQuiz(null)} title={`Questions: ${manageQuiz?.title}`} size="xl">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <button onClick={() => openQuestionModal('create')} className="btn-primary text-sm flex items-center gap-2">
              <Plus size={14} /> Add Question
            </button>
            <span className="text-xs text-slate-400">{questions.length} question{questions.length !== 1 ? 's' : ''}</span>
          </div>
          {questions.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-8">No questions yet. Add your first question.</p>
          ) : (
            <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
              {questions.map((q, idx) => (
                <div key={q.id} className="rounded-xl border border-slate-200 dark:border-slate-700">
                  <div className="flex items-center gap-2 p-3">
                    <button onClick={() => toggleQuestion(q.id)} className="text-slate-400 flex-shrink-0">
                      {expandedQuestions.has(q.id) ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    </button>
                    <span className="text-xs text-slate-400 font-mono flex-shrink-0">Q{idx + 1}</span>
                    <Badge variant="default" className="text-[10px] capitalize flex-shrink-0">{typeLabel(q.question_type)}</Badge>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium flex-shrink-0 ${q.difficulty === 'easy' ? 'bg-emerald-100 text-emerald-700' : q.difficulty === 'hard' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>{q.difficulty}</span>
                    <p className="flex-1 text-sm text-slate-900 dark:text-white truncate">{q.question_text}</p>
                    <span className="text-xs text-slate-400 flex-shrink-0">{q.points}pt{q.points > 1 ? 's' : ''}</span>
                    <div className="flex items-center gap-0.5 flex-shrink-0">
                      <button disabled={idx === 0} onClick={() => handleReorderQuestion(q.id, 'up')} className="p-1 text-slate-400 hover:text-slate-600 disabled:opacity-30">
                        <ArrowUp size={12} />
                      </button>
                      <button disabled={idx === questions.length - 1} onClick={() => handleReorderQuestion(q.id, 'down')} className="p-1 text-slate-400 hover:text-slate-600 disabled:opacity-30">
                        <ArrowDown size={12} />
                      </button>
                      <button onClick={() => openQuestionModal('edit', q)} className="p-1 text-slate-400 hover:text-slate-600">
                        <Edit2 size={12} />
                      </button>
                      <button onClick={() => handleDuplicateQuestion(q)} className="p-1 text-slate-400 hover:text-slate-600">
                        <Copy size={12} />
                      </button>
                      <button onClick={() => handleDeleteQuestion(q.id)} className="p-1 text-red-400 hover:text-red-600">
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                  {expandedQuestions.has(q.id) && (
                    <div className="border-t border-slate-100 dark:border-slate-700/50 p-3 pl-10 space-y-2">
                      {q.code_snippet && (
                        <pre className="text-xs bg-slate-900 text-emerald-400 p-3 rounded-lg overflow-x-auto font-mono">{q.code_snippet}</pre>
                      )}
                      {q.enable_playground && (
                        <div className="flex items-center gap-1.5 text-xs text-blue-600 dark:text-blue-400">
                          <Code size={12} /> Python Playground enabled
                        </div>
                      )}
                      {needsOptions(q.question_type) ? (
                        <>
                          {q.options.map(opt => (
                            <div key={opt.id} className="flex items-center gap-2 py-1">
                              <button onClick={() => handleToggleCorrect(opt)} className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${opt.is_correct ? 'bg-emerald-500 border-emerald-500' : 'border-slate-300 dark:border-slate-600'}`}>
                                {opt.is_correct && <Check size={10} className="text-white" />}
                              </button>
                              <span className="text-sm text-slate-700 dark:text-slate-300 flex-1">{opt.option_text}</span>
                              <button onClick={() => { setOptionForm({ option_text: opt.option_text, is_correct: opt.is_correct }); setOptionModal({ questionId: q.id, option: opt }); }} className="p-1 text-slate-400 hover:text-slate-600">
                                <Edit2 size={11} />
                              </button>
                              <button onClick={() => handleDeleteOption(opt.id)} className="p-1 text-red-400 hover:text-red-600">
                                <X size={12} />
                              </button>
                            </div>
                          ))}
                          <button onClick={() => { setOptionForm({ option_text: '', is_correct: false }); setOptionModal({ questionId: q.id }); }} className="text-xs text-primary-600 hover:underline flex items-center gap-1 mt-1">
                            <Plus size={10} /> Add Option
                          </button>
                        </>
                      ) : (
                        <div className="text-sm text-slate-600 dark:text-slate-300">
                          {q.correct_answer_text ? (
                            <span>Correct answer: <strong className="text-emerald-600">{q.correct_answer_text}</strong></span>
                          ) : q.question_type === 'coding' ? (
                            <span className="text-slate-400 italic">Students submit code via the playground</span>
                          ) : (
                            <span className="text-slate-400 italic">No correct answer set</span>
                          )}
                        </div>
                      )}
                      {q.explanation && (
                        <p className="text-xs text-slate-400 mt-2 italic">Explanation: {q.explanation}</p>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </Modal>

      {/* Question Modal */}
      <Modal open={!!questionModal} onClose={() => setQuestionModal(null)} title={questionModal?.mode === 'edit' ? 'Edit Question' : 'New Question'} size="xl">
        <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
          <div>
            <label className="label">Question Text</label>
            <textarea className="input min-h-[80px] resize-none" placeholder="Enter your question..." value={qForm.question_text} onChange={e => setQForm(f => ({ ...f, question_text: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="label">Type</label>
              <select className="input" value={qForm.question_type} onChange={e => handleQTypeChange(e.target.value)}>
                {QUESTION_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Points</label>
              <input type="number" min={1} className="input" value={qForm.points} onChange={e => setQForm(f => ({ ...f, points: Number(e.target.value) || 1 }))} />
            </div>
            <div>
              <label className="label">Difficulty</label>
              <select className="input" value={qForm.difficulty} onChange={e => setQForm(f => ({ ...f, difficulty: e.target.value }))}>
                {DIFFICULTIES.map(d => <option key={d} value={d}>{d.charAt(0).toUpperCase() + d.slice(1)}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Time (sec)</label>
              <input type="number" className="input" placeholder="No limit" value={qForm.time_limit_seconds} onChange={e => setQForm(f => ({ ...f, time_limit_seconds: e.target.value }))} />
            </div>
          </div>

          <div>
            <label className="label">Code Snippet (optional)</label>
            <textarea className="input min-h-[60px] resize-none font-mono text-sm" placeholder="x = [1, 2, 3]&#10;print(x[1])" value={qForm.code_snippet} onChange={e => setQForm(f => ({ ...f, code_snippet: e.target.value }))} />
          </div>

          <div>
            <label className="label">Image URL (optional)</label>
            <input className="input" placeholder="https://..." value={qForm.image_url} onChange={e => setQForm(f => ({ ...f, image_url: e.target.value }))} />
          </div>

          {(qForm.question_type === 'coding' || qForm.question_type === 'code_output') && (
            <label className="flex items-center gap-2 cursor-pointer p-3 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
              <input type="checkbox" className="w-4 h-4 rounded" checked={qForm.enable_playground} onChange={e => setQForm(f => ({ ...f, enable_playground: e.target.checked }))} />
              <div>
                <span className="text-sm font-medium text-blue-900 dark:text-blue-100">Enable Python Playground</span>
                <p className="text-xs text-blue-700 dark:text-blue-300">Students get an integrated code editor to solve this question</p>
              </div>
            </label>
          )}

          {['fill_in_blank', 'code_output'].includes(qForm.question_type) && (
            <div>
              <label className="label">Correct Answer</label>
              <input className="input" placeholder="Expected answer..." value={qForm.correct_answer_text} onChange={e => setQForm(f => ({ ...f, correct_answer_text: e.target.value }))} />
            </div>
          )}

          {needsOptions(qForm.question_type) && (
            <div>
              <label className="label mb-2">Options</label>
              <div className="space-y-2">
                {qForm.options.map((opt, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        if (qForm.question_type === 'mcq' || qForm.question_type === 'true_false') {
                          setQForm(f => ({ ...f, options: f.options.map((o, j) => ({ ...o, is_correct: j === i })) }));
                        } else {
                          setQForm(f => ({ ...f, options: f.options.map((o, j) => j === i ? { ...o, is_correct: !o.is_correct } : o) }));
                        }
                      }}
                      className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${opt.is_correct ? 'bg-emerald-500 border-emerald-500' : 'border-slate-300 dark:border-slate-600'}`}
                    >
                      {opt.is_correct && <Check size={12} className="text-white" />}
                    </button>
                    <span className="text-xs text-slate-400 w-6 flex-shrink-0">
                      {String.fromCharCode(65 + i)}
                    </span>
                    <input
                      className="input flex-1"
                      placeholder={`Option ${String.fromCharCode(65 + i)}`}
                      value={opt.option_text}
                      onChange={e => setQForm(f => ({ ...f, options: f.options.map((o, j) => j === i ? { ...o, option_text: e.target.value } : o) }))}
                      disabled={qForm.question_type === 'true_false'}
                    />
                    {qForm.question_type !== 'true_false' && qForm.options.length > 2 && (
                      <button onClick={() => setQForm(f => ({ ...f, options: f.options.filter((_, j) => j !== i) }))} className="p-1 text-red-400 hover:text-red-600">
                        <X size={14} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
              {qForm.question_type !== 'true_false' && (
                <button onClick={() => setQForm(f => ({ ...f, options: [...f.options, { option_text: '', is_correct: false }] }))} className="text-xs text-primary-600 hover:underline flex items-center gap-1 mt-2">
                  <Plus size={10} /> Add Option
                </button>
              )}
            </div>
          )}

          <div>
            <label className="label">Explanation (shown after answering)</label>
            <textarea className="input min-h-[60px] resize-none" placeholder="Why this is the correct answer..." value={qForm.explanation} onChange={e => setQForm(f => ({ ...f, explanation: e.target.value }))} />
          </div>

          <div className="flex gap-3 justify-end pt-2">
            <button onClick={() => setQuestionModal(null)} className="btn-secondary">Cancel</button>
            <button onClick={handleSaveQuestion} disabled={saving || !qForm.question_text} className="btn-primary disabled:opacity-50">
              {questionModal?.mode === 'edit' ? 'Update Question' : 'Add Question'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Option Modal */}
      <Modal open={!!optionModal} onClose={() => setOptionModal(null)} title={optionModal?.option ? 'Edit Option' : 'Add Option'} size="sm">
        <div className="space-y-4">
          <div>
            <label className="label">Option Text</label>
            <input className="input" placeholder="Answer option..." value={optionForm.option_text} onChange={e => setOptionForm(f => ({ ...f, option_text: e.target.value }))} />
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" className="w-4 h-4 rounded" checked={optionForm.is_correct} onChange={e => setOptionForm(f => ({ ...f, is_correct: e.target.checked }))} />
            <span className="text-sm text-slate-700 dark:text-slate-300">Mark as correct answer</span>
          </label>
          <div className="flex gap-3 justify-end">
            <button onClick={() => setOptionModal(null)} className="btn-secondary">Cancel</button>
            <button onClick={handleSaveOption} disabled={saving || !optionForm.option_text} className="btn-primary disabled:opacity-50">
              {optionModal?.option ? 'Update' : 'Add'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Attempts Modal */}
      <Modal open={!!attemptsView} onClose={() => setAttemptsView(null)} title={`Attempts: ${attemptsView?.title}`} size="lg">
        {attempts.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-8">No attempts yet.</p>
        ) : (
          <div className="space-y-2 max-h-[400px] overflow-y-auto">
            {attempts.map(att => (
              <div key={att.id} className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-800">
                <div>
                  <p className="text-sm font-medium text-slate-900 dark:text-white">{att.student?.full_name}</p>
                  <p className="text-xs text-slate-400">{att.student?.email}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{att.score != null ? `${Math.round(Number(att.score))}%` : '-'}</span>
                  <Badge variant={att.passed ? 'success' : 'error'} className="text-xs">{att.passed ? 'Passed' : 'Failed'}</Badge>
                </div>
              </div>
            ))}
          </div>
        )}
      </Modal>

      {/* Delete Confirmation */}
      <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Confirm Delete" size="sm">
        <p className="text-sm text-slate-600 dark:text-slate-300 mb-4">Delete quiz <strong>{deleteTarget?.title}</strong>? All questions and attempts will be deleted.</p>
        <div className="flex gap-3 justify-end">
          <button onClick={() => setDeleteTarget(null)} className="btn-secondary">Cancel</button>
          <button onClick={handleDeleteQuiz} disabled={saving} className="btn-primary bg-red-600 hover:bg-red-700 flex items-center gap-2">
            {saving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Trash2 size={14} />}
            Delete
          </button>
        </div>
      </Modal>
    </div>
  );
}
