import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  BookOpen,
  Check,
  CheckCircle2,
  Code2,
  Eye,
  Filter,
  Plus,
  Save,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../components/ui/Toast';
import { getFacultyCourses } from '../../services/faculty';
import { supabase } from '../../lib/supabase';
import {
  createAssignment,
  createAssignmentQuestion,
  createTestCase,
  deleteAssignmentQuestion,
  deleteTestCase,
  getAssignmentById,
  getAssignmentQuestions,
  getTestCases,
  updateAssignment,
  updateAssignmentQuestion,
} from '../../services/assignments';
import type {
  Assignment,
  AssignmentQuestion,
  AssignmentTestCase,
  Course,
} from '../../types/database';

type QuestionBankQuestion = {
  id: string;
  title: string;
  problem_statement: string;
  instructions: string | null;
  input_format: string | null;
  output_format: string | null;
  constraints_text: string | null;
  starter_code: string | null;
  hints: string[];
  difficulty: 'easy' | 'medium' | 'hard';
  topic: string;
  subtopic: string | null;
  tags: string[];
  company_tags: string[];
  frequency_score: number;
  default_marks: number;
};

type QuestionBankTestCase = {
  id: string;
  question_id: string;
  input_data: string | null;
  expected_output: string;
  is_hidden: boolean;
  weight: number;
  order_index: number;
};

const STEPS = [
  { number: 1, title: 'Assignment Details', icon: BookOpen },
  { number: 2, title: 'Add Questions', icon: Code2 },
  { number: 3, title: 'Test Cases', icon: CheckCircle2 },
  { number: 4, title: 'Preview & Publish', icon: Eye },
];

const EMPTY_QUESTION: Partial<AssignmentQuestion> = {
  title: '',
  problem_statement: '',
  instructions: '',
  input_format: '',
  output_format: '',
  constraints_text: '',
  starter_code: '# Write your Python code here\n',
  hints: [],
  question_type: 'coding',
  difficulty: 'easy',
  marks: 10,
};

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;

  if (typeof error === 'object' && error !== null && 'message' in error) {
    return String(error.message);
  }

  return 'Something went wrong';
}

export default function FacultyAssignmentBuilderPage() {
  const navigate = useNavigate();
  const { assignmentId: routeAssignmentId } = useParams();
  const { profile } = useAuth();
  const { success, error: toastError } = useToast();

  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [assignmentId, setAssignmentId] = useState(routeAssignmentId ?? '');
  const [courses, setCourses] = useState<Course[]>([]);
  const [questions, setQuestions] = useState<AssignmentQuestion[]>([]);
  const [testCases, setTestCases] = useState<Record<string, AssignmentTestCase[]>>({});
  const [editingQuestionId, setEditingQuestionId] = useState<string | null>(null);
  const [selectedQuestionId, setSelectedQuestionId] = useState('');
  const [questionBankOpen, setQuestionBankOpen] = useState(false);
  const [questionBankLoading, setQuestionBankLoading] = useState(false);
  const [importingQuestions, setImportingQuestions] = useState(false);
  const [questionBank, setQuestionBank] = useState<QuestionBankQuestion[]>([]);
  const [questionBankTests, setQuestionBankTests] = useState<Record<string, QuestionBankTestCase[]>>({});
  const [selectedBankIds, setSelectedBankIds] = useState<string[]>([]);
  const [previewBankId, setPreviewBankId] = useState('');
  const [bankSearch, setBankSearch] = useState('');
  const [bankDifficulty, setBankDifficulty] = useState('all');
  const [bankTopic, setBankTopic] = useState('all');

  const [details, setDetails] = useState<Partial<Assignment>>({
    title: '',
    description: '',
    instructions: '',
    assignment_type: 'coding',
    status: 'draft',
    due_date: null,
    allow_late_submission: false,
    difficulty: 'beginner',
    max_marks: 0,
  });
  const [questionForm, setQuestionForm] = useState<Partial<AssignmentQuestion>>({ ...EMPTY_QUESTION });
  const [testCaseForm, setTestCaseForm] = useState<Partial<AssignmentTestCase>>({
    input_data: '',
    expected_output: '',
    is_hidden: false,
    weight: 1,
  });

  const totalMarks = useMemo(
    () => questions.reduce((total, question) => total + Number(question.marks || 0), 0),
    [questions],
  );

  const bankTopics = useMemo(
    () => Array.from(new Set(questionBank.map(question => question.topic))).sort(),
    [questionBank],
  );

  const filteredBankQuestions = useMemo(() => {
    const search = bankSearch.trim().toLowerCase();
    return questionBank.filter(question => {
      const matchesSearch = !search || [
        question.title,
        question.problem_statement,
        question.topic,
        question.subtopic ?? '',
        ...question.tags,
        ...question.company_tags,
      ].some(value => value.toLowerCase().includes(search));
      const matchesDifficulty = bankDifficulty === 'all' || question.difficulty === bankDifficulty;
      const matchesTopic = bankTopic === 'all' || question.topic === bankTopic;
      return matchesSearch && matchesDifficulty && matchesTopic;
    });
  }, [questionBank, bankSearch, bankDifficulty, bankTopic]);

  const previewBankQuestion = questionBank.find(question => question.id === previewBankId) ?? filteredBankQuestions[0];

  const alreadyAddedBankIds = useMemo(
    () => new Set(
      questions
        .map(question => (question as AssignmentQuestion & { question_bank_id?: string | null }).question_bank_id)
        .filter((id): id is string => Boolean(id)),
    ),
    [questions],
  );

  const reloadQuestions = async (id: string) => {
    const loadedQuestions = await getAssignmentQuestions(id);
    setQuestions(loadedQuestions);
    if (loadedQuestions.length && !selectedQuestionId) {
      setSelectedQuestionId(loadedQuestions[0].id);
    }
    const entries = await Promise.all(
      loadedQuestions.map(async question => [question.id, await getTestCases(id, question.id)] as const),
    );
    setTestCases(Object.fromEntries(entries));
  };

  const openQuestionBank = async () => {
    if (!assignmentId) {
      toastError('Save details first', 'Complete Step 1 before choosing questions from the bank.');
      return;
    }

    setQuestionBankOpen(true);
    setQuestionBankLoading(true);
    setSelectedBankIds([]);
    try {
      const { data: bankData, error: bankError } = await supabase
        .from('coding_questions')
        .select('*')
        .eq('is_published', true)
        .order('frequency_score', { ascending: false })
        .order('title', { ascending: true });
      if (bankError) throw bankError;

      const loadedBank = (bankData ?? []) as QuestionBankQuestion[];
      setQuestionBank(loadedBank);
      setPreviewBankId(loadedBank[0]?.id ?? '');

      if (loadedBank.length) {
        const { data: testData, error: testError } = await supabase
          .from('coding_question_test_cases')
          .select('*')
          .in('question_id', loadedBank.map(question => question.id))
          .order('order_index', { ascending: true });
        if (testError) throw testError;

        const grouped = ((testData ?? []) as QuestionBankTestCase[]).reduce<Record<string, QuestionBankTestCase[]>>(
          (result, testCase) => {
            result[testCase.question_id] = [...(result[testCase.question_id] ?? []), testCase];
            return result;
          },
          {},
        );
        setQuestionBankTests(grouped);
      } else {
        setQuestionBankTests({});
      }
    } catch (error) {
      toastError('Could not load question bank', errorMessage(error));
    } finally {
      setQuestionBankLoading(false);
    }
  };

  const toggleBankSelection = (id: string) => {
    setSelectedBankIds(current => current.includes(id)
      ? current.filter(item => item !== id)
      : [...current, id]);
  };

  const importSelectedQuestions = async () => {
    if (!assignmentId || selectedBankIds.length === 0) return;

    const existingBankIds = new Set(
      questions
        .map(question => (question as AssignmentQuestion & { question_bank_id?: string | null }).question_bank_id)
        .filter((id): id is string => Boolean(id)),
    );
    const newBankQuestions = questionBank.filter(
      question => selectedBankIds.includes(question.id) && !existingBankIds.has(question.id),
    );

    if (newBankQuestions.length === 0) {
      toastError('Questions already added', 'Every selected question is already in this assignment.');
      return;
    }

    setImportingQuestions(true);
    try {
      let nextOrder = questions.length;
      for (const bankQuestion of newBankQuestions) {
        const created = await createAssignmentQuestion({
          assignment_id: assignmentId,
          question_bank_id: bankQuestion.id,
          title: bankQuestion.title,
          problem_statement: bankQuestion.problem_statement,
          instructions: bankQuestion.instructions,
          input_format: bankQuestion.input_format,
          output_format: bankQuestion.output_format,
          constraints_text: bankQuestion.constraints_text,
          starter_code: bankQuestion.starter_code,
          hints: bankQuestion.hints,
          question_type: 'coding',
          difficulty: bankQuestion.difficulty,
          marks: bankQuestion.default_marks,
          order_index: nextOrder,
        } as Partial<AssignmentQuestion>);

        const sourceTests = questionBankTests[bankQuestion.id] ?? [];
        for (const sourceTest of sourceTests) {
          await createTestCase({
            assignment_id: assignmentId,
            question_id: created.id,
            input_data: sourceTest.input_data,
            expected_output: sourceTest.expected_output,
            is_hidden: sourceTest.is_hidden,
            weight: sourceTest.weight,
            order_index: sourceTest.order_index,
          });
        }
        nextOrder += 1;
      }

      const importedMarks = newBankQuestions.reduce(
        (sum, question) => sum + Number(question.default_marks || 0),
        0,
      );
      await updateAssignment(assignmentId, { max_marks: totalMarks + importedMarks });
      await reloadQuestions(assignmentId);
      setQuestionBankOpen(false);
      setSelectedBankIds([]);
      success(
        `${newBankQuestions.length} question${newBankQuestions.length === 1 ? '' : 's'} added`,
        'Problem details and all visible/hidden test cases were copied.',
      );
    } catch (error) {
      toastError('Could not add bank questions', errorMessage(error));
    } finally {
      setImportingQuestions(false);
    }
  };

  useEffect(() => {
    if (!profile) return;
    let active = true;

    const load = async () => {
      setLoading(true);
      try {
        const facultyCourses = await getFacultyCourses(profile.id);
        if (!active) return;
        setCourses(facultyCourses);

        if (routeAssignmentId) {
          const existing = await getAssignmentById(routeAssignmentId);
          if (!existing) throw new Error('Assignment not found');
          if (!active) return;
          setDetails({
                    course_id: existing.course_id,
                    title: existing.title,
                    description: existing.description,
                    instructions: existing.instructions,
                    assignment_type: existing.assignment_type,
                    status: existing.status,
                    due_date: existing.due_date,
                    allow_late_submission: existing.allow_late_submission,
                    difficulty: existing.difficulty,
                    max_marks: existing.max_marks,
                    is_published: existing.is_published,
                  });
          setAssignmentId(existing.id);
          await reloadQuestions(existing.id);
        } else if (facultyCourses.length) {
          setDetails(current => ({ ...current, course_id: current.course_id || facultyCourses[0].id }));
        }
      } catch (error) {
        toastError('Could not open builder', errorMessage(error));
      } finally {
        if (active) setLoading(false);
      }
    };

    void load();
    return () => { active = false; };
  }, [profile, routeAssignmentId]);

  const saveDetails = async () => {
    if (!profile || !details.course_id || !details.title?.trim()) {
      toastError('Details required', 'Select a course and enter an assignment title.');
      return;
    }

    setSaving(true);
    try {
      const payload: Partial<Assignment> = {
        ...details,
        title: details.title.trim(),
        description: details.description?.trim() || null,
        instructions: details.instructions?.trim() || null,
        assignment_type: 'coding',
        status: details.status ?? 'draft',
        is_published: details.status === 'published',
        allow_resubmit: true,
        max_submissions: null,
        passing_score: 50,
        order_index: 0,
        max_marks: totalMarks,
        created_by: profile.id,
      };

      let id = assignmentId;
      if (id) {
        await updateAssignment(id, payload);
        success('Assignment details saved');
      } else {
        const created = await createAssignment(payload);
        id = created.id;
        setAssignmentId(id);
        window.history.replaceState(null, '', `/faculty/assignments/builder/${id}`);
        success('Draft assignment created');
      }
      setStep(2);
    } catch (error) {
      toastError('Could not save assignment', errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const saveQuestion = async () => {
    if (!assignmentId) {
      toastError('Save details first', 'Complete Step 1 before adding questions.');
      return;
    }
    if (!questionForm.title?.trim() || !questionForm.problem_statement?.trim()) {
      toastError('Question incomplete', 'Enter the question title and problem statement.');
      return;
    }

    setSaving(true);
    try {
      const payload: Partial<AssignmentQuestion> = {
        ...questionForm,
        title: questionForm.title.trim(),
        problem_statement: questionForm.problem_statement.trim(),
        question_type: 'coding',
        marks: Number(questionForm.marks || 0),
      };

      if (editingQuestionId) {
        await updateAssignmentQuestion(editingQuestionId, payload);
        success('Question updated');
      } else {
        const created = await createAssignmentQuestion({
          ...payload,
          assignment_id: assignmentId,
          order_index: questions.length,
        });
        setSelectedQuestionId(created.id);
        success('Question added');
      }
      setEditingQuestionId(null);
      setQuestionForm({ ...EMPTY_QUESTION });
      await reloadQuestions(assignmentId);
    } catch (error) {
      toastError('Could not save question', errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const removeQuestion = async (id: string) => {
    if (!assignmentId || !window.confirm('Delete this question and its test cases?')) return;
    try {
      await deleteAssignmentQuestion(id);
      if (selectedQuestionId === id) setSelectedQuestionId('');
      await reloadQuestions(assignmentId);
      success('Question deleted');
    } catch (error) {
      toastError('Could not delete question', errorMessage(error));
    }
  };

  const saveTestCase = async () => {
    if (!assignmentId || !selectedQuestionId || !testCaseForm.expected_output?.trim()) {
      toastError('Test case incomplete', 'Choose a question and enter the expected output.');
      return;
    }
    setSaving(true);
    try {
      await createTestCase({
        ...testCaseForm,
        assignment_id: assignmentId,
        question_id: selectedQuestionId,
        expected_output: testCaseForm.expected_output.trim(),
        order_index: testCases[selectedQuestionId]?.length ?? 0,
      });
      setTestCaseForm({ input_data: '', expected_output: '', is_hidden: false, weight: 1 });
      await reloadQuestions(assignmentId);
      success('Test case added');
    } catch (error) {
      toastError('Could not save test case', errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const removeTestCase = async (id: string) => {
    if (!assignmentId) return;
    try {
      await deleteTestCase(id);
      await reloadQuestions(assignmentId);
      success('Test case deleted');
    } catch (error) {
      toastError('Could not delete test case', errorMessage(error));
    }
  };

  const publishAssignment = async () => {
    if (!assignmentId || questions.length === 0) {
      toastError('Cannot publish', 'Add at least one coding question.');
      return;
    }
    const questionWithoutTests = questions.find(question => !(testCases[question.id]?.length));
    if (questionWithoutTests) {
      toastError('Test cases required', `Add a test case for “${questionWithoutTests.title}”.`);
      return;
    }

    setSaving(true);
    try {
      await updateAssignment(assignmentId, {
        status: 'published',
        is_published: true,
        max_marks: totalMarks,
      });
      success('Assignment published', 'Students can now see and solve it.');
      navigate('/faculty/assignments');
    } catch (error) {
      toastError('Could not publish assignment', errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="p-8 text-center text-slate-400">Opening assignment builder...</div>;
  }

  return (
    <div className="min-h-full bg-slate-50 p-5 dark:bg-slate-900 lg:p-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button className="btn-secondary !p-2.5" onClick={() => navigate('/faculty/assignments')}>
              <ArrowLeft size={18} />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
                {assignmentId ? 'Build Coding Assignment' : 'Create Coding Assignment'}
              </h1>
              <p className="mt-1 text-sm text-slate-500">Create the problem, test cases, and publish it to students.</p>
            </div>
          </div>
          <div className="hidden rounded-xl bg-white px-4 py-2 text-sm shadow-sm dark:bg-slate-800 sm:block">
            Total marks: <strong>{totalMarks}</strong>
          </div>
        </div>

        <div className="card mb-6 overflow-hidden rounded-2xl p-4">
          <div className="grid gap-3 md:grid-cols-4">
            {STEPS.map(item => {
              const Icon = item.icon;
              const active = step === item.number;
              const complete = step > item.number;
              return (
                <button
                  key={item.number}
                  type="button"
                  disabled={item.number > 1 && !assignmentId}
                  onClick={() => setStep(item.number)}
                  className={`flex items-center gap-3 rounded-xl p-3 text-left transition ${
                    active ? 'bg-primary-600 text-white' : 'hover:bg-slate-100 dark:hover:bg-slate-700'
                  } disabled:cursor-not-allowed disabled:opacity-40`}
                >
                  <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${active ? 'bg-white/20' : 'bg-slate-100 dark:bg-slate-700'}`}>
                    {complete ? <Check size={18} /> : <Icon size={18} />}
                  </span>
                  <span><span className="block text-xs opacity-70">Step {item.number}</span><span className="text-sm font-semibold">{item.title}</span></span>
                </button>
              );
            })}
          </div>
        </div>

        {step === 1 && (
          <section className="card p-6 lg:p-8">
            <h2 className="section-title">Assignment details</h2>
            <div className="grid gap-5 md:grid-cols-2">
              <div>
                <label className="label">Course *</label>
                <select className="input" value={details.course_id ?? ''} onChange={event => setDetails({ ...details, course_id: event.target.value })}>
                  <option value="">Select course</option>
                  {courses.map(course => <option key={course.id} value={course.id}>{course.title}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Assignment title *</label>
                <input className="input" value={details.title ?? ''} onChange={event => setDetails({ ...details, title: event.target.value })} placeholder="Example: Python Conditions Practice" />
              </div>
              <div className="md:col-span-2">
                <label className="label">Short description</label>
                <textarea className="input min-h-24" value={details.description ?? ''} onChange={event => setDetails({ ...details, description: event.target.value })} placeholder="What will students practise?" />
              </div>
              <div className="md:col-span-2">
                <label className="label">Instructions for students</label>
                <textarea className="input min-h-28" value={details.instructions ?? ''} onChange={event => setDetails({ ...details, instructions: event.target.value })} placeholder="Read inputs carefully, do not hard-code answers..." />
              </div>
              <div>
                <label className="label">Due date</label>
                <input type="datetime-local" className="input" value={details.due_date ? details.due_date.slice(0, 16) : ''} onChange={event => setDetails({ ...details, due_date: event.target.value || null })} />
              </div>
              <div>
                <label className="label">Difficulty</label>
                <select className="input" value={details.difficulty ?? 'beginner'} onChange={event => setDetails({ ...details, difficulty: event.target.value })}>
                  <option value="beginner">Beginner</option><option value="intermediate">Intermediate</option><option value="advanced">Advanced</option>
                </select>
              </div>
              <label className="flex items-center gap-3 text-sm md:col-span-2">
                <input type="checkbox" checked={details.allow_late_submission ?? false} onChange={event => setDetails({ ...details, allow_late_submission: event.target.checked })} />
                Allow students to submit after the due date
              </label>
            </div>
            <div className="mt-6 flex justify-end"><button className="btn-primary flex items-center gap-2" disabled={saving} onClick={saveDetails}><Save size={17} /> {saving ? 'Saving...' : 'Save & Add Questions'}</button></div>
          </section>
        )}

        {step === 2 && (
          <div className="grid gap-6 xl:grid-cols-[360px_1fr]">
            <aside className="card h-fit p-5">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-bold">Questions ({questions.length})</h2>
                <div className="flex items-center gap-2">
                  <button className="btn-secondary flex items-center gap-1.5 !px-3 !py-2 text-xs" onClick={() => void openQuestionBank()}>
                    <BookOpen size={15} /> Question Bank
                  </button>
                  <button className="btn-primary !p-2" title="Create a new question" onClick={() => { setEditingQuestionId(null); setQuestionForm({ ...EMPTY_QUESTION }); }}><Plus size={17} /></button>
                </div>
              </div>
              <div className="space-y-2">
                {questions.length === 0 && <p className="rounded-xl border border-dashed p-6 text-center text-sm text-slate-400">No questions yet</p>}
                {questions.map((question, index) => (
                  <div key={question.id} className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                    <button className="w-full text-left" onClick={() => { setEditingQuestionId(question.id); setQuestionForm(question); }}>
                      <span className="text-xs text-slate-400">Question {index + 1} · {question.marks} marks</span>
                      <span className="mt-1 block font-medium">{question.title}</span>
                    </button>
                    <button className="mt-2 text-red-500" onClick={() => removeQuestion(question.id)}><Trash2 size={15} /></button>
                  </div>
                ))}
              </div>
            </aside>
            <section className="card p-6">
              <h2 className="section-title">{editingQuestionId ? 'Edit coding question' : 'New coding question'}</h2>
              <div className="space-y-5">
                <div><label className="label">Question title *</label><input className="input" value={questionForm.title ?? ''} onChange={event => setQuestionForm({ ...questionForm, title: event.target.value })} placeholder="Example: Even or Odd" /></div>
                <div><label className="label">Problem statement *</label><textarea className="input min-h-36" value={questionForm.problem_statement ?? ''} onChange={event => setQuestionForm({ ...questionForm, problem_statement: event.target.value })} placeholder="Explain exactly what the student must build..." /></div>
                <div className="grid gap-5 md:grid-cols-3">
                  <div><label className="label">Marks</label><input type="number" min="1" className="input" value={questionForm.marks ?? 10} onChange={event => setQuestionForm({ ...questionForm, marks: Number(event.target.value) })} /></div>
                  <div><label className="label">Difficulty</label><select className="input" value={questionForm.difficulty ?? 'easy'} onChange={event => setQuestionForm({ ...questionForm, difficulty: event.target.value })}><option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option></select></div>
                  <div><label className="label">Language</label><input className="input" value="Python" disabled /></div>
                </div>
                <div className="grid gap-5 md:grid-cols-2">
                  <div><label className="label">Input format</label><textarea className="input min-h-24" value={questionForm.input_format ?? ''} onChange={event => setQuestionForm({ ...questionForm, input_format: event.target.value })} /></div>
                  <div><label className="label">Output format</label><textarea className="input min-h-24" value={questionForm.output_format ?? ''} onChange={event => setQuestionForm({ ...questionForm, output_format: event.target.value })} /></div>
                </div>
                <div><label className="label">Constraints</label><textarea className="input min-h-20" value={questionForm.constraints_text ?? ''} onChange={event => setQuestionForm({ ...questionForm, constraints_text: event.target.value })} placeholder="Example: 1 ≤ N ≤ 100" /></div>
                <div><label className="label">Starter code</label><textarea className="input min-h-32 font-mono" value={questionForm.starter_code ?? ''} onChange={event => setQuestionForm({ ...questionForm, starter_code: event.target.value })} /></div>
              </div>
              <div className="mt-6 flex justify-between gap-3"><button className="btn-secondary" disabled={!questions.length} onClick={() => setStep(3)}>Continue to Test Cases</button><button className="btn-primary" disabled={saving} onClick={saveQuestion}>{saving ? 'Saving...' : editingQuestionId ? 'Update Question' : 'Add Question'}</button></div>
            </section>
          </div>
        )}

        {step === 3 && (
          <div className="grid gap-6 lg:grid-cols-2">
            <section className="card p-6">
              <h2 className="section-title">Add test case</h2>
              <div className="space-y-5">
                <div><label className="label">Question</label><select className="input" value={selectedQuestionId} onChange={event => setSelectedQuestionId(event.target.value)}><option value="">Select question</option>{questions.map(question => <option key={question.id} value={question.id}>{question.title}</option>)}</select></div>
                <div><label className="label">Program input</label><textarea className="input min-h-28 font-mono" value={testCaseForm.input_data ?? ''} onChange={event => setTestCaseForm({ ...testCaseForm, input_data: event.target.value })} placeholder={'5\n10'} /></div>
                <div><label className="label">Expected output *</label><textarea className="input min-h-28 font-mono" value={testCaseForm.expected_output ?? ''} onChange={event => setTestCaseForm({ ...testCaseForm, expected_output: event.target.value })} placeholder="15" /></div>
                <div className="flex items-center gap-6"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={testCaseForm.is_hidden ?? false} onChange={event => setTestCaseForm({ ...testCaseForm, is_hidden: event.target.checked })} /> Hidden from student</label><label className="flex items-center gap-2 text-sm">Weight <input type="number" min="1" className="input !w-24" value={testCaseForm.weight ?? 1} onChange={event => setTestCaseForm({ ...testCaseForm, weight: Number(event.target.value) })} /></label></div>
              </div>
              <button className="btn-primary mt-6 flex items-center gap-2" disabled={saving} onClick={saveTestCase}><Plus size={16} /> Add Test Case</button>
            </section>
            <section className="card p-6">
              <h2 className="section-title">Saved test cases</h2>
              {!selectedQuestionId && <p className="text-sm text-slate-400">Select a question to view its test cases.</p>}
              <div className="space-y-3">
                {(testCases[selectedQuestionId] ?? []).map((testCase, index) => (
                  <div key={testCase.id} className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
                    <div className="flex justify-between gap-3"><strong className="text-sm">Test #{index + 1} {testCase.is_hidden && '· Hidden'}</strong><button className="text-red-500" onClick={() => removeTestCase(testCase.id)}><Trash2 size={16} /></button></div>
                    <div className="mt-3 grid gap-3 text-xs md:grid-cols-2"><pre className="overflow-auto rounded-lg bg-slate-100 p-3 dark:bg-slate-900">Input:{'\n'}{testCase.input_data || '(no input)'}</pre><pre className="overflow-auto rounded-lg bg-slate-100 p-3 dark:bg-slate-900">Expected:{'\n'}{testCase.expected_output}</pre></div>
                  </div>
                ))}
                {selectedQuestionId && !(testCases[selectedQuestionId]?.length) && <p className="rounded-xl border border-dashed p-8 text-center text-sm text-slate-400">No test cases for this question</p>}
              </div>
              <div className="mt-6 flex justify-between"><button className="btn-secondary" onClick={() => setStep(2)}>Back</button><button className="btn-primary" onClick={() => setStep(4)}>Preview Assignment</button></div>
            </section>
          </div>
        )}

        {step === 4 && (
          <section className="card overflow-hidden">
            <div className="border-b border-slate-200 p-6 dark:border-slate-700"><span className="badge bg-primary-100 text-primary-700">CODING ASSIGNMENT</span><h2 className="mt-3 text-2xl font-bold">{details.title}</h2><p className="mt-2 text-slate-500">{details.description || 'No description provided.'}</p><div className="mt-4 flex flex-wrap gap-4 text-sm text-slate-500"><span>{questions.length} questions</span><span>{totalMarks} marks</span><span>{details.difficulty}</span></div></div>
            <div className="space-y-5 p-6">
              {questions.map((question, index) => (
                <article key={question.id} className="rounded-2xl border border-slate-200 p-5 dark:border-slate-700"><div className="flex items-start justify-between gap-4"><div><span className="text-xs font-semibold text-primary-600">QUESTION {index + 1}</span><h3 className="mt-1 text-lg font-bold">{question.title}</h3></div><span className="badge bg-slate-100 dark:bg-slate-700">{question.marks} marks</span></div><p className="mt-4 whitespace-pre-wrap text-sm text-slate-600 dark:text-slate-300">{question.problem_statement}</p><p className="mt-3 text-xs text-slate-400">{testCases[question.id]?.length ?? 0} test cases configured</p></article>
              ))}
              {questions.length === 0 && <p className="rounded-xl border border-dashed p-10 text-center text-slate-400">Add at least one question before publishing.</p>}
            </div>
            <div className="flex flex-wrap justify-between gap-3 border-t border-slate-200 p-6 dark:border-slate-700"><button className="btn-secondary" onClick={() => setStep(3)}>Back to Test Cases</button><div className="flex gap-3"><button className="btn-secondary" disabled={saving} onClick={async () => { if (assignmentId) { await updateAssignment(assignmentId, { max_marks: totalMarks }); success('Draft saved'); } }}>Save Draft</button><button className="btn-primary flex items-center gap-2" disabled={saving} onClick={publishAssignment}><CheckCircle2 size={17} /> {saving ? 'Publishing...' : 'Publish to Students'}</button></div></div>
          </section>
        )}

        {questionBankOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-3 backdrop-blur-sm lg:p-6">
            <div className="flex h-[92vh] w-full max-w-7xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900">
              <div className="flex items-center justify-between gap-4 border-b border-slate-200 px-5 py-4 dark:border-slate-700">
                <div>
                  <h2 className="text-xl font-bold text-slate-900 dark:text-white">Choose from Question Bank</h2>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Select reusable questions. Their visible and hidden tests will be copied automatically.</p>
                </div>
                <button className="rounded-xl p-2.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-white" onClick={() => setQuestionBankOpen(false)}>
                  <X size={20} />
                </button>
              </div>

              <div className="grid gap-3 border-b border-slate-200 p-4 dark:border-slate-700 lg:grid-cols-[1fr_200px_220px]">
                <label className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
                  <input className="input w-full pl-10" value={bankSearch} onChange={event => setBankSearch(event.target.value)} placeholder="Search title, topic, tag or company pattern..." />
                </label>
                <label className="relative">
                  <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                  <select className="input w-full pl-10" value={bankDifficulty} onChange={event => setBankDifficulty(event.target.value)}>
                    <option value="all">All difficulties</option>
                    <option value="easy">Easy</option>
                    <option value="medium">Medium</option>
                    <option value="hard">Hard</option>
                  </select>
                </label>
                <select className="input w-full" value={bankTopic} onChange={event => setBankTopic(event.target.value)}>
                  <option value="all">All topics</option>
                  {bankTopics.map(topic => <option key={topic} value={topic}>{topic}</option>)}
                </select>
              </div>

              {questionBankLoading ? (
                <div className="flex flex-1 items-center justify-center text-slate-400">Loading question bank...</div>
              ) : questionBank.length === 0 ? (
                <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
                  <BookOpen size={42} className="mb-3 text-slate-400" />
                  <h3 className="font-bold text-slate-900 dark:text-white">No published questions</h3>
                  <p className="mt-1 text-sm text-slate-500">Create and publish questions from the faculty Question Bank first.</p>
                </div>
              ) : (
                <div className="grid min-h-0 flex-1 lg:grid-cols-[430px_1fr]">
                  <div className="overflow-y-auto border-r border-slate-200 p-4 dark:border-slate-700">
                    <div className="mb-3 flex items-center justify-between text-sm text-slate-500">
                      <span>{filteredBankQuestions.length} questions</span>
                      <span>{selectedBankIds.length} selected</span>
                    </div>
                    <div className="space-y-3">
                      {filteredBankQuestions.map(question => {
                        const alreadyAdded = alreadyAddedBankIds.has(question.id);
                        const selected = selectedBankIds.includes(question.id);
                        const tests = questionBankTests[question.id] ?? [];
                        return (
                          <div key={question.id} className={`rounded-xl border p-4 transition ${previewBankQuestion?.id === question.id ? 'border-primary-500 bg-primary-50/60 dark:bg-primary-900/10' : 'border-slate-200 dark:border-slate-700'} ${alreadyAdded ? 'opacity-65' : ''}`}>
                            <div className="flex items-start gap-3">
                              <input
                                type="checkbox"
                                className="mt-1 h-4 w-4"
                                checked={selected}
                                disabled={alreadyAdded}
                                onChange={() => toggleBankSelection(question.id)}
                              />
                              <button className="min-w-0 flex-1 text-left" onClick={() => setPreviewBankId(question.id)}>
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="font-semibold text-slate-900 dark:text-white">{question.title}</span>
                                  <span className={`badge ${question.difficulty === 'easy' ? 'bg-emerald-100 text-emerald-700' : question.difficulty === 'medium' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>{question.difficulty}</span>
                                  {alreadyAdded && <span className="badge bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300">Already added</span>}
                                </div>
                                <p className="mt-2 line-clamp-2 text-sm text-slate-500 dark:text-slate-400">{question.problem_statement}</p>
                                <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-400">
                                  <span>{question.topic}</span>
                                  <span>{question.default_marks} marks</span>
                                  <span>{tests.filter(test => !test.is_hidden).length} visible</span>
                                  <span>{tests.filter(test => test.is_hidden).length} hidden</span>
                                </div>
                              </button>
                            </div>
                          </div>
                        );
                      })}
                      {filteredBankQuestions.length === 0 && (
                        <p className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-400 dark:border-slate-700">No questions match these filters.</p>
                      )}
                    </div>
                  </div>

                  <div className="overflow-y-auto p-5 lg:p-7">
                    {previewBankQuestion ? (
                      <div>
                        <div className="flex flex-wrap items-start justify-between gap-4">
                          <div>
                            <p className="text-xs font-bold uppercase tracking-wide text-primary-600">Question preview</p>
                            <h3 className="mt-1 text-2xl font-bold text-slate-900 dark:text-white">{previewBankQuestion.title}</h3>
                            <p className="mt-2 text-sm text-slate-500">{previewBankQuestion.topic}{previewBankQuestion.subtopic ? ` · ${previewBankQuestion.subtopic}` : ''}</p>
                          </div>
                          <div className="rounded-xl bg-slate-100 px-4 py-2 text-sm dark:bg-slate-800"><strong>{previewBankQuestion.default_marks}</strong> marks</div>
                        </div>

                        <p className="mt-6 whitespace-pre-wrap leading-7 text-slate-700 dark:text-slate-300">{previewBankQuestion.problem_statement}</p>

                        <div className="mt-6 grid gap-4 md:grid-cols-2">
                          <PreviewBlock title="Input format" value={previewBankQuestion.input_format || 'Not provided'} />
                          <PreviewBlock title="Output format" value={previewBankQuestion.output_format || 'Not provided'} />
                        </div>
                        {previewBankQuestion.constraints_text && <PreviewBlock title="Constraints" value={previewBankQuestion.constraints_text} className="mt-4" />}
                        {previewBankQuestion.starter_code && <PreviewBlock title="Starter code" value={previewBankQuestion.starter_code} className="mt-4" code />}

                        <div className="mt-6">
                          <h4 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-500">Automatic test cases</h4>
                          <div className="space-y-3">
                            {(questionBankTests[previewBankQuestion.id] ?? []).map((testCase, index) => (
                              <div key={testCase.id} className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
                                <div className="mb-3 flex items-center justify-between gap-3">
                                  <strong className="text-sm">Test {index + 1}</strong>
                                  <span className={`badge ${testCase.is_hidden ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>{testCase.is_hidden ? 'Hidden' : 'Visible'}</span>
                                </div>
                                <div className="grid gap-3 text-xs sm:grid-cols-2">
                                  <pre className="overflow-auto whitespace-pre-wrap rounded-lg bg-slate-100 p-3 dark:bg-slate-950">Input:{'\n'}{testCase.input_data || '(no input)'}</pre>
                                  <pre className="overflow-auto whitespace-pre-wrap rounded-lg bg-slate-100 p-3 dark:bg-slate-950">Expected:{'\n'}{testCase.expected_output}</pre>
                                </div>
                              </div>
                            ))}
                            {!(questionBankTests[previewBankQuestion.id]?.length) && <p className="rounded-xl border border-dashed p-6 text-center text-sm text-slate-400">No test cases configured.</p>}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="flex h-full items-center justify-center text-slate-400">Select a question to preview it.</div>
                    )}
                  </div>
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-5 py-4 dark:border-slate-700">
                <p className="text-sm text-slate-500">Duplicate questions are disabled automatically.</p>
                <div className="flex gap-3">
                  <button className="btn-secondary" disabled={importingQuestions} onClick={() => setQuestionBankOpen(false)}>Cancel</button>
                  <button className="btn-primary flex items-center gap-2" disabled={selectedBankIds.length === 0 || importingQuestions} onClick={() => void importSelectedQuestions()}>
                    <Plus size={16} /> {importingQuestions ? 'Adding questions...' : `Add Selected (${selectedBankIds.length})`}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function PreviewBlock({ title, value, className = '', code = false }: { title: string; value: string; className?: string; code?: boolean }) {
  return (
    <div className={className}>
      <h4 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">{title}</h4>
      <pre className={`overflow-auto whitespace-pre-wrap rounded-xl bg-slate-100 p-4 text-sm text-slate-700 dark:bg-slate-950 dark:text-slate-300 ${code ? 'font-mono' : 'font-sans'}`}>{value}</pre>
    </div>
  );
}
