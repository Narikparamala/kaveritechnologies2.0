import { useState, useEffect } from 'react';
import { Map, CheckCircle, Circle, Lock, Loader2, BookOpen } from 'lucide-react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../../components/common/PageHeader';
import { EmptyState } from '../../components/ui/EmptyState';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

interface LessonRoadmapItem {
  id: string;
  title: string;
  done: boolean;
}

interface ChapterGroup {
  chapterId: string;
  chapterTitle: string;
  orderIndex: number;
  lessons: LessonRoadmapItem[];
}

interface CourseRoadmap {
  courseId: string;
  courseTitle: string;
  color: string;
  chapters: ChapterGroup[];
}

const COURSE_COLORS = [
  'from-emerald-500 to-teal-500',
  'from-primary-500 to-primary-700',
  'from-slate-600 to-slate-800',
  'from-teal-500 to-cyan-600',
  'from-rose-500 to-pink-600',
  'from-amber-500 to-orange-600',
];

export default function RoadmapPage() {
  const { profile } = useAuth();
  const [roadmaps, setRoadmaps] = useState<CourseRoadmap[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile) return;
    loadRoadmap();
  }, [profile]);

  async function loadRoadmap() {
    if (!profile) return;
    setLoading(true);
    try {
      const { data: enrollments } = await supabase
        .from('course_enrollments')
        .select('course_id, courses(id, title)')
        .eq('student_id', profile.id)
        .eq('access_status', 'active');

      if (!enrollments?.length) { setRoadmaps([]); return; }

      const courseIds = enrollments.map(e => e.course_id);

      const [chaptersRes, lessonsRes, progressRes] = await Promise.all([
        supabase
          .from('chapters')
          .select('id, course_id, title, order_index')
          .in('course_id', courseIds)
          .eq('is_published', true)
          .order('order_index', { ascending: true }),
        supabase
          .from('lessons')
          .select('id, chapter_id, course_id, title, order_index')
          .in('course_id', courseIds)
          .eq('is_published', true)
          .order('order_index', { ascending: true }),
        supabase
          .from('lesson_progress')
          .select('lesson_id, completed')
          .eq('student_id', profile.id)
          .eq('completed', true),
      ]);

      const completedSet = new Set((progressRes.data ?? []).map(p => p.lesson_id));
      const chapters = chaptersRes.data ?? [];
      const lessons = lessonsRes.data ?? [];

      const result: CourseRoadmap[] = enrollments.map((enr, idx) => {
        const course = (enr as any).courses;
        const courseChapters = chapters
          .filter(c => c.course_id === enr.course_id)
          .map(ch => ({
            chapterId: ch.id,
            chapterTitle: ch.title,
            orderIndex: ch.order_index,
            lessons: lessons
              .filter(l => l.chapter_id === ch.id)
              .map(l => ({
                id: l.id,
                title: l.title,
                done: completedSet.has(l.id),
              })),
          }));

        return {
          courseId: enr.course_id,
          courseTitle: course?.title ?? 'Unknown Course',
          color: COURSE_COLORS[idx % COURSE_COLORS.length],
          chapters: courseChapters,
        };
      });

      setRoadmaps(result.filter(r => r.chapters.length > 0));
    } catch {
      setRoadmaps([]);
    } finally {
      setLoading(false);
    }
  }

  const totalLessons = roadmaps.reduce((s, r) => s + r.chapters.reduce((s2, c) => s2 + c.lessons.length, 0), 0);
  const doneLessons = roadmaps.reduce((s, r) => s + r.chapters.reduce((s2, c) => s2 + c.lessons.filter(l => l.done).length, 0), 0);

  if (loading) {
    return (
      <div className="p-6 lg:p-8 max-w-4xl mx-auto flex items-center justify-center min-h-[400px]">
        <Loader2 className="animate-spin text-primary-500" size={32} />
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 max-w-4xl mx-auto animate-fade-in">
      <PageHeader
        title="Learning Roadmap"
        subtitle={totalLessons > 0 ? `${doneLessons}/${totalLessons} lessons completed` : 'Track your learning progress'}
        icon={Map}
        action={<Link to="/student/courses" className="btn-primary text-sm">Browse Courses</Link>}
      />

      {roadmaps.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title="No courses enrolled"
          description="Enroll in courses to see your learning roadmap and track progress."
          action={<Link to="/student/courses" className="btn-primary text-sm mt-3">Explore Courses</Link>}
        />
      ) : (
        <div className="space-y-10">
          {roadmaps.map(roadmap => {
            const courseLessons = roadmap.chapters.reduce((s, c) => s + c.lessons.length, 0);
            const courseDone = roadmap.chapters.reduce((s, c) => s + c.lessons.filter(l => l.done).length, 0);
            const pct = courseLessons > 0 ? (courseDone / courseLessons) * 100 : 0;

            return (
              <div key={roadmap.courseId}>
                <div className={`p-4 rounded-2xl bg-gradient-to-r ${roadmap.color} mb-4`}>
                  <div className="flex items-center justify-between">
                    <h2 className="font-bold text-white text-lg">{roadmap.courseTitle}</h2>
                    <span className="text-white/80 text-sm font-medium">{courseDone}/{courseLessons} lessons</span>
                  </div>
                  <div className="mt-2 h-1.5 bg-white/20 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-white/80 rounded-full transition-all duration-500"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>

                <div className="space-y-6">
                  {roadmap.chapters.map((chapter, ci) => {
                    const chDone = chapter.lessons.filter(l => l.done).length;
                    const allPrevChaptersDone = ci === 0 || roadmap.chapters.slice(0, ci).every(
                      pc => pc.lessons.every(l => l.done)
                    );

                    return (
                      <div key={chapter.chapterId}>
                        <div className="flex items-center gap-2 mb-3">
                          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                            {chapter.chapterTitle}
                          </h3>
                          <span className="text-xs text-slate-400">({chDone}/{chapter.lessons.length})</span>
                        </div>
                        <div className="grid sm:grid-cols-2 gap-3">
                          {chapter.lessons.map((lesson, li) => {
                            const locked = !allPrevChaptersDone && li > 0 && !chapter.lessons.slice(0, li).every(l => l.done);
                            return (
                              <div
                                key={lesson.id}
                                className={`card p-4 flex items-center gap-3 transition-all ${
                                  lesson.done
                                    ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-100 dark:border-emerald-800'
                                    : locked
                                    ? 'opacity-60'
                                    : ''
                                }`}
                              >
                                {lesson.done ? (
                                  <CheckCircle size={18} className="text-emerald-500 flex-shrink-0" />
                                ) : locked ? (
                                  <Lock size={18} className="text-slate-300 flex-shrink-0" />
                                ) : (
                                  <Circle size={18} className="text-slate-300 flex-shrink-0" />
                                )}
                                <span
                                  className={`text-sm font-medium ${
                                    lesson.done
                                      ? 'text-emerald-700 dark:text-emerald-400 line-through'
                                      : 'text-slate-700 dark:text-slate-300'
                                  }`}
                                >
                                  {lesson.title}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
