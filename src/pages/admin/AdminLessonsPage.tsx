import { useState, useEffect } from 'react';
import { BookOpen, Search, Filter, Eye, EyeOff, Loader2, Clock, Zap, Video, FileText } from 'lucide-react';
import { PageHeader } from '../../components/common/PageHeader';
import { EmptyState } from '../../components/ui/EmptyState';
import { supabase } from '../../lib/supabase';

interface LessonRow {
  id: string;
  title: string;
  slug: string;
  course_id: string;
  chapter_id: string;
  teaching_mode: string;
  duration_minutes: number;
  xp_reward: number;
  is_published: boolean;
  is_free_preview: boolean;
  order_index: number;
  created_at: string;
  course_title: string;
  chapter_title: string;
}

export default function AdminLessonsPage() {
  const [lessons, setLessons] = useState<LessonRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [courseFilter, setCourseFilter] = useState('');
  const [courses, setCourses] = useState<{ id: string; title: string }[]>([]);
  const [statusFilter, setStatusFilter] = useState<'all' | 'published' | 'draft'>('all');

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    const [lessonsRes, coursesRes, chaptersRes] = await Promise.all([
      supabase.from('lessons').select('*').order('created_at', { ascending: false }),
      supabase.from('courses').select('id, title'),
      supabase.from('chapters').select('id, title, course_id'),
    ]);

    const courseMap = new Map((coursesRes.data ?? []).map(c => [c.id, c.title]));
    const chapterMap = new Map((chaptersRes.data ?? []).map(c => [c.id, c.title]));

    setCourses(coursesRes.data ?? []);
    setLessons((lessonsRes.data ?? []).map(l => ({
      ...l,
      course_title: courseMap.get(l.course_id) ?? 'Unknown',
      chapter_title: chapterMap.get(l.chapter_id) ?? 'Unknown',
    })));
    setLoading(false);
  }

  async function togglePublish(lesson: LessonRow) {
    await supabase.from('lessons').update({ is_published: !lesson.is_published }).eq('id', lesson.id);
    setLessons(prev => prev.map(l => l.id === lesson.id ? { ...l, is_published: !l.is_published } : l));
  }

  const filtered = lessons.filter(l => {
    if (search && !l.title.toLowerCase().includes(search.toLowerCase())) return false;
    if (courseFilter && l.course_id !== courseFilter) return false;
    if (statusFilter === 'published' && !l.is_published) return false;
    if (statusFilter === 'draft' && l.is_published) return false;
    return true;
  });

  if (loading) {
    return (
      <div className="p-6 lg:p-8 flex items-center justify-center min-h-[400px]">
        <Loader2 className="animate-spin text-primary-500" size={32} />
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto animate-fade-in">
      <PageHeader title="Lesson Manager" subtitle={`${lessons.length} lessons across all courses`} icon={BookOpen} />

      <div className="flex flex-wrap gap-3 mb-6">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input className="input pl-9" placeholder="Search lessons..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="input w-auto" value={courseFilter} onChange={e => setCourseFilter(e.target.value)}>
          <option value="">All Courses</option>
          {courses.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
        </select>
        <select className="input w-auto" value={statusFilter} onChange={e => setStatusFilter(e.target.value as any)}>
          <option value="all">All Status</option>
          <option value="published">Published</option>
          <option value="draft">Draft</option>
        </select>
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={BookOpen} title="No lessons found" description="Adjust filters or create lessons in the course builder." />
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800">
                  <th className="text-left text-xs font-medium text-slate-400 uppercase tracking-wider py-3 px-4">Lesson</th>
                  <th className="text-left text-xs font-medium text-slate-400 uppercase tracking-wider py-3 px-4">Course / Chapter</th>
                  <th className="text-left text-xs font-medium text-slate-400 uppercase tracking-wider py-3 px-4">Mode</th>
                  <th className="text-left text-xs font-medium text-slate-400 uppercase tracking-wider py-3 px-4">Duration</th>
                  <th className="text-left text-xs font-medium text-slate-400 uppercase tracking-wider py-3 px-4">XP</th>
                  <th className="text-left text-xs font-medium text-slate-400 uppercase tracking-wider py-3 px-4">Status</th>
                  <th className="text-right text-xs font-medium text-slate-400 uppercase tracking-wider py-3 px-4">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                {filtered.map(l => (
                  <tr key={l.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                    <td className="py-3 px-4">
                      <p className="text-sm font-medium text-slate-900 dark:text-white">{l.title}</p>
                      {l.is_free_preview && <span className="text-xs text-emerald-600 font-medium">Free Preview</span>}
                    </td>
                    <td className="py-3 px-4">
                      <p className="text-sm text-slate-600 dark:text-slate-400">{l.course_title}</p>
                      <p className="text-xs text-slate-400">{l.chapter_title}</p>
                    </td>
                    <td className="py-3 px-4">
                      <span className="flex items-center gap-1 text-xs text-slate-500">
                        {l.teaching_mode === 'live_class' ? <Video size={12} /> : <FileText size={12} />}
                        {l.teaching_mode === 'live_class' ? 'Live' : 'Recorded'}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <span className="flex items-center gap-1 text-xs text-slate-500"><Clock size={12} /> {l.duration_minutes}m</span>
                    </td>
                    <td className="py-3 px-4">
                      <span className="flex items-center gap-1 text-xs text-amber-600"><Zap size={12} /> {l.xp_reward}</span>
                    </td>
                    <td className="py-3 px-4">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${l.is_published ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'}`}>
                        {l.is_published ? 'Published' : 'Draft'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button onClick={() => togglePublish(l)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-600" title={l.is_published ? 'Unpublish' : 'Publish'}>
                        {l.is_published ? <EyeOff size={14} /> : <Eye size={14} />}
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
