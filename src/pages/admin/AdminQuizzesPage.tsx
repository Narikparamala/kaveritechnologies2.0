import { useState, useEffect } from 'react';
import { HelpCircle, Search, Loader2, Eye, EyeOff, Clock, Award, Users, CheckCircle } from 'lucide-react';
import { PageHeader } from '../../components/common/PageHeader';
import { EmptyState } from '../../components/ui/EmptyState';
import { supabase } from '../../lib/supabase';

interface QuizRow {
  id: string;
  title: string;
  course_id: string;
  pass_percentage: number;
  time_limit_minutes: number | null;
  xp_reward: number;
  is_published: boolean;
  show_answers: boolean;
  created_at: string;
  course_title: string;
  question_count: number;
  attempt_count: number;
}

export default function AdminQuizzesPage() {
  const [quizzes, setQuizzes] = useState<QuizRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [courseFilter, setCourseFilter] = useState('');
  const [courses, setCourses] = useState<{ id: string; title: string }[]>([]);

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    const [quizRes, coursesRes, questionsRes, attemptsRes] = await Promise.all([
      supabase.from('quizzes').select('*').order('created_at', { ascending: false }),
      supabase.from('courses').select('id, title'),
      supabase.from('quiz_questions').select('quiz_id'),
      supabase.from('quiz_attempts').select('quiz_id'),
    ]);

    const courseMap = new Map((coursesRes.data ?? []).map(c => [c.id, c.title]));
    const qCountMap = new Map<string, number>();
    (questionsRes.data ?? []).forEach(q => { qCountMap.set(q.quiz_id, (qCountMap.get(q.quiz_id) ?? 0) + 1); });
    const aCountMap = new Map<string, number>();
    (attemptsRes.data ?? []).forEach(a => { aCountMap.set(a.quiz_id, (aCountMap.get(a.quiz_id) ?? 0) + 1); });

    setCourses(coursesRes.data ?? []);
    setQuizzes((quizRes.data ?? []).map(q => ({
      ...q,
      course_title: courseMap.get(q.course_id) ?? 'Unknown',
      question_count: qCountMap.get(q.id) ?? 0,
      attempt_count: aCountMap.get(q.id) ?? 0,
    })));
    setLoading(false);
  }

  async function togglePublish(q: QuizRow) {
    await supabase.from('quizzes').update({ is_published: !q.is_published }).eq('id', q.id);
    setQuizzes(prev => prev.map(x => x.id === q.id ? { ...x, is_published: !x.is_published } : x));
  }

  const filtered = quizzes.filter(q => {
    if (search && !q.title.toLowerCase().includes(search.toLowerCase())) return false;
    if (courseFilter && q.course_id !== courseFilter) return false;
    return true;
  });

  if (loading) {
    return <div className="p-6 lg:p-8 flex items-center justify-center min-h-[400px]"><Loader2 className="animate-spin text-primary-500" size={32} /></div>;
  }

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto animate-fade-in">
      <PageHeader title="Quiz Manager" subtitle={`${quizzes.length} quizzes across all courses`} icon={HelpCircle} />

      <div className="flex flex-wrap gap-3 mb-6">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input className="input pl-9" placeholder="Search quizzes..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="input w-auto" value={courseFilter} onChange={e => setCourseFilter(e.target.value)}>
          <option value="">All Courses</option>
          {courses.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
        </select>
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={HelpCircle} title="No quizzes found" description="Quizzes are created by faculty through the course builder." />
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800">
                  <th className="text-left text-xs font-medium text-slate-400 uppercase tracking-wider py-3 px-4">Quiz</th>
                  <th className="text-left text-xs font-medium text-slate-400 uppercase tracking-wider py-3 px-4">Course</th>
                  <th className="text-left text-xs font-medium text-slate-400 uppercase tracking-wider py-3 px-4">Questions</th>
                  <th className="text-left text-xs font-medium text-slate-400 uppercase tracking-wider py-3 px-4">Pass %</th>
                  <th className="text-left text-xs font-medium text-slate-400 uppercase tracking-wider py-3 px-4">Time Limit</th>
                  <th className="text-left text-xs font-medium text-slate-400 uppercase tracking-wider py-3 px-4">Attempts</th>
                  <th className="text-left text-xs font-medium text-slate-400 uppercase tracking-wider py-3 px-4">Status</th>
                  <th className="text-right text-xs font-medium text-slate-400 uppercase tracking-wider py-3 px-4">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                {filtered.map(q => (
                  <tr key={q.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                    <td className="py-3 px-4">
                      <p className="text-sm font-medium text-slate-900 dark:text-white">{q.title}</p>
                      <div className="flex items-center gap-2 text-xs text-slate-400 mt-0.5">
                        <span className="flex items-center gap-0.5"><Award size={10} /> {q.xp_reward} XP</span>
                        {q.show_answers && <span className="text-blue-500">Shows answers</span>}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-sm text-slate-600 dark:text-slate-400">{q.course_title}</td>
                    <td className="py-3 px-4">
                      <span className="flex items-center gap-1 text-xs text-slate-500"><CheckCircle size={12} /> {q.question_count}</span>
                    </td>
                    <td className="py-3 px-4 text-sm text-slate-600 dark:text-slate-400">{q.pass_percentage}%</td>
                    <td className="py-3 px-4">
                      {q.time_limit_minutes ? (
                        <span className="flex items-center gap-1 text-xs text-slate-500"><Clock size={12} /> {q.time_limit_minutes}m</span>
                      ) : <span className="text-xs text-slate-400">None</span>}
                    </td>
                    <td className="py-3 px-4">
                      <span className="flex items-center gap-1 text-xs text-slate-500"><Users size={12} /> {q.attempt_count}</span>
                    </td>
                    <td className="py-3 px-4">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${q.is_published ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-slate-100 text-slate-500'}`}>
                        {q.is_published ? 'Published' : 'Draft'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button onClick={() => togglePublish(q)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-600" title={q.is_published ? 'Unpublish' : 'Publish'}>
                        {q.is_published ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
