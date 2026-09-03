import { useEffect, useState, useCallback } from 'react';
import {
  FileText, Plus, Edit2, Trash2, Eye, EyeOff, Calendar, Star, MessageSquare,
  ChevronDown, ChevronRight, Check, X, AlertCircle, Lock,
} from 'lucide-react';
import { PageHeader } from '../../components/common/PageHeader';
import { EmptyState } from '../../components/ui/EmptyState';
import { Modal } from '../../components/ui/Modal';
import { Badge } from '../../components/ui/Badge';
import { useToast } from '../../components/ui/Toast';
import { useAuth } from '../../contexts/AuthContext';
import {
  getFacultyCourses, getFacultyAssignments, createAssignment, updateAssignment,
  deleteAssignment, getAssignmentSubmissions, gradeSubmission,
  getTestCases, createTestCase, updateTestCase, deleteTestCase,
} from '../../services/faculty';
import { formatDate } from '../../lib/utils';
import type { Course, Assignment, AssignmentSubmission, Profile, AssignmentTestCase } from '../../types/database';

export default function FacultyAssignmentsPage() {
  const { profile } = useAuth();
  const { success, error: toastError } = useToast();
  const [courses, setCourses] = useState<Course[]>([]);
  const [assignments, setAssignments] = useState<(Assignment & { course: Course })[]>([]);
  const [loading, setLoading] = useState(true);
  const [editModal, setEditModal] = useState<{ mode: 'create' | 'edit'; assignment?: Assignment } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Assignment | null>(null);
  const [submissionsView, setSubmissionsView] = useState<Assignment | null>(null);
  const [submissions, setSubmissions] = useState<(AssignmentSubmission & { student_profile: Profile })[]>([]);
  const [gradingModal, setGradingModal] = useState<AssignmentSubmission | null>(null);
  const [gradeForm, setGradeForm] = useState({ score: '', feedback: '' });
  const [saving, setSaving] = useState(false);
  const [expandedTestCases, setExpandedTestCases] = useState<Set<string>>(new Set());
  const [testCases, setTestCases] = useState<AssignmentTestCase[]>([]);
  const [tcModal, setTcModal] = useState<{ mode: 'create' | 'edit'; assignmentId: string; tc?: AssignmentTestCase } | null>(null);
  const [tcForm, setTcForm] = useState({ input_data: '', expected_output: '', is_hidden: false, weight: 1 });
  const [hintsInput, setHintsInput] = useState('');

  const defaultForm = () => ({
    course_id: courses[0]?.id ?? '',
    title: '',
    problem_statement: '',
    description: '',
    instructions: '',
    input_format: '',
    output_format: '',
    constraints_text: '',
    starter_code: '',
    hints: [] as string[],
    sample_solution: '',
    sample_solution_visibility: 'after_submission' as const,
    due_date: '',
    max_marks: 100,
    passing_score: '',
    max_submissions: '',
    allow_resubmit: true,
    is_published: false,
  });
  const [form, setForm] = useState(defaultForm());

  const loadData = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    const [cs, asgs] = await Promise.all([
      getFacultyCourses(profile.id),
      getFacultyAssignments(profile.id),
    ]);
    setCourses(cs);
    setAssignments(asgs);
    setLoading(false);
  }, [profile]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleSave = async () => {
    if (!editModal || !profile) return;
    setSaving(true);
    try {
      const hints = hintsInput.split('\n').map(h => h.trim()).filter(Boolean);
      const payload = {
        course_id: form.course_id,
        title: form.title,
        problem_statement: form.problem_statement || null,
        description: form.description || null,
        instructions: form.instructions || null,
        input_format: form.input_format || null,
        output_format: form.output_format || null,
        constraints_text: form.constraints_text || null,
        starter_code: form.starter_code || null,
        hints,
        sample_solution: form.sample_solution || null,
        sample_solution_visibility: form.sample_solution_visibility,
        due_date: form.due_date || null,
        max_marks: Number(form.max_marks) || 100,
        passing_score: form.passing_score ? Number(form.passing_score) : null,
        max_submissions: form.max_submissions ? Number(form.max_submissions) : null,
        allow_resubmit: form.allow_resubmit,
        is_published: form.is_published,
      };
      if (editModal.mode === 'create') {
        await createAssignment({ ...payload, created_by: profile.id });
        success('Assignment created');
      } else if (editModal.assignment) {
        await updateAssignment(editModal.assignment.id, payload as any);
        success('Assignment updated');
      }
      setEditModal(null);
      await loadData();
    } catch (e: any) { toastError('Error', e.message); }
    setSaving(false);
  };

  const handleTogglePublish = async (asg: Assignment) => {
    try {
      await updateAssignment(asg.id, { is_published: !asg.is_published });
      success(asg.is_published ? 'Unpublished' : 'Published');
      await loadData();
    } catch (e: any) { toastError('Error', e.message); }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setSaving(true);
    try { await deleteAssignment(deleteTarget.id); success('Deleted'); setDeleteTarget(null); await loadData(); }
    catch (e: any) { toastError('Error', e.message); }
    setSaving(false);
  };

  const openSubmissions = async (asg: Assignment) => {
    setSubmissionsView(asg);
    const subs = await getAssignmentSubmissions(asg.id);
    setSubmissions(subs);
  };

  const openTestCases = async (asg: Assignment) => {
    setExpandedTestCases(prev => { const n = new Set(prev); if (n.has(asg.id)) n.delete(asg.id); else n.add(asg.id); return n; });
    const tcs = await getTestCases(asg.id, true);
    setTestCases(prev => { const next = prev.filter(t => t.assignment_id !== asg.id); return [...next, ...tcs]; });
  };

  const handleGrade = async () => {
    if (!gradingModal || !profile) return;
    setSaving(true);
    try {
      await gradeSubmission(gradingModal.id, Number(gradeForm.score), gradeForm.feedback, profile.id);
      success('Graded');
      setGradingModal(null);
      if (submissionsView) await openSubmissions(submissionsView);
    } catch (e: any) { toastError('Error', e.message); }
    setSaving(false);
  };

  const handleSaveTestCase = async () => {
    if (!tcModal) return;
    setSaving(true);
    try {
      if (tcModal.mode === 'create') {
        await createTestCase({ assignment_id: tcModal.assignmentId, input_data: tcForm.input_data || undefined, expected_output: tcForm.expected_output, is_hidden: tcForm.is_hidden, weight: tcForm.weight });
        success('Test case added');
      } else if (tcModal.tc) {
        await updateTestCase(tcModal.tc.id, { input_data: tcForm.input_data || null, expected_output: tcForm.expected_output, is_hidden: tcForm.is_hidden, weight: tcForm.weight });
        success('Test case updated');
      }
      setTcModal(null);
      const tcs = await getTestCases(tcModal.assignmentId, true);
      setTestCases(prev => [...prev.filter(t => t.assignment_id !== tcModal.assignmentId), ...tcs]);
    } catch (e: any) { toastError('Error', e.message); }
    setSaving(false);
  };

  const handleDeleteTestCase = async (tc: AssignmentTestCase) => {
    try {
      await deleteTestCase(tc.id);
      setTestCases(prev => prev.filter(t => t.id !== tc.id));
    } catch (e: any) { toastError('Error', e.message); }
  };

  const openCreate = () => {
    setForm({ ...defaultForm(), course_id: courses[0]?.id ?? '' });
    setHintsInput('');
    setEditModal({ mode: 'create' });
  };

  const openEdit = (asg: Assignment) => {
    setForm({
      course_id: asg.course_id,
      title: asg.title,
      problem_statement: asg.problem_statement ?? '',
      description: asg.description ?? '',
      instructions: asg.instructions ?? '',
      input_format: asg.input_format ?? '',
      output_format: asg.output_format ?? '',
      constraints_text: asg.constraints_text ?? '',
      starter_code: asg.starter_code ?? '',
      hints: asg.hints ?? [],
      sample_solution: asg.sample_solution ?? '',
      sample_solution_visibility: asg.sample_solution_visibility ?? 'after_submission',
      due_date: asg.due_date ? new Date(asg.due_date).toISOString().slice(0, 16) : '',
      max_marks: asg.max_marks,
      passing_score: asg.passing_score?.toString() ?? '',
      max_submissions: asg.max_submissions?.toString() ?? '',
      allow_resubmit: asg.allow_resubmit,
      is_published: asg.is_published,
    });
    setHintsInput((asg.hints ?? []).join('\n'));
    setEditModal({ mode: 'edit', assignment: asg });
  };

  if (loading) return <div className="p-8 text-center text-slate-400">Loading...</div>;

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto animate-fade-in">
      <PageHeader title="Assignments" subtitle="Create and manage Python coding assignments" icon={FileText} action={
        <button onClick={openCreate} disabled={courses.length === 0} className="btn-primary flex items-center gap-2 disabled:opacity-50">
          <Plus size={16} /> Create Assignment
        </button>
      } />

      {courses.length === 0 ? (
        <EmptyState icon={FileText} title="No courses assigned" description="You need to be assigned to courses first." />
      ) : assignments.length === 0 ? (
        <EmptyState icon={FileText} title="No assignments yet" description="Create your first Python coding assignment." action={
          <button onClick={openCreate} className="btn-primary text-sm flex items-center gap-2"><Plus size={14} /> Create Assignment</button>
        } />
      ) : (
        <div className="space-y-3">
          {assignments.map(asg => {
            const asgTestCases = testCases.filter(t => t.assignment_id === asg.id);
            const isExpanded = expandedTestCases.has(asg.id);
            return (
              <div key={asg.id} className="card overflow-hidden">
                <div className="p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <h3 className="font-semibold text-slate-900 dark:text-white">{asg.title}</h3>
                        <span className={`badge text-xs ${asg.is_published ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-slate-100 text-slate-400'}`}>{asg.is_published ? 'Published' : 'Draft'}</span>
                        {asg.starter_code && <span className="badge text-xs bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">Python</span>}
                      </div>
                      <p className="text-xs text-primary-600 dark:text-primary-400 mb-1">{asg.course?.title}</p>
                      {asg.problem_statement && <p className="text-sm text-slate-500 dark:text-slate-400 line-clamp-2">{asg.problem_statement}</p>}
                      <div className="flex items-center gap-4 text-xs text-slate-400 mt-2">
                        {asg.due_date && <span className="flex items-center gap-1"><Calendar size={11} /> Due {formatDate(asg.due_date)}</span>}
                        <span>Max: {asg.max_marks}</span>
                        {asg.hints?.length > 0 && <span>{asg.hints.length} hints</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button onClick={() => openSubmissions(asg)} className="btn-secondary text-xs flex items-center gap-1"><MessageSquare size={12} /> Submissions</button>
                      <button onClick={() => openTestCases(asg)} className="btn-secondary text-xs flex items-center gap-1">
                        {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />} Tests
                      </button>
                      <button onClick={() => handleTogglePublish(asg)} className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700">{asg.is_published ? <EyeOff size={14} /> : <Eye size={14} />}</button>
                      <button onClick={() => openEdit(asg)} className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700"><Edit2 size={14} /></button>
                      <button onClick={() => setDeleteTarget(asg)} className="p-2 text-red-400 hover:text-red-600 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20"><Trash2 size={14} /></button>
                    </div>
                  </div>
                </div>

                {isExpanded && (
                  <div className="border-t border-slate-100 dark:border-slate-700 p-4">
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Test Cases ({asgTestCases.length})</p>
                      <button onClick={() => { setTcForm({ input_data: '', expected_output: '', is_hidden: false, weight: 1 }); setTcModal({ mode: 'create', assignmentId: asg.id }); }} className="btn-primary text-xs flex items-center gap-1"><Plus size={11} /> Add Test</button>
                    </div>
                    <div className="p-2 rounded-lg bg-blue-50 dark:bg-blue-900/20 text-xs text-blue-700 dark:text-blue-400 mb-3 flex items-start gap-1.5">
                      <AlertCircle size={12} className="flex-shrink-0 mt-0.5" />
                      Hidden test-case grading requires a secure server-side execution service. Faculty manual review is currently enabled.
                    </div>
                    {asgTestCases.length === 0 ? <p className="text-xs text-slate-400 text-center py-4">No test cases yet.</p> : (
                      <div className="space-y-2">
                        {asgTestCases.map((tc, idx) => (
                          <div key={tc.id} className="flex items-start gap-3 p-2 rounded-lg bg-slate-50 dark:bg-slate-800 text-xs">
                            <span className="text-slate-400 font-mono mt-0.5">#{idx+1}</span>
                            <div className="flex-1 font-mono">
                              {tc.input_data && <div className="text-slate-500">In: {tc.input_data}</div>}
                              <div className="text-emerald-700 dark:text-emerald-400">Expected: {tc.expected_output}</div>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <span className={`badge text-xs ${tc.is_hidden ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' : 'bg-slate-100 text-slate-500'}`}>{tc.is_hidden ? 'Hidden' : 'Visible'}</span>
                              <button onClick={() => { setTcForm({ input_data: tc.input_data ?? '', expected_output: tc.expected_output, is_hidden: tc.is_hidden, weight: tc.weight }); setTcModal({ mode: 'edit', assignmentId: asg.id, tc }); }} className="p-1 text-slate-400 hover:text-slate-600"><Edit2 size={11} /></button>
                              <button onClick={() => handleDeleteTestCase(tc)} className="p-1 text-red-400 hover:text-red-600"><X size={11} /></button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Create/Edit Modal */}
      <Modal open={!!editModal} onClose={() => setEditModal(null)} title={editModal?.mode === 'edit' ? 'Edit Assignment' : 'Create Assignment'} size="xl">
        <div className="space-y-4 max-h-[70vh] overflow-y-auto">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Course</label>
              <select className="input" value={form.course_id} onChange={e => setForm(f => ({ ...f, course_id: e.target.value }))} disabled={editModal?.mode === 'edit'}>
                {courses.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Title</label>
              <input className="input" placeholder="Assignment title..." value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
            </div>
          </div>
          <div>
            <label className="label">Problem Statement</label>
            <textarea className="input min-h-[80px] resize-none" placeholder="Full problem description..." value={form.problem_statement} onChange={e => setForm(f => ({ ...f, problem_statement: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Input Format</label>
              <textarea className="input min-h-[60px] resize-none text-sm" placeholder="Input specification..." value={form.input_format} onChange={e => setForm(f => ({ ...f, input_format: e.target.value }))} />
            </div>
            <div>
              <label className="label">Output Format</label>
              <textarea className="input min-h-[60px] resize-none text-sm" placeholder="Output specification..." value={form.output_format} onChange={e => setForm(f => ({ ...f, output_format: e.target.value }))} />
            </div>
          </div>
          <div>
            <label className="label">Constraints</label>
            <textarea className="input min-h-[50px] resize-none text-sm" placeholder="e.g. 1 ≤ n ≤ 1000" value={form.constraints_text} onChange={e => setForm(f => ({ ...f, constraints_text: e.target.value }))} />
          </div>
          <div>
            <label className="label">Starter Python Code</label>
            <textarea className="input min-h-[80px] resize-none font-mono text-sm bg-slate-900 text-slate-100" placeholder="# Starter code for students..." value={form.starter_code} onChange={e => setForm(f => ({ ...f, starter_code: e.target.value }))} />
          </div>
          <div>
            <label className="label">Hints (one per line)</label>
            <textarea className="input min-h-[60px] resize-none text-sm" placeholder="Hint 1&#10;Hint 2" value={hintsInput} onChange={e => setHintsInput(e.target.value)} />
          </div>
          <div>
            <label className="label">Sample Solution (optional)</label>
            <textarea className="input min-h-[70px] resize-none font-mono text-sm bg-slate-900 text-slate-100" placeholder="# Sample solution..." value={form.sample_solution} onChange={e => setForm(f => ({ ...f, sample_solution: e.target.value }))} />
          </div>
          <div>
            <label className="label">Solution Visibility</label>
            <select className="input" value={form.sample_solution_visibility} onChange={e => setForm(f => ({ ...f, sample_solution_visibility: e.target.value as any }))}>
              <option value="always">Always visible</option>
              <option value="after_submission">After student submits</option>
              <option value="after_grading">After faculty grades</option>
              <option value="never">Never visible</option>
            </select>
          </div>
          <div>
            <label className="label">Instructions (additional)</label>
            <textarea className="input min-h-[60px] resize-none text-sm" value={form.instructions} onChange={e => setForm(f => ({ ...f, instructions: e.target.value }))} />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div><label className="label">Due Date</label><input type="datetime-local" className="input" value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} /></div>
            <div><label className="label">Max Marks</label><input type="number" className="input" value={form.max_marks} onChange={e => setForm(f => ({ ...f, max_marks: Number(e.target.value) }))} /></div>
            <div><label className="label">Passing Score</label><input type="number" className="input" placeholder="Optional" value={form.passing_score} onChange={e => setForm(f => ({ ...f, passing_score: e.target.value }))} /></div>
          </div>
          <div className="flex items-center gap-6">
            <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" className="w-4 h-4 rounded" checked={form.allow_resubmit} onChange={e => setForm(f => ({ ...f, allow_resubmit: e.target.checked }))} /><span className="text-sm text-slate-700 dark:text-slate-300">Allow resubmission</span></label>
            <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" className="w-4 h-4 rounded" checked={form.is_published} onChange={e => setForm(f => ({ ...f, is_published: e.target.checked }))} /><span className="text-sm text-slate-700 dark:text-slate-300">Publish immediately</span></label>
          </div>
          <div className="flex gap-3 justify-end">
            <button onClick={() => setEditModal(null)} className="btn-secondary">Cancel</button>
            <button onClick={handleSave} disabled={saving || !form.title} className="btn-primary flex items-center gap-2 disabled:opacity-50">
              {saving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : null}
              {editModal?.mode === 'edit' ? 'Update' : 'Create'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Submissions Modal */}
      <Modal open={!!submissionsView} onClose={() => setSubmissionsView(null)} title={`Submissions: ${submissionsView?.title}`} size="xl">
        {submissions.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-8">No submissions yet.</p>
        ) : (
          <div className="space-y-3 max-h-[500px] overflow-y-auto">
            {submissions.map(sub => (
              <div key={sub.id} className="p-4 rounded-xl border border-slate-100 dark:border-slate-700">
                <div className="flex items-start justify-between gap-4 mb-2">
                  <div>
                    <p className="font-medium text-slate-900 dark:text-white text-sm">{sub.student_profile?.full_name}</p>
                    <p className="text-xs text-slate-400">{sub.student_profile?.email}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={sub.status === 'graded' ? 'success' : 'info'} className="text-xs">{sub.status}</Badge>
                    {sub.submission_number > 1 && <span className="text-xs text-slate-400">#{sub.submission_number}</span>}
                  </div>
                </div>
                {sub.visible_tests_total > 0 && (
                  <p className={`text-xs mb-2 ${sub.visible_tests_passed === sub.visible_tests_total ? 'text-emerald-600' : 'text-amber-600'}`}>
                    Visible tests: {sub.visible_tests_passed}/{sub.visible_tests_total} passed
                  </p>
                )}
                {(sub as any).submitted_code && (
                  <details className="mb-2">
                    <summary className="text-xs text-slate-500 cursor-pointer">View submitted code</summary>
                    <pre className="text-xs bg-slate-900 text-slate-100 rounded-lg p-3 mt-1 font-mono overflow-x-auto max-h-48">{(sub as any).submitted_code}</pre>
                  </details>
                )}
                {sub.submission_text && <p className="text-sm text-slate-600 dark:text-slate-300 mb-2 whitespace-pre-wrap">{sub.submission_text}</p>}
                <div className="flex items-center gap-3 text-xs text-slate-400 mb-2">
                  <span>Submitted: {formatDate(sub.submitted_at)}</span>
                </div>
                {sub.score !== null && <p className="text-sm text-emerald-600 font-medium mb-1">Score: {sub.score}/{submissionsView?.max_marks}</p>}
                {sub.feedback && <p className="text-xs text-slate-500 italic mb-2">Feedback: {sub.feedback}</p>}
                {sub.status !== 'graded' && (
                  <button onClick={() => { setGradingModal(sub); setGradeForm({ score: '', feedback: sub.feedback ?? '' }); }} className="btn-primary text-xs flex items-center gap-1">
                    <Star size={12} /> Grade
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </Modal>

      {/* Grading Modal */}
      <Modal open={!!gradingModal} onClose={() => setGradingModal(null)} title="Grade Submission">
        <div className="space-y-4">
          <div><label className="label">Score (out of {submissionsView?.max_marks})</label><input type="number" className="input" value={gradeForm.score} onChange={e => setGradeForm(f => ({ ...f, score: e.target.value }))} /></div>
          <div><label className="label">Feedback</label><textarea className="input min-h-[80px] resize-none" value={gradeForm.feedback} onChange={e => setGradeForm(f => ({ ...f, feedback: e.target.value }))} /></div>
          <div className="flex gap-3 justify-end">
            <button onClick={() => setGradingModal(null)} className="btn-secondary">Cancel</button>
            <button onClick={handleGrade} disabled={saving || !gradeForm.score} className="btn-primary flex items-center gap-2">
              {saving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Star size={14} />}Submit Grade
            </button>
          </div>
        </div>
      </Modal>

      {/* Test Case Modal */}
      <Modal open={!!tcModal} onClose={() => setTcModal(null)} title={tcModal?.mode === 'edit' ? 'Edit Test Case' : 'Add Test Case'}>
        <div className="space-y-4">
          <div><label className="label">Input Data (optional)</label><textarea className="input min-h-[60px] resize-none font-mono text-sm" placeholder="stdin input..." value={tcForm.input_data} onChange={e => setTcForm(f => ({ ...f, input_data: e.target.value }))} /></div>
          <div><label className="label">Expected Output <span className="text-red-500">*</span></label><textarea className="input min-h-[60px] resize-none font-mono text-sm" placeholder="Expected stdout..." value={tcForm.expected_output} onChange={e => setTcForm(f => ({ ...f, expected_output: e.target.value }))} /></div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="label">Weight</label><input type="number" className="input" value={tcForm.weight} onChange={e => setTcForm(f => ({ ...f, weight: Number(e.target.value) }))} /></div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 cursor-pointer pb-3">
                <input type="checkbox" className="w-4 h-4 rounded" checked={tcForm.is_hidden} onChange={e => setTcForm(f => ({ ...f, is_hidden: e.target.checked }))} />
                <span className="text-sm text-slate-700 dark:text-slate-300 flex items-center gap-1"><Lock size={12} /> Hidden test case</span>
              </label>
            </div>
          </div>
          {tcForm.is_hidden && (
            <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 text-xs flex items-start gap-2">
              <AlertCircle size={12} className="flex-shrink-0 mt-0.5" />
              Students cannot see hidden test cases. They require manual faculty grading or a secure server-side execution service.
            </div>
          )}
          <div className="flex gap-3 justify-end">
            <button onClick={() => setTcModal(null)} className="btn-secondary">Cancel</button>
            <button onClick={handleSaveTestCase} disabled={saving || !tcForm.expected_output} className="btn-primary flex items-center gap-2 disabled:opacity-50">
              {saving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : null}
              {tcModal?.mode === 'edit' ? 'Update' : 'Add'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Delete Confirmation */}
      <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Confirm Delete" size="sm">
        <p className="text-sm text-slate-600 dark:text-slate-300 mb-4">Delete <strong>{deleteTarget?.title}</strong>? All submissions and test cases will also be deleted.</p>
        <div className="flex gap-3 justify-end">
          <button onClick={() => setDeleteTarget(null)} className="btn-secondary">Cancel</button>
          <button onClick={handleDelete} disabled={saving} className="btn-primary bg-red-600 hover:bg-red-700 flex items-center gap-2"><Trash2 size={14} /> Delete</button>
        </div>
      </Modal>
    </div>
  );
}
