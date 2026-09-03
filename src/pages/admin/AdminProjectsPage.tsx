import { useState, useEffect } from 'react';
import { FolderKanban, Search, Loader2, Eye, EyeOff, Clock, Tag, Users } from 'lucide-react';
import { PageHeader } from '../../components/common/PageHeader';
import { EmptyState } from '../../components/ui/EmptyState';
import { supabase } from '../../lib/supabase';

interface ProjectRow {
  id: string;
  title: string;
  description: string | null;
  difficulty: string;
  category: string;
  estimated_hours: number;
  tech_tags: string[];
  course_id: string | null;
  is_published: boolean;
  created_at: string;
  course_title: string | null;
  submission_count: number;
}

export default function AdminProjectsPage() {
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    const [projectsRes, coursesRes, submissionsRes] = await Promise.all([
      supabase.from('projects').select('*').order('created_at', { ascending: false }),
      supabase.from('courses').select('id, title'),
      supabase.from('project_submissions').select('project_id'),
    ]);

    const courseMap = new Map((coursesRes.data ?? []).map(c => [c.id, c.title]));
    const subCountMap = new Map<string, number>();
    (submissionsRes.data ?? []).forEach(s => {
      subCountMap.set(s.project_id, (subCountMap.get(s.project_id) ?? 0) + 1);
    });

    setProjects((projectsRes.data ?? []).map(p => ({
      ...p,
      course_title: p.course_id ? courseMap.get(p.course_id) ?? null : null,
      submission_count: subCountMap.get(p.id) ?? 0,
    })));
    setLoading(false);
  }

  async function togglePublish(p: ProjectRow) {
    await supabase.from('projects').update({ is_published: !p.is_published }).eq('id', p.id);
    setProjects(prev => prev.map(x => x.id === p.id ? { ...x, is_published: !x.is_published } : x));
  }

  const filtered = projects.filter(p => {
    if (search && !p.title.toLowerCase().includes(search.toLowerCase()) && !p.category.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const difficultyColor: Record<string, string> = {
    beginner: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
    intermediate: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
    advanced: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  };

  if (loading) {
    return <div className="p-6 lg:p-8 flex items-center justify-center min-h-[400px]"><Loader2 className="animate-spin text-primary-500" size={32} /></div>;
  }

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto animate-fade-in">
      <PageHeader title="Projects Manager" subtitle={`${projects.length} projects`} icon={FolderKanban} />

      <div className="flex flex-wrap gap-3 mb-6">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input className="input pl-9" placeholder="Search projects..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={FolderKanban} title="No projects found" description="Projects can be created by faculty through the course builder." />
      ) : (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map(p => (
            <div key={p.id} className="card p-5 flex flex-col">
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-slate-900 dark:text-white text-sm">{p.title}</h3>
                  {p.course_title && <p className="text-xs text-slate-400 mt-0.5">{p.course_title}</p>}
                </div>
                <button onClick={() => togglePublish(p)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-600 flex-shrink-0">
                  {p.is_published ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>

              {p.description && (
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-3 line-clamp-2">{p.description}</p>
              )}

              <div className="flex flex-wrap gap-1.5 mb-3">
                <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium capitalize ${difficultyColor[p.difficulty] ?? 'bg-slate-100 text-slate-500'}`}>
                  {p.difficulty}
                </span>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                  <Tag size={10} /> {p.category}
                </span>
              </div>

              {p.tech_tags?.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-3">
                  {p.tech_tags.slice(0, 5).map(tag => (
                    <span key={tag} className="px-1.5 py-0.5 rounded text-xs bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-400">
                      {tag}
                    </span>
                  ))}
                </div>
              )}

              <div className="mt-auto pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs text-slate-400">
                <span className="flex items-center gap-1"><Clock size={11} /> {p.estimated_hours}h estimated</span>
                <span className="flex items-center gap-1"><Users size={11} /> {p.submission_count} submissions</span>
              </div>

              <div className="mt-2">
                <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${p.is_published ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-slate-100 text-slate-500'}`}>
                  {p.is_published ? 'Published' : 'Draft'}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
