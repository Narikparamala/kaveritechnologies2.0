import { useEffect, useState, useCallback, lazy, Suspense, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import {
  FileText, Calendar, CheckCircle, AlertCircle, Play, RotateCcw,
  ChevronRight, ChevronLeft, Eye, EyeOff, Info, Lock, Save, Send
} from 'lucide-react';
import { PageHeader } from '../../components/common/PageHeader';
import { Badge } from '../../components/ui/Badge';
import { EmptyState } from '../../components/ui/EmptyState';
import { Modal } from '../../components/ui/Modal';
import { useToast } from '../../components/ui/Toast';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { runPython, onRuntimeStatus, type RuntimeStatus } from '../../services/pythonExecution';
import { formatDate } from '../../lib/utils';
import { 
  getStudentAssignments, getAssignmentById, getAssignmentQuestions, 
  getTestCases, getStudentSubmission, getQuestionSubmissions,
  saveQuestionSubmission, createSubmission, submitAssignment
} from '../../services/assignments';
import type { Assignment, AssignmentQuestion, AssignmentSubmission, AssignmentQuestionSubmission, AssignmentTestCase, Course } from '../../types/database';

const MonacoEditor = lazy(() => import('@monaco-editor/react').then(m => ({ default: m.default })));

type AssignmentWithDetails = Assignment & { course: Course; submission: AssignmentSubmission | null };
type TestResult = { input: string | null; expected: string; actual: string; passed: boolean };

export default function AssignmentsPage() {
  const { assignmentId } = useParams<{ assignmentId?: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const returnTo = searchParams.get('returnTo');
  
  if (assignmentId) {
    return <AssignmentWorkspace assignmentId={assignmentId} onBack={() => navigate(returnTo ?? '/student/assignments')} />;
  }
  return <AssignmentList onOpen={(id) => navigate(`/student/assignments/${id}${returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : ''}`)} />;
}

function AssignmentList({ onOpen }: { onOpen: (id: string) => void }) {
  const { profile } = useAuth();
  const [assignments, setAssignments] = useState<AssignmentWithDetails[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile) return;
    getStudentAssignments(profile.id).then(asgs => {
      setAssignments(asgs);
      setLoading(false);
    });
  }, [profile]);

  const getStatusBadge = (asg: AssignmentWithDetails) => {
    const sub = asg.submission;
    if (!sub) return <Badge variant="secondary">Not Started</Badge>;
    if (sub.status === 'draft') return <Badge variant="warning">Draft Saved</Badge>;
    if (sub.status === 'submitted') return <Badge variant="info">Submitted</Badge>;
    if (sub.status === 'graded') return <Badge variant="success">Graded</Badge>;
    return <Badge variant="secondary">{sub.status}</Badge>;
  };

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto animate-fade-in">
      <PageHeader title="Assignments" subtitle="Complete your coursework and coding challenges" icon={FileText} />
      {loading ? (
        <div className="grid gap-4">{[1,2,3].map(i=><div key={i} className="h-24 bg-slate-100 dark:bg-slate-800 rounded-2xl animate-pulse" />)}</div>
      ) : assignments.length === 0 ? (
        <EmptyState icon={FileText} title="No assignments yet" description="Enroll in courses to see your assignments here." />
      ) : (
        <div className="grid gap-3">
          {assignments.map(asg => (
            <button key={asg.id} onClick={() => onOpen(asg.id)} className="card p-5 flex items-start gap-4 w-full text-left hover:shadow-md transition-shadow">
              <div className="w-10 h-10 rounded-xl bg-primary-50 dark:bg-primary-900/30 flex items-center justify-center flex-shrink-0">
                <FileText size={18} className="text-primary-600 dark:text-primary-400" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className="font-semibold text-slate-900 dark:text-white">{asg.title}</span>
                  {getStatusBadge(asg)}
                </div>
                <p className="text-xs text-primary-600 dark:text-primary-400 mb-1">{asg.course?.title}</p>
                <p className="text-sm text-slate-500 dark:text-slate-400 line-clamp-1">{asg.description}</p>
              </div>
              <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                {asg.due_date && <span className="text-xs text-slate-400 flex items-center gap-1"><Calendar size={11} />{formatDate(asg.due_date)}</span>}
                <span className="text-primary-600 dark:text-primary-400 text-xs flex items-center gap-1 capitalize">{asg.assignment_type} <ChevronRight size={12} /></span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function AssignmentWorkspace({ assignmentId, onBack }: { assignmentId: string; onBack: () => void }) {
  const { profile } = useAuth();
  const { success, error: toastError } = useToast();
  
  const [asg, setAsg] = useState<AssignmentWithDetails | null>(null);
  const [questions, setQuestions] = useState<AssignmentQuestion[]>([]);
  const [currentQIdx, setCurrentQIdx] = useState(0);
  const [submission, setSubmission] = useState<AssignmentSubmission | null>(null);
  const [qSubmissions, setQSubmissions] = useState<Record<string, Partial<AssignmentQuestionSubmission>>>({});
  const [testCases, setTestCases] = useState<Record<string, AssignmentTestCase[]>>({});
  const [loading, setLoading] = useState(true);
  
  const [running, setRunning] = useState(false);
  const [output, setOutput] = useState('');
  const [testResults, setTestResults] = useState<TestResult[]>([]);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [confirmSubmit, setConfirmSubmit] = useState(false);

  const currentQ = questions[currentQIdx];

  const load = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    try {
      const [asgData, qs, sub] = await Promise.all([
        getAssignmentById(assignmentId),
        getAssignmentQuestions(assignmentId),
        getStudentSubmission(assignmentId, profile.id)
      ]);
      
      if (!asgData) throw new Error('Assignment not found');
      setAsg(asgData);
      setQuestions(qs);
      setSubmission(sub);
      
      if (sub) {
        const qSubs = await getQuestionSubmissions(sub.id);
        const qSubMap: Record<string, Partial<AssignmentQuestionSubmission>> = {};
        qSubs.forEach(qs => { qSubMap[qs.question_id] = qs; });
        setQSubmissions(qSubMap);
      }
      
      // Load test cases for all coding questions
      const tcMap: Record<string, AssignmentTestCase[]> = {};
      for (const q of qs) {
        if (q.question_type === 'coding') {
          tcMap[q.id] = await getTestCases(assignmentId, q.id, false);
        }
      }
      setTestCases(tcMap);
    } catch (e: any) { toastError('Error', e.message); }
    setLoading(false);
  }, [assignmentId, profile]);

  useEffect(() => { load(); }, [load]);

  const handleUpdateAnswer = (val: string) => {
    if (!currentQ) return;
    const key = currentQ.question_type === 'coding' ? 'submitted_code' : 'submitted_text';
    setQSubmissions(prev => ({
      ...prev,
      [currentQ.id]: { ...prev[currentQ.id], [key]: val }
    }));
  };

  const saveDraft = async () => {
    if (!profile || !asg || !currentQ) return;
    setSaving(true);
    try {
      let currentSub = submission;
      if (!currentSub) {
        currentSub = await createSubmission(asg.id, profile.id);
        setSubmission(currentSub);
      }
      
      const qSub = qSubmissions[currentQ.id] || {};
      await saveQuestionSubmission({
        ...qSub,
        submission_id: currentSub.id,
        question_id: currentQ.id
      });
      // success('Draft saved');
    } catch (e: any) { toastError('Save failed', e.message); }
    setSaving(false);
  };

  // Debounced autosave
  useEffect(() => {
    const timer = setTimeout(() => {
      if (Object.keys(qSubmissions).length > 0) saveDraft();
    }, 2000);
    return () => clearTimeout(timer);
  }, [qSubmissions]);

  const runCode = async () => {
    if (!currentQ || currentQ.question_type !== 'coding') return;
    const code = qSubmissions[currentQ.id]?.submitted_code || currentQ.starter_code || '';
    if (!code.trim()) return;
    
    setRunning(true);
    setOutput('Running...');
    setTestResults([]);
    
    try {
      const qTcs = testCases[currentQ.id] || [];
      const results: TestResult[] = [];
      
      for (const tc of qTcs) {
        let testCode = code;
        if (tc.input_data) {
          testCode = `import sys\nfrom io import StringIO\nsys.stdin = StringIO(${JSON.stringify(tc.input_data)})\n${code}`;
        }
        const res = await runPython(testCode);
        const actual = (res.output ?? '').trim();
        const expected = tc.expected_output.trim();
        results.push({ input: tc.input_data, expected, actual, passed: actual === expected });
      }
      setTestResults(results);
      if (results.length > 0) {
        setOutput(results.map((r, i) => `Test Case ${i+1}: ${r.passed ? 'PASSED' : 'FAILED'}`).join('\n'));
      } else {
        const res = await runPython(code);
        setOutput(res.output || res.error || '(no output)');
      }
    } catch (e: any) { setOutput(`Error: ${e.message}`); }
    setRunning(false);
  };

  const handleFinalSubmit = async () => {
    if (!submission) return;
    setSubmitting(true);
    try {
      await submitAssignment(submission.id);
      success('Assignment submitted successfully!');
      navigate('/student/assignments');
    } catch (e: any) { toastError('Submit failed', e.message); }
    setSubmitting(false);
  };

  if (loading) return <div className="p-8 text-center text-slate-400">Loading assignment...</div>;
  if (!asg || questions.length === 0) return <div className="p-8 text-center text-slate-400">Assignment not available.</div>;

  return (
    <div className="flex flex-col h-screen bg-white dark:bg-slate-950">
      {/* Header */}
      <div className="h-14 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between px-4 bg-white dark:bg-slate-900 z-10">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"><ChevronLeft size={20} /></button>
          <div>
            <h2 className="font-semibold text-sm text-slate-900 dark:text-white line-clamp-1">{asg.title}</h2>
            <p className="text-[10px] text-slate-400 uppercase tracking-wider">{asg.course?.title}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="text-xs text-slate-400 mr-2 flex items-center gap-1">
            {saving ? <span className="flex items-center gap-1 animate-pulse"><Save size={12} /> Saving...</span> : <span className="flex items-center gap-1 text-emerald-500"><CheckCircle size={12} /> Saved</span>}
          </div>
          <button onClick={() => setConfirmSubmit(true)} className="btn-primary text-xs py-1.5 px-3 flex items-center gap-1.5">
            <Send size={14} /> Submit
          </button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Left: Question Content */}
        <div className="w-1/2 flex flex-col border-r border-slate-200 dark:border-slate-800 overflow-y-auto bg-slate-50/50 dark:bg-slate-900/50">
          <div className="p-6 space-y-6">
            <div className="flex items-center justify-between">
              <Badge variant="secondary" className="uppercase text-[10px] tracking-widest">{currentQ.question_type} Question</Badge>
              <span className="text-xs font-medium text-slate-400">Question {currentQIdx + 1} of {questions.length}</span>
            </div>
            
            <div className="space-y-4">
              <h3 className="text-xl font-bold text-slate-900 dark:text-white">{currentQ.title}</h3>
              <div className="prose prose-slate dark:prose-invert max-w-none text-sm">
                <p className="whitespace-pre-wrap text-slate-600 dark:text-slate-300">{currentQ.problem_statement}</p>
              </div>
            </div>

            {currentQ.instructions && (
              <div className="p-4 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800/50">
                <h4 className="text-xs font-bold text-blue-700 dark:text-blue-400 uppercase mb-2 flex items-center gap-1.5"><Info size={14} /> Instructions</h4>
                <p className="text-sm text-blue-700 dark:text-blue-300 whitespace-pre-wrap">{currentQ.instructions}</p>
              </div>
            )}

            {currentQ.question_type === 'coding' && (
              <div className="space-y-4">
                {currentQ.input_format && (
                  <div>
                    <h4 className="text-xs font-bold text-slate-400 uppercase mb-2">Input Format</h4>
                    <div className="p-3 rounded-lg bg-slate-100 dark:bg-slate-800 text-sm font-mono">{currentQ.input_format}</div>
                  </div>
                )}
                {currentQ.output_format && (
                  <div>
                    <h4 className="text-xs font-bold text-slate-400 uppercase mb-2">Output Format</h4>
                    <div className="p-3 rounded-lg bg-slate-100 dark:bg-slate-800 text-sm font-mono">{currentQ.output_format}</div>
                  </div>
                )}
                
                <h4 className="text-xs font-bold text-slate-400 uppercase mb-2">Examples</h4>
                <div className="space-y-3">
                  {(testCases[currentQ.id] || []).map((tc, idx) => (
                    <div key={tc.id} className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                      <div className="bg-slate-100 dark:bg-slate-800 px-3 py-1.5 text-[10px] font-bold text-slate-500 uppercase">Example {idx + 1}</div>
                      <div className="p-3 space-y-2 text-xs font-mono">
                        {tc.input_data && <div><span className="text-slate-400">Input:</span><pre className="mt-1">{tc.input_data}</pre></div>}
                        <div><span className="text-slate-400">Expected:</span><pre className="mt-1 text-emerald-600 dark:text-emerald-400">{tc.expected_output}</pre></div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right: Editor/Input */}
        <div className="w-1/2 flex flex-col bg-white dark:bg-slate-950">
          <div className="flex-1 flex flex-col overflow-hidden">
            {currentQ.question_type === 'coding' ? (
              <div className="flex-1 flex flex-col overflow-hidden">
                <div className="flex-1 min-h-0 bg-slate-900">
                  <Suspense fallback={<div className="flex items-center justify-center h-full text-slate-400">Loading editor...</div>}>
                    <MonacoEditor
                      height="100%"
                      language="python"
                      theme="vs-dark"
                      value={qSubmissions[currentQ.id]?.submitted_code || currentQ.starter_code || ''}
                      onChange={(v) => handleUpdateAnswer(v || '')}
                      options={{ fontSize: 14, minimap: { enabled: false }, scrollBeyondLastLine: false, padding: { top: 16 } }}
                    />
                  </Suspense>
                </div>
                <div className="h-48 border-t border-slate-200 dark:border-slate-800 flex flex-col bg-white dark:bg-slate-900">
                  <div className="flex items-center justify-between px-4 py-2 border-b border-slate-200 dark:border-slate-800">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Output</span>
                    <button onClick={runCode} disabled={running} className="btn-secondary text-xs py-1 px-3 flex items-center gap-1.5 disabled:opacity-50">
                      {running ? <div className="w-3 h-3 border-2 border-primary-600 border-t-transparent rounded-full animate-spin" /> : <Play size={12} />}
                      Run Code
                    </button>
                  </div>
                  <div className="flex-1 p-4 font-mono text-xs overflow-y-auto whitespace-pre-wrap dark:text-slate-300">
                    {output || <span className="text-slate-400">Click "Run Code" to see output...</span>}
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex-1 p-6 flex flex-col space-y-4">
                <h4 className="text-xs font-bold text-slate-400 uppercase">Your Answer</h4>
                <textarea
                  className="flex-1 input resize-none font-sans text-base leading-relaxed p-4"
                  placeholder="Type your answer here..."
                  value={qSubmissions[currentQ.id]?.submitted_text || ''}
                  onChange={(e) => handleUpdateAnswer(e.target.value)}
                />
              </div>
            )}
          </div>
          
          {/* Question Navigation Footer */}
          <div className="h-14 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between px-4 bg-slate-50 dark:bg-slate-900">
            <button
              onClick={() => setCurrentQIdx(prev => Math.max(0, prev - 1))}
              disabled={currentQIdx === 0}
              className="btn-secondary text-xs flex items-center gap-1 disabled:opacity-30"
            >
              <ChevronLeft size={16} /> Previous
            </button>
            <div className="flex gap-1.5">
              {questions.map((_, i) => (
                <div key={i} className={`w-2 h-2 rounded-full ${i === currentQIdx ? 'bg-primary-600' : 'bg-slate-300 dark:bg-slate-700'}`} />
              ))}
            </div>
            {currentQIdx < questions.length - 1 ? (
              <button
                onClick={() => setCurrentQIdx(prev => Math.min(questions.length - 1, prev + 1))}
                className="btn-secondary text-xs flex items-center gap-1"
              >
                Next <ChevronRight size={16} />
              </button>
            ) : (
              <button onClick={() => setConfirmSubmit(true)} className="btn-primary text-xs flex items-center gap-1.5">
                Review & Submit <Send size={14} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Submit Confirmation Modal */}
      <Modal isOpen={confirmSubmit} onClose={() => setConfirmSubmit(null)} title="Submit Assignment">
        <div className="p-6 space-y-4">
          <p className="text-slate-600 dark:text-slate-400">Are you sure you want to submit your assignment? You can't change your answers after final submission.</p>
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800 space-y-2">
            <p className="text-xs font-bold text-slate-400 uppercase">Summary</p>
            <div className="flex justify-between text-sm">
              <span>Total Questions</span>
              <span className="font-bold">{questions.length}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span>Answered</span>
              <span className="font-bold text-emerald-600">{Object.keys(qSubmissions).length}</span>
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-4">
            <button onClick={() => setConfirmSubmit(false)} className="btn-secondary">Go Back</button>
            <button onClick={handleFinalSubmit} disabled={submitting} className="btn-primary flex items-center gap-2">
              {submitting ? 'Submitting...' : 'Yes, Submit Now'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
