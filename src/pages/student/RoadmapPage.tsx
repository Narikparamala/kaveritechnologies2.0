import { useState, useEffect } from 'react';
import {
  Map as MapIcon, CheckCircle, Play, Lock, Loader2, BookOpen, ArrowRight, Clock, Zap,
  Video, FileText, PenLine, HelpCircle, ClipboardList, CalendarClock,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../../components/common/PageHeader';
import { EmptyState } from '../../components/ui/EmptyState';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { getStudentCoursePlan } from '../../services/lessons';
import type { LessonPlanItem, LessonActivity } from '../../types/database';

interface JourneyChapter {
  chapterTitle: string;
  chapterOrder: number;
  lessons: LessonPlanItem[];
}

interface JourneyCourse {
  courseId: string;
  courseTitle: string;
  chapters: JourneyChapter[];
  done: number;
  total: number;
  nextAvailableId: string | null;
}

const COURSE_COLORS = [
  'from-primary-600 to-indigo-700',
  'from-emerald-600 to-teal-700',
  'from-violet-600 to-purple-700',
  'from-rose-600 to-pink-700',
  'from-amber-600 to-orange-700',
  'from-sky-600 to-blue-700',
];

function stateIcon(item: LessonPlanItem) {
  if (item.access === 'completed') {
    return { Icon: CheckCircle, cls: 'text-emerald-500 dark:text-emerald-400' };
  }
  if (item.access === 'locked') {
    return { Icon: Lock, cls: 'text-slate-400 dark:text-slate-500' };
  }
  return { Icon: Play, cls: 'text-primary-600 dark:text-primary-400' };
}

const ACTIVITY_ICONS: Record<string, typeof Video> = {
  recorded_video: Video,
  slides: FileText,
  notes: BookOpen,
  material: FileText,
  practice: PenLine,
  live: CalendarClock,
  quiz: HelpCircle,
  assignment: ClipboardList,
};

function activityLabel(act: LessonActivity): { text: string; cls: string } {
  switch (act.state) {
    case 'completed': return { text: 'Completed', cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' };
    case 'live_now': return { text: 'Live now', cls: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' };
    case 'upcoming': return { text: 'Upcoming', cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' };
    case 'cancelled': return { text: 'Cancelled', cls: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400 line-through' };
    case 'locked': return { text: 'Locked', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' };
    case 'draft': return { text: 'Draft', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' };
    case 'submitted': return { text: 'Submitted', cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' };
    case 'returned': return { text: 'Returned', cls: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400' };
    case 'resubmitted': return { text: 'Resubmitted', cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' };
    case 'graded': return { text: 'Graded', cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' };
    default: return { text: 'Available', cls: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300' };
  }
}

function activityKindLabel(act: LessonActivity): string {
  switch (act.kind) {
    case 'recorded_video': return 'Recorded Lesson';
    case 'slides': return 'Slides';
    case 'notes': return 'Notes';
    case 'practice': return act.count ? `Practice (${act.count})` : 'Practice';
    case 'live': return 'Live Class';
    case 'quiz': return 'Quiz';
    case 'assignment': return 'Assignment';
    default: return act.title;
  }
}

function activityHref(act: LessonActivity, courseId: string): string {
  if (act.kind === 'live' && act.session_id) return `/student/live-classes/${act.session_id}`;
  if (act.kind === 'quiz' && act.quiz_id) return '/student/quizzes';
  if (act.kind === 'assignment' && act.assignment_id) return `/student/assignments/${act.assignment_id}`;
  if (['recorded_video', 'slides', 'notes', 'practice', 'material'].includes(act.kind)) {
    return `/student/course/${courseId}`;
  }
  return `/student/course/${courseId}`;
}

function ActivityChips({ item, courseId }: { item: LessonPlanItem; courseId: string }) {
  const acts = item.activities ?? [];
  if (!acts.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
      {acts.map((act, i) => {
        const Icon = ACTIVITY_ICONS[act.kind] ?? FileText;
        const st = activityLabel(act);
        const href = activityHref(act, courseId);
        const title = act.kind === 'live'
          ? `${act.title}${act.date ? ` · ${act.date}` : ''}${act.recording === 'available' ? ' · recording available' : act.recording === 'locked' ? ' · recording locked' : ''}`
          : act.title;
        return (
          <Link
            key={`${act.kind}-${i}`}
            to={href}
            title={title}
            className={`inline-flex items-center gap-1 rounded-lg border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 px-2 py-0.5 text-[10px] font-medium text-slate-600 dark:text-slate-300 hover:border-primary-300 dark:hover:border-primary-600 transition-colors ${act.state === 'cancelled' ? 'opacity-60' : ''}`}
          >
            <Icon size={10} className={act.state === 'live_now' ? 'text-red-500 animate-pulse' : act.kind === 'live' ? 'text-red-400' : 'text-slate-400'} />
            <span>{activityKindLabel(act)}</span>
            <span className={`px-1 rounded text-[9px] font-semibold uppercase tracking-wide ${st.cls}`}>{st.text}</span>
          </Link>
        );
      })}
    </div>
  );
}

export default function RoadmapPage() {
  const { profile } = useAuth();
  const [courses, setCourses] = useState<JourneyCourse[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile) return;
    loadJourney();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile]);

  async function loadJourney() {
    if (!profile) return;
    setLoading(true);
    try {
      const { data: enrollments, error: enrError } = await supabase
        .from('course_enrollments')
        .select('course_id, courses(id, title)')
        .eq('student_id', profile.id)
        .eq('access_status', 'active');

      if (enrError) throw enrError;
      if (!enrollments?.length) { setCourses([]); return; }

      const built: JourneyCourse[] = [];
      for (const enr of enrollments) {
        const course = (enr as any).courses;
        const plan = await getStudentCoursePlan(enr.course_id);
        if (!plan.length) continue;

        const byChapter = new Map<string, JourneyChapter>();
        for (const item of plan) {
          const key = `${item.chapter_order_index}-${item.chapter_id}`;
          const group: JourneyChapter = byChapter.get(key) ?? {
            chapterTitle: item.chapter_title,
            chapterOrder: item.chapter_order_index,
            lessons: [] as LessonPlanItem[],
          };
          group.lessons.push(item);
          byChapter.set(key, group);
        }

        const chapters = [...byChapter.values()].sort((a, b) => a.chapterOrder - b.chapterOrder);
        const done = plan.filter(i => i.access === 'completed').length;
        const nextAvailable = plan.find(i => i.access === 'available');

        built.push({
          courseId: enr.course_id,
          courseTitle: course?.title ?? 'Course',
          chapters,
          done,
          total: plan.length,
          nextAvailableId: nextAvailable?.lesson_id ?? null,
        });
      }

      setCourses(built.filter(c => c.chapters.length > 0));
    } catch (err) {
      console.error('Failed to load journey:', err);
      setCourses([]);
    } finally {
      setLoading(false);
    }
  }

  const totalDone = courses.reduce((s, c) => s + c.done, 0);
  const totalAll = courses.reduce((s, c) => s + c.total, 0);

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
        title="My Journey"
        subtitle={totalAll > 0 ? `${totalDone}/${totalAll} lessons completed across your courses` : 'Your learning path, chapter by chapter'}
        icon={MapIcon}
        action={<Link to="/student/courses" className="btn-primary text-sm">Browse Courses</Link>}
      />

      {courses.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title="No course journey yet"
          description="Enroll in a course to unlock your learning journey."
          action={<Link to="/student/courses" className="btn-primary text-sm mt-3">Explore Courses</Link>}
        />
      ) : (
        <div className="space-y-12">
          {courses.map((course, ci) => {
            const pct = course.total > 0 ? Math.round((course.done / course.total) * 100) : 0;
            const color = COURSE_COLORS[ci % COURSE_COLORS.length];
            const nextId = course.nextAvailableId;

            return (
              <section key={course.courseId}>
                <div className={`p-5 rounded-2xl bg-gradient-to-r ${color} shadow-lg shadow-slate-200/60 dark:shadow-none mb-5`}>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-white/70">Course</p>
                      <h2 className="font-bold text-white text-lg">{course.courseTitle}</h2>
                    </div>
                    <span className="px-3 py-1 rounded-full bg-white/20 text-white text-xs font-semibold">
                      {course.done}/{course.total} · {pct}%
                    </span>
                  </div>
                  <div className="mt-3 h-2 bg-white/20 rounded-full overflow-hidden">
                    <div className="h-full bg-white rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
                  </div>
                </div>

                <div className="space-y-5">
                  {course.chapters.map(chapter => {
                    const chDone = chapter.lessons.filter(l => l.access === 'completed').length;
                    const isNextChapter = chapter.lessons.some(l => l.lesson_id === nextId);
                    return (
                      <div key={chapter.chapterTitle} className="card p-5">
                        <div className="flex items-center justify-between mb-4">
                          <div className="flex items-center gap-2">
                            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">{chapter.chapterTitle}</h3>
                            <span className="text-xs text-slate-400 font-medium">({chDone}/{chapter.lessons.length})</span>
                            {isNextChapter && (
                              <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-primary-100 dark:bg-primary-900/40 text-primary-700 dark:text-primary-300">
                                Continue here
                              </span>
                            )}
                          </div>
                          {chDone === chapter.lessons.length && (
                            <span className="flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                              <CheckCircle size={13} /> Chapter complete
                            </span>
                          )}
                        </div>

                        <div className="space-y-1.5">
                          {chapter.lessons.map(item => {
                            const { Icon, cls } = stateIcon(item);
                            const isNext = item.lesson_id === nextId;
                            const rowCls =
                              item.access === 'completed'
                                ? 'bg-emerald-50/60 dark:bg-emerald-900/10'
                                : item.access === 'locked'
                                ? 'opacity-70'
                                : isNext
                                ? 'ring-2 ring-primary-400 dark:ring-primary-600'
                                : '';
                            return (
                              <div key={item.lesson_id} className={`flex items-start gap-3 rounded-xl border border-slate-100 dark:border-slate-800 p-3 transition-colors ${rowCls}`}>
                                <div className={`mt-0.5 flex-shrink-0 ${item.access === 'locked' ? 'text-slate-300 dark:text-slate-600' : ''}`}>
                                  {item.access === 'locked' ? (
                                    <Lock size={17} className={cls} />
                                  ) : item.access === 'completed' ? (
                                    <CheckCircle size={17} className={cls} />
                                  ) : (
                                    <span className="block w-[17px] h-[17px] rounded-full bg-primary-600 dark:bg-primary-400 flex items-center justify-center">
                                      <Play size={10} className="text-white dark:text-slate-900 ml-[1px]" />
                                    </span>
                                  )}
                                </div>

                                <div className="flex-1 min-w-0">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <p className={`text-sm font-medium ${item.access === 'completed' ? 'text-slate-500 dark:text-slate-400 line-through' : 'text-slate-800 dark:text-slate-100'}`}>
                                      {item.title}
                                    </p>
                                    {item.access === 'available' && !isNext && (
                                      <span className="text-[10px] font-semibold uppercase tracking-wide text-primary-600 dark:text-primary-400">Available</span>
                                    )}
                                    {isNext && (
                                      <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-primary-600 text-white">Next up</span>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-3 mt-0.5 text-[11px] text-slate-400">
                                    {item.duration_minutes ? (
                                      <span className="flex items-center gap-1"><Clock size={11} /> {item.duration_minutes} min</span>
                                    ) : null}
                                    <span className="flex items-center gap-1"><Zap size={11} /> +{item.xp_reward} XP</span>
                                    {item.teaching_mode === 'live_class' && (
                                      <span className="uppercase tracking-wide text-[10px] font-semibold text-red-500/80">Live Class</span>
                                    )}
                                  </div>
                                  {item.access === 'locked' && item.reason && (
                                    <p className="mt-1 text-[11px] text-amber-600 dark:text-amber-400 flex items-start gap-1">
                                      <Lock size={11} className="flex-shrink-0 mt-0.5" />
                                      {item.reason}
                                    </p>
                                  )}
                                  <ActivityChips item={item} courseId={course.courseId} />
                                </div>

                                {item.access !== 'locked' && (
                                  <Link
                                    to={`/student/course/${course.courseId}`}
                                    className="flex-shrink-0 inline-flex items-center gap-1 text-xs font-semibold text-primary-600 dark:text-primary-400 hover:text-primary-700 mt-1"
                                  >
                                    {item.access === 'completed' ? 'Review' : 'Start'}
                                    <ArrowRight size={13} />
                                  </Link>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
