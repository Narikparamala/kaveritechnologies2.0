import { useState } from 'react';
import {
  Plus, Edit2, Trash2, ChevronDown, ChevronRight, Check, X, Copy,
  ArrowUp, ArrowDown, Code, GripVertical,
} from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Badge } from '../ui/Badge';
import { useToast } from '../ui/Toast';
import {
  getQuizQuestions, createQuestion, updateQuestion, deleteQuestion,
  createOption, updateOption, deleteOption,
} from '../../services/faculty';
import type { Quiz, QuizQuestion, QuizOption } from '../../types/database';

type QuestionWithOptions = QuizQuestion & { options: QuizOption[] };
type QuestionType = QuizQuestion['question_type'];

const QUESTION_TYPES = [
  { value: 'mcq', label: 'Multiple Choice' },
  { value: 'multiple_select', label: 'Multiple Select' },
  { value: 'true_false', label: 'True / False' },
  { value: 'fill_in_blank', label: 'Fill in the Blank' },
  { value: 'code_output', label: 'Code Output' },
  { value: 'coding', label: 'Coding Question' },
] as const;

const DIFFICULTIES = ['easy', 'medium', 'hard'] as const;

export const typeLabel = (t: string) => QUESTION_TYPES.find(q => q.value === t)?.label ?? t;

const needsOptions = (type: string) => ['mcq', 'multiple_select', 'true_false'].includes(type);

type QuestionValidationInput = {
  question_text: string;
  question_type: string;
  points: number;
  correct_answer_text?: string | null;
  enable_playground?: boolean;
  time_limit_seconds?: string | number | null;
  options?: Array<{ option_text: string; is_correct: boolean }>;
};

export const validateQuestion = (question: QuestionValidationInput): string | null => {
  if (!question.question_text.trim()) return 'Enter the question text.';
  if (!Number.isFinite(Number(question.points)) || Number(question.points) < 1) {
    return 'Points must be at least 1.';
  }

  if (
    question.time_limit_seconds !== undefined &&
    question.time_limit_seconds !== null &&
    question.time_limit_seconds !== '' &&
    Number(question.time_limit_seconds) <= 0
  ) {
    return 'Question time must be greater than 0 seconds.';
  }

  const options = (question.options ?? [])
    .map(option => ({ ...option, option_text: option.option_text.trim() }))
    .filter(option => option.option_text.length > 0);

  if (['mcq', 'multiple_select', 'true_false'].includes(question.question_type)) {
    if (options.length < 2) return 'Add at least two answer options.';

    const normalizedOptions = options.map(option => option.option_text.toLowerCase());
    if (new Set(normalizedOptions).size !== normalizedOptions.length) {
      return 'Answer options cannot be repeated.';
    }

    const correctCount = options.filter(option => option.is_correct).length;
    if (question.question_type === 'multiple_select') {
      if (correctCount < 2) return 'Multiple Select needs at least two correct answers.';
    } else if (correctCount !== 1) {
      return 'Choose exactly one correct answer.';
    }

    if (question.question_type === 'true_false') {
      const values = [...normalizedOptions].sort();
      if (options.length !== 2 || values[0] !== 'false' || values[1] !== 'true') {
        return 'True / False questions must contain exactly True and False.';
      }
    }
  }

  if (
    ['fill_in_blank', 'code_output'].includes(question.question_type) &&
    !question.correct_answer_text?.trim()
  ) {
    return 'Enter the expected correct answer.';
  }

  if (question.question_type === 'coding' && !question.enable_playground) {
    return 'Enable the Python Playground for a coding question.';
  }

  return null;
};

/**
 * Add / edit / reorder / delete the questions of one quiz, inline.
 * Used by Faculty → Quizzes (inside the Manage modal) and by the Course
 * Builder's chapter-quiz manager, so question authoring never requires
 * leaving the current page.
 */
export default function QuizQuestionsManager({ quiz, onChanged }: { quiz: Quiz; onChanged?: () => void }) {
  const { success, error: toastError } = useToast();
  const [questions, setQuestions] = useState<QuestionWithOptions[]>([]);
  const [expandedQuestions, setExpandedQuestions] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const [questionModal, setQuestionModal] = useState<{ mode: 'create' | 'edit'; question?: QuestionWithOptions } | null>(null);
  const [qForm, setQForm] = useState({
    question_text: '', question_type: 'mcq' as QuestionType, explanation: '',
    points: 1, difficulty: 'medium', code_snippet: '', image_url: '',
    enable_playground: false, correct_answer_text: '', time_limit_seconds: '',
    options: [] as { id?: string; option_text: string; is_correct: boolean }[],
  });

  const [optionModal, setOptionModal] = useState<{ questionId: string; option?: QuizOption } | null>(null);
  const [optionForm, setOptionForm] = useState({ option_text: '', is_correct: false });

  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  if (!loaded) {
    setLoaded(true);
    getQuizQuestions(quiz.id).then(qs => {
      setQuestions(qs);
      if (qs.length > 0) setExpandedQuestions(new Set([qs[0].id]));
    }).catch(e => toastError(e.message));
  }

  const refreshQuestions = async () => {
    const qs = await getQuizQuestions(quiz.id);
    setQuestions(qs);
    onChanged?.();
  };

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

  const handleQTypeChange = (type: QuestionType) => {
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
    const validationError = validateQuestion(qForm);
    if (validationError) {
      toastError(validationError);
      return;
    }

    setSaving(true);
    try {
      const base = {
        question_text: qForm.question_text,
        question_type: qForm.question_type,
        explanation: qForm.explanation || undefined,
        points: qForm.points,
        difficulty: qForm.difficulty,
        code_snippet: qForm.code_snippet || null,
        image_url: qForm.image_url || null,
        enable_playground: qForm.enable_playground,
        correct_answer_text: qForm.correct_answer_text || null,
        time_limit_seconds: qForm.time_limit_seconds ? Number(qForm.time_limit_seconds) : null,
      };

      if (questionModal?.mode === 'create') {
        const q = await createQuestion({ quiz_id: quiz.id, ...base });
        if (needsOptions(qForm.question_type)) {
          for (let i = 0; i < qForm.options.length; i++) {
            const opt = qForm.options[i];
            if (opt.option_text.trim()) {
              await createOption({ question_id: q.id, option_text: opt.option_text, is_correct: opt.is_correct, order_index: i });
            }
          }
        }
        success('Question added');
      } else if (questionModal?.question) {
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
      await refreshQuestions();
    } catch (e: any) { toastError(e.message); }
    setSaving(false);
  };

  const handleDeleteQuestion = async (qId: string) => {
    try { await deleteQuestion(qId); success('Question deleted'); await refreshQuestions(); }
    catch (e: any) { toastError(e.message); }
  };

  const handleDuplicateQuestion = async (q: QuestionWithOptions) => {
    setSaving(true);
    try {
      const newQ = await createQuestion({
        quiz_id: quiz.id, question_text: q.question_text + ' (copy)',
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
      await refreshQuestions();
    } catch (e: any) { toastError(e.message); }
    setSaving(false);
  };

  const handleReorderQuestion = async (qId: string, direction: 'up' | 'down') => {
    const idx = questions.findIndex(q => q.id === qId);
    if (idx < 0) return;
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= questions.length) return;
    try {
      await updateQuestion(questions[idx].id, { order_index: swapIdx } as any);
      await updateQuestion(questions[swapIdx].id, { order_index: idx } as any);
      await refreshQuestions();
    } catch (e: any) { toastError(e.message); }
  };

  const handleToggleCorrect = async (opt: QuizOption) => {
    const question = questions.find(item => item.options.some(option => option.id === opt.id));
    if (!question) return;

    try {
      if (['mcq', 'true_false'].includes(question.question_type)) {
        if (opt.is_correct) {
          toastError('This question must always have one correct answer.');
          return;
        }
        await Promise.all(
          question.options.map(option =>
            updateOption(option.id, { is_correct: option.id === opt.id })
          )
        );
      } else {
        await updateOption(opt.id, { is_correct: !opt.is_correct });
      }
      await refreshQuestions();
    } catch (e: any) { toastError(e.message); }
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
      await refreshQuestions();
    } catch (e: any) { toastError(e.message); }
    setSaving(false);
  };

  const handleDeleteOption = async (optId: string) => {
    try { await deleteOption(optId); success('Option deleted'); await refreshQuestions(); }
    catch (e: any) { toastError(e.message); }
  };

  const handleDragStart = (qId: string) => setDraggedId(qId);

  const handleDragOver = (e: React.DragEvent, qId: string) => {
    e.preventDefault();
    if (qId !== draggedId) setDragOverId(qId);
  };

  const handleDrop = async (targetId: string) => {
    if (!draggedId || draggedId === targetId) {
      setDraggedId(null);
      setDragOverId(null);
      return;
    }
    const fromIdx = questions.findIndex(q => q.id === draggedId);
    const toIdx = questions.findIndex(q => q.id === targetId);
    if (fromIdx < 0 || toIdx < 0) {
      setDraggedId(null);
      setDragOverId(null);
      return;
    }
    try {
      await updateQuestion(questions[fromIdx].id, { order_index: toIdx } as any);
      await updateQuestion(questions[toIdx].id, { order_index: fromIdx } as any);
      await refreshQuestions();
    } catch (e: any) { toastError(e.message); }
    setDraggedId(null);
    setDragOverId(null);
  };

  const handleDragEnd = () => {
    setDraggedId(null);
    setDragOverId(null);
  };

  const toggleQuestion = (id: string) => {
    setExpandedQuestions(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  return (
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
            <div
              key={q.id}
              draggable
              onDragStart={() => handleDragStart(q.id)}
              onDragOver={(e) => handleDragOver(e, q.id)}
              onDrop={() => handleDrop(q.id)}
              onDragEnd={handleDragEnd}
              className={`rounded-xl border transition-all ${
                draggedId === q.id
                  ? 'border-primary-400 bg-primary-50 dark:bg-primary-900/20 opacity-50'
                  : dragOverId === q.id
                    ? 'border-primary-400 bg-primary-50/50 dark:bg-primary-900/10'
                    : 'border-slate-200 dark:border-slate-700'
              }`}
            >
              <div className="flex items-center gap-2 p-3">
                <button
                  onClick={() => toggleQuestion(q.id)}
                  className="text-slate-400 flex-shrink-0 cursor-pointer"
                  title="Expand/collapse"
                >
                  {expandedQuestions.has(q.id) ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                </button>
                <span className="cursor-grab active:cursor-grabbing text-slate-300 hover:text-slate-500 flex-shrink-0" title="Drag to reorder">
                  <GripVertical size={14} />
                </span>
                <span className="text-xs text-slate-400 font-mono flex-shrink-0">Q{idx + 1}</span>
                <Badge variant="default" className="text-[10px] capitalize flex-shrink-0">{typeLabel(q.question_type)}</Badge>
                <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium flex-shrink-0 ${q.difficulty === 'easy' ? 'bg-emerald-100 text-emerald-700' : q.difficulty === 'hard' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>{q.difficulty}</span>
                <p className="flex-1 text-sm text-slate-900 dark:text-white truncate">{q.question_text}</p>
                <span className="text-xs text-slate-400 flex-shrink-0 hidden sm:block">{q.points}pt{q.points > 1 ? 's' : ''}</span>
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
              <select className="input" value={qForm.question_type} onChange={e => handleQTypeChange(e.target.value as QuestionType)}>
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
    </div>
  );
}
