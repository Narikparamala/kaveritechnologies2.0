import { useState, useEffect } from 'react';
import { ClipboardList, Search, Loader2, Eye, EyeOff, Calendar, Award, Users } from 'lucide-react';
import { PageHeader } from '../../components/common/PageHeader';
import { EmptyState } from '../../components/ui/EmptyState';
import { supabase } from '../../lib/supabase';

interface AssignmentRow {
  id: string;
  title: string;
  course_id: string;
  max_marks: number;
  difficulty: string;
  due_date: string | null;
  is_published: boolean;
  allow_resubmit: boolean;
  created_at: string;
  course_title: string;
  submission_count: number;
}

export default function AdminAssignmentsPage() {
  const [assignments, setAssignments] = useState<AssignmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [courseFilter, setCourseFilter] = useState('');
  const [courses, setCourses] = useState<{ id: string; title: string }[]>([]);

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    const [assignRes, coursesRes, submissionsRes] = await Promise.all([
      supabase.from('assignments').select('*').order('created_at', { ascending: false }),
      supabase.from('courses').select('id, title'),
      supabase.from('assignment_submissions').select('assignment_id'),
    ]);

    const courseMap = new Map((coursesRes.data ?? []).map(c => [c.id, c.title]));
    const subCountMap = new Map<string, number>();
    (submissionsRes.data ?? []).forEach(s => {
      subCountMap.set(s.assignment_id, (subCountMap.get(s.assignment_id) ?? 0) + 1);
    });

    setCourses(coursesRes.data ?? []);
    setAssignments((assignRes.data ?? []).map(a => ({
      ...a,
      course_title: courseMap.get(a.course_id) ?? 'Unknown',
      submission_count: subCountMap.get(a.id) ?? 0,
    })));
    setLoading(false);
  }

  async function togglePublish(a: AssignmentRow) {
    await supabase.from('assignments').update({ is_published: !a.is_published }).eq('id', a.id);
    setAssignments(prev => prev.map(x => x.id === a.id ? { ...x, is_published: !x.is_published } : x));
  }

  const filtered = assignments.filter(a => {
    if (search && !a.title.toLowerCase().includes(search.toLowerCase())) return false;
    if (courseFilter && a.course_id !== courseFilter) return false;
    return true;
  });

  const difficultyColor: Record<string, string> = {
    easy: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
    medium: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
    hard: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  };

  if (loading) {
    return <div className="p-6 lg:p-8 flex items-center justify-center min-h-[400px]"><Loader2 className="animate-spin text-primary-500" size={32} /></div>;
  }

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto animate-fade-in">
      <PageHeader title="Assignment Manager" subtitle={`${assignments.length} assignments across all courses`} icon={ClipboardList} />

      <div className="flex flex-wrap gap-3 mb-6">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input className="input pl-9" placeholder="Search assignments..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="input w-auto" value={courseFilter} onChange={e => setCourseFilter(e.target.value)}>
          <option value="">All Courses</option>
          {courses.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
        </select>
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={ClipboardList} title="No assignments found" description="Assignments are created by faculty through the course builder." />
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800">
                  <th className="text-left text-xs font-medium text-slate-400 uppercase tracking-wider py-3 px-4">Assignment</th>
                  <th className="text-left text-xs font-medium text-slate-400 uppercase tracking-wider py-3 px-4">Course</th>
                  <th className="text-left text-xs font-medium text-slate-400 uppercase tracking-wider py-3 px-4">Difficulty</th>
                  <th className="text-left text-xs font-medium text-slate-400 uppercase tracking-wider py-3 px-4">Max Marks</th>
                  <th className="text-left text-xs font-medium text-slate-400 uppercase tracking-wider py-3 px-4">Due Date</th>
                  <th className="text-left text-xs font-medium text-slate-400 uppercase tracking-wider py-3 px-4">Submissions</th>
                  <th className="text-left text-xs font-medium text-slate-400 uppercase tracking-wider py-3 px-4">Status</th>
                  <th className="text-right text-xs font-medium text-slate-400 uppercase tracking-wider py-3 px-4">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                {filtered.map(a => (
                  <tr key={a.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                    <td className="py-3 px-4">
                      <p className="text-sm font-medium text-slate-900 dark:text-white">{a.title}</p>
                      {a.allow_resubmit && <span className="text-xs text-blue-500">Resubmit allowed</span>}
                    </td>
                    <td className="py-3 px-4 text-sm text-slate-600 dark:text-slate-400">{a.course_title}</td>
                    <td className="py-3 px-4">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium capitalize ${difficultyColor[a.difficulty] ?? 'bg-slate-100 text-slate-500'}`}>
                        {a.difficulty}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <span className="flex items-center gap-1 text-xs text-slate-500"><Award size={12} /> {a.max_marks}</span>
                    </td>
                    <td className="py-3 px-4">
                      {a.due_date ? (
                        <span className="flex items-center gap-1 text-xs text-slate-500">
                          <Calendar size={12} />
                          {new Date(a.due_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </span>
                      ) : <span className="text-xs text-slate-400">No deadline</span>}
                    </td>
                    <td className="py-3 px-4">
                      <span className="flex items-center gap-1 text-xs text-slate-500"><Users size={12} /> {a.submission_count}</span>
                    </td>
                    <td className="py-3 px-4">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${a.is_published ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-slate-100 text-slate-500'}`}>
                        {a.is_published ? 'Published' : 'Draft'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button onClick={() => togglePublish(a)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-600" title={a.is_published ? 'Unpublish' : 'Publish'}>
                        {a.is_published ? <EyeOff size={14} /> : <Eye size={14} />}
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
