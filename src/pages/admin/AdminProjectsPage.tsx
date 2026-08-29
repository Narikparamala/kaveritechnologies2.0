import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Clock,
  ExternalLink,
  Eye,
  EyeOff,
  FolderKanban,
  Github,
  History,
  Loader2,
  Search,
  Tag,
  Users,
  X,
} from 'lucide-react';
import { PageHeader } from '../../components/common/PageHeader';
import { EmptyState } from '../../components/ui/EmptyState';
import { supabase } from '../../lib/supabase';

type SubmissionStatus = 'draft' | 'submitted' | 'reviewed' | 'approved' | 'rejected';

interface ProjectRow {
  id: string;
  title: string;
  description: string | null;
  difficulty: string;
  category: string;
  estimated_hours: number;
  max_marks: number;
  due_at: string | null;
  tech_tags: string[];
  course_id: string | null;
  is_published: boolean;
  created_at: string;
  course_title: string | null;
  submission_count: number;
}

interface ProfileSummary {
  id: string;
  full_name: string;
  email: string;
}

interface SubmissionRow {
  id: string;
  project_id: string;
  student_id: string;
  github_url: string | null;
  live_url: string | null;
  external_url: string | null;
  description: string | null;
  status: SubmissionStatus;
  feedback: string | null;
  score: number | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  submitted_at: string | null;
  updated_at: string;
  project_title: string;
  max_marks: number;
  due_at: string | null;
  student_name: string;
  student_email: string;
  reviewer_name: string | null;
}

interface ReviewHistoryRow {
  id: string;
  submission_id: string;
  status: SubmissionStatus;
  score: number | null;
  feedback: string | null;
  reviewed_by: string | null;
  reviewed_at: string;
  reviewer_name: string | null;
}

const statusLabel: Record<SubmissionStatus, string> = {
  draft: 'Draft',
  submitted: 'Awaiting review',
  reviewed: 'Reviewed',
  approved: 'Approved',
  rejected: 'Revision requested',
};

const statusClass: Record<SubmissionStatus, string> = {
  draft: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  submitted: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  reviewed: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300',
  approved: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  rejected: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
};

function formatDate(value: string | null) {
  if (!value) return 'Not available';
  return new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function isOverdue(row: SubmissionRow) {
  return Boolean(row.due_at && row.submitted_at && new Date(row.submitted_at) > new Date(row.due_at));
}

export default function AdminProjectsPage() {
  const [tab, setTab] = useState<'projects' | 'submissions'>('projects');
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [submissions, setSubmissions] = useState<SubmissionRow[]>([]);
  const [history, setHistory] = useState<ReviewHistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'all' | SubmissionStatus>('all');
  const [projectId, setProjectId] = useState('all');
  const [reviewer, setReviewer] = useState('all');
  const [timing, setTiming] = useState<'all' | 'overdue' | 'on_time'>('all');
  const [selected, setSelected] = useState<SubmissionRow | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [projectsRes, coursesRes, submissionsRes, profilesRes, historyRes] = await Promise.all([
      supabase.from('projects').select('*').order('created_at', { ascending: false }),
      supabase.from('courses').select('id, title'),
      supabase.from('project_submissions').select('*').order('updated_at', { ascending: false }),
      supabase.from('profiles').select('id, full_name, email'),
      supabase.from('project_submission_review_history').select('*').order('reviewed_at', { ascending: false }),
    ]);

    const firstError = projectsRes.error ?? coursesRes.error ?? submissionsRes.error ?? profilesRes.error ?? historyRes.error;
    if (firstError) {
      setError(firstError.message);
      setLoading(false);
      return;
    }

    const courseMap = new Map((coursesRes.data ?? []).map(course => [course.id, course.title]));
    const profileMap = new Map<string, ProfileSummary>(
      ((profilesRes.data ?? []) as ProfileSummary[]).map(profile => [profile.id, profile]),
    );
    const rawProjects = projectsRes.data ?? [];
    const projectMap = new Map(rawProjects.map(project => [project.id, project]));
    const subCountMap = new Map<string, number>();
    (submissionsRes.data ?? []).forEach(submission => {
      subCountMap.set(submission.project_id, (subCountMap.get(submission.project_id) ?? 0) + 1);
    });

    setProjects(rawProjects.map(project => ({
      ...project,
      course_title: project.course_id ? courseMap.get(project.course_id) ?? null : null,
      submission_count: subCountMap.get(project.id) ?? 0,
    })) as ProjectRow[]);

    setSubmissions((submissionsRes.data ?? []).map(submission => {
      const project = projectMap.get(submission.project_id);
      const student = profileMap.get(submission.student_id);
      const reviewedBy = submission.reviewed_by ? profileMap.get(submission.reviewed_by) : null;
      return {
        ...submission,
        project_title: project?.title ?? 'Unknown project',
        max_marks: project?.max_marks ?? 0,
        due_at: project?.due_at ?? null,
        student_name: student?.full_name ?? 'Unknown student',
        student_email: student?.email ?? '',
        reviewer_name: reviewedBy?.full_name ?? null,
      };
    }) as SubmissionRow[]);

    setHistory((historyRes.data ?? []).map(item => ({
      ...item,
      reviewer_name: item.reviewed_by ? profileMap.get(item.reviewed_by)?.full_name ?? null : null,
    })) as ReviewHistoryRow[]);
    setLoading(false);
  }, []);

  useEffect(() => { void loadData(); }, [loadData]);

  async function togglePublish(project: ProjectRow) {
    const { error: updateError } = await supabase
      .from('projects')
      .update({ is_published: !project.is_published })
      .eq('id', project.id);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setProjects(previous => previous.map(item => item.id === project.id
      ? { ...item, is_published: !item.is_published }
      : item));
  }

  const filteredProjects = useMemo(() => projects.filter(project => {
    const term = search.trim().toLowerCase();
    return !term
      || project.title.toLowerCase().includes(term)
      || project.category.toLowerCase().includes(term)
      || (project.course_title ?? '').toLowerCase().includes(term);
  }), [projects, search]);

  const reviewers = useMemo(() => Array.from(new Set(
    submissions.map(item => item.reviewer_name).filter((name): name is string => Boolean(name)),
  )).sort(), [submissions]);

  const filteredSubmissions = useMemo(() => submissions.filter(submission => {
    const term = search.trim().toLowerCase();
    if (term && ![
      submission.student_name,
      submission.student_email,
      submission.project_title,
      submission.reviewer_name ?? '',
    ].some(value => value.toLowerCase().includes(term))) return false;
    if (status !== 'all' && submission.status !== status) return false;
    if (projectId !== 'all' && submission.project_id !== projectId) return false;
    if (reviewer !== 'all' && submission.reviewer_name !== reviewer) return false;
    if (timing === 'overdue' && !isOverdue(submission)) return false;
    if (timing === 'on_time' && isOverdue(submission)) return false;
    return true;
  }), [projectId, reviewer, search, status, submissions, timing]);

  const stats = useMemo(() => ({
    total: submissions.length,
    pending: submissions.filter(item => item.status === 'submitted').length,
    approved: submissions.filter(item => item.status === 'approved').length,
    revisions: submissions.filter(item => item.status === 'rejected').length,
  }), [submissions]);

  const selectedHistory = selected ? history.filter(item => item.submission_id === selected.id) : [];
  const difficultyColor: Record<string, string> = {
    beginner: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
    intermediate: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
    advanced: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  };

  if (loading) {
    return <div className="p-6 lg:p-8 flex min-h-[400px] items-center justify-center"><Loader2 className="animate-spin text-primary-500" size={32} /></div>;
  }

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto animate-fade-in">
      <PageHeader title="Project Management" subtitle="Projects, submissions and review history" icon={FolderKanban} />

      {error && (
        <div className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
          {error} <button className="ml-2 font-semibold underline" onClick={() => void loadData()}>Retry</button>
        </div>
      )}

      <div className="mb-6 flex gap-2">
        <button className={tab === 'projects' ? 'btn-primary' : 'btn-secondary'} onClick={() => setTab('projects')}>Projects</button>
        <button className={tab === 'submissions' ? 'btn-primary' : 'btn-secondary'} onClick={() => setTab('submissions')}>Submissions ({submissions.length})</button>
      </div>

      {tab === 'submissions' && (
        <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            ['Total submissions', stats.total, 'text-slate-900 dark:text-white'],
            ['Awaiting review', stats.pending, 'text-blue-600'],
            ['Approved', stats.approved, 'text-emerald-600'],
            ['Revision requested', stats.revisions, 'text-amber-600'],
          ].map(([label, value, color]) => (
            <div key={String(label)} className="card p-4"><p className="text-xs text-slate-500">{label}</p><p className={`mt-1 text-2xl font-bold ${color}`}>{value}</p></div>
          ))}
        </div>
      )}

      <div className="mb-6 flex flex-wrap gap-3">
        <div className="relative min-w-[220px] flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input className="input pl-9" placeholder={tab === 'projects' ? 'Search projects...' : 'Search students, projects or reviewers...'} value={search} onChange={event => setSearch(event.target.value)} />
        </div>
        {tab === 'submissions' && <>
          <select className="input w-auto min-w-[160px]" value={status} onChange={event => setStatus(event.target.value as typeof status)}>
            <option value="all">All statuses</option>
            {(Object.keys(statusLabel) as SubmissionStatus[]).map(value => <option key={value} value={value}>{statusLabel[value]}</option>)}
          </select>
          <select className="input w-auto min-w-[180px]" value={projectId} onChange={event => setProjectId(event.target.value)}>
            <option value="all">All projects</option>
            {projects.map(project => <option key={project.id} value={project.id}>{project.title}</option>)}
          </select>
          <select className="input w-auto min-w-[170px]" value={reviewer} onChange={event => setReviewer(event.target.value)}>
            <option value="all">All reviewers</option>
            {reviewers.map(name => <option key={name} value={name}>{name}</option>)}
          </select>
          <select className="input w-auto min-w-[150px]" value={timing} onChange={event => setTiming(event.target.value as typeof timing)}>
            <option value="all">All timing</option><option value="on_time">On time</option><option value="overdue">Submitted late</option>
          </select>
        </>}
      </div>

      {tab === 'projects' ? (
        filteredProjects.length === 0 ? <EmptyState icon={FolderKanban} title="No projects found" description="Projects can be created by faculty through the course builder." /> :
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredProjects.map(project => (
            <div key={project.id} className="card p-5 flex flex-col">
              <div className="mb-3 flex items-start justify-between">
                <div className="min-w-0 flex-1"><h3 className="text-sm font-semibold text-slate-900 dark:text-white">{project.title}</h3>{project.course_title && <p className="mt-0.5 text-xs text-slate-400">{project.course_title}</p>}</div>
                <button onClick={() => void togglePublish(project)} className="flex-shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700" title={project.is_published ? 'Unpublish' : 'Publish'}>{project.is_published ? <EyeOff size={14} /> : <Eye size={14} />}</button>
              </div>
              {project.description && <p className="mb-3 line-clamp-2 text-xs text-slate-500 dark:text-slate-400">{project.description}</p>}
              <div className="mb-3 flex flex-wrap gap-1.5"><span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium capitalize ${difficultyColor[project.difficulty] ?? 'bg-slate-100 text-slate-500'}`}>{project.difficulty}</span><span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-400"><Tag size={10} /> {project.category}</span></div>
              <div className="mt-auto flex items-center justify-between border-t border-slate-100 pt-3 text-xs text-slate-400 dark:border-slate-800"><span className="flex items-center gap-1"><Clock size={11} /> {project.estimated_hours}h</span><span className="flex items-center gap-1"><Users size={11} /> {project.submission_count} submissions</span></div>
            </div>
          ))}
        </div>
      ) : (
        filteredSubmissions.length === 0 ? <EmptyState icon={Users} title="No submissions found" description="Try changing the current filters." /> :
        <div className="space-y-3">
          {filteredSubmissions.map(submission => (
            <button key={submission.id} onClick={() => setSelected(submission)} className="card w-full p-5 text-left transition hover:border-primary-400">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div><h3 className="font-semibold text-slate-900 dark:text-white">{submission.student_name}</h3><p className="text-xs text-slate-500">{submission.student_email}</p><p className="mt-2 text-sm font-medium text-slate-700 dark:text-slate-200">{submission.project_title}</p></div>
                <div className="text-right"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass[submission.status]}`}>{statusLabel[submission.status]}</span>{submission.score !== null && <p className="mt-2 text-sm font-bold text-emerald-600">{submission.score}/{submission.max_marks}</p>}</div>
              </div>
              <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs text-slate-500"><span>Submitted: {formatDate(submission.submitted_at)}</span><span>Reviewer: {submission.reviewer_name ?? 'Not assigned'}</span>{isOverdue(submission) && <span className="font-semibold text-red-600">Submitted late</span>}</div>
            </button>
          ))}
        </div>
      )}

      {selected && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/70 p-4" onMouseDown={event => { if (event.currentTarget === event.target) setSelected(null); }}>
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-slate-700 bg-white shadow-2xl dark:bg-slate-900">
            <div className="sticky top-0 flex items-center justify-between border-b border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900"><div><h2 className="text-lg font-bold text-slate-900 dark:text-white">{selected.student_name}</h2><p className="text-sm text-slate-500">{selected.project_title}</p></div><button className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800" onClick={() => setSelected(null)}><X size={20} /></button></div>
            <div className="space-y-6 p-5">
              <div className="flex flex-wrap items-center gap-3"><span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusClass[selected.status]}`}>{statusLabel[selected.status]}</span>{selected.score !== null && <strong className="text-emerald-600">Score: {selected.score}/{selected.max_marks}</strong>}</div>
              <div className="grid gap-3 sm:grid-cols-2">
                {selected.github_url && <a className="btn-secondary justify-center" href={selected.github_url} target="_blank" rel="noreferrer"><Github size={16} /> GitHub repository</a>}
                {selected.live_url && <a className="btn-secondary justify-center" href={selected.live_url} target="_blank" rel="noreferrer"><ExternalLink size={16} /> Live demo</a>}
                {selected.external_url && <a className="btn-secondary justify-center" href={selected.external_url} target="_blank" rel="noreferrer"><ExternalLink size={16} /> External evidence</a>}
              </div>
              {selected.description && <section><h3 className="mb-2 text-sm font-semibold text-slate-900 dark:text-white">Implementation notes</h3><p className="whitespace-pre-wrap rounded-xl bg-slate-50 p-4 text-sm text-slate-600 dark:bg-slate-800 dark:text-slate-300">{selected.description}</p></section>}
              {selected.feedback && <section><h3 className="mb-2 text-sm font-semibold text-slate-900 dark:text-white">Latest faculty feedback</h3><p className="whitespace-pre-wrap rounded-xl border border-primary-200 bg-primary-50 p-4 text-sm text-slate-700 dark:border-primary-900 dark:bg-primary-950/30 dark:text-slate-200">{selected.feedback}</p></section>}
              <section><h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white"><History size={16} /> Review history</h3>{selectedHistory.length === 0 ? <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500 dark:bg-slate-800">No review events recorded yet.</p> : <div className="space-y-3">{selectedHistory.map(item => <div key={item.id} className="rounded-xl border border-slate-200 p-4 dark:border-slate-700"><div className="flex flex-wrap justify-between gap-2"><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${statusClass[item.status]}`}>{statusLabel[item.status]}</span><span className="text-xs text-slate-500">{formatDate(item.reviewed_at)}</span></div><p className="mt-2 text-sm text-slate-700 dark:text-slate-200">{item.reviewer_name ?? 'Staff reviewer'}{item.score !== null ? ` · ${item.score}/${selected.max_marks}` : ''}</p>{item.feedback && <p className="mt-2 whitespace-pre-wrap text-sm text-slate-500">{item.feedback}</p>}</div>)}</div>}</section>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
