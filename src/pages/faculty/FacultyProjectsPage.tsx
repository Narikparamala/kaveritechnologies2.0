import { useEffect, useState, useCallback } from 'react';
import { FolderKanban, Plus, Edit2, Trash2, Eye, EyeOff, Clock, Tag, Star, Github, ExternalLink, MessageSquare } from 'lucide-react';
import { PageHeader } from '../../components/common/PageHeader';
import { EmptyState } from '../../components/ui/EmptyState';
import { Modal } from '../../components/ui/Modal';
import { Badge } from '../../components/ui/Badge';
import { useToast } from '../../components/ui/Toast';
import { useAuth } from '../../contexts/AuthContext';
import { getFacultyCourses, getFacultyProjects, createProject, updateProject, deleteProject, getProjectSubmissions, gradeProjectSubmission } from '../../services/faculty';
import { getDifficultyColor, formatDate } from '../../lib/utils';
import type { Course, Project, ProjectSubmission, Profile } from '../../types/database';

export default function FacultyProjectsPage() {
  const { profile } = useAuth();
  const { success, error: toastError } = useToast();
  const [courses, setCourses] = useState<Course[]>([]);
  const [projects, setProjects] = useState<(Project & { course: Course | null })[]>([]);
  const [loading, setLoading] = useState(true);
  const [editModal, setEditModal] = useState<{ mode: 'create' | 'edit'; project?: Project } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);
  const [submissionsView, setSubmissionsView] = useState<Project | null>(null);
  const [submissions, setSubmissions] = useState<(ProjectSubmission & { student: Profile })[]>([]);
  const [gradingModal, setGradingModal] = useState<ProjectSubmission | null>(null);
  const [gradeForm, setGradeForm] = useState({ status: 'approved' as 'approved' | 'rejected' | 'reviewed', feedback: '' });
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', difficulty: 'beginner', category: 'python', estimated_hours: 5, tech_tags: '', requirements: '', starter_code: '', course_id: '', is_published: false });

  const loadData = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    const [cs, ps] = await Promise.all([getFacultyCourses(profile.id), getFacultyProjects(profile.id)]);
    setCourses(cs);
    setProjects(ps);
    if (cs.length > 0 && !form.course_id) setForm(f => ({ ...f, course_id: cs[0].id }));
    setLoading(false);
  }, [profile]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleSave = async () => {
    if (!editModal || !profile) return;
    setSaving(true);
    try {
      const techTags = form.tech_tags ? form.tech_tags.split(',').map(t => t.trim()).filter(Boolean) : [];
      if (editModal.mode === 'create') {
        await createProject({
          title: form.title,
          description: form.description,
          difficulty: form.difficulty,
          category: form.category,
          estimated_hours: Number(form.estimated_hours) || 5,
          tech_tags: techTags,
          requirements: form.requirements,
          starter_code: form.starter_code,
          course_id: form.course_id || null,
          is_published: form.is_published,
          created_by: profile.id,
        });
        success('Project created');
      } else if (editModal.project) {
        await updateProject(editModal.project.id, {
          title: form.title,
          description: form.description,
          difficulty: form.difficulty as any,
          category: form.category,
          estimated_hours: Number(form.estimated_hours) || 5,
          tech_tags: techTags,
          requirements: form.requirements,
          starter_code: form.starter_code,
          course_id: form.course_id || null,
          is_published: form.is_published,
        });
        success('Project updated');
      }
      setEditModal(null);
      await loadData();
    } catch (e: any) { toastError('Error', e.message); }
    setSaving(false);
  };

  const handleTogglePublish = async (p: Project) => {
    try {
      await updateProject(p.id, { is_published: !p.is_published });
      success(p.is_published ? 'Unpublished' : 'Published');
      await loadData();
    } catch (e: any) { toastError('Error', e.message); }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setSaving(true);
    try {
      await deleteProject(deleteTarget.id);
      success('Project deleted');
      setDeleteTarget(null);
      await loadData();
    } catch (e: any) { toastError('Error', e.message); }
    setSaving(false);
  };

  const openSubmissions = async (p: Project) => {
    setSubmissionsView(p);
    const subs = await getProjectSubmissions(p.id);
    setSubmissions(subs);
  };

  const handleGrade = async () => {
    if (!gradingModal) return;
    setSaving(true);
    try {
      await gradeProjectSubmission(gradingModal.id, gradeForm.status, gradeForm.feedback);
      success('Submission reviewed');
      setGradingModal(null);
      if (submissionsView) await openSubmissions(submissionsView);
    } catch (e: any) { toastError('Error', e.message); }
    setSaving(false);
  };

  if (loading) return <div className="p-8 text-center text-slate-400">Loading...</div>;

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto animate-fade-in">
      <PageHeader title="Projects" subtitle="Create and manage Python projects for your courses" icon={FolderKanban} action={
        <button onClick={() => { setForm({ title: '', description: '', difficulty: 'beginner', category: 'python', estimated_hours: 5, tech_tags: '', requirements: '', starter_code: '', course_id: courses[0]?.id ?? '', is_published: false }); setEditModal({ mode: 'create' }); }} disabled={courses.length === 0} className="btn-primary flex items-center gap-2 disabled:opacity-50">
          <Plus size={16} /> Create Project
        </button>
      } />

      {courses.length === 0 ? (
        <EmptyState icon={FolderKanban} title="No courses assigned" description="You need to be assigned to courses first." />
      ) : projects.length === 0 ? (
        <EmptyState icon={FolderKanban} title="No projects yet" description="Create your first project to get started." />
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {projects.map(p => (
            <div key={p.id} className="card p-5 flex flex-col">
              <div className="flex items-start justify-between gap-2 mb-3">
                <h3 className="font-bold text-slate-900 dark:text-white">{p.title}</h3>
                <span className={`badge text-xs flex-shrink-0 ${p.is_published ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-slate-100 text-slate-400'}`}>
                  {p.is_published ? 'Published' : 'Draft'}
                </span>
              </div>
              <div className="flex gap-2 mb-3">
                <span className={`badge capitalize text-xs ${getDifficultyColor(p.difficulty)}`}>{p.difficulty}</span>
                <span className="badge text-xs bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 flex items-center gap-1">
                  <Clock size={10} /> {p.estimated_hours}h
                </span>
                {p.course && <span className="badge text-xs bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-400">{p.course.title}</span>}
              </div>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-3 line-clamp-2 flex-1">{p.description}</p>
              <div className="flex flex-wrap gap-1.5 mb-3">
                {(p.tech_tags ?? []).slice(0, 4).map(tag => (
                  <span key={tag} className="badge text-xs bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-400 flex items-center gap-1">
                    <Tag size={9} /> {tag}
                  </span>
                ))}
              </div>
              <div className="flex items-center gap-2 pt-3 border-t border-slate-50 dark:border-slate-700/50">
                <button onClick={() => openSubmissions(p)} className="btn-secondary text-xs flex-1 flex items-center justify-center gap-1">
                  <MessageSquare size={12} /> Submissions
                </button>
                <button onClick={() => handleTogglePublish(p)} className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700">
                  {p.is_published ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
                <button onClick={() => { setForm({ title: p.title, description: p.description ?? '', difficulty: p.difficulty, category: p.category, estimated_hours: p.estimated_hours, tech_tags: (p.tech_tags ?? []).join(', '), requirements: p.requirements ?? '', starter_code: p.starter_code ?? '', course_id: p.course_id ?? '', is_published: p.is_published }); setEditModal({ mode: 'edit', project: p }); }} className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700">
                  <Edit2 size={14} />
                </button>
                <button onClick={() => setDeleteTarget(p)} className="p-2 text-red-400 hover:text-red-600 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Edit/Create Modal */}
      <Modal open={!!editModal} onClose={() => setEditModal(null)} title={editModal?.mode === 'edit' ? 'Edit Project' : 'Create Project'} size="lg">
        <div className="space-y-4">
          <div>
            <label className="label">Title</label>
            <input className="input" placeholder="Project title..." value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
          </div>
          <div>
            <label className="label">Description</label>
            <textarea className="input min-h-[80px] resize-none" placeholder="Project description..." value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
          </div>
          <div>
            <label className="label">Requirements / Rubric</label>
            <textarea className="input min-h-[100px] resize-none" placeholder="Project requirements and evaluation criteria..." value={form.requirements} onChange={e => setForm(f => ({ ...f, requirements: e.target.value }))} />
          </div>
          <div>
            <label className="label">Starter Code (optional)</label>
            <textarea className="input min-h-[80px] resize-none font-mono text-sm bg-slate-900 text-slate-100" placeholder="# Starter code..." value={form.starter_code} onChange={e => setForm(f => ({ ...f, starter_code: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Course</label>
              <select className="input" value={form.course_id} onChange={e => setForm(f => ({ ...f, course_id: e.target.value }))}>
                <option value="">No specific course</option>
                {courses.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Difficulty</label>
              <select className="input" value={form.difficulty} onChange={e => setForm(f => ({ ...f, difficulty: e.target.value }))}>
                <option value="beginner">Beginner</option>
                <option value="intermediate">Intermediate</option>
                <option value="advanced">Advanced</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Estimated Hours</label>
              <input type="number" className="input" value={form.estimated_hours} onChange={e => setForm(f => ({ ...f, estimated_hours: Number(e.target.value) }))} />
            </div>
            <div>
              <label className="label">Tech Tags (comma-separated)</label>
              <input className="input" placeholder="python, flask, api" value={form.tech_tags} onChange={e => setForm(f => ({ ...f, tech_tags: e.target.value }))} />
            </div>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" className="w-4 h-4 rounded" checked={form.is_published} onChange={e => setForm(f => ({ ...f, is_published: e.target.checked }))} />
            <span className="text-sm text-slate-700 dark:text-slate-300">Publish immediately</span>
          </label>
          <div className="flex gap-3 justify-end">
            <button onClick={() => setEditModal(null)} className="btn-secondary">Cancel</button>
            <button onClick={handleSave} disabled={saving || !form.title} className="btn-primary flex items-center gap-2 disabled:opacity-50">
              {saving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : null}
              {editModal?.mode === 'edit' ? 'Update' : 'Create'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Submissions Modal */}
      <Modal open={!!submissionsView} onClose={() => setSubmissionsView(null)} title={`Submissions: ${submissionsView?.title}`} size="xl">
        {submissions.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-8">No submissions yet.</p>
        ) : (
          <div className="space-y-3 max-h-[500px] overflow-y-auto">
            {submissions.map(sub => (
              <div key={sub.id} className="p-4 rounded-xl border border-slate-100 dark:border-slate-700">
                <div className="flex items-start justify-between gap-4 mb-2">
                  <div>
                    <p className="font-medium text-slate-900 dark:text-white text-sm">{sub.student?.full_name}</p>
                    <p className="text-xs text-slate-400">{sub.student?.email}</p>
                  </div>
                  <Badge variant={sub.status === 'approved' ? 'success' : sub.status === 'rejected' ? 'error' : 'info'} className="text-xs">{sub.status}</Badge>
                </div>
                {sub.description && <p className="text-sm text-slate-600 dark:text-slate-300 mb-2">{sub.description}</p>}
                <div className="flex items-center gap-3 text-xs mb-3">
                  {sub.github_url && <a href={sub.github_url} target="_blank" rel="noopener noreferrer" className="text-primary-600 hover:underline flex items-center gap-1"><Github size={11} /> GitHub</a>}
                  {sub.live_url && <a href={sub.live_url} target="_blank" rel="noopener noreferrer" className="text-primary-600 hover:underline flex items-center gap-1"><ExternalLink size={11} /> Live Demo</a>}
                  <span className="text-slate-400">{formatDate(sub.submitted_at)}</span>
                </div>
                {sub.feedback && <p className="text-xs text-slate-500 italic mb-2">Feedback: {sub.feedback}</p>}
                {sub.status !== 'approved' && sub.status !== 'rejected' && (
                  <button
                    onClick={() => { setGradingModal(sub); setGradeForm({ status: 'approved', feedback: sub.feedback ?? '' }); }}
                    className="btn-primary text-xs flex items-center gap-1"
                  >
                    <Star size={12} /> Review
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </Modal>

      {/* Grading Modal */}
      <Modal open={!!gradingModal} onClose={() => setGradingModal(null)} title="Review Project Submission">
        <div className="space-y-4">
          <div>
            <label className="label">Decision</label>
            <select className="input" value={gradeForm.status} onChange={e => setGradeForm(f => ({ ...f, status: e.target.value as any }))}>
              <option value="approved">Approve</option>
              <option value="rejected">Reject</option>
              <option value="reviewed">Reviewed (pending)</option>
            </select>
          </div>
          <div>
            <label className="label">Feedback</label>
            <textarea className="input min-h-[100px] resize-none" placeholder="Provide feedback..." value={gradeForm.feedback} onChange={e => setGradeForm(f => ({ ...f, feedback: e.target.value }))} />
          </div>
          <div className="flex gap-3 justify-end">
            <button onClick={() => setGradingModal(null)} className="btn-secondary">Cancel</button>
            <button onClick={handleGrade} disabled={saving} className="btn-primary flex items-center gap-2">
              {saving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Star size={14} />}
              Submit Review
            </button>
          </div>
        </div>
      </Modal>

      {/* Delete Confirmation */}
      <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Confirm Delete" size="sm">
        <p className="text-sm text-slate-600 dark:text-slate-300 mb-4">Delete project <strong>{deleteTarget?.title}</strong>? All submissions will also be deleted.</p>
        <div className="flex gap-3 justify-end">
          <button onClick={() => setDeleteTarget(null)} className="btn-secondary">Cancel</button>
          <button onClick={handleDelete} disabled={saving} className="btn-primary bg-red-600 hover:bg-red-700 flex items-center gap-2">
            {saving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Trash2 size={14} />}
            Delete
          </button>
        </div>
      </Modal>
    </div>
  );
}
