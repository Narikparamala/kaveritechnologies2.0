import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpen, Plus, Trash2, Edit2, ChevronDown, ChevronRight, GripVertical, Eye, EyeOff, FileText, Clock, Code2, Settings2 } from 'lucide-react';
import { PageHeader } from '../../components/common/PageHeader';
import { EmptyState } from '../../components/ui/EmptyState';
import { Modal } from '../../components/ui/Modal';
import { useToast } from '../../components/ui/Toast';
import { useAuth } from '../../contexts/AuthContext';
import { getFacultyCourses, getCourseChapters, getChapterLessonsAll, createChapter, updateChapter, deleteChapter, createLesson, updateLesson, deleteLesson } from '../../services/faculty';
import { slugify } from '../../lib/utils';
import type { Course, Chapter, Lesson } from '../../types/database';

export default function FacultyCourseBuilderPage() {
  const { profile } = useAuth();
  const { success, error: toastError } = useToast();
  const navigate = useNavigate();
  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);
  const [chapters, setChapters] = useState<(Chapter & { lessons: Lesson[] })[]>([]);
  const [expandedChapters, setExpandedChapters] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [chapterModal, setChapterModal] = useState<{ mode: 'create' | 'edit'; chapter?: Chapter } | null>(null);
  const [lessonModal, setLessonModal] = useState<{ mode: 'create' | 'edit'; chapterId: string; lesson?: Lesson } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ type: 'chapter' | 'lesson'; id: string; name: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [chapterForm, setChapterForm] = useState({ title: '', description: '' });
  const [lessonForm, setLessonForm] = useState({ title: '', slug: '', notes_markdown: '', code_example: '', explanation: '', duration_minutes: 10, is_published: false, teaching_mode: 'live_class' as 'live_class' | 'recorded_video', enable_coding_playground: false });

  useEffect(() => {
    if (!profile) return;
    (async () => {
      const cs = await getFacultyCourses(profile.id);
      setCourses(cs);
      if (cs.length > 0) setSelectedCourse(cs[0]);
      setLoading(false);
    })();
  }, [profile]);

  const loadChapters = useCallback(async (courseId: string) => {
    const chs = await getCourseChapters(courseId);
    const withLessons = await Promise.all(
      chs.map(async ch => {
        const lessons = await getChapterLessonsAll(ch.id);
        return { ...ch, lessons };
      })
    );
    setChapters(withLessons);
    if (withLessons.length > 0) setExpandedChapters(new Set([withLessons[0].id]));
  }, []);

  useEffect(() => {
    if (selectedCourse) loadChapters(selectedCourse.id);
    else setChapters([]);
  }, [selectedCourse, loadChapters]);

  const toggleChapter = (id: string) => {
    setExpandedChapters(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleSaveChapter = async () => {
    if (!chapterModal || !selectedCourse) return;
    setSaving(true);
    try {
      if (chapterModal.mode === 'create') {
        await createChapter(selectedCourse.id, chapterForm.title, chapterForm.description);
        success('Chapter created');
      } else if (chapterModal.chapter) {
        await updateChapter(chapterModal.chapter.id, { title: chapterForm.title, description: chapterForm.description });
        success('Chapter updated');
      }
      setChapterModal(null);
      await loadChapters(selectedCourse.id);
    } catch (e: any) {
      toastError('Error', e.message);
    }
    setSaving(false);
  };

  const handleSaveLesson = async () => {
    if (!lessonModal || !selectedCourse) return;
    setSaving(true);
    try {
      const slug = lessonForm.slug || slugify(lessonForm.title);
      if (lessonModal.mode === 'create') {
        await createLesson({
          chapter_id: lessonModal.chapterId,
          course_id: selectedCourse.id,
          title: lessonForm.title,
          slug,
          notes_markdown: lessonForm.notes_markdown,
          code_example: lessonForm.code_example,
          explanation: lessonForm.explanation,
          duration_minutes: Number(lessonForm.duration_minutes) || 10,
          is_published: lessonForm.is_published,
          teaching_mode: lessonForm.teaching_mode,
          enable_coding_playground: lessonForm.enable_coding_playground,
        });
        success('Lesson created');
      } else if (lessonModal.lesson) {
        await updateLesson(lessonModal.lesson.id, {
          title: lessonForm.title,
          slug,
          notes_markdown: lessonForm.notes_markdown,
          code_example: lessonForm.code_example,
          explanation: lessonForm.explanation,
          duration_minutes: Number(lessonForm.duration_minutes) || 10,
          is_published: lessonForm.is_published,
          teaching_mode: lessonForm.teaching_mode,
          enable_coding_playground: lessonForm.enable_coding_playground,
        });
        success('Lesson updated');
      }
      setLessonModal(null);
      await loadChapters(selectedCourse.id);
    } catch (e: any) {
      toastError('Error', e.message);
    }
    setSaving(false);
  };

  const handleTogglePublishChapter = async (ch: Chapter) => {
    try {
      await updateChapter(ch.id, { is_published: !ch.is_published });
      success(ch.is_published ? 'Chapter unpublished' : 'Chapter published');
      await loadChapters(selectedCourse!.id);
    } catch (e: any) { toastError('Error', e.message); }
  };

  const handleTogglePublishLesson = async (lesson: Lesson) => {
    try {
      await updateLesson(lesson.id, { is_published: !lesson.is_published });
      success(lesson.is_published ? 'Lesson unpublished' : 'Lesson published');
      await loadChapters(selectedCourse!.id);
    } catch (e: any) { toastError('Error', e.message); }
  };

  const handleDelete = async () => {
    if (!deleteTarget || !selectedCourse) return;
    setSaving(true);
    try {
      if (deleteTarget.type === 'chapter') {
        await deleteChapter(deleteTarget.id);
      } else {
        await deleteLesson(deleteTarget.id);
      }
      success('Deleted');
      setDeleteTarget(null);
      await loadChapters(selectedCourse.id);
    } catch (e: any) { toastError('Error', e.message); }
    setSaving(false);
  };

  const openCreateChapter = () => {
    setChapterForm({ title: '', description: '' });
    setChapterModal({ mode: 'create' });
  };

  const openEditChapter = (ch: Chapter) => {
    setChapterForm({ title: ch.title, description: ch.description ?? '' });
    setChapterModal({ mode: 'edit', chapter: ch });
  };

  const openCreateLesson = (chapterId: string) => {
    setLessonForm({ title: '', slug: '', notes_markdown: '', code_example: '', explanation: '', duration_minutes: 10, is_published: false, teaching_mode: 'live_class', enable_coding_playground: false });
    setLessonModal({ mode: 'create', chapterId });
  };

  const openEditLesson = (chapterId: string, lesson: Lesson) => {
    setLessonForm({
      title: lesson.title,
      slug: lesson.slug,
      notes_markdown: lesson.notes_markdown ?? '',
      code_example: lesson.code_example ?? '',
      explanation: lesson.explanation ?? '',
      duration_minutes: lesson.duration_minutes,
      is_published: lesson.is_published,
      teaching_mode: lesson.teaching_mode ?? 'live_class',
      enable_coding_playground: lesson.enable_coding_playground ?? false,
    });
    setLessonModal({ mode: 'edit', chapterId, lesson });
  };

  if (loading) return <div className="p-8 text-center text-slate-400">Loading...</div>;

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto animate-fade-in">
      <PageHeader title="Course Builder" subtitle="Manage chapters and lessons for your assigned courses" icon={BookOpen} />

      {courses.length === 0 ? (
        <EmptyState icon={BookOpen} title="No courses assigned" description="Contact your admin to be assigned to courses." />
      ) : (
        <>
          {/* Course selector */}
          <div className="flex flex-wrap gap-2 mb-6">
            {courses.map(c => (
              <button
                key={c.id}
                onClick={() => setSelectedCourse(c)}
                className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${selectedCourse?.id === c.id ? 'bg-primary-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'}`}
              >
                {c.title}
              </button>
            ))}
          </div>

          {selectedCourse && (
            <>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">Curriculum</h2>
                <button onClick={openCreateChapter} className="btn-primary text-sm flex items-center gap-2">
                  <Plus size={14} /> Add Chapter
                </button>
              </div>

              {chapters.length === 0 ? (
                <EmptyState icon={BookOpen} title="No chapters yet" description="Create your first chapter to start building the curriculum." action={
                  <button onClick={openCreateChapter} className="btn-primary text-sm flex items-center gap-2"><Plus size={14} /> Add Chapter</button>
                } />
              ) : (
                <div className="space-y-3">
                  {chapters.map(ch => (
                    <div key={ch.id} className="card overflow-hidden">
                      <div className="flex items-center gap-3 p-4">
                        <button onClick={() => toggleChapter(ch.id)} className="text-slate-400 hover:text-slate-600">
                          {expandedChapters.has(ch.id) ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                        </button>
                        <GripVertical size={14} className="text-slate-300" />
                        <div className="flex-1">
                          <p className="font-medium text-slate-900 dark:text-white">{ch.title}</p>
                          {ch.description && <p className="text-xs text-slate-400 mt-0.5">{ch.description}</p>}
                        </div>
                        <span className={`badge text-xs ${ch.is_published ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-slate-100 text-slate-400'}`}>
                          {ch.is_published ? 'Published' : 'Draft'}
                        </span>
                        <button onClick={() => handleTogglePublishChapter(ch)} className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700">
                          {ch.is_published ? <EyeOff size={14} /> : <Eye size={14} />}
                        </button>
                        <button onClick={() => openEditChapter(ch)} className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700">
                          <Edit2 size={14} />
                        </button>
                        <button onClick={() => setDeleteTarget({ type: 'chapter', id: ch.id, name: ch.title })} className="p-2 text-red-400 hover:text-red-600 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20">
                          <Trash2 size={14} />
                        </button>
                      </div>

                      {expandedChapters.has(ch.id) && (
                        <div className="border-t border-slate-100 dark:border-slate-700">
                          {ch.lessons.length === 0 ? (
                            <div className="p-4 text-sm text-slate-400 text-center">No lessons in this chapter yet.</div>
                          ) : (
                            <div className="divide-y divide-slate-50 dark:divide-slate-700/50">
                              {ch.lessons.map(lesson => (
                                <div key={lesson.id} className="flex items-center gap-3 p-3 pl-12">
                                  <FileText size={14} className="text-slate-300" />
                                  <div className="flex-1">
                                    <p className="text-sm font-medium text-slate-900 dark:text-white">{lesson.title}</p>
                                    <div className="flex items-center gap-3 text-xs text-slate-400 mt-0.5">
                                      <span className="flex items-center gap-1"><Clock size={10} /> {lesson.duration_minutes}m</span>
                                      <span className="capitalize">{(lesson.teaching_mode ?? 'live_class').replace('_', ' ')}</span>
                                      {lesson.enable_coding_playground && <span className="flex items-center gap-1"><Code2 size={10} /> Playground</span>}
                                      <span>{lesson.xp_reward} XP</span>
                                    </div>
                                  </div>
                                  <span className={`badge text-xs ${lesson.is_published ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-slate-100 text-slate-400'}`}>
                                    {lesson.is_published ? 'Published' : 'Draft'}
                                  </span>
                                  <button
                                    onClick={() => navigate(`/faculty/courses/${selectedCourse?.id}/builder?lessonId=${lesson.id}`)}
                                    className="p-1.5 text-primary-600 hover:text-primary-700 rounded-lg hover:bg-primary-50 dark:hover:bg-primary-900/20"
                                    title="Edit lesson content"
                                  >
                                    <Settings2 size={12} />
                                  </button>
                                  <button onClick={() => handleTogglePublishLesson(lesson)} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700">
                                    {lesson.is_published ? <EyeOff size={12} /> : <Eye size={12} />}
                                  </button>
                                  <button onClick={() => openEditLesson(ch.id, lesson)} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700">
                                    <Edit2 size={12} />
                                  </button>
                                  <button onClick={() => setDeleteTarget({ type: 'lesson', id: lesson.id, name: lesson.title })} className="p-1.5 text-red-400 hover:text-red-600 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20">
                                    <Trash2 size={12} />
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                          <div className="p-3 pl-12">
                            <button onClick={() => openCreateLesson(ch.id)} className="text-sm text-primary-600 hover:underline flex items-center gap-1">
                              <Plus size={12} /> Add Lesson
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* Chapter Modal */}
      <Modal open={!!chapterModal} onClose={() => setChapterModal(null)} title={chapterModal?.mode === 'edit' ? 'Edit Chapter' : 'New Chapter'}>
        <div className="space-y-4">
          <div>
            <label className="label">Title</label>
            <input className="input" placeholder="Chapter title..." value={chapterForm.title} onChange={e => setChapterForm(f => ({ ...f, title: e.target.value }))} />
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
            <input className="input" placeholder="e.g. Variables and Data Types" value={lessonForm.title} onChange={e => setLessonForm(f => ({ ...f, title: e.target.value, slug: f.slug || slugify(e.target.value) }))} />
          </div>
          <div>
            <label className="label">Description / Explanation</label>
            <textarea className="input min-h-[80px] resize-none" placeholder="Brief explanation of the lesson..." value={lessonForm.explanation} onChange={e => setLessonForm(f => ({ ...f, explanation: e.target.value }))} />
          </div>
          <div>
            <label className="label">Notes (Markdown)</label>
            <textarea className="input min-h-[120px] resize-none font-mono text-sm" placeholder="Lesson content in markdown..." value={lessonForm.notes_markdown} onChange={e => setLessonForm(f => ({ ...f, notes_markdown: e.target.value }))} />
          </div>
          <div>
            <label className="label">Starter Python Code</label>
            <textarea className="input min-h-[100px] resize-none font-mono text-sm bg-slate-900 text-slate-100 dark:bg-slate-900" placeholder="# Starter code for students..." value={lessonForm.code_example} onChange={e => setLessonForm(f => ({ ...f, code_example: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Duration (minutes)</label>
              <input type="number" className="input" value={lessonForm.duration_minutes} onChange={e => setLessonForm(f => ({ ...f, duration_minutes: Number(e.target.value) }))} />
            </div>
            <div>
              <label className="label">Teaching Mode</label>
              <select className="input" value={lessonForm.teaching_mode} onChange={e => setLessonForm(f => ({ ...f, teaching_mode: e.target.value as 'live_class' | 'recorded_video' }))}>
                <option value="live_class">Live Class</option>
                <option value="recorded_video">Recorded Video</option>
              </select>
            </div>
          </div>
          <div className="flex items-center gap-6">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" className="w-4 h-4 rounded" checked={lessonForm.enable_coding_playground} onChange={e => setLessonForm(f => ({ ...f, enable_coding_playground: e.target.checked }))} />
              <span className="text-sm text-slate-700 dark:text-slate-300">Enable Coding Playground</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" className="w-4 h-4 rounded" checked={lessonForm.is_published} onChange={e => setLessonForm(f => ({ ...f, is_published: e.target.checked }))} />
              <span className="text-sm text-slate-700 dark:text-slate-300">Publish immediately</span>
            </label>
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

      {/* Delete Confirmation */}
      <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Confirm Delete" size="sm">
        <p className="text-sm text-slate-600 dark:text-slate-300 mb-4">
          Are you sure you want to delete <strong>{deleteTarget?.name}</strong>? This action cannot be undone.
        </p>
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
