import { useEffect, useState, useCallback } from 'react';
import { MessageSquare, ExternalLink, Github, Star, ChevronRight, Code, Type, CheckCircle, XCircle } from 'lucide-react';
import { PageHeader } from '../../components/common/PageHeader';
import { Badge } from '../../components/ui/Badge';
import { EmptyState } from '../../components/ui/EmptyState';
import { Modal } from '../../components/ui/Modal';
import { useToast } from '../../components/ui/Toast';
import { useAuth } from '../../contexts/AuthContext';
import { formatDate } from '../../lib/utils';
import { 
  getAssignmentSubmissions, getQuestionSubmissions, 
  gradeSubmission, gradeQuestionSubmission, getAssignmentQuestions 
} from '../../services/assignments';
import type { 
  AssignmentSubmission, Assignment, Profile, 
  AssignmentQuestion, AssignmentQuestionSubmission 
} from '../../types/database';

type SubmissionFull = AssignmentSubmission & { 
  assignment: Assignment; 
  student_profile: Profile;
};

export default function SubmissionsPage() {
  const { profile } = useAuth();
  const { success, error: toastError } = useToast();
  const [submissions, setSubmissions] = useState<SubmissionFull[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Grading State
  const [grading, setGrading] = useState<SubmissionFull | null>(null);
  const [questions, setQuestions] = useState<AssignmentQuestion[]>([]);
  const [qSubmissions, setQSubmissions] = useState<AssignmentQuestionSubmission[]>([]);
  const [gradeForm, setGradeForm] = useState({ score: '', feedback: '' });
  const [saving, setSaving] = useState(false);

  const loadSubmissions = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    try {
      // In a real app, we'd filter by faculty courses. 
      // For now, let's fetch all submissions for assignments the faculty has access to.
      const { data: cf } = await (await import('../../lib/supabase')).supabase.from('course_faculty').select('course_id').eq('faculty_id', profile.id);
      const cIds = (cf ?? []).map((c: any) => c.course_id);
      if (!cIds.length) { setLoading(false); return; }

      const { data: aData } = await (await import('../../lib/supabase')).supabase.from('assignments').select('id').in('course_id', cIds);
      const aIds = (aData ?? []).map((a: any) => a.id);
      if (!aIds.length) { setLoading(false); return; }

      const { data, error } = await (await import('../../lib/supabase')).supabase
        .from('assignment_submissions')
        .select('*, assignment:assignments(*), student_profile:profiles!assignment_submissions_student_id_fkey(*)')
        .in('assignment_id', aIds)
        .order('submitted_at', { ascending: false });

      if (error) throw error;
      setSubmissions((data ?? []) as any);
    } catch (e: any) { toastError('Error', e.message); }
    setLoading(false);
  }, [profile]);

  useEffect(() => { loadSubmissions(); }, [loadSubmissions]);

  const openGrading = async (sub: SubmissionFull) => {
    setGrading(sub);
    setGradeForm({ score: sub.score?.toString() || '', feedback: sub.feedback || '' });
    try {
      const [qs, qSubs] = await Promise.all([
        getAssignmentQuestions(sub.assignment_id),
        getQuestionSubmissions(sub.id)
      ]);
      setQuestions(qs);
      setQSubmissions(qSubs);
    } catch (e: any) { toastError('Error loading details', e.message); }
  };

  const handleGrade = async () => {
    if (!grading || !profile) return;
    setSaving(true);
    try {
      await gradeSubmission(grading.id, Number(gradeForm.score), gradeForm.feedback, profile.id);
      success('Submission graded!');
      setGrading(null);
      await loadSubmissions();
    } catch (e: any) { toastError('Error', e.message); }
    setSaving(false);
  };

  const handleGradeQuestion = async (qSubId: string, marks: number, feedback: string) => {
    try {
      await gradeQuestionSubmission(qSubId, marks, feedback);
      success('Question graded');
      if (grading) {
        const updatedQSubs = await getQuestionSubmissions(grading.id);
        setQSubmissions(updatedQSubs);
        // Auto-calculate total score
        const total = updatedQSubs.reduce((sum, qs) => sum + (qs.marks_awarded || 0), 0);
        setGradeForm(prev => ({ ...prev, score: total.toString() }));
      }
    } catch (e: any) { toastError('Error', e.message); }
  };

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto animate-fade-in">
      <PageHeader title="Submissions" subtitle="Review and grade student work" icon={MessageSquare} />

      {loading ? (
        <div className="space-y-3">{[1, 2, 3].map(i => <div key={i} className="h-20 bg-slate-100 dark:bg-slate-800 rounded-2xl animate-pulse" />)}</div>
      ) : submissions.length === 0 ? (
        <EmptyState icon={MessageSquare} title="No submissions yet" />
      ) : (
        <div className="grid gap-3">
          {submissions.map(sub => (
            <div key={sub.id} className="card p-5 flex items-center justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <p className="font-semibold text-slate-900 dark:text-white">{sub.student_profile?.full_name}</p>
                  <Badge variant={sub.status === 'graded' ? 'success' : 'info'} className="capitalize">{sub.status}</Badge>
                </div>
                <p className="text-sm text-primary-600 dark:text-primary-400 mb-1">{sub.assignment?.title}</p>
                <div className="flex items-center gap-4 text-xs text-slate-400">
                  <span>Submitted: {formatDate(sub.submitted_at)}</span>
                  {sub.score !== null && <span className="text-emerald-600 font-bold">Score: {sub.score}/{sub.assignment?.max_marks}</span>}
                </div>
              </div>
              <button onClick={() => openGrading(sub)} className="btn-primary text-xs py-2 px-4">
                {sub.status === 'graded' ? 'View Grade' : 'Grade'}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Grading Modal */}
      <Modal isOpen={!!grading} onClose={() => setGrading(null)} title="Grade Submission" size="xl">
        <div className="flex flex-col h-[80vh]">
          <div className="flex-1 overflow-y-auto p-6 space-y-8">
            {/* Student Info */}
            <div className="flex items-center justify-between p-4 rounded-2xl bg-slate-50 dark:bg-slate-800">
              <div>
                <h4 className="font-bold text-slate-900 dark:text-white">{grading?.student_profile?.full_name}</h4>
                <p className="text-xs text-slate-500">{grading?.student_profile?.email}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-slate-400 uppercase tracking-wider">Assignment</p>
                <p className="font-medium text-sm">{grading?.assignment?.title}</p>
              </div>
            </div>

            {/* Questions and Answers */}
            <div className="space-y-6">
              <h4 className="text-sm font-bold text-slate-400 uppercase tracking-widest">Questions & Answers</h4>
              {questions.map((q, idx) => {
                const qSub = qSubmissions.find(qs => qs.question_id === q.id);
                return (
                  <div key={q.id} className="space-y-3 p-5 rounded-2xl border border-slate-200 dark:border-slate-700">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-xs font-bold">{idx + 1}</span>
                        <h5 className="font-bold text-slate-900 dark:text-white">{q.title}</h5>
                        <Badge variant="secondary" className="text-[10px] uppercase">{q.question_type}</Badge>
                      </div>
                      <span className="text-xs text-slate-400">Max Marks: {q.marks}</span>
                    </div>
                    
                    <div className="text-sm text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/50 p-3 rounded-xl italic">
                      {q.problem_statement}
                    </div>

                    <div className="space-y-2">
                      <p className="text-xs font-bold text-slate-400 uppercase">Student Answer</p>
                      {q.question_type === 'coding' ? (
                        <div className="space-y-2">
                          <pre className="p-4 rounded-xl bg-slate-900 text-slate-100 font-mono text-xs overflow-x-auto">
                            {qSub?.submitted_code || '# No code submitted'}
                          </pre>
                          {qSub?.execution_output && (
                            <div className="p-3 rounded-xl bg-slate-100 dark:bg-slate-800 font-mono text-[10px] text-slate-500">
                              <p className="font-bold mb-1 uppercase">Execution Output:</p>
                              {qSub.execution_output}
                            </div>
                          )}
                          <div className="flex items-center gap-2 text-xs">
                            <span className="text-slate-400">Test Results:</span>
                            <span className={qSub?.passed_test_cases === qSub?.total_test_cases ? 'text-emerald-600 font-bold' : 'text-amber-600 font-bold'}>
                              {qSub?.passed_test_cases || 0}/{qSub?.total_test_cases || 0} Passed
                            </span>
                          </div>
                        </div>
                      ) : (
                        <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 text-sm whitespace-pre-wrap">
                          {qSub?.submitted_text || 'No answer submitted'}
                        </div>
                      )}
                    </div>

                    {/* Per-question Grading */}
                    <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex items-end gap-4">
                      <div className="w-32">
                        <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Marks</label>
                        <input 
                          type="number" 
                          className="input py-1.5 text-sm" 
                          defaultValue={qSub?.marks_awarded || 0}
                          onBlur={(e) => qSub && handleGradeQuestion(qSub.id, Number(e.target.value), qSub.feedback || '')}
                        />
                      </div>
                      <div className="flex-1">
                        <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Feedback</label>
                        <input 
                          type="text" 
                          className="input py-1.5 text-sm" 
                          placeholder="Feedback for this question..."
                          defaultValue={qSub?.feedback || ''}
                          onBlur={(e) => qSub && handleGradeQuestion(qSub.id, qSub.marks_awarded || 0, e.target.value)}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Final Grading Footer */}
          <div className="p-6 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">Final Score (out of {grading?.assignment?.max_marks})</label>
                <input type="number" className="input" value={gradeForm.score} onChange={e => setGradeForm({ ...gradeForm, score: e.target.value })} />
              </div>
              <div>
                <label className="label">Overall Feedback</label>
                <input type="text" className="input" placeholder="Overall comments..." value={gradeForm.feedback} onChange={e => setGradeForm({ ...gradeForm, feedback: e.target.value })} />
              </div>
            </div>
            <div className="flex justify-end gap-3">
              <button onClick={() => setGrading(null)} className="btn-secondary">Cancel</button>
              <button onClick={handleGrade} disabled={saving} className="btn-primary flex items-center gap-2">
                {saving ? 'Saving...' : <><CheckCircle size={16} /> Complete Grading</>}
              </button>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
