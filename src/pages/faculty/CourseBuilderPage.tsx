import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  BookOpen, Plus, Trash2, Edit2, ChevronDown, ChevronRight, Eye, EyeOff,
  ArrowLeft, Users, Settings, ExternalLink, GripVertical, FileText, Clock,
  ArrowUp, ArrowDown, AlertCircle,
} from 'lucide-react';
import { useToast } from '../../components/ui/Toast';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { Modal } from '../../components/ui/Modal';
import { EmptyState } from '../../components/ui/EmptyState';
import { slugify } from '../../lib/utils';
import {
  getCourseById, getCourseEnrollmentCount, updateCourse,
  getCourseChapters, getChapterLessonsAll, createChapter, updateChapter, deleteChapter,
  createLesson, updateLesson, deleteLesson, deleteCourseWithContent,
} from '../../services/faculty';
import LessonEditorTabs from './LessonEditorTabs';
import type { Course, Chapter, Lesson } from '../../types/database';

type ChapterWithLessons = Chapter & { lessons: Lesson[] };

export default function CourseBuilderPage() {
  const { courseId } = useParams<{ courseId: string }>();
  const { profile } = useAuth();
  const { success, error: toastError } = useToast();
  const navigate = useNavigate();

  const [course, setCourse] = useState<Course | null>(null);
  const [enrollmentCount, setEnrollmentCount] = useState(0);
  const [chapters, setChapters] = useState<ChapterWithLessons[]>([]);
  const [expandedChapters, setExpandedChapters] = useState<Set<string>>(new Set());
  const [selectedLessonId, setSelectedLessonId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);

  // Modals
  const [chapterModal, setChapterModal] = useState<{ mode: 'create' | 'edit'; chapter?: Chapter } | null>(null);
  const [lessonModal, setLessonModal] = useState<{ mode: 'create' | 'edit'; chapterId: string; lesson?: Lesson } | null>(null);
  const [courseEditModal, setCourseEditModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ type: 'chapter' | 'lesson'; id: string; name: string; warning?: string } | null>(null);
  const [courseDeleteModal, setCourseDeleteModal] = useState(false);
  const [courseDeleteConfirm, setCourseDeleteConfirm] = useState('');
  const [deletingCourse, setDeletingCourse] = useState(false);
  const [saving, setSaving] = useState(false);

  // Forms
  const [chapterForm, setChapterForm] = useState({ title: '', description: '' });
  const [lessonForm, setLessonForm] = useState({ title: '', slug: '', notes_markdown: '', code_example: '', explanation: '', duration_minutes: 10, is_published: false });
  const [courseForm, setCourseForm] = useState({ title: '', short_description: '', description: '', thumbnail_url: '', difficulty: 'beginner', category: 'python', language: 'English', is_published: false, is_featured: false });

  const loadData = useCallback(async () => {
    if (!courseId || !profile) return;
    setLoading(true);
    try {
      const c = await getCourseById(courseId);
      if (!c) { setAccessDenied(true); setLoading(false); return; }

      // Verify faculty is assigned to this course
      const { data: assignment } = await supabase.from('course_faculty').select('id').eq('course_id', courseId).eq('faculty_id', profile.id).maybeSingle();
      if (!assignment && profile.role !== 'super_admin') {
        setAccessDenied(true);
        setLoading(false);
        return;
      }

      setCourse(c);
      setEnrollmentCount(await getCourseEnrollmentCount(courseId));

      const chs = await getCourseChapters(courseId);
      const withLessons = await Promise.all(
        chs.map(async ch => ({ ...ch, lessons: await getChapterLessonsAll(ch.id) }))
      );
      setChapters(withLessons);
      if (withLessons.length > 0) setExpandedChapters(new Set([withLessons[0].id]));
    } catch (e: any) {
      toastError('Error', e.message);
    }
    setLoading(false);
  }, [courseId, profile]);

  useEffect(() => { loadData(); }, [loadData]);

  const toggleChapter = (id: string) => {
    setExpandedChapters(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const moveChapter = async (ch: Chapter, direction: 'up' | 'down') => {
    const sorted = [...chapters].sort((a, b) => a.order_index - b.order_index);
    const idx = sorted.findIndex(c => c.id === ch.id);
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= sorted.length) return;
    const swapCh = sorted[swapIdx];
    await updateChapter(ch.id, { order_index: swapCh.order_index });
    await updateChapter(swapCh.id, { order_index: ch.order_index });
    await loadData();
  };

  const moveLesson = async (lesson: Lesson, direction: 'up' | 'down') => {
    const parentCh = chapters.find(c => c.id === lesson.chapter_id);
    if (!parentCh) return;
    const sorted = [...parentCh.lessons].sort((a, b) => a.order_index - b.order_index);
    const idx = sorted.findIndex(l => l.id === lesson.id);
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= sorted.length) return;
    const swapLesson = sorted[swapIdx];
    await updateLesson(lesson.id, { order_index: swapLesson.order_index });
    await updateLesson(swapLesson.id, { order_index: lesson.order_index });
    await loadData();
  };

  const handleSaveChapter = async () => {
    if (!chapterModal || !courseId) return;
    setSaving(true);
    try {
      if (chapterModal.mode === 'create') {
        await createChapter(courseId, chapterForm.title, chapterForm.description);
        success('Chapter created');
      } else if (chapterModal.chapter) {
        await updateChapter(chapterModal.chapter.id, { title: chapterForm.title, description: chapterForm.description });
        success('Chapter updated');
      }
      setChapterModal(null);
      await loadData();
    } catch (e: any) { toastError('Error', e.message); }
    setSaving(false);
  };

  const handleSaveLesson = async () => {
    if (!lessonModal || !courseId) return;
    setSaving(true);
    try {
      const slug = lessonForm.slug || slugify(lessonForm.title);
      if (lessonModal.mode === 'create') {
        await createLesson({
          chapter_id: lessonModal.chapterId,
          course_id: courseId,
          title: lessonForm.title,
          slug,
          notes_markdown: lessonForm.notes_markdown,
          code_example: lessonForm.code_example,
          explanation: lessonForm.explanation,
          duration_minutes: Number(lessonForm.duration_minutes) || 10,
          is_published: lessonForm.is_published,
        });
        success('Lesson created');
      } else if (lessonModal.lesson) {
        await updateLesson(lessonModal.lesson.id, {
          title: lessonForm.title, slug,
          notes_markdown: lessonForm.notes_markdown,
          code_example: lessonForm.code_example,
          explanation: lessonForm.explanation,
          duration_minutes: Number(lessonForm.duration_minutes) || 10,
          is_published: lessonForm.is_published,
        });
        success('Lesson updated');
      }
      setLessonModal(null);
      await loadData();
    } catch (e: any) { toastError('Error', e.message); }
    setSaving(false);
  };

  const handleSaveCourse = async () => {
    if (!courseId) return;
    setSaving(true);
    try {
      await updateCourse(courseId, {
        title: courseForm.title,
        short_description: courseForm.short_description || null,
        description: courseForm.description || null,
        thumbnail_url: courseForm.thumbnail_url || null,
        difficulty: courseForm.difficulty as any,
        category: courseForm.category,
        language: courseForm.language,
        is_published: courseForm.is_published,
        is_featured: courseForm.is_featured,
      });
      success('Course updated');
      setCourseEditModal(false);
      await loadData();
    } catch (e: any) { toastError('Error', e.message); }
    setSaving(false);
  };

  const handleDeleteCourse = async () => {
    if (!course || courseDeleteConfirm !== course.title) return;
    setDeletingCourse(true);
    try {
      await deleteCourseWithContent(course.id);
      success('Course deleted');
      navigate('/faculty/courses');
    } catch (e: any) { toastError('Error', e.message); }
    setDeletingCourse(false);
  };

  const handleTogglePublishCourse = async () => {
    if (!course) return;
    try {
      await updateCourse(course.id, { is_published: !course.is_published });
      success(course.is_published ? 'Course unpublished' : 'Course published');
      await loadData();
    } catch (e: any) { toastError('Error', e.message); }
  };

  const handleTogglePublishChapter = async (ch: Chapter) => {
    try {
      await updateChapter(ch.id, { is_published: !ch.is_published });
      success(ch.is_published ? 'Chapter unpublished' : 'Chapter published');
      await loadData();
    } catch (e: any) { toastError('Error', e.message); }
  };

  const handleTogglePublishLesson = async (lesson: Lesson) => {
    try {
      await updateLesson(lesson.id, { is_published: !lesson.is_published });
      success(lesson.is_published ? 'Lesson unpublished' : 'Lesson published');
      await loadData();
    } catch (e: any) { toastError('Error', e.message); }
  };

  const handleDelete = async () => {
    if (!deleteTarget || !courseId) return;
    setSaving(true);
    try {
      if (deleteTarget.type === 'chapter') await deleteChapter(deleteTarget.id);
      else await deleteLesson(deleteTarget.id);
      success('Deleted');
      setDeleteTarget(null);
      if (selectedLessonId === deleteTarget.id) setSelectedLessonId(null);
      await loadData();
    } catch (e: any) { toastError('Error', e.message); }
    setSaving(false);
  };

  const openCreateChapter = () => { setChapterForm({ title: '', description: '' }); setChapterModal({ mode: 'create' }); };
  const openEditChapter = (ch: Chapter) => { setChapterForm({ title: ch.title, description: ch.description ?? '' }); setChapterModal({ mode: 'edit', chapter: ch }); };
  const openCreateLesson = (chapterId: string) => { setLessonForm({ title: '', slug: '', notes_markdown: '', code_example: '', explanation: '', duration_minutes: 10, is_published: false }); setLessonModal({ mode: 'create', chapterId }); };
  const openEditLesson = (chapterId: string, lesson: Lesson) => {
    setLessonForm({
      title: lesson.title, slug: lesson.slug,
      notes_markdown: lesson.notes_markdown ?? '', code_example: lesson.code_example ?? '',
      explanation: lesson.explanation ?? '', duration_minutes: lesson.duration_minutes,
      is_published: lesson.is_published,
    });
    setLessonModal({ mode: 'edit', chapterId, lesson });
  };
  const openEditCourse = () => {
    if (!course) return;
    setCourseForm({
      title: course.title, short_description: course.short_description ?? '',
      description: course.description ?? '', thumbnail_url: course.thumbnail_url ?? '',
      difficulty: course.difficulty, category: course.category ?? 'python',
      language: course.language ?? 'English', is_published: course.is_published,
      is_featured: course.is_featured,
    });
    setCourseEditModal(true);
  };

  if (loading) return <div className="p-8 text-center text-slate-400">Loading course builder...</div>;
  if (accessDenied) return (
    <div className="p-8 max-w-md mx-auto text-center">
      <AlertCircle size={32} className="text-red-400 mx-auto mb-3" />
      <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-2">Access Denied</h2>
      <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">You are not assigned to this course.</p>
      <Link to="/faculty/courses" className="btn-primary">Back to My Courses</Link>
    </div>
  );
  if (!course) return null;

  const selectedLesson = chapters.flatMap(c => c.lessons).find(l => l.id === selectedLessonId) ?? null;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Top bar */}
      <div className="flex items-center gap-3 px-4 sm:px-6 py-3 bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 flex-shrink-0">
        <button onClick={() => navigate('/faculty/courses')} className="btn-ghost py-1.5 px-3 text-sm flex items-center gap-1.5">
          <ArrowLeft size={14} /> Courses
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="font-bold text-slate-900 dark:text-white truncate">{course.title}</h1>
          <p className="text-xs text-slate-400">Course Builder</p>
        </div>
        <span className={`badge text-xs ${course.is_published ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-slate-100 text-slate-400'}`}>
          {course.is_published ? 'Published' : 'Draft'}
        </span>
        <span className="text-xs text-slate-400 flex items-center gap-1"><Users size={11} /> {enrollmentCount}</span>
        <button onClick={openEditCourse} className="btn-secondary text-sm flex items-center gap-1.5">
          <Settings size={14} /> Edit Course
        </button>
        <button onClick={handleTogglePublishCourse} className="btn-primary text-sm flex items-center gap-1.5">
          {course.is_published ? <EyeOff size={14} /> : <Eye size={14} />}
          {course.is_published ? 'Unpublish' : 'Publish'}
        </button>
        <button onClick={() => { setCourseDeleteConfirm(''); setCourseDeleteModal(true); }} className="p-2 text-red-400 hover:text-red-600 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20" title="Delete Course">
          <Trash2 size={14} />
        </button>
      </div>

      {/* Main content: left outline + right editor */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left outline panel */}
        <div className="w-72 lg:w-80 border-r border-slate-100 dark:border-slate-800 overflow-y-auto flex-shrink-0 bg-slate-50 dark:bg-slate-900/50">
          <div className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-bold text-slate-700 dark:text-slate-300">Curriculum</h2>
              <button onClick={openCreateChapter} className="btn-primary text-xs py-1.5 px-2.5 flex items-center gap-1">
                <Plus size={12} /> Chapter
              </button>
            </div>

            {chapters.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-8">No chapters yet. Create your first chapter.</p>
            ) : (
              <div className="space-y-1">
                {chapters.map((ch, chIdx) => (
                  <div key={ch.id} className="rounded-lg overflow-hidden">
                    <div className="flex items-center gap-1.5 p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg group">
                      <button onClick={() => toggleChapter(ch.id)} className="text-slate-400 hover:text-slate-600 flex-shrink-0">
                        {expandedChapters.has(ch.id) ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      </button>
                      <span className="text-xs text-slate-400 font-mono flex-shrink-0">{chIdx + 1}.</span>
                      <p className="text-sm font-medium text-slate-900 dark:text-white truncate flex-1">{ch.title}</p>
                      <span className={`badge text-xs flex-shrink-0 ${ch.is_published ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-slate-100 text-slate-400'}`}>
                        {ch.lessons.length}
                      </span>
                      <div className="hidden group-hover:flex items-center gap-0.5">
                        <button onClick={() => moveChapter(ch, 'up')} disabled={chIdx === 0} className="p-0.5 text-slate-400 hover:text-slate-600 disabled:opacity-20">
                          <ArrowUp size={11} />
                        </button>
                        <button onClick={() => moveChapter(ch, 'down')} disabled={chIdx === chapters.length - 1} className="p-0.5 text-slate-400 hover:text-slate-600 disabled:opacity-20">
                          <ArrowDown size={11} />
                        </button>
                      </div>
                    </div>

                    {expandedChapters.has(ch.id) && (
                      <div className="ml-6 mt-1 space-y-0.5">
                        {ch.lessons.map((lesson, lIdx) => (
                          <div key={lesson.id} className="flex items-center gap-1.5 p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 group">
                            <FileText size={12} className="text-slate-300 flex-shrink-0" />
                            <button
                              onClick={() => setSelectedLessonId(lesson.id)}
                              className={`text-sm truncate flex-1 text-left ${selectedLessonId === lesson.id ? 'text-primary-600 dark:text-primary-400 font-medium' : 'text-slate-600 dark:text-slate-400'}`}
                            >
                              {chIdx + 1}.{lIdx + 1} {lesson.title}
                            </button>
                            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${lesson.is_published ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                          </div>
                        ))}
                        <button onClick={() => openCreateLesson(ch.id)} className="text-xs text-primary-600 hover:underline flex items-center gap-1 p-1.5">
                          <Plus size={10} /> Add Lesson
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right editor panel */}
        <div className="flex-1 overflow-y-auto">
          {selectedLesson ? (
            <LessonEditorTabs lesson={selectedLesson} course={course} onRefresh={loadData} onEditLesson={() => openEditLesson(selectedLesson.chapter_id, selectedLesson)} onTogglePublish={() => handleTogglePublishLesson(selectedLesson)} onDeleteLesson={() => setDeleteTarget({ type: 'lesson', id: selectedLesson.id, name: selectedLesson.title })} onMoveLesson={(dir) => moveLesson(selectedLesson, dir)} />
          ) : (
            <div className="p-8">
              <EmptyState icon={BookOpen} title="Select a lesson" description="Choose a lesson from the outline to edit its content, or create a new chapter and lesson." />
            </div>
          )}
        </div>
      </div>

      {/* Chapter Modal */}
      <Modal open={!!chapterModal} onClose={() => setChapterModal(null)} title={chapterModal?.mode === 'edit' ? 'Edit Chapter' : 'New Chapter'}>
        <div className="space-y-4">
          <div>
            <label className="label">Title</label>
            <input className="input" placeholder="e.g. Python Fundamentals" value={chapterForm.title} onChange={e => setChapterForm(f => ({ ...f, title: e.target.value }))} />
          </div>
          <div>
            <label className="label">Description (optional)</label>
            <textarea className="input min-h-[80px] resize-none" placeholder="What this chapter covers..." value={chapterForm.description} onChange={e => setChapterForm(f => ({ ...f, description: e.target.value }))} />
          </div>
          <div className="flex gap-3 justify-end">
            <button onClick={() => setChapterModal(null)} className="btn-secondary">Cancel</button>
            <button onClick={handleSaveChapter} disabled={saving || !chapterForm.title} className="btn-primary flex items-center gap-2 disabled:opacity-50">
              {saving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : null}
              {chapterModal?.mode === 'edit' ? 'Update' : 'Create'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Lesson Modal */}
      <Modal open={!!lessonModal} onClose={() => setLessonModal(null)} title={lessonModal?.mode === 'edit' ? 'Edit Lesson' : 'New Lesson'} size="lg">
        <div className="space-y-4">
          <div>
            <label className="label">Lesson Title</label>
            <input className="input" placeholder="e.g. Introduction to Python" value={lessonForm.title} onChange={e => setLessonForm(f => ({ ...f, title: e.target.value, slug: f.slug || slugify(e.target.value) }))} />
          </div>
          <div>
            <label className="label">Overview / Explanation</label>
            <textarea className="input min-h-[60px] resize-none" placeholder="Brief overview of the lesson..." value={lessonForm.explanation} onChange={e => setLessonForm(f => ({ ...f, explanation: e.target.value }))} />
          </div>
          <div>
            <label className="label">Notes (Markdown)</label>
            <textarea className="input min-h-[100px] resize-none font-mono text-sm" placeholder="Lesson content in markdown..." value={lessonForm.notes_markdown} onChange={e => setLessonForm(f => ({ ...f, notes_markdown: e.target.value }))} />
          </div>
          <div>
            <label className="label">Starter Python Code</label>
            <textarea className="input min-h-[80px] resize-none font-mono text-sm bg-slate-900 text-slate-100" placeholder="# Starter code..." value={lessonForm.code_example} onChange={e => setLessonForm(f => ({ ...f, code_example: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Duration (minutes)</label>
              <input type="number" className="input" value={lessonForm.duration_minutes} onChange={e => setLessonForm(f => ({ ...f, duration_minutes: Number(e.target.value) }))} />
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 cursor-pointer pb-3">
                <input type="checkbox" className="w-4 h-4 rounded" checked={lessonForm.is_published} onChange={e => setLessonForm(f => ({ ...f, is_published: e.target.checked }))} />
                <span className="text-sm text-slate-700 dark:text-slate-300">Publish immediately</span>
              </label>
            </div>
          </div>
          <div className="flex gap-3 justify-end">
            <button onClick={() => setLessonModal(null)} className="btn-secondary">Cancel</button>
            <button onClick={handleSaveLesson} disabled={saving || !lessonForm.title} className="btn-primary flex items-center gap-2 disabled:opacity-50">
              {saving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : null}
              {lessonModal?.mode === 'edit' ? 'Update' : 'Create'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Course Edit Modal */}
      <Modal open={courseEditModal} onClose={() => setCourseEditModal(false)} title="Edit Course" size="lg">
        <div className="space-y-4">
          <div>
            <label className="label">Course Title</label>
            <input className="input" value={courseForm.title} onChange={e => setCourseForm(f => ({ ...f, title: e.target.value }))} />
          </div>
          <div>
            <label className="label">Cover Image URL</label>
            <input className="input" placeholder="https://..." value={courseForm.thumbnail_url} onChange={e => setCourseForm(f => ({ ...f, thumbnail_url: e.target.value }))} />
            <p className="text-xs text-slate-400 mt-1">Paste an external image URL. File upload requires storage configuration.</p>
          </div>
          <div>
            <label className="label">Short Description (card)</label>
            <input className="input" placeholder="Brief description for course cards..." value={courseForm.short_description} onChange={e => setCourseForm(f => ({ ...f, short_description: e.target.value }))} />
          </div>
          <div>
            <label className="label">Full Description</label>
            <textarea className="input min-h-[80px] resize-none" placeholder="Detailed course description..." value={courseForm.description} onChange={e => setCourseForm(f => ({ ...f, description: e.target.value }))} />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="label">Difficulty</label>
              <select className="input" value={courseForm.difficulty} onChange={e => setCourseForm(f => ({ ...f, difficulty: e.target.value }))}>
                <option value="beginner">Beginner</option>
                <option value="intermediate">Intermediate</option>
                <option value="advanced">Advanced</option>
              </select>
            </div>
            <div>
              <label className="label">Category</label>
              <input className="input" value={courseForm.category} onChange={e => setCourseForm(f => ({ ...f, category: e.target.value }))} />
            </div>
            <div>
              <label className="label">Language</label>
              <input className="input" value={courseForm.language} onChange={e => setCourseForm(f => ({ ...f, language: e.target.value }))} />
            </div>
          </div>
          <div className="flex items-center gap-6">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" className="w-4 h-4 rounded" checked={courseForm.is_published} onChange={e => setCourseForm(f => ({ ...f, is_published: e.target.checked }))} />
              <span className="text-sm text-slate-700 dark:text-slate-300">Published</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" className="w-4 h-4 rounded" checked={courseForm.is_featured} onChange={e => setCourseForm(f => ({ ...f, is_featured: e.target.checked }))} />
              <span className="text-sm text-slate-700 dark:text-slate-300">Featured</span>
            </label>
          </div>
          <div className="flex gap-3 justify-end">
            <button onClick={() => setCourseEditModal(false)} className="btn-secondary">Cancel</button>
            <button onClick={handleSaveCourse} disabled={saving || !courseForm.title} className="btn-primary flex items-center gap-2 disabled:opacity-50">
              {saving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : null}
              Save Changes
            </button>
          </div>
        </div>
      </Modal>

      {/* Delete Confirmation */}
      <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Confirm Delete" size="sm">
        <div className="space-y-3">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Are you sure you want to delete <strong>{deleteTarget?.name}</strong>?
          </p>
          {deleteTarget?.type === 'chapter' && (
            <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 text-xs flex items-start gap-2">
              <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
              <span>All lessons within this chapter and their associated content (topics, quizzes, assignments, materials) will also be deleted.</span>
            </div>
          )}
          {deleteTarget?.type === 'lesson' && (
            <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 text-xs flex items-start gap-2">
              <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
              <span>All content within this lesson (topics, subtopics, materials, practice questions, quizzes, assignments) will also be deleted.</span>
            </div>
          )}
          <div className="flex gap-3 justify-end">
            <button onClick={() => setDeleteTarget(null)} className="btn-secondary">Cancel</button>
            <button onClick={handleDelete} disabled={saving} className="btn-primary bg-red-600 hover:bg-red-700 flex items-center gap-2">
              {saving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Trash2 size={14} />}
              Delete
            </button>
          </div>
        </div>
      </Modal>
    

      {/* Course Delete Modal */}
      <Modal open={courseDeleteModal} onClose={() => setCourseDeleteModal(false)} title="Delete Course" size="sm">
        <div className="space-y-3">
          <div className="p-3 rounded-xl bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 text-xs flex items-start gap-2">
            <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
            <span>This will permanently delete the course and <strong>all</strong> chapters, lessons, topics, materials, practice questions, quizzes, assignments, live sessions, and student learning data. This action cannot be undone.</span>
          </div>
          <p className="text-sm text-slate-600 dark:text-slate-300">Type <strong>{course?.title}</strong> to confirm:</p>
          <input className="input" placeholder={course?.title} value={courseDeleteConfirm} onChange={e => setCourseDeleteConfirm(e.target.value)} />
          <div className="flex gap-3 justify-end">
            <button onClick={() => setCourseDeleteModal(false)} className="btn-secondary">Cancel</button>
            <button onClick={handleDeleteCourse} disabled={deletingCourse || courseDeleteConfirm !== course?.title} className="btn-primary bg-red-600 hover:bg-red-700 flex items-center gap-2 disabled:opacity-50">
              {deletingCourse ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Trash2 size={14} />}
              Delete Permanently
            </button>
          </div>
        </div>
      </Modal></div>
  );
}
