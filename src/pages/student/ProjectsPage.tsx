import { useEffect, useState } from 'react';
import { FolderKanban, Clock, Tag, Github, ExternalLink, CheckCircle } from 'lucide-react';
import { PageHeader } from '../../components/common/PageHeader';
import { Badge } from '../../components/ui/Badge';
import { EmptyState } from '../../components/ui/EmptyState';
import { Modal } from '../../components/ui/Modal';
import { SkeletonCard } from '../../components/ui/LoadingSpinner';
import { useToast } from '../../components/ui/Toast';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { getDifficultyColor } from '../../lib/utils';
import type { Project, ProjectSubmission } from '../../types/database';

export default function ProjectsPage() {
  const { profile } = useAuth();
  const { success, error: toastError } = useToast();
  const [projects, setProjects] = useState<Project[]>([]);
  const [submissions, setSubmissions] = useState<Map<string, ProjectSubmission>>(new Map());
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [submitModal, setSubmitModal] = useState<Project | null>(null);
  const [form, setForm] = useState({ github_url: '', live_url: '', description: '' });

  useEffect(() => {
    const load = async () => {
      if (!profile) { setLoading(false); return; }
      const { data: enrData } = await supabase.from('course_enrollments').select('course_id').eq('student_id', profile.id);
      const courseIds = (enrData ?? []).map((e: any) => e.course_id);

      let projData = null;
      if (courseIds.length) {
        const res = await supabase.from('projects').select('*').eq('is_published', true).in('course_id', courseIds).order('difficulty');
        projData = res.data;
      }
      setProjects((projData ?? []) as Project[]);

      const { data: subData } = await supabase.from('project_submissions').select('*').eq('student_id', profile.id);
      setSubmissions(new Map((subData ?? []).map((s: any) => [s.project_id, s])));
      setLoading(false);
    };
    load();
  }, [profile]);

  const handleSubmit = async () => {
    if (!submitModal || !profile) return;
    const { error: err } = await supabase.from('project_submissions').upsert({
      project_id: submitModal.id, student_id: profile.id, ...form, status: 'submitted',
    }, { onConflict: 'project_id,student_id' });
    if (err) { toastError('Error', err.message); return; }
    success('Project submitted!');
    setSubmissions(prev => {
      const next = new Map(prev);
      next.set(submitModal.id, { project_id: submitModal.id, student_id: profile.id, ...form, status: 'submitted', submitted_at: new Date().toISOString(), id: '', feedback: null });
      return next;
    });
    setSubmitModal(null);
  };

  const difficulties = ['all', 'beginner', 'intermediate', 'advanced'];
  const filtered = filter === 'all' ? projects : projects.filter(p => p.difficulty === filter);

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto animate-fade-in">
      <PageHeader title="Projects" subtitle="Real-world projects to build your portfolio" icon={FolderKanban} />

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-6">
        {difficulties.map(d => (
          <button key={d} onClick={() => setFilter(d)}
            className={`px-4 py-1.5 rounded-xl text-sm font-medium transition-colors capitalize ${filter === d ? 'bg-primary-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'}`}>
            {d === 'all' ? 'All Projects' : d}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {[1, 2, 3, 4, 5, 6].map(i => <SkeletonCard key={i} />)}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={FolderKanban} title="No projects found" />
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {filtered.map(proj => {
            const sub = submissions.get(proj.id);
            return (
              <div key={proj.id} className="card-hover p-5 flex flex-col">
                <div className="flex items-start justify-between gap-2 mb-3">
                  <h3 className="font-bold text-slate-900 dark:text-white">{proj.title}</h3>
                  {sub && <Badge variant="success" className="text-xs flex-shrink-0"><CheckCircle size={10} /> Done</Badge>}
                </div>
                <div className="flex gap-2 mb-3">
                  <span className={`badge capitalize text-xs ${getDifficultyColor(proj.difficulty)}`}>{proj.difficulty}</span>
                  <span className="badge text-xs bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 flex items-center gap-1">
                    <Clock size={10} /> {proj.estimated_hours}h
                  </span>
                </div>
                <p className="text-sm text-slate-500 dark:text-slate-400 mb-4 flex-1 line-clamp-3">{proj.description}</p>
                <div className="flex flex-wrap gap-1.5 mb-4">
                  {(proj.tech_tags ?? []).slice(0, 4).map(tag => (
                    <span key={tag} className="badge text-xs bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-400 flex items-center gap-1">
                      <Tag size={9} /> {tag}
                    </span>
                  ))}
                </div>
                <button
                  onClick={() => { setSubmitModal(proj); setForm({ github_url: '', live_url: '', description: '' }); }}
                  className="btn-primary text-sm py-2 w-full"
                >
                  {sub ? 'Update Submission' : 'Submit Project'}
                </button>
              </div>
            );
          })}
        </div>
      )}

      <Modal open={!!submitModal} onClose={() => setSubmitModal(null)} title={`Submit: ${submitModal?.title}`}>
        <div className="space-y-4">
          <div>
            <label className="label">GitHub Repository URL</label>
            <div className="relative">
              <Github size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input className="input pl-9" placeholder="https://github.com/..." value={form.github_url} onChange={e => setForm(f => ({ ...f, github_url: e.target.value }))} />
            </div>
          </div>
          <div>
            <label className="label">Live Demo URL (optional)</label>
            <div className="relative">
              <ExternalLink size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input className="input pl-9" placeholder="https://..." value={form.live_url} onChange={e => setForm(f => ({ ...f, live_url: e.target.value }))} />
            </div>
          </div>
          <div>
            <label className="label">Project Description</label>
            <textarea className="input min-h-[100px] resize-none" placeholder="Briefly describe your implementation..." value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
          </div>
          <div className="flex gap-3 justify-end">
            <button onClick={() => setSubmitModal(null)} className="btn-secondary">Cancel</button>
            <button onClick={handleSubmit} className="btn-primary">Submit Project</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
