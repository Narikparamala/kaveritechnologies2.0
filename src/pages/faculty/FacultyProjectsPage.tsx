import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Clock,
  Edit2,
  ExternalLink,
  Eye,
  EyeOff,
  FileText,
  FolderKanban,
  Github,
  Layers3,
  MessageSquare,
  Play,
  Plus,
  Star,
  Tag,
  Trash2,
} from 'lucide-react';
import { PageHeader } from '../../components/common/PageHeader';
import { EmptyState } from '../../components/ui/EmptyState';
import { Modal } from '../../components/ui/Modal';
import { Badge } from '../../components/ui/Badge';
import { useToast } from '../../components/ui/Toast';
import { useAuth } from '../../contexts/AuthContext';
import {
  deleteProject,
  getFacultyCourses,
  getFacultyProjects,
  getProjectSubmissions,
  gradeProjectSubmission,
  updateProject,
} from '../../services/faculty';
import { createProjectEvidenceUrl } from '../../services/projectSubmissions';
import { formatDate, getDifficultyColor } from '../../lib/utils';
import type { Course, Profile, Project, ProjectSubmission, ProjectType } from '../../types/database';

const PROJECT_TYPE_LABELS: Record<ProjectType, string> = {
  python: 'Python',
  html_css_js: 'HTML / CSS / JavaScript',
  selenium_python: 'Selenium + Python',
  selenium_java: 'Selenium + Java',
  python_fullstack: 'Python Full Stack',
  java_fullstack: 'Java Full Stack',
  mern: 'MERN Full Stack',
  csharp_fullstack: 'C# Full Stack',
  genai: 'Generative AI',
  n8n: 'n8n Automation',
  custom: 'Custom / GitHub',
};

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : 'Something went wrong';
}

export default function FacultyProjectsPage() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { success, error: toastError } = useToast();
  const [courses, setCourses] = useState<Course[]>([]);
  const [projects, setProjects] = useState<(Project & { course: Course | null })[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);
  const [submissionsView, setSubmissionsView] = useState<Project | null>(null);
  const [submissions, setSubmissions] = useState<(ProjectSubmission & { student: Profile })[]>([]);
  const [submissionsLoading, setSubmissionsLoading] = useState(false);
  const [gradingModal, setGradingModal] = useState<ProjectSubmission | null>(null);
  const [gradeForm, setGradeForm] = useState({
    status: 'approved' as 'approved' | 'rejected' | 'reviewed',
    score: '',
    feedback: '',
  });
  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    try {
      const [facultyCourses, facultyProjects] = await Promise.all([
        getFacultyCourses(profile.id),
        getFacultyProjects(profile.id),
      ]);
      setCourses(facultyCourses);
      setProjects(facultyProjects);
    } catch (error) {
      toastError('Could not load projects', messageOf(error));
    } finally {
      setLoading(false);
    }
  }, [profile, toastError]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleTogglePublish = async (project: Project) => {
    try {
      await updateProject(project.id, { is_published: !project.is_published });
      success(project.is_published ? 'Project moved to draft' : 'Project published');
      await loadData();
    } catch (error) {
      toastError('Could not update project', messageOf(error));
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setSaving(true);
    try {
      await deleteProject(deleteTarget.id);
      success('Project deleted');
      setDeleteTarget(null);
      await loadData();
    } catch (error) {
      toastError('Could not delete project', messageOf(error));
    } finally {
      setSaving(false);
    }
  };

  const openSubmissions = async (project: Project) => {
    setSubmissionsView(project);
    setSubmissionsLoading(true);
    try {
      setSubmissions(await getProjectSubmissions(project.id));
    } catch (error) {
      toastError('Could not load submissions', messageOf(error));
      setSubmissions([]);
    } finally {
      setSubmissionsLoading(false);
    }
  };

  const handleGrade = async () => {
    if (!gradingModal || !submissionsView) return;
    const score = Number(gradeForm.score);
    if (!Number.isFinite(score) || score < 0 || score > submissionsView.max_marks) {
      toastError('Invalid score', `Enter a score from 0 to ${submissionsView.max_marks}.`);
      return;
    }
    setSaving(true);
    try {
      await gradeProjectSubmission(gradingModal.id, gradeForm.status, score, gradeForm.feedback);
      success('Submission reviewed');
      setGradingModal(null);
      if (submissionsView) await openSubmissions(submissionsView);
    } catch (error) {
      toastError('Could not save review', messageOf(error));
    } finally {
      setSaving(false);
    }
  };

  const handleOpenEvidence = async (storagePath: string) => {
    const evidenceWindow = window.open('about:blank', '_blank');
    if (evidenceWindow) evidenceWindow.opener = null;
    try {
      const url = await createProjectEvidenceUrl(storagePath);
      if (evidenceWindow) evidenceWindow.location.href = url;
      else window.open(url, '_blank', 'noopener,noreferrer');
    } catch (error) {
      evidenceWindow?.close();
      toastError('Could not open evidence', messageOf(error));
    }
  };

  if (loading) {
    return <div className="p-8 text-center text-slate-400">Loading projects...</div>;
  }

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto animate-fade-in">
      <PageHeader
        title="Projects"
        subtitle="Build industry-style projects, milestones and evaluation rubrics"
        icon={FolderKanban}
        action={
          <button
            onClick={() => navigate('/faculty/projects/new')}
            disabled={courses.length === 0}
            className="btn-primary flex items-center gap-2 disabled:opacity-50"
          >
            <Plus size={16} /> Create Project
          </button>
        }
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <div className="card p-4">
          <p className="text-xs uppercase tracking-wide text-slate-400">Total projects</p>
          <p className="mt-1 text-2xl font-bold text-slate-900 dark:text-white">{projects.length}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs uppercase tracking-wide text-slate-400">Published</p>
          <p className="mt-1 text-2xl font-bold text-emerald-600">{projects.filter(project => project.is_published).length}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs uppercase tracking-wide text-slate-400">Drafts</p>
          <p className="mt-1 text-2xl font-bold text-amber-500">{projects.filter(project => !project.is_published).length}</p>
        </div>
      </div>

      {courses.length === 0 ? (
        <EmptyState icon={FolderKanban} title="No courses assigned" description="Ask the super admin to assign you to a course first." />
      ) : projects.length === 0 ? (
        <EmptyState icon={FolderKanban} title="No projects yet" description="Create your first guided or portfolio project." />
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {projects.map(project => (
            <article key={project.id} className="card p-5 flex flex-col">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="font-bold text-slate-900 dark:text-white truncate">{project.title}</h3>
                  <p className="mt-1 text-xs text-primary-600 dark:text-primary-400">
                    {project.course?.title ?? 'Independent project'}
                  </p>
                </div>
                <span className={`badge text-xs flex-shrink-0 ${project.is_published ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'}`}>
                  {project.is_published ? 'Published' : 'Draft'}
                </span>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <span className={`badge capitalize text-xs ${getDifficultyColor(project.difficulty)}`}>{project.difficulty}</span>
                <span className="badge text-xs bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 flex items-center gap-1">
                  <Layers3 size={11} /> {PROJECT_TYPE_LABELS[project.project_type ?? 'python']}
                </span>
                <span className="badge text-xs bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 flex items-center gap-1">
                  <Clock size={11} /> {project.estimated_hours}h
                </span>
              </div>

              <p className="my-4 text-sm text-slate-500 dark:text-slate-400 line-clamp-3 flex-1">
                {project.description || 'No project description yet.'}
              </p>

              <div className="mb-4 flex flex-wrap gap-1.5">
                {(project.tech_tags ?? []).slice(0, 5).map(tag => (
                  <span key={tag} className="badge text-xs bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-400 flex items-center gap-1">
                    <Tag size={9} /> {tag}
                  </span>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-2 border-t border-slate-100 pt-4 dark:border-slate-700">
                <button onClick={() => navigate(`/faculty/projects/${project.id}/builder`)} className="btn-primary text-xs flex-1 flex items-center justify-center gap-1.5">
                  <Edit2 size={13} /> Build
                </button>
                <button
                  onClick={() => navigate(`/faculty/projects/${project.id}/workspace`)}
                  className="btn-secondary text-xs flex items-center justify-center gap-1.5"
                >
                  <Play size={13} /> Preview Workspace
                </button>
                <button onClick={() => void openSubmissions(project)} className="btn-secondary text-xs flex items-center justify-center gap-1.5">
                  <MessageSquare size={13} /> Review
                </button>
                <div className="flex items-center justify-end gap-1 rounded-xl border border-slate-200 px-1 dark:border-slate-700">
                  <button onClick={() => void handleTogglePublish(project)} title={project.is_published ? 'Unpublish' : 'Publish'} className="p-2 text-slate-400 hover:text-primary-600 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700">{project.is_published ? <EyeOff size={15} /> : <Eye size={15} />}</button>
                  <span className="h-5 w-px bg-slate-200 dark:bg-slate-700" />
                  <button onClick={() => setDeleteTarget(project)} title="Delete" className="p-2 text-red-400 hover:text-red-600 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20"><Trash2 size={15} /></button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      <Modal open={!!submissionsView} onClose={() => setSubmissionsView(null)} title={`Submissions: ${submissionsView?.title}`} size="xl">
        {submissionsLoading ? (
          <p className="py-8 text-center text-sm text-slate-400">Loading submissions...</p>
        ) : submissions.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-400">No submissions yet.</p>
        ) : (
          <div className="space-y-3 max-h-[520px] overflow-y-auto pr-1">
            {submissions.map(submission => (
              <div key={submission.id} className="rounded-xl border border-slate-100 p-4 dark:border-slate-700">
                <div className="mb-2 flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium text-slate-900 dark:text-white">{submission.student?.full_name || 'Student'}</p>
                    <p className="text-xs text-slate-400">{submission.student?.email}</p>
                  </div>
                  <Badge variant={submission.status === 'approved' ? 'success' : submission.status === 'rejected' ? 'error' : 'info'} className="text-xs">
                    {submission.status}
                  </Badge>
                </div>
                {submission.description && <p className="mb-2 text-sm text-slate-600 dark:text-slate-300">{submission.description}</p>}
                <div className="mb-3 flex flex-wrap items-center gap-3 text-xs">
                  {submission.github_url && <a href={submission.github_url} target="_blank" rel="noopener noreferrer" className="text-primary-600 hover:underline flex items-center gap-1"><Github size={12} /> GitHub repository</a>}
                  {submission.live_url && <a href={submission.live_url} target="_blank" rel="noopener noreferrer" className="text-primary-600 hover:underline flex items-center gap-1"><ExternalLink size={12} /> Live demo</a>}
                  {submission.external_url && <a href={submission.external_url} target="_blank" rel="noopener noreferrer" className="text-primary-600 hover:underline flex items-center gap-1"><ExternalLink size={12} /> External project</a>}
                  {submission.submitted_at && <span className="text-slate-400">Submitted {formatDate(submission.submitted_at)}</span>}
                </div>
                {!!submission.files?.length && (
                  <div className="mb-3 rounded-lg bg-slate-50 p-3 dark:bg-slate-900/40">
                    <p className="mb-2 text-xs font-medium text-slate-700 dark:text-slate-200">Private evidence files</p>
                    <div className="flex flex-wrap gap-2">
                      {submission.files.map(file => (
                        <button key={file.id} type="button" onClick={() => void handleOpenEvidence(file.storage_path)} className="btn-secondary text-xs flex items-center gap-1.5">
                          <FileText size={12} /> {file.file_name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {submission.score !== null && (
                  <p className="mb-3 text-sm font-semibold text-emerald-600">Score: {submission.score}/{submissionsView?.max_marks}</p>
                )}
                {submission.feedback && <p className="mb-3 rounded-lg bg-slate-50 p-2 text-xs italic text-slate-500 dark:bg-slate-900/40">Feedback: {submission.feedback}</p>}
                <button
                  onClick={() => {
                    setGradingModal(submission);
                    setGradeForm({
                      status: submission.status === 'approved' || submission.status === 'rejected' || submission.status === 'reviewed'
                        ? submission.status
                        : 'approved',
                      score: String(submission.score ?? submissionsView?.max_marks ?? 0),
                      feedback: submission.feedback ?? '',
                    });
                  }}
                  className="btn-primary text-xs flex items-center gap-1"
                >
                  <Star size={12} /> {submission.status === 'submitted' ? 'Review' : 'Update review'}
                </button>
              </div>
            ))}
          </div>
        )}
      </Modal>

      <Modal open={!!gradingModal} onClose={() => setGradingModal(null)} title="Review Project Submission">
        <div className="space-y-4">
          <div>
            <label className="label">Decision</label>
            <select className="input" value={gradeForm.status} onChange={event => setGradeForm(form => ({ ...form, status: event.target.value as typeof form.status }))}>
              <option value="approved">Approve</option>
              <option value="reviewed">Needs changes / reviewed</option>
              <option value="rejected">Reject</option>
            </select>
          </div>
          <div>
            <label className="label">Score (maximum {submissionsView?.max_marks ?? 0})</label>
            <input
              type="number"
              min="0"
              max={submissionsView?.max_marks ?? 0}
              step="1"
              className="input"
              value={gradeForm.score}
              onChange={event => setGradeForm(form => ({ ...form, score: event.target.value }))}
            />
          </div>
          <div>
            <label className="label">Faculty feedback</label>
            <textarea className="input min-h-[120px] resize-none" placeholder="Explain strengths and what the student should improve..." value={gradeForm.feedback} onChange={event => setGradeForm(form => ({ ...form, feedback: event.target.value }))} />
          </div>
          <div className="flex justify-end gap-3">
            <button onClick={() => setGradingModal(null)} className="btn-secondary">Cancel</button>
            <button onClick={() => void handleGrade()} disabled={saving} className="btn-primary flex items-center gap-2 disabled:opacity-50">
              <Star size={14} /> Save review
            </button>
          </div>
        </div>
      </Modal>

      <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Delete project" size="sm">
        <p className="mb-4 text-sm text-slate-600 dark:text-slate-300">
          Delete <strong>{deleteTarget?.title}</strong>? Its milestones, rubric, starter files and submissions will also be deleted.
        </p>
        <div className="flex justify-end gap-3">
          <button onClick={() => setDeleteTarget(null)} className="btn-secondary">Cancel</button>
          <button onClick={() => void handleDelete()} disabled={saving} className="btn-primary bg-red-600 hover:bg-red-700 flex items-center gap-2 disabled:opacity-50">
            <Trash2 size={14} /> Delete
          </button>
        </div>
      </Modal>
    </div>
  );
}
