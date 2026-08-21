import { useEffect, useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BookOpen, Users, Settings, Plus, AlertCircle } from 'lucide-react';
import { PageHeader } from '../../components/common/PageHeader';
import { EmptyState } from '../../components/ui/EmptyState';
import { Modal } from '../../components/ui/Modal';
import { SkeletonCard } from '../../components/ui/LoadingSpinner';
import { useToast } from '../../components/ui/Toast';
import { getDifficultyColor, slugify } from '../../lib/utils';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { createCourse } from '../../services/faculty';
import type { Course } from '../../types/database';

function CourseThumbnail({ src, alt }: { src?: string | null; alt: string }) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  if (!src || failed) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-slate-400 dark:text-slate-500">
        <BookOpen size={38} strokeWidth={1.5} />
        <span className="text-xs font-medium">No cover image</span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={`${alt} course cover`}
      className="h-full w-full object-cover object-center transition-transform duration-300 group-hover:scale-[1.02]"
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  );
}

const INITIAL_FORM = { title: '', slug: '', short_description: '', description: '', thumbnail_url: '', difficulty: 'beginner', category: 'python', language: 'English', duration_hours: 0 };

export default function FacultyCoursesPage() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const { success, error: toastError } = useToast();
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [createModal, setCreateModal] = useState(false);
  const [form, setForm] = useState(INITIAL_FORM);
  const [slugEdited, setSlugEdited] = useState(false);
  const [saving, setSaving] = useState(false);
  const [slugError, setSlugError] = useState('');

  const loadCourses = useCallback(async () => {
    if (!profile) return;
    const { data: cfData } = await supabase.from('course_faculty').select('course_id').eq('faculty_id', profile.id);
    const ids = (cfData ?? []).map((c: any) => c.course_id);
    if (ids.length) {
      const { data } = await supabase.from('courses').select('*').in('id', ids).order('created_at', { ascending: false });
      setCourses((data ?? []) as Course[]);
    } else {
      setCourses([]);
    }
    setLoading(false);
  }, [profile]);

  useEffect(() => { loadCourses(); }, [loadCourses]);

  const handleTitleChange = (title: string) => {
    setForm(f => ({ ...f, title, slug: slugEdited ? f.slug : slugify(title) }));
    setSlugError('');
  };

  const handleSlugChange = (slug: string) => {
    setSlugEdited(true);
    setForm(f => ({ ...f, slug: slug.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-') }));
    setSlugError('');
  };

  const handleCreate = async () => {
    if (!profile || !form.title.trim() || !form.slug.trim()) return;
    setSaving(true);
    setSlugError('');
    try {
      const course = await createCourse({
        title: form.title.trim(),
        slug: form.slug.trim(),
        short_description: form.short_description || undefined,
        description: form.description || undefined,
        thumbnail_url: form.thumbnail_url || undefined,
        difficulty: form.difficulty,
        category: form.category,
        language: form.language,
        duration_hours: Number(form.duration_hours) || 0,
        created_by: profile.id,
      });
      success('Course created!', 'You can now build the curriculum in the Course Builder.');
      setCreateModal(false);
      setForm(INITIAL_FORM);
      setSlugEdited(false);
      navigate(`/faculty/courses/${course.id}/builder`);
    } catch (e: any) {
      if (e.message?.includes('unique') || e.code === '23505') {
        setSlugError('This slug is already taken. Please use a different one.');
      } else {
        toastError('Error creating course', e.message);
      }
    }
    setSaving(false);
  };

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto animate-fade-in">
      <PageHeader
        title="My Courses"
        subtitle="Courses you are assigned to teach"
        icon={BookOpen}
        action={
          <button onClick={() => { setForm(INITIAL_FORM); setSlugEdited(false); setSlugError(''); setCreateModal(true); }} className="btn-primary flex items-center gap-2">
            <Plus size={16} /> Create Course
          </button>
        }
      />

      {loading ? (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 2xl:grid-cols-3">{[1,2,3].map(i => <SkeletonCard key={i} />)}</div>
      ) : courses.length === 0 ? (
        <EmptyState icon={BookOpen} title="No courses yet" description="Create your first course or ask your admin to assign you to an existing one." action={
          <button onClick={() => setCreateModal(true)} className="btn-primary flex items-center gap-2"><Plus size={14} /> Create Course</button>
        } />
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 2xl:grid-cols-3">
          {courses.map(c => (
            <article key={c.id} className="card-hover group flex h-full min-h-[430px] flex-col overflow-hidden">
              <div className="relative aspect-video overflow-hidden bg-slate-100 dark:bg-slate-900/70">
                <CourseThumbnail src={c.thumbnail_url} alt={c.title} />

                <div className="absolute left-3 top-3">
                  <span className={`badge border border-white/60 text-xs shadow-sm ${c.is_published ? 'bg-emerald-100 text-emerald-700' : 'bg-white text-slate-600'}`}>
                    {c.is_published ? 'Published' : 'Draft'}
                  </span>
                </div>

                <div className="absolute right-3 top-3">
                  <span className={`badge capitalize text-xs shadow-sm ${getDifficultyColor(c.difficulty)}`}>
                    {c.difficulty}
                  </span>
                </div>
              </div>

              <div className="flex flex-1 flex-col p-5">
                <div className="min-h-[92px]">
                  <h3 className="mb-2 line-clamp-2 text-lg font-bold text-slate-900 dark:text-white">
                    {c.title}
                  </h3>
                  <p className="line-clamp-2 text-sm leading-5 text-slate-500 dark:text-slate-400">
                    {c.short_description?.trim() || 'No course description added yet.'}
                  </p>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-slate-200 pt-4 text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400">
                  <span className="flex items-center gap-1.5">
                    <Users size={13} />
                    {c.enrollment_count ?? 0} students
                  </span>
                  <span>{c.duration_hours ?? 0}h</span>
                  <span className="capitalize">{c.category || 'Uncategorized'}</span>
                </div>

                <div className="mt-auto space-y-2 pt-5">
                  <Link
                    to={`/faculty/courses/${c.id}/builder`}
                    className="btn-primary flex w-full items-center justify-center gap-2 py-2.5 text-sm"
                  >
                    <Settings size={14} />
                    {c.is_published ? 'Manage Course' : 'Continue Building'}
                  </Link>

                  <div className="grid grid-cols-2 gap-2">
                    <Link
                      to="/faculty/assignments"
                      className="btn-secondary py-2 text-center text-xs"
                    >
                      Assignments
                    </Link>
                    <Link
                      to="/faculty/quizzes"
                      className="btn-secondary py-2 text-center text-xs"
                    >
                      Quizzes
                    </Link>
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {/* Create Course Modal */}
      <Modal open={createModal} onClose={() => setCreateModal(false)} title="Create New Course" size="lg">
        <div className="space-y-4">
          <div>
            <label className="label">Course Title <span className="text-red-500">*</span></label>
            <input className="input" placeholder="e.g. Python Fundamentals" value={form.title} onChange={e => handleTitleChange(e.target.value)} />
          </div>
          <div>
            <label className="label">URL Slug <span className="text-red-500">*</span></label>
            <input className="input font-mono text-sm" placeholder="python-fundamentals" value={form.slug} onChange={e => handleSlugChange(e.target.value)} />
            {slugError && <p className="text-xs text-red-500 mt-1 flex items-center gap-1"><AlertCircle size={11} />{slugError}</p>}
            <p className="text-xs text-slate-400 mt-1">Used in the course URL. Auto-generated from title.</p>
          </div>
          <div>
            <label className="label">Cover Image URL</label>
            <input className="input" placeholder="https://images.pexels.com/..." value={form.thumbnail_url} onChange={e => setForm(f => ({ ...f, thumbnail_url: e.target.value }))} />
            <p className="text-xs text-slate-400 mt-1">Paste an external image URL. File upload requires storage configuration.</p>
          </div>
          <div>
            <label className="label">Short Description</label>
            <input className="input" placeholder="Brief description for course cards..." value={form.short_description} onChange={e => setForm(f => ({ ...f, short_description: e.target.value }))} />
          </div>
          <div>
            <label className="label">Full Description</label>
            <textarea className="input min-h-[80px] resize-none" placeholder="Detailed course description..." value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Level</label>
              <select className="input" value={form.difficulty} onChange={e => setForm(f => ({ ...f, difficulty: e.target.value }))}>
                <option value="beginner">Beginner</option>
                <option value="intermediate">Intermediate</option>
                <option value="advanced">Advanced</option>
              </select>
            </div>
            <div>
              <label className="label">Category</label>
              <input className="input" placeholder="python" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Language</label>
              <input className="input" placeholder="English" value={form.language} onChange={e => setForm(f => ({ ...f, language: e.target.value }))} />
            </div>
            <div>
              <label className="label">Estimated Duration (hours)</label>
              <input type="number" className="input" value={form.duration_hours} onChange={e => setForm(f => ({ ...f, duration_hours: Number(e.target.value) }))} />
            </div>
          </div>
          <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 text-xs flex items-start gap-2">
            <AlertCircle size={12} className="flex-shrink-0 mt-0.5" />
            <span>The course will be created as <strong>Draft</strong>. You will be taken directly to the Course Builder to add chapters, lessons, materials, and more. Publish when ready.</span>
          </div>
          <div className="flex gap-3 justify-end">
            <button onClick={() => setCreateModal(false)} className="btn-secondary">Cancel</button>
            <button onClick={handleCreate} disabled={saving || !form.title.trim() || !form.slug.trim()} className="btn-primary flex items-center gap-2 disabled:opacity-50">
              {saving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Plus size={14} />}
              Create & Build
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
