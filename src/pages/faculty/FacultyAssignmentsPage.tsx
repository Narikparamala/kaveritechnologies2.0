import { useEffect, useState, useCallback } from 'react';
import {
  FileText, Plus, Edit2, Trash2, Eye, EyeOff, Calendar, Star, MessageSquare,
  ChevronDown, ChevronRight, Check, X, AlertCircle, Lock, Copy, List, Code, Type
} from 'lucide-react';
import { PageHeader } from '../../components/common/PageHeader';
import { EmptyState } from '../../components/ui/EmptyState';
import { Modal } from '../../components/ui/Modal';
import { Badge } from '../../components/ui/Badge';
import { useToast } from '../../components/ui/Toast';
import { useAuth } from '../../contexts/AuthContext';
import { getFacultyCourses } from '../../services/faculty';
import {
  getFacultyAssignments, createAssignment, updateAssignment,
  deleteAssignment, getAssignmentSubmissions, gradeSubmission,
  getTestCases, createTestCase, updateTestCase, deleteTestCase,
  getAssignmentQuestions, createAssignmentQuestion, updateAssignmentQuestion, deleteAssignmentQuestion,
} from '../../services/assignments';
import { formatDate } from '../../lib/utils';
import type { Course, Assignment, AssignmentQuestion, AssignmentSubmission, Profile, AssignmentTestCase } from '../../types/database';

export default function FacultyAssignmentsPage() {
  const { profile } = useAuth();
  const { success, error: toastError } = useToast();
  const [courses, setCourses] = useState<Course[]>([]);
  const [assignments, setAssignments] = useState<(Assignment & { course: Course })[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Assignment Modals
  const [editModal, setEditModal] = useState<{ mode: 'create' | 'edit'; assignment?: Assignment } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Assignment | null>(null);
  
  // Question Builder State
  const [questionBuilderView, setQuestionBuilderView] = useState<Assignment | null>(null);
  const [questions, setQuestions] = useState<AssignmentQuestion[]>([]);
  const [qModal, setQModal] = useState<{ mode: 'create' | 'edit'; q?: AssignmentQuestion } | null>(null);
  
  // Test Case State
  const [tcModal, setTcModal] = useState<{ mode: 'create' | 'edit'; questionId: string; tc?: AssignmentTestCase } | null>(null);
  const [testCases, setTestCases] = useState<Record<string, AssignmentTestCase[]>>({});

  // Form States
  const [form, setForm] = useState<Partial<Assignment>>({});
  const [qForm, setQForm] = useState<Partial<AssignmentQuestion>>({});
  const [tcForm, setTcForm] = useState<Partial<AssignmentTestCase>>({});

  const loadData = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    try {
      const [cs, asgs] = await Promise.all([
        getFacultyCourses(profile.id),
        getFacultyAssignments(profile.id),
      ]);
      setCourses(cs);
      setAssignments(asgs);
    } catch (e: any) { toastError('Error', e.message); }
    setLoading(false);
  }, [profile]);

  useEffect(() => { loadData(); }, [loadData]);

  // Assignment Handlers
  const handleSaveAssignment = async () => {
    if (!profile) return;
    try {
      if (editModal?.mode === 'create') {
        await createAssignment({ ...form, created_by: profile.id });
        success('Assignment created');
      } else if (editModal?.assignment) {
        await updateAssignment(editModal.assignment.id, form);
        success('Assignment updated');
      }
      setEditModal(null);
      await loadData();
    } catch (e: any) { toastError('Error', e.message); }
  };

  const handleDeleteAssignment = async () => {
    if (!deleteTarget) return;
    try {
      await deleteAssignment(deleteTarget.id);
      success('Assignment deleted');
      setDeleteTarget(null);
      await loadData();
    } catch (e: any) { toastError('Error', e.message); }
  };

  // Question Handlers
  const openQuestionBuilder = async (asg: Assignment) => {
    setQuestionBuilderView(asg);
    const qs = await getAssignmentQuestions(asg.id);
    setQuestions(qs);
    // Load test cases for all questions
    const tcMap: Record<string, AssignmentTestCase[]> = {};
    for (const q of qs) {
      if (q.question_type === 'coding') {
        tcMap[q.id] = await getTestCases(asg.id, q.id);
      }
    }
    setTestCases(tcMap);
  };

  const handleSaveQuestion = async () => {
    if (!questionBuilderView) return;
    try {
      if (qModal?.mode === 'create') {
        await createAssignmentQuestion({ ...qForm, assignment_id: questionBuilderView.id, order_index: questions.length });
        success('Question added');
      } else if (qModal?.q) {
        await updateAssignmentQuestion(qModal.q.id, qForm);
        success('Question updated');
      }
      setQModal(null);
      await openQuestionBuilder(questionBuilderView);
    } catch (e: any) { toastError('Error', e.message); }
  };

  const handleDeleteQuestion = async (qId: string) => {
    if (!questionBuilderView) return;
    try {
      await deleteAssignmentQuestion(qId);
      success('Question deleted');
      await openQuestionBuilder(questionBuilderView);
    } catch (e: any) { toastError('Error', e.message); }
  };

  // Test Case Handlers
  const handleSaveTestCase = async () => {
    if (!questionBuilderView || !tcModal) return;
    try {
      if (tcModal.mode === 'create') {
        await createTestCase({ ...tcForm, assignment_id: questionBuilderView.id, question_id: tcModal.questionId });
        success('Test case added');
      } else if (tcModal.tc) {
        await updateTestCase(tcModal.tc.id, tcForm);
        success('Test case updated');
      }
      setTcModal(null);
      await openQuestionBuilder(questionBuilderView);
    } catch (e: any) { toastError('Error', e.message); }
  };

  if (loading) return <div className="p-8 text-center text-slate-400">Loading...</div>;

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto animate-fade-in">
      <PageHeader title="Assignments" subtitle="Manage assignment workflows and questions" icon={FileText} action={
        <button onClick={() => { setForm({ course_id: courses[0]?.id, assignment_type: 'coding', status: 'draft' }); setEditModal({ mode: 'create' }); }} className="btn-primary flex items-center gap-2">
          <Plus size={16} /> Create Assignment
        </button>
      } />

      {assignments.length === 0 ? (
        <EmptyState icon={FileText} title="No assignments yet" description="Create your first assignment to get started." />
      ) : (
        <div className="grid gap-4">
          {assignments.map(asg => (
            <div key={asg.id} className="card p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-semibold text-slate-900 dark:text-white">{asg.title}</h3>
                    <Badge variant={asg.status === 'published' ? 'success' : 'secondary'}>{asg.status}</Badge>
                    <Badge variant="info" className="capitalize">{asg.assignment_type}</Badge>
                  </div>
                  <p className="text-sm text-slate-500 dark:text-slate-400">{asg.course?.title}</p>
                  <div className="flex items-center gap-4 mt-2 text-xs text-slate-400">
                    <span className="flex items-center gap-1"><Calendar size={12} /> Due: {asg.due_date ? formatDate(asg.due_date) : 'No due date'}</span>
                    <span>Max Marks: {asg.max_marks}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => openQuestionBuilder(asg)} className="btn-secondary text-xs flex items-center gap-1"><List size={14} /> Questions</button>
                  <button onClick={() => { setForm(asg); setEditModal({ mode: 'edit', assignment: asg }); }} className="p-2 text-slate-400 hover:text-primary-600 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700"><Edit2 size={16} /></button>
                  <button onClick={() => setDeleteTarget(asg)} className="p-2 text-slate-400 hover:text-red-600 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20"><Trash2 size={16} /></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Assignment Edit Modal */}
      <Modal isOpen={!!editModal} onClose={() => setEditModal(null)} title={editModal?.mode === 'create' ? 'Create Assignment' : 'Edit Assignment'}>
        <div className="space-y-4 p-4">
          <div>
            <label className="label">Course</label>
            <select className="input" value={form.course_id} onChange={e => setForm({ ...form, course_id: e.target.value })}>
              {courses.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Title</label>
            <input className="input" value={form.title || ''} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Assignment Title" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Type</label>
              <select className="input" value={form.assignment_type} onChange={e => setForm({ ...form, assignment_type: e.target.value as any })}>
                <option value="coding">Coding</option>
                <option value="written">Written</option>
                <option value="mixed">Mixed</option>
              </select>
            </div>
            <div>
              <label className="label">Status</label>
              <select className="input" value={form.status} onChange={e => setForm({ ...form, status: e.target.value as any })}>
                <option value="draft">Draft</option>
                <option value="published">Published</option>
                <option value="closed">Closed</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Due Date</label>
              <input type="datetime-local" className="input" value={form.due_date ? new Date(form.due_date).toISOString().slice(0, 16) : ''} onChange={e => setForm({ ...form, due_date: e.target.value })} />
            </div>
            <div>
              <label className="label">Max Marks</label>
              <input type="number" className="input" value={form.max_marks || 0} onChange={e => setForm({ ...form, max_marks: Number(e.target.value) })} />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" checked={form.allow_late_submission} onChange={e => setForm({ ...form, allow_late_submission: e.target.checked })} />
            <label className="text-sm">Allow late submissions</label>
          </div>
          <div className="flex justify-end gap-3 pt-4">
            <button onClick={() => setEditModal(null)} className="btn-secondary">Cancel</button>
            <button onClick={handleSaveAssignment} className="btn-primary">Save Assignment</button>
          </div>
        </div>
      </Modal>

      {/* Question Builder Modal */}
      <Modal isOpen={!!questionBuilderView} onClose={() => setQuestionBuilderView(null)} title={`Questions: ${questionBuilderView?.title}`} size="xl">
        <div className="p-4 space-y-4 max-h-[80vh] overflow-y-auto">
          <div className="flex justify-between items-center">
            <p className="text-sm text-slate-500">{questions.length} Questions</p>
            <button onClick={() => { setQForm({ question_type: 'coding', marks: 10 }); setQModal({ mode: 'create' }); }} className="btn-primary text-xs flex items-center gap-1"><Plus size={14} /> Add Question</button>
          </div>
          
          {questions.length === 0 ? (
            <div className="text-center py-12 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-2xl">
              <p className="text-slate-400 text-sm">No questions added yet.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {questions.map((q, idx) => (
                <div key={q.id} className="p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="w-6 h-6 rounded-full bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400 flex items-center justify-center text-xs font-bold">{idx + 1}</span>
                        <h4 className="font-medium text-slate-900 dark:text-white">{q.title}</h4>
                        <Badge variant="secondary" className="text-[10px] uppercase">{q.question_type}</Badge>
                      </div>
                      <p className="text-sm text-slate-600 dark:text-slate-400 line-clamp-2">{q.problem_statement}</p>
                      <div className="flex items-center gap-3 mt-2 text-xs text-slate-400">
                        <span>Marks: {q.marks}</span>
                        <span className="capitalize">Difficulty: {q.difficulty}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      {q.question_type === 'coding' && (
                        <button onClick={() => { setTcForm({ is_hidden: false, weight: 1 }); setTcModal({ mode: 'create', questionId: q.id }); }} className="p-2 text-slate-400 hover:text-primary-600" title="Add Test Case"><Star size={16} /></button>
                      )}
                      <button onClick={() => { setQForm(q); setQModal({ mode: 'edit', q }); }} className="p-2 text-slate-400 hover:text-primary-600"><Edit2 size={16} /></button>
                      <button onClick={() => handleDeleteQuestion(q.id)} className="p-2 text-slate-400 hover:text-red-600"><Trash2 size={16} /></button>
                    </div>
                  </div>
                  
                  {/* Test Cases for this question */}
                  {q.question_type === 'coding' && testCases[q.id]?.length > 0 && (
                    <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700">
                      <p className="text-xs font-medium text-slate-500 mb-2">Test Cases</p>
                      <div className="grid gap-2">
                        {testCases[q.id].map((tc, tcIdx) => (
                          <div key={tc.id} className="flex items-center justify-between p-2 rounded-lg bg-white dark:bg-slate-900 text-xs font-mono">
                            <div className="flex-1 truncate">
                              <span className="text-slate-400 mr-2">#{tcIdx + 1}</span>
                              <span className="text-primary-600 dark:text-primary-400">In: {tc.input_data || 'None'}</span>
                              <span className="mx-2 text-slate-300">|</span>
                              <span className="text-emerald-600 dark:text-emerald-400">Out: {tc.expected_output}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              {tc.is_hidden && <Lock size={12} className="text-amber-500" />}
                              <button onClick={() => { setTcForm(tc); setTcModal({ mode: 'edit', questionId: q.id, tc }); }} className="text-slate-400 hover:text-primary-600"><Edit2 size={12} /></button>
                              <button onClick={async () => { await deleteTestCase(tc.id); await openQuestionBuilder(questionBuilderView!); }} className="text-slate-400 hover:text-red-600"><Trash2 size={12} /></button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </Modal>

      {/* Question Edit Modal */}
      <Modal isOpen={!!qModal} onClose={() => setQModal(null)} title={qModal?.mode === 'create' ? 'Add Question' : 'Edit Question'} size="lg">
        <div className="p-4 space-y-4 max-h-[80vh] overflow-y-auto">
          <div>
            <label className="label">Question Title</label>
            <input className="input" value={qForm.title || ''} onChange={e => setQForm({ ...qForm, title: e.target.value })} placeholder="e.g., Two Sum Problem" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Type</label>
              <select className="input" value={qForm.question_type} onChange={e => setQForm({ ...qForm, question_type: e.target.value as any })}>
                <option value="coding">Coding</option>
                <option value="short_answer">Short Answer</option>
                <option value="long_answer">Long Answer</option>
              </select>
            </div>
            <div>
              <label className="label">Marks</label>
              <input type="number" className="input" value={qForm.marks || 0} onChange={e => setQForm({ ...qForm, marks: Number(e.target.value) })} />
            </div>
          </div>
          <div>
            <label className="label">Problem Statement</label>
            <textarea className="input min-h-[100px]" value={qForm.problem_statement || ''} onChange={e => setQForm({ ...qForm, problem_statement: e.target.value })} placeholder="Describe the problem..." />
          </div>
          {qForm.question_type === 'coding' && (
            <>
              <div>
                <label className="label">Starter Code (Python)</label>
                <textarea className="input font-mono min-h-[100px]" value={qForm.starter_code || ''} onChange={e => setQForm({ ...qForm, starter_code: e.target.value })} placeholder="def solution():\n    pass" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Input Format</label>
                  <textarea className="input text-xs" value={qForm.input_format || ''} onChange={e => setQForm({ ...qForm, input_format: e.target.value })} />
                </div>
                <div>
                  <label className="label">Output Format</label>
                  <textarea className="input text-xs" value={qForm.output_format || ''} onChange={e => setQForm({ ...qForm, output_format: e.target.value })} />
                </div>
              </div>
            </>
          )}
          <div className="flex justify-end gap-3 pt-4">
            <button onClick={() => setQModal(null)} className="btn-secondary">Cancel</button>
            <button onClick={handleSaveQuestion} className="btn-primary">Save Question</button>
          </div>
        </div>
      </Modal>

      {/* Test Case Modal */}
      <Modal isOpen={!!tcModal} onClose={() => setTcModal(null)} title={tcModal?.mode === 'create' ? 'Add Test Case' : 'Edit Test Case'}>
        <div className="p-4 space-y-4">
          <div>
            <label className="label">Input Data</label>
            <textarea className="input font-mono" value={tcForm.input_data || ''} onChange={e => setQForm({ ...tcForm, input_data: e.target.value })} placeholder="Input for the program..." />
          </div>
          <div>
            <label className="label">Expected Output</label>
            <textarea className="input font-mono" value={tcForm.expected_output || ''} onChange={e => setQForm({ ...tcForm, expected_output: e.target.value })} placeholder="Expected output..." />
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <input type="checkbox" checked={tcForm.is_hidden} onChange={e => setTcForm({ ...tcForm, is_hidden: e.target.checked })} />
              <label className="text-sm">Hidden Case</label>
            </div>
            <div className="flex-1">
              <label className="label">Weight</label>
              <input type="number" className="input" value={tcForm.weight || 1} onChange={e => setTcForm({ ...tcForm, weight: Number(e.target.value) })} />
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-4">
            <button onClick={() => setTcModal(null)} className="btn-secondary">Cancel</button>
            <button onClick={handleSaveTestCase} className="btn-primary">Save Test Case</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
