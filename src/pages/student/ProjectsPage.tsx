import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  AlertCircle,
  ArrowLeft,
  Award,
  CheckCircle,
  Clock,
  ExternalLink,
  FileText,
  FolderKanban,
  Github,
  Save,
  Tag,
  Trash2,
  UploadCloud,
} from 'lucide-react';
import { PageHeader } from '../../components/common/PageHeader';
import { Badge } from '../../components/ui/Badge';
import { EmptyState } from '../../components/ui/EmptyState';
import { Modal } from '../../components/ui/Modal';
import { SkeletonCard } from '../../components/ui/LoadingSpinner';
import { useToast } from '../../components/ui/Toast';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { formatDate, getDifficultyColor } from '../../lib/utils';
import {
  createProjectEvidenceUrl,
  deleteProjectSubmissionFile,
  getProjectGuidance,
  getProjectSubmissionFiles,
  saveProjectSubmission,
  uploadProjectSubmissionFile,
} from '../../services/projectSubmissions';
import type {
  Project,
  ProjectMilestone,
  ProjectRubricItem,
  ProjectSubmission,
  ProjectSubmissionFile,
} from '../../types/database';

const emptyForm = { githubUrl: '', liveUrl: '', externalUrl: '', description: '' };

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : 'Something went wrong';
}

function statusVariant(status: ProjectSubmission['status']) {
  if (status === 'approved') return 'success' as const;
  if (status === 'rejected') return 'error' as const;
  if (status === 'draft') return 'warning' as const;
  return 'info' as const;
}

function humanFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ProjectsPage() {
  const { profile } = useAuth();
  const { success, error: toastError } = useToast();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const practiceMode = searchParams.get('practice') === '1';
  const requestedProjectId = searchParams.get('projectId');
  const returnTo = searchParams.get('returnTo') ?? '/faculty/projects';
  const [projects, setProjects] = useState<Project[]>([]);
  const [submissions, setSubmissions] = useState<Map<string, ProjectSubmission>>(new Map());
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [submitModal, setSubmitModal] = useState<Project | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [milestones, setMilestones] = useState<ProjectMilestone[]>([]);
  const [rubric, setRubric] = useState<ProjectRubricItem[]>([]);
  const [evidenceFiles, setEvidenceFiles] = useState<ProjectSubmissionFile[]>([]);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    const load = async () => {
      if (!profile) { setLoading(false); return; }

      if (practiceMode && requestedProjectId) {
        const { data, error } = await supabase
          .from('projects')
          .select('*')
          .eq('id', requestedProjectId)
          .eq('is_published', true)
          .maybeSingle();
        if (error) {
          console.error(error);
          setProjects([]);
          setLoading(false);
          return;
        }
        setProjects(data ? [data as Project] : []);
        setSubmissions(new Map());
        setLoading(false);
        return;
      }

      const { data: enrollmentData } = await supabase
        .from('course_enrollments')
        .select('course_id')
        .eq('student_id', profile.id)
        .or('access_status.eq.active,access_status.is.null');
      const courseIds = (enrollmentData ?? []).map((enrollment: { course_id: string }) => enrollment.course_id);

      let projectData: Project[] = [];
      if (courseIds.length) {
        const result = await supabase
          .from('projects')
          .select('*')
          .eq('is_published', true)
          .in('course_id', courseIds)
          .order('difficulty');
        if (result.error) toastError('Could not load projects', result.error.message);
        projectData = (result.data ?? []) as Project[];
      }
      setProjects(projectData);

      const { data: submissionData, error: submissionError } = await supabase
        .from('project_submissions')
        .select('*')
        .eq('student_id', profile.id);
      if (submissionError) toastError('Could not load submissions', submissionError.message);
      setSubmissions(new Map((submissionData ?? []).map((submission: ProjectSubmission) => [submission.project_id, submission])));
      setLoading(false);
    };
    void load();
  }, [profile, practiceMode, requestedProjectId, toastError]);

  const openProject = async (project: Project) => {
    setSubmitModal(project);
    const current = submissions.get(project.id);
    setForm(current ? {
      githubUrl: current.github_url ?? '',
      liveUrl: current.live_url ?? '',
      externalUrl: current.external_url ?? '',
      description: current.description ?? '',
    } : emptyForm);
    setEvidenceFiles([]);
    setMilestones([]);
    setRubric([]);

    try {
      const [guidance, files] = await Promise.all([
        getProjectGuidance(project.id),
        current?.id ? getProjectSubmissionFiles(current.id) : Promise.resolve([]),
      ]);
      setMilestones(guidance.milestones);
      setRubric(guidance.rubric);
      setEvidenceFiles(files);
    } catch (error) {
      toastError('Could not load project details', messageOf(error));
    }
  };

  const persist = async (submit: boolean) => {
    if (!submitModal || !profile) return null;
    if (practiceMode) {
      success('Practice complete. No project submission, grade, or progress was recorded.');
      setSubmitModal(null);
      return null;
    }

    setSaving(true);
    try {
      const submission = await saveProjectSubmission({
        projectId: submitModal.id,
        githubUrl: form.githubUrl,
        liveUrl: form.liveUrl,
        externalUrl: form.externalUrl,
        description: form.description,
        submit,
      });
      setSubmissions(previous => new Map(previous).set(submitModal.id, submission));
      success(submit ? 'Project submitted for faculty review.' : 'Project draft saved.');
      if (submit) setSubmitModal(null);
      return submission;
    } catch (error) {
      toastError(submit ? 'Could not submit project' : 'Could not save draft', messageOf(error));
      return null;
    } finally {
      setSaving(false);
    }
  };

  const handleUpload = async (file: File | undefined) => {
    if (!file || !submitModal || practiceMode) return;
    setUploading(true);
    try {
      let submission = submissions.get(submitModal.id);
      if (!submission || submission.status !== 'draft') {
        submission = await persist(false) ?? undefined;
      }
      if (!submission) return;
      const uploaded = await uploadProjectSubmissionFile(submission, file);
      setEvidenceFiles(previous => [...previous, uploaded]);
      success('Evidence file uploaded.');
    } catch (error) {
      toastError('Could not upload evidence', messageOf(error));
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteFile = async (file: ProjectSubmissionFile) => {
    try {
      await deleteProjectSubmissionFile(file);
      setEvidenceFiles(previous => previous.filter(item => item.id !== file.id));
      success('Evidence file removed.');
    } catch (error) {
      toastError('Could not remove evidence', messageOf(error));
    }
  };

  const handleOpenFile = async (file: ProjectSubmissionFile) => {
    const evidenceWindow = window.open('about:blank', '_blank');
    if (evidenceWindow) evidenceWindow.opener = null;
    try {
      const url = await createProjectEvidenceUrl(file.storage_path);
      if (evidenceWindow) evidenceWindow.location.href = url;
      else window.open(url, '_blank', 'noopener,noreferrer');
    } catch (error) {
      evidenceWindow?.close();
      toastError('Could not open evidence', messageOf(error));
    }
  };

  const difficulties = ['all', 'beginner', 'intermediate', 'advanced'];
  const filtered = filter === 'all' ? projects : projects.filter(project => project.difficulty === filter);
  const selectedSubmission = submitModal ? submissions.get(submitModal.id) : undefined;
  const submissionLocked = selectedSubmission?.status === 'submitted' || selectedSubmission?.status === 'approved';
  const showGithub = !!submitModal && (submitModal.repository_required || submitModal.submission_mode === 'github' || submitModal.submission_mode === 'github_and_live');
  const showLive = !!submitModal && (submitModal.live_demo_required || submitModal.submission_mode === 'github_and_live');
  const showExternal = submitModal?.submission_mode === 'external_url';

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto animate-fade-in">
      {practiceMode && (
        <button onClick={() => navigate(returnTo)} className="mb-4 inline-flex items-center gap-2 text-sm font-medium text-primary-600 hover:text-primary-700">
          <ArrowLeft size={14} /> Back to Faculty Projects
        </button>
      )}
      {practiceMode && (
        <div className="mb-5 rounded-xl border border-primary-200 bg-primary-50 p-4 text-sm text-primary-800 dark:border-primary-800 dark:bg-primary-950/30 dark:text-primary-200">
          <strong>Faculty Practice Mode</strong>
          <p className="mt-1">Work through this project exactly as a student would. Completing practice will not create a submission, grade, or progress record.</p>
        </div>
      )}
      <PageHeader title="Projects" subtitle={practiceMode ? 'Try this project exactly as a student would' : 'Build portfolio-ready work and submit verifiable evidence'} icon={FolderKanban} />

      <div className="flex flex-wrap gap-2 mb-6">
        {difficulties.map(difficulty => (
          <button key={difficulty} onClick={() => setFilter(difficulty)}
            className={`px-4 py-1.5 rounded-xl text-sm font-medium transition-colors capitalize ${filter === difficulty ? 'bg-primary-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'}`}>
            {difficulty === 'all' ? 'All Projects' : difficulty}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {[1, 2, 3, 4, 5, 6].map(index => <SkeletonCard key={index} />)}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={FolderKanban} title={practiceMode ? 'This project is not available for practice' : 'No projects found'} />
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {filtered.map(project => {
            const submission = submissions.get(project.id);
            return (
              <div key={project.id} className="card-hover p-5 flex flex-col">
                <div className="flex items-start justify-between gap-2 mb-3">
                  <h3 className="font-bold text-slate-900 dark:text-white">{project.title}</h3>
                  {submission && <Badge variant={statusVariant(submission.status)} className="text-xs flex-shrink-0 capitalize">{submission.status}</Badge>}
                </div>
                <div className="flex flex-wrap gap-2 mb-3">
                  <span className={`badge capitalize text-xs ${getDifficultyColor(project.difficulty)}`}>{project.difficulty}</span>
                  <span className="badge text-xs bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 flex items-center gap-1">
                    <Clock size={10} /> {project.estimated_hours}h
                  </span>
                  <span className="badge text-xs bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 flex items-center gap-1">
                    <Award size={10} /> {project.max_marks} marks
                  </span>
                </div>
                <p className="text-sm text-slate-500 dark:text-slate-400 mb-4 flex-1 line-clamp-3">{project.description}</p>
                <div className="flex flex-wrap gap-1.5 mb-4">
                  {(project.tech_tags ?? []).slice(0, 4).map(tag => (
                    <span key={tag} className="badge text-xs bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-400 flex items-center gap-1">
                      <Tag size={9} /> {tag}
                    </span>
                  ))}
                </div>
                {submission?.score !== null && submission?.score !== undefined && (
                  <p className="mb-3 text-sm font-semibold text-emerald-600">Score: {submission.score}/{project.max_marks}</p>
                )}
                <button onClick={() => void openProject(project)} className="btn-primary text-sm py-2 w-full">
                  {practiceMode ? 'Try Project' : submission?.status === 'submitted' || submission?.status === 'approved' ? 'View Submission' : submission ? 'View / Update Submission' : 'Start Project Submission'}
                </button>
              </div>
            );
          })}
        </div>
      )}

      <Modal open={!!submitModal} onClose={() => setSubmitModal(null)} title={practiceMode ? `Practice: ${submitModal?.title}` : `Project: ${submitModal?.title}`} size="xl">
        <div className="max-h-[72vh] space-y-5 overflow-y-auto pr-1">
          {submitModal && (
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-xl bg-slate-50 p-4 text-sm dark:bg-slate-900/40">
                <h3 className="font-semibold text-slate-900 dark:text-white">Project brief</h3>
                <p className="mt-2 whitespace-pre-wrap text-slate-600 dark:text-slate-300">{submitModal.description || 'No description provided.'}</p>
                {submitModal.objectives && <><h4 className="mt-4 font-medium">Objectives</h4><p className="mt-1 whitespace-pre-wrap text-slate-500">{submitModal.objectives}</p></>}
                {submitModal.requirements && <><h4 className="mt-4 font-medium">Requirements</h4><p className="mt-1 whitespace-pre-wrap text-slate-500">{submitModal.requirements}</p></>}
                {submitModal.instructions && <><h4 className="mt-4 font-medium">Instructions</h4><p className="mt-1 whitespace-pre-wrap text-slate-500">{submitModal.instructions}</p></>}
              </div>
              <div className="space-y-4">
                <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
                  <h3 className="font-semibold text-slate-900 dark:text-white">Milestones</h3>
                  {milestones.length ? milestones.map((milestone, index) => (
                    <div key={milestone.id} className="mt-3 text-sm">
                      <p className="font-medium">{index + 1}. {milestone.title} <span className="text-xs text-slate-400">({milestone.max_marks} marks)</span></p>
                      {milestone.description && <p className="mt-1 text-slate-500">{milestone.description}</p>}
                    </div>
                  )) : <p className="mt-2 text-sm text-slate-400">No milestones configured.</p>}
                </div>
                <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
                  <h3 className="font-semibold text-slate-900 dark:text-white">Evaluation rubric</h3>
                  {rubric.length ? rubric.map(item => (
                    <div key={item.id} className="mt-3 flex justify-between gap-3 text-sm">
                      <span>{item.title}</span><span className="font-medium text-primary-600">{item.max_marks}</span>
                    </div>
                  )) : <p className="mt-2 text-sm text-slate-400">Faculty will evaluate the complete project.</p>}
                </div>
              </div>
            </div>
          )}

          {selectedSubmission?.feedback && (
            <div className={`rounded-xl border p-4 ${selectedSubmission.status === 'rejected' ? 'border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/20' : 'border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950/20'}`}>
              <div className="flex items-center gap-2 font-semibold"><AlertCircle size={16} /> Faculty feedback</div>
              <p className="mt-2 whitespace-pre-wrap text-sm">{selectedSubmission.feedback}</p>
              {selectedSubmission.score !== null && <p className="mt-2 text-sm font-semibold">Score: {selectedSubmission.score}/{submitModal?.max_marks}</p>}
            </div>
          )}

          {selectedSubmission?.status === 'submitted' && (
            <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800 dark:border-blue-900 dark:bg-blue-950/20 dark:text-blue-200">
              <strong>Awaiting faculty review</strong>
              <p className="mt-1">Your submitted evidence is locked while faculty reviews it. You can update it after faculty requests changes.</p>
            </div>
          )}

          {selectedSubmission?.status === 'approved' && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/20 dark:text-emerald-200">
              <strong>Project approved</strong>
              <p className="mt-1">This submission is now read-only and can be used as verified portfolio evidence.</p>
            </div>
          )}

          {!practiceMode && (
            <div className="space-y-4 rounded-xl border border-slate-200 p-4 dark:border-slate-700">
              <h3 className="font-semibold text-slate-900 dark:text-white">Submission evidence</h3>
              {showGithub && (
                <div>
                  <label className="label">GitHub Repository URL {submitModal?.repository_required || submitModal?.submission_mode !== 'external_url' ? '*' : ''}</label>
                  <div className="relative"><Github size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input type="url" disabled={submissionLocked} className="input pl-9 disabled:cursor-not-allowed disabled:opacity-60" placeholder="https://github.com/..." value={form.githubUrl} onChange={event => setForm(current => ({ ...current, githubUrl: event.target.value }))} />
                  </div>
                </div>
              )}
              {showLive && (
                <div>
                  <label className="label">Live Demo URL *</label>
                  <div className="relative"><ExternalLink size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input type="url" disabled={submissionLocked} className="input pl-9 disabled:cursor-not-allowed disabled:opacity-60" placeholder="https://your-project.vercel.app" value={form.liveUrl} onChange={event => setForm(current => ({ ...current, liveUrl: event.target.value }))} />
                  </div>
                </div>
              )}
              {showExternal && (
                <div>
                  <label className="label">External Project URL *</label>
                  <div className="relative"><ExternalLink size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input type="url" disabled={submissionLocked} className="input pl-9 disabled:cursor-not-allowed disabled:opacity-60" placeholder="https://..." value={form.externalUrl} onChange={event => setForm(current => ({ ...current, externalUrl: event.target.value }))} />
                  </div>
                </div>
              )}
              <div>
                <label className="label">Implementation notes</label>
                <textarea disabled={submissionLocked} className="input min-h-[100px] resize-none disabled:cursor-not-allowed disabled:opacity-60" placeholder="Explain what you built, important decisions, and how to test it..." value={form.description} onChange={event => setForm(current => ({ ...current, description: event.target.value }))} />
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <label className="label mb-0">Evidence files {submitModal?.submission_mode === 'file_upload' ? '*' : '(optional)'}</label>
                  <label className={`btn-secondary cursor-pointer text-xs flex items-center gap-2 ${uploading || submissionLocked ? 'pointer-events-none opacity-50' : ''}`}>
                    <UploadCloud size={14} /> {uploading ? 'Uploading...' : 'Upload file'}
                    <input type="file" className="hidden" accept=".pdf,.zip,.png,.jpg,.jpeg,.webp,.txt,.csv,.json" onChange={event => { void handleUpload(event.target.files?.[0]); event.currentTarget.value = ''; }} />
                  </label>
                </div>
                <p className="mb-3 text-xs text-slate-400">PDF, ZIP, images, text, CSV or JSON. Maximum 20 MB per file.</p>
                {evidenceFiles.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-slate-300 p-4 text-center text-sm text-slate-400 dark:border-slate-600">No evidence files uploaded.</div>
                ) : evidenceFiles.map(file => (
                  <div key={file.id} className="mb-2 flex items-center justify-between gap-3 rounded-lg bg-slate-50 p-3 dark:bg-slate-900/40">
                    <button type="button" onClick={() => void handleOpenFile(file)} className="min-w-0 text-left text-sm text-primary-600 hover:underline flex items-center gap-2">
                      <FileText size={15} className="shrink-0" /><span className="truncate">{file.file_name}</span><span className="shrink-0 text-xs text-slate-400">{humanFileSize(file.file_size)}</span>
                    </button>
                    {selectedSubmission?.status !== 'approved' && selectedSubmission?.status !== 'submitted' && (
                      <button type="button" onClick={() => void handleDeleteFile(file)} className="text-red-400 hover:text-red-600"><Trash2 size={15} /></button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex flex-wrap justify-end gap-3 border-t border-slate-100 pt-4 dark:border-slate-700">
            <button onClick={() => setSubmitModal(null)} className="btn-secondary">Cancel</button>
            {!practiceMode && !submissionLocked && (
              <button onClick={() => void persist(false)} disabled={saving || uploading} className="btn-secondary flex items-center gap-2 disabled:opacity-50"><Save size={14} /> Save Draft</button>
            )}
            {practiceMode ? (
              <button onClick={() => void persist(true)} className="btn-primary flex items-center gap-2"><CheckCircle size={14} /> Complete Practice</button>
            ) : !submissionLocked && (
              <button onClick={() => void persist(true)} disabled={saving || uploading} className="btn-primary flex items-center gap-2 disabled:opacity-50"><CheckCircle size={14} /> Submit for Review</button>
            )}
          </div>
          {selectedSubmission?.submitted_at && <p className="text-right text-xs text-slate-400">Last submitted {formatDate(selectedSubmission.submitted_at)}</p>}
        </div>
      </Modal>
    </div>
  );
}
