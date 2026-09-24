import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  HelpCircle, Plus, Edit2, Trash2, Eye, EyeOff, Clock, Trophy, Play,
} from 'lucide-react';
import { PageHeader } from '../../components/common/PageHeader';
import { EmptyState } from '../../components/ui/EmptyState';
import { Modal } from '../../components/ui/Modal';
import { useToast } from '../../components/ui/Toast';
import { useAuth } from '../../contexts/AuthContext';
import QuizQuestionsManager from '../../components/faculty/QuizQuestionsManager';
import {
  getFacultyCourses, getFacultyQuizzes, createQuiz, updateQuiz, deleteQuiz,
  getQuizQuestions, getQuizAttempts,
} from '../../services/faculty';
import type { Course, Quiz, QuizAttempt, Profile } from '../../types/database';

export default function FacultyQuizzesPage() {
  const { profile } = useAuth();
  const navigate = useNavigate();
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

  // Question management (delegated to QuizQuestionsManager)
  const [manageQuiz, setManageQuiz] = useState<Quiz | null>(null);

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
          is_published: false, created_by: profile.id,
        });
        success('Quiz created as a draft. Add valid questions before publishing.');
      } else if (quizModal.quiz) {
        if (quizForm.is_published && !quizModal.quiz.is_published) {
          const quizQuestions = await getQuizQuestions(quizModal.quiz.id);
          if (quizQuestions.length === 0) throw new Error('Add at least one question before publishing.');
        }
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
      if (!q.is_published) {
        const quizQuestions = await getQuizQuestions(q.id);
        if (quizQuestions.length === 0) {
          toastError('Add at least one question before publishing.');
          return;
        }
      }

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

  const openAttempts = async (q: Quiz) => {
    setAttemptsView(q);
    const atts = await getQuizAttempts(q.id);
    setAttempts(atts);
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
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <h3 className="font-semibold text-slate-900 dark:text-white">{q.title}</h3>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${q.is_published ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-slate-100 text-slate-400'}`}>
                      {q.is_published ? 'Published' : 'Draft'}
                    </span>
                  </div>
                  <p className="text-xs text-primary-600 dark:text-primary-400 mb-1">{q.course?.title}</p>
                  {q.description && <p className="text-sm text-slate-500 dark:text-slate-400 line-clamp-2">{q.description}</p>}
                  <div className="flex items-center gap-4 text-xs text-slate-400 mt-2 flex-wrap">
                    <span>Pass: {q.pass_percentage}%</span>
                    {q.time_limit_minutes && <span className="flex items-center gap-1"><Clock size={11} /> {q.time_limit_minutes}m</span>}
                    <span className="flex items-center gap-1"><Trophy size={11} /> +{q.xp_reward} XP</span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0 flex-wrap">
                  <button
                    onClick={() => navigate(`/faculty/practice/quizzes?practice=1&quizId=${q.id}&returnTo=${encodeURIComponent('/faculty/quizzes')}`)}
                    className="btn-secondary text-xs flex items-center gap-1"
                  >
                    <Play size={13} /> Practice
                  </button>
                  <button onClick={() => setManageQuiz(q)} className="btn-secondary text-xs">Manage Questions</button>
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
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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

      {/* Manage Questions Modal — shared component, also used by the course builder */}
      <Modal open={!!manageQuiz} onClose={() => setManageQuiz(null)} title={`Questions: ${manageQuiz?.title}`} size="xl">
        {manageQuiz && (
          <QuizQuestionsManager
            quiz={manageQuiz}
            onChanged={() => {
              // A quiz needs >=1 question to publish; refresh list state opportunistically.
              loadData();
            }}
          />
        )}
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
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${att.passed ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>{att.passed ? 'Passed' : 'Failed'}</span>
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
