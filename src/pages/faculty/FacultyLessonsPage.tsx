import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FileText, Search, Filter, Eye, EyeOff, Edit2, Trash2, ExternalLink,
  Clock, Monitor, Film, Code, Loader2,
} from 'lucide-react';
import { PageHeader } from '../../components/common/PageHeader';
import { EmptyState } from '../../components/ui/EmptyState';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../components/ui/Toast';
import { getFacultyCourses, getCourseChapters, getCourseLessonsAll, updateLesson, deleteLesson } from '../../services/faculty';
import type { Course, Chapter, Lesson } from '../../types/database';

type LessonRow = Lesson & { courseName: string; chapterName: string; courseId: string };

export default function FacultyLessonsPage() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const { success, error: toastError } = useToast();
  const [courses, setCourses] = useState<Course[]>([]);
  const [chapters, setChapters] = useState<Map<string, Chapter[]>>(new Map());
  const [lessons, setLessons] = useState<LessonRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterCourse, setFilterCourse] = useState('');
  const [filterChapter, setFilterChapter] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<LessonRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadAll = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    try {
      const cs = await getFacultyCourses(profile.id);
      setCourses(cs);
      const chapMap = new Map<string, Chapter[]>();
      const allLessons: LessonRow[] = [];
      await Promise.all(cs.map(async (c) => {
        const [chaps, lsns] = await Promise.all([getCourseChapters(c.id), getCourseLessonsAll(c.id)]);
        chapMap.set(c.id, chaps);
        const chapNameMap = new Map(chaps.map(ch => [ch.id, ch.title]));
        lsns.forEach(l => {
          allLessons.push({
            ...l,
            courseName: c.title,
            chapterName: chapNameMap.get(l.chapter_id) ?? '',
            courseId: c.id,
          });
        });
      }));
      setChapters(chapMap);
      setLessons(allLessons);
    } catch (err) {
      toastError('Failed to load lessons');
    } finally {
      setLoading(false);
    }
  }, [profile]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const handleTogglePublish = async (lesson: LessonRow) => {
    try {
      await updateLesson(lesson.id, { is_published: !lesson.is_published });
      success(lesson.is_published ? 'Unpublished' : 'Published');
      setLessons(prev => prev.map(l => l.id === lesson.id ? { ...l, is_published: !l.is_published } : l));
    } catch { toastError('Failed to update lesson'); }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteLesson(deleteTarget.id);
      success('Lesson deleted');
      setDeleteTarget(null);
      setLessons(prev => prev.filter(l => l.id !== deleteTarget.id));
    } catch { toastError('Failed to delete lesson'); }
    setDeleting(false);
  };

  const openInBuilder = (lesson: LessonRow) => {
    navigate(`/faculty/courses/${lesson.courseId}/builder?lessonId=${lesson.id}`);
  };

  const filtered = lessons.filter(l => {
    if (filterCourse && l.courseId !== filterCourse) return false;
    if (filterChapter && l.chapter_id !== filterChapter) return false;
    if (search) {
      const q = search.toLowerCase();
      return l.title.toLowerCase().includes(q) || l.courseName.toLowerCase().includes(q) || l.chapterName.toLowerCase().includes(q);
    }
    return true;
  });

  const modeIcon = (mode?: string) => {
    if (mode === 'live_class') return <Monitor size={12} className="text-blue-500" />;
    if (mode === 'recorded_video') return <Film size={12} className="text-amber-500" />;
    return null;
  };

  const availableChapters = filterCourse ? (chapters.get(filterCourse) ?? []) : [];

  if (loading) return <div className="p-8 text-center text-slate-400"><Loader2 className="animate-spin mx-auto" size={24} /></div>;

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto animate-fade-in">
      <PageHeader title="Lessons" subtitle="View and manage all lessons across your courses" icon={FileText} />

      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            className="input pl-10 text-sm"
            placeholder="Search lessons..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-2">
          <select className="input text-sm py-1.5 w-auto" value={filterCourse} onChange={e => { setFilterCourse(e.target.value); setFilterChapter(''); }}>
            <option value="">All Courses</option>
            {courses.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
          </select>
          {availableChapters.length > 0 && (
            <select className="input text-sm py-1.5 w-auto" value={filterChapter} onChange={e => setFilterChapter(e.target.value)}>
              <option value="">All Chapters</option>
              {availableChapters.map(ch => <option key={ch.id} value={ch.id}>{ch.title}</option>)}
            </select>
          )}
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={FileText} title="No lessons found" description={search || filterCourse ? "Try adjusting your search or filters." : "Create lessons inside the Course Builder."} />
      ) : (
        <div className="space-y-2">
          <div className="hidden md:grid grid-cols-12 gap-4 px-5 py-2 text-xs font-medium text-slate-400 uppercase tracking-wider">
            <div className="col-span-4">Lesson</div>
            <div className="col-span-2">Course</div>
            <div className="col-span-2">Chapter</div>
            <div className="col-span-1 text-center">Status</div>
            <div className="col-span-1 text-center">Mode</div>
            <div className="col-span-2 text-right">Actions</div>
          </div>
          {filtered.map(lesson => (
            <div key={lesson.id} className="card p-4 md:px-5 md:py-3">
              <div className="md:grid md:grid-cols-12 md:gap-4 md:items-center space-y-2 md:space-y-0">
                <div className="col-span-4">
                  <p className="font-medium text-slate-900 dark:text-white text-sm truncate">{lesson.title}</p>
                  <div className="flex items-center gap-2 text-xs text-slate-400 mt-0.5">
                    {lesson.duration_minutes && <span className="flex items-center gap-1"><Clock size={10} />{lesson.duration_minutes}m</span>}
                    {lesson.enable_coding_playground && <span className="flex items-center gap-1"><Code size={10} />Playground</span>}
                  </div>
                </div>
                <div className="col-span-2">
                  <p className="text-xs text-primary-600 dark:text-primary-400 truncate">{lesson.courseName}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-xs text-slate-500 truncate">{lesson.chapterName}</p>
                </div>
                <div className="col-span-1 text-center">
                  <span className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium ${lesson.is_published ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400'}`}>
                    {lesson.is_published ? 'Published' : 'Draft'}
                  </span>
                </div>
                <div className="col-span-1 flex justify-center">
                  {modeIcon(lesson.teaching_mode)}
                </div>
                <div className="col-span-2 flex items-center justify-end gap-1">
                  <button onClick={() => openInBuilder(lesson)} title="Edit in Builder" className="p-2 text-slate-400 hover:text-primary-600 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
                    <Edit2 size={14} />
                  </button>
                  <button onClick={() => handleTogglePublish(lesson)} title={lesson.is_published ? 'Unpublish' : 'Publish'} className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
                    {lesson.is_published ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                  <button onClick={() => setDeleteTarget(lesson)} title="Delete" className="p-2 text-red-400 hover:text-red-600 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </div>
          ))}
          <p className="text-xs text-slate-400 text-center pt-2">{filtered.length} lesson{filtered.length !== 1 ? 's' : ''}</p>
        </div>
      )}

      <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Delete Lesson" size="sm">
        <p className="text-sm text-slate-600 dark:text-slate-300 mb-4">
          Permanently delete <strong>{deleteTarget?.title}</strong>? All related progress, notes, and resources will be removed.
        </p>
        <div className="flex gap-3 justify-end">
          <button onClick={() => setDeleteTarget(null)} className="btn-secondary">Cancel</button>
          <button onClick={handleDelete} disabled={deleting} className="btn-primary bg-red-600 hover:bg-red-700 flex items-center gap-2 disabled:opacity-50">
            {deleting ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Trash2 size={14} />}
            Delete
          </button>
        </div>
      </Modal>
    </div>
  );
}
