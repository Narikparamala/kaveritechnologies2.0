import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  CheckCircle2,
  Code2,
  Edit3,
  Eye,
  EyeOff,
  Filter,
  Loader2,
  Plus,
  Save,
  Search,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { PageHeader } from '../../components/common/PageHeader';
import { Badge } from '../../components/ui/Badge';
import { EmptyState } from '../../components/ui/EmptyState';
import { useToast } from '../../components/ui/Toast';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';

type Difficulty = 'easy' | 'medium' | 'hard';

type CodingQuestion = {
  id: string;
  title: string;
  slug: string;
  problem_statement: string;
  instructions: string | null;
  input_format: string | null;
  output_format: string | null;
  constraints_text: string | null;
  starter_code: string | null;
  reference_solution: string | null;
  explanation: string | null;
  hints: string[];
  difficulty: Difficulty;
  topic: string;
  subtopic: string | null;
  tags: string[];
  company_tags: string[];
  frequency_score: number;
  default_marks: number;
  source_type: 'original' | 'faculty_created' | 'adapted_pattern';
  is_published: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

type QuestionTestCase = {
  id: string;
  question_id: string;
  input_data: string | null;
  expected_output: string;
  is_hidden: boolean;
  weight: number;
  order_index: number;
};

type QuestionForm = {
  title: string;
  problem_statement: string;
  instructions: string;
  input_format: string;
  output_format: string;
  constraints_text: string;
  starter_code: string;
  reference_solution: string;
  explanation: string;
  hintsText: string;
  difficulty: Difficulty;
  topic: string;
  subtopic: string;
  tagsText: string;
  companyTagsText: string;
  frequency_score: number;
  default_marks: number;
  source_type: CodingQuestion['source_type'];
  is_published: boolean;
};

const EMPTY_FORM: QuestionForm = {
  title: '',
  problem_statement: '',
  instructions: '',
  input_format: '',
  output_format: '',
  constraints_text: '',
  starter_code: '# Write your Python code here\n',
  reference_solution: '',
  explanation: '',
  hintsText: '',
  difficulty: 'easy',
  topic: 'Python Basics',
  subtopic: '',
  tagsText: '',
  companyTagsText: '',
  frequency_score: 50,
  default_marks: 10,
  source_type: 'faculty_created',
  is_published: false,
};

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && error !== null && 'message' in error) {
    return String(error.message);
  }
  return 'Something went wrong';
}

function listFromComma(value: string) {
  return Array.from(new Set(value.split(',').map(item => item.trim()).filter(Boolean)));
}

function listFromLines(value: string) {
  return Array.from(new Set(value.split('\n').map(item => item.trim()).filter(Boolean)));
}

function makeSlug(title: string) {
  const base = title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'coding-question';
  return `${base}-${Date.now().toString().slice(-6)}`;
}

export default function FacultyQuestionBankPage() {
  const { questionId } = useParams<{ questionId?: string }>();
  const navigate = useNavigate();

  if (questionId) {
    return <QuestionEditor questionId={questionId} onBack={() => navigate('/faculty/question-bank')} />;
  }

  return (
    <QuestionBankList
      onCreate={() => navigate('/faculty/question-bank/editor/new')}
      onEdit={id => navigate(`/faculty/question-bank/editor/${id}`)}
    />
  );
}

function QuestionBankList({ onCreate, onEdit }: { onCreate: () => void; onEdit: (id: string) => void }) {
  const { success, error: toastError } = useToast();
  const [questions, setQuestions] = useState<CodingQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [difficulty, setDifficulty] = useState('all');
  const [status, setStatus] = useState('all');

  const loadQuestions = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('coding_questions')
        .select('*')
        .order('updated_at', { ascending: false });
      if (error) throw error;
      setQuestions((data ?? []) as CodingQuestion[]);
    } catch (error) {
      toastError('Could not load question bank', errorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadQuestions(); }, []);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return questions.filter(question => {
      const matchesSearch = !query || [
        question.title,
        question.topic,
        question.subtopic ?? '',
        ...question.tags,
        ...question.company_tags,
      ].some(value => value.toLowerCase().includes(query));
      const matchesDifficulty = difficulty === 'all' || question.difficulty === difficulty;
      const matchesStatus = status === 'all' || (status === 'published' ? question.is_published : !question.is_published);
      return matchesSearch && matchesDifficulty && matchesStatus;
    });
  }, [questions, search, difficulty, status]);

  const removeQuestion = async (question: CodingQuestion) => {
    if (!window.confirm(`Delete “${question.title}”? Its test cases and practice attempts will also be deleted.`)) return;
    try {
      const { error } = await supabase.from('coding_questions').delete().eq('id', question.id);
      if (error) throw error;
      setQuestions(current => current.filter(item => item.id !== question.id));
      success('Question deleted');
    } catch (error) {
      toastError('Could not delete question', errorMessage(error));
    }
  };

  const togglePublished = async (question: CodingQuestion) => {
    try {
      const { error } = await supabase
        .from('coding_questions')
        .update({ is_published: !question.is_published })
        .eq('id', question.id);
      if (error) throw error;
      setQuestions(current => current.map(item => item.id === question.id ? { ...item, is_published: !item.is_published } : item));
      success(question.is_published ? 'Question moved to draft' : 'Question published');
    } catch (error) {
      toastError('Could not change question status', errorMessage(error));
    }
  };

  return (
    <div className="mx-auto max-w-7xl animate-fade-in p-6 lg:p-8">
      <PageHeader
        title="Coding Question Bank"
        subtitle="Create reusable interview-pattern questions and test cases"
        icon={Code2}
        action={<button className="btn-primary flex items-center gap-2" onClick={onCreate}><Plus size={17} /> Create Question</button>}
      />

      <section className="card mb-6 grid gap-3 p-4 lg:grid-cols-[1fr_200px_200px]">
        <label className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input className="input w-full pl-10" placeholder="Search questions, topics, tags or patterns..." value={search} onChange={event => setSearch(event.target.value)} />
        </label>
        <label className="relative">
          <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
          <select className="input w-full pl-10" value={difficulty} onChange={event => setDifficulty(event.target.value)}>
            <option value="all">All difficulties</option>
            <option value="easy">Easy</option>
            <option value="medium">Medium</option>
            <option value="hard">Hard</option>
          </select>
        </label>
        <select className="input w-full" value={status} onChange={event => setStatus(event.target.value)}>
          <option value="all">All statuses</option>
          <option value="published">Published</option>
          <option value="draft">Draft</option>
        </select>
      </section>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 text-sm text-slate-500 dark:text-slate-400">
        <span>{filtered.length} of {questions.length} questions</span>
        <span>{questions.filter(question => question.is_published).length} published</span>
      </div>

      {loading ? (
        <div className="grid gap-4">{[1, 2, 3].map(item => <div key={item} className="h-36 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-800" />)}</div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={Code2} title="No questions found" description="Create your first reusable coding question or change the filters." />
      ) : (
        <div className="grid gap-4">
          {filtered.map(question => (
            <article key={question.id} className="card p-5 transition hover:border-primary-400 hover:shadow-lg">
              <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-center">
                <button className="min-w-0 flex-1 text-left" onClick={() => onEdit(question.id)}>
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <h2 className="text-lg font-bold text-slate-900 dark:text-white">{question.title}</h2>
                    <Badge variant={question.is_published ? 'success' : 'warning'}>{question.is_published ? 'Published' : 'Draft'}</Badge>
                    <Badge variant={question.difficulty === 'easy' ? 'success' : question.difficulty === 'medium' ? 'warning' : 'error'}>{question.difficulty}</Badge>
                  </div>
                  <p className="line-clamp-2 text-sm text-slate-500 dark:text-slate-400">{question.problem_statement}</p>
                  <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs text-slate-400">
                    <span>{question.topic}{question.subtopic ? ` · ${question.subtopic}` : ''}</span>
                    <span>{question.default_marks} marks</span>
                    <span>Pattern score {question.frequency_score}</span>
                    {question.company_tags.length > 0 && <span>{question.company_tags.join(', ')}</span>}
                  </div>
                </button>

                <div className="flex items-center gap-2">
                  <button className="btn-secondary flex items-center gap-2 text-sm" onClick={() => void togglePublished(question)}>
                    {question.is_published ? <EyeOff size={16} /> : <Eye size={16} />}
                    {question.is_published ? 'Unpublish' : 'Publish'}
                  </button>
                  <button className="rounded-xl p-2.5 text-slate-400 transition hover:bg-primary-50 hover:text-primary-600 dark:hover:bg-primary-900/20" title="Edit question" onClick={() => onEdit(question.id)}>
                    <Edit3 size={17} />
                  </button>
                  <button className="rounded-xl p-2.5 text-slate-400 transition hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20" title="Delete question" onClick={() => void removeQuestion(question)}>
                    <Trash2 size={17} />
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

function QuestionEditor({ questionId, onBack }: { questionId: string; onBack: () => void }) {
  const isNew = questionId === 'new';
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { success, error: toastError } = useToast();
  const [form, setForm] = useState<QuestionForm>({ ...EMPTY_FORM });
  const [savedQuestionId, setSavedQuestionId] = useState(isNew ? '' : questionId);
  const [testCases, setTestCases] = useState<QuestionTestCase[]>([]);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [testInput, setTestInput] = useState('');
  const [testOutput, setTestOutput] = useState('');
  const [testHidden, setTestHidden] = useState(false);
  const [testWeight, setTestWeight] = useState(1);

  const loadTests = async (id: string) => {
    const { data, error } = await supabase
      .from('coding_question_test_cases')
      .select('*')
      .eq('question_id', id)
      .order('order_index', { ascending: true });
    if (error) throw error;
    setTestCases((data ?? []) as QuestionTestCase[]);
  };

  useEffect(() => {
    if (isNew) return;
    let active = true;

    const load = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase.from('coding_questions').select('*').eq('id', questionId).single();
        if (error) throw error;
        const question = data as CodingQuestion;
        if (!active) return;
        setForm({
          title: question.title,
          problem_statement: question.problem_statement,
          instructions: question.instructions ?? '',
          input_format: question.input_format ?? '',
          output_format: question.output_format ?? '',
          constraints_text: question.constraints_text ?? '',
          starter_code: question.starter_code ?? '',
          reference_solution: question.reference_solution ?? '',
          explanation: question.explanation ?? '',
          hintsText: question.hints.join('\n'),
          difficulty: question.difficulty,
          topic: question.topic,
          subtopic: question.subtopic ?? '',
          tagsText: question.tags.join(', '),
          companyTagsText: question.company_tags.join(', '),
          frequency_score: question.frequency_score,
          default_marks: question.default_marks,
          source_type: question.source_type,
          is_published: question.is_published,
        });
        await loadTests(questionId);
      } catch (error) {
        toastError('Could not open question', errorMessage(error));
      } finally {
        if (active) setLoading(false);
      }
    };

    void load();
    return () => { active = false; };
  }, [isNew, questionId, toastError]);

  const update = <K extends keyof QuestionForm>(key: K, value: QuestionForm[K]) => {
    setForm(current => ({ ...current, [key]: value }));
  };

  const saveQuestion = async (publish?: boolean) => {
    if (!form.title.trim() || !form.problem_statement.trim()) {
      toastError('Question incomplete', 'Enter the question title and problem statement.');
      return;
    }
    if (!form.topic.trim()) {
      toastError('Topic required', 'Enter a topic such as Strings, Lists or Conditional Statements.');
      return;
    }

    setSaving(true);
    try {
      const isPublished = publish ?? form.is_published;
      const payload = {
        title: form.title.trim(),
        problem_statement: form.problem_statement.trim(),
        instructions: form.instructions.trim() || null,
        input_format: form.input_format.trim() || null,
        output_format: form.output_format.trim() || null,
        constraints_text: form.constraints_text.trim() || null,
        starter_code: form.starter_code || null,
        reference_solution: form.reference_solution || null,
        explanation: form.explanation.trim() || null,
        hints: listFromLines(form.hintsText),
        difficulty: form.difficulty,
        topic: form.topic.trim(),
        subtopic: form.subtopic.trim() || null,
        tags: listFromComma(form.tagsText),
        company_tags: listFromComma(form.companyTagsText),
        frequency_score: Math.max(0, Math.min(100, Number(form.frequency_score) || 0)),
        default_marks: Math.max(1, Number(form.default_marks) || 10),
        language: 'python',
        source_type: form.source_type,
        is_published: isPublished,
        created_by: profile?.id ?? null,
      };

      let id = savedQuestionId;
      if (id) {
        const { error } = await supabase.from('coding_questions').update(payload).eq('id', id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from('coding_questions')
          .insert({ ...payload, slug: makeSlug(form.title) })
          .select('id')
          .single();
        if (error) throw error;
        id = data.id;
        setSavedQuestionId(id);
        window.history.replaceState(null, '', `/faculty/question-bank/editor/${id}`);
      }

      setForm(current => ({ ...current, is_published: isPublished }));
      success(isPublished ? 'Question published' : 'Question saved as draft');
      return id;
    } catch (error) {
      toastError('Could not save question', errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const addTestCase = async () => {
    if (!testOutput.trim()) {
      toastError('Expected output required', 'Enter the correct expected output for this test case.');
      return;
    }

    let id = savedQuestionId;
    if (!id) id = await saveQuestion(false) || '';
    if (!id) return;

    setSaving(true);
    try {
      const { error } = await supabase.from('coding_question_test_cases').insert({
        question_id: id,
        input_data: testInput || null,
        expected_output: testOutput,
        is_hidden: testHidden,
        weight: Math.max(1, Number(testWeight) || 1),
        order_index: testCases.length,
      });
      if (error) throw error;
      await loadTests(id);
      setTestInput('');
      setTestOutput('');
      setTestHidden(false);
      setTestWeight(1);
      success('Test case added');
    } catch (error) {
      toastError('Could not add test case', errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const removeTestCase = async (testCase: QuestionTestCase) => {
    if (!window.confirm('Delete this test case?')) return;
    try {
      const { error } = await supabase.from('coding_question_test_cases').delete().eq('id', testCase.id);
      if (error) throw error;
      setTestCases(current => current.filter(item => item.id !== testCase.id));
      success('Test case deleted');
    } catch (error) {
      toastError('Could not delete test case', errorMessage(error));
    }
  };

  if (loading) {
    return <div className="flex min-h-[500px] items-center justify-center"><Loader2 className="animate-spin text-primary-500" /></div>;
  }

  return (
    <div className="mx-auto max-w-6xl animate-fade-in p-6 lg:p-8">
      <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="rounded-xl p-2.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"><ArrowLeft size={20} /></button>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{savedQuestionId ? 'Edit Coding Question' : 'Create Coding Question'}</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">Build the problem, solution metadata and automatic test cases</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button disabled={saving} className="btn-secondary flex items-center gap-2" onClick={() => void saveQuestion(false)}><Save size={16} /> Save Draft</button>
          <button disabled={saving} className="btn-primary flex items-center gap-2" onClick={() => void saveQuestion(true)}>
            {saving ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />} Publish
          </button>
        </div>
      </div>

      <div className="space-y-6">
        <section className="card p-5 lg:p-6">
          <SectionTitle number="1" title="Problem Details" description="What the student sees and needs to solve" />
          <div className="grid gap-4 lg:grid-cols-2">
            <Field label="Question title" className="lg:col-span-2"><input className="input w-full" value={form.title} onChange={event => update('title', event.target.value)} placeholder="Example: Find the Second Largest Number" /></Field>
            <Field label="Difficulty"><select className="input w-full" value={form.difficulty} onChange={event => update('difficulty', event.target.value as Difficulty)}><option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option></select></Field>
            <Field label="Default marks"><input type="number" min="1" className="input w-full" value={form.default_marks} onChange={event => update('default_marks', Number(event.target.value))} /></Field>
            <Field label="Topic"><input className="input w-full" value={form.topic} onChange={event => update('topic', event.target.value)} placeholder="Strings" /></Field>
            <Field label="Subtopic"><input className="input w-full" value={form.subtopic} onChange={event => update('subtopic', event.target.value)} placeholder="Slicing" /></Field>
            <Field label="Problem statement" className="lg:col-span-2"><textarea className="input min-h-32 w-full" value={form.problem_statement} onChange={event => update('problem_statement', event.target.value)} placeholder="Clearly describe the problem..." /></Field>
            <Field label="Instructions for students" className="lg:col-span-2"><textarea className="input min-h-24 w-full" value={form.instructions} onChange={event => update('instructions', event.target.value)} placeholder="Important rules or clarification..." /></Field>
            <Field label="Input format"><textarea className="input min-h-24 w-full" value={form.input_format} onChange={event => update('input_format', event.target.value)} /></Field>
            <Field label="Output format"><textarea className="input min-h-24 w-full" value={form.output_format} onChange={event => update('output_format', event.target.value)} /></Field>
            <Field label="Constraints" className="lg:col-span-2"><textarea className="input min-h-20 w-full font-mono text-sm" value={form.constraints_text} onChange={event => update('constraints_text', event.target.value)} placeholder="1 <= N <= 1000" /></Field>
          </div>
        </section>

        <section className="card p-5 lg:p-6">
          <SectionTitle number="2" title="Python Code & Teaching Help" description="Starter code, faculty solution, explanation and hints" />
          <div className="grid gap-4 lg:grid-cols-2">
            <Field label="Starter code"><textarea className="input min-h-48 w-full font-mono text-sm" value={form.starter_code} onChange={event => update('starter_code', event.target.value)} /></Field>
            <Field label="Reference solution (faculty only)"><textarea className="input min-h-48 w-full font-mono text-sm" value={form.reference_solution} onChange={event => update('reference_solution', event.target.value)} /></Field>
            <Field label="Solution explanation" className="lg:col-span-2"><textarea className="input min-h-24 w-full" value={form.explanation} onChange={event => update('explanation', event.target.value)} placeholder="Explain the approach after the student solves it..." /></Field>
            <Field label="Hints (one per line)" className="lg:col-span-2"><textarea className="input min-h-24 w-full" value={form.hintsText} onChange={event => update('hintsText', event.target.value)} placeholder={'Think about a loop\nKeep a running maximum'} /></Field>
          </div>
        </section>

        <section className="card p-5 lg:p-6">
          <SectionTitle number="3" title="Interview Metadata" description="Used for searching, filtering and learning paths" />
          <div className="grid gap-4 lg:grid-cols-2">
            <Field label="Tags (comma separated)"><input className="input w-full" value={form.tagsText} onChange={event => update('tagsText', event.target.value)} placeholder="strings, loops, counting" /></Field>
            <Field label="Company-pattern tags (comma separated)"><input className="input w-full" value={form.companyTagsText} onChange={event => update('companyTagsText', event.target.value)} placeholder="TCS, Infosys, Wipro" /></Field>
            <Field label="Pattern frequency score (0–100)"><input type="number" min="0" max="100" className="input w-full" value={form.frequency_score} onChange={event => update('frequency_score', Number(event.target.value))} /></Field>
            <Field label="Source type"><select className="input w-full" value={form.source_type} onChange={event => update('source_type', event.target.value as CodingQuestion['source_type'])}><option value="faculty_created">Faculty created</option><option value="original">Original</option><option value="adapted_pattern">Adapted interview pattern</option></select></Field>
          </div>
        </section>

        <section className="card p-5 lg:p-6">
          <SectionTitle number="4" title="Automatic Test Cases" description="Visible examples help students; hidden tests verify submissions" />
          <div className="mb-5 grid gap-4 lg:grid-cols-2">
            <Field label="Input"><textarea className="input min-h-28 w-full font-mono text-sm" value={testInput} onChange={event => setTestInput(event.target.value)} placeholder={'5\n7'} /></Field>
            <Field label="Expected output"><textarea className="input min-h-28 w-full font-mono text-sm" value={testOutput} onChange={event => setTestOutput(event.target.value)} placeholder="12" /></Field>
            <label className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300"><input type="checkbox" checked={testHidden} onChange={event => setTestHidden(event.target.checked)} /> Hidden test case</label>
            <Field label="Weight"><input type="number" min="1" className="input w-full" value={testWeight} onChange={event => setTestWeight(Number(event.target.value))} /></Field>
          </div>
          <button disabled={saving} className="btn-primary flex items-center gap-2" onClick={() => void addTestCase()}><Plus size={16} /> Add Test Case</button>

          <div className="mt-6 space-y-3">
            {testCases.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-400 dark:border-slate-700">No test cases yet. Add at least one visible and one hidden test.</div>
            ) : testCases.map((testCase, index) => (
              <div key={testCase.id} className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2"><span className="font-semibold text-slate-900 dark:text-white">Test {index + 1}</span><Badge variant={testCase.is_hidden ? 'warning' : 'success'}>{testCase.is_hidden ? 'Hidden' : 'Visible'}</Badge><span className="text-xs text-slate-400">Weight {testCase.weight}</span></div>
                  <button className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20" onClick={() => void removeTestCase(testCase)}><Trash2 size={16} /></button>
                </div>
                <div className="grid gap-4 text-sm sm:grid-cols-2"><div><p className="mb-1 text-xs uppercase text-slate-400">Input</p><pre className="whitespace-pre-wrap rounded-lg bg-slate-100 p-3 dark:bg-slate-800">{testCase.input_data || '(no input)'}</pre></div><div><p className="mb-1 text-xs uppercase text-slate-400">Expected</p><pre className="whitespace-pre-wrap rounded-lg bg-slate-100 p-3 text-emerald-600 dark:bg-slate-800">{testCase.expected_output}</pre></div></div>
              </div>
            ))}
          </div>
        </section>

        <div className="flex flex-col justify-end gap-3 sm:flex-row">
          <button className="btn-secondary" onClick={() => navigate('/faculty/question-bank')}>Cancel</button>
          <button disabled={saving} className="btn-secondary flex items-center justify-center gap-2" onClick={() => void saveQuestion(false)}><Save size={16} /> Save Draft</button>
          <button disabled={saving} className="btn-primary flex items-center justify-center gap-2" onClick={() => void saveQuestion(true)}><CheckCircle2 size={16} /> Publish Question</button>
        </div>
      </div>
    </div>
  );
}

function SectionTitle({ number, title, description }: { number: string; title: string; description: string }) {
  return <div className="mb-5 flex items-start gap-3"><span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-primary-600 text-sm font-bold text-white">{number}</span><div><h2 className="font-bold text-slate-900 dark:text-white">{title}</h2><p className="text-sm text-slate-500 dark:text-slate-400">{description}</p></div></div>;
}

function Field({ label, className = '', children }: { label: string; className?: string; children: React.ReactNode }) {
  return <label className={className}><span className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">{label}</span>{children}</label>;
}
