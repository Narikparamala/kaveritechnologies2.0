import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, Video, CheckCircle, Zap, Flame, Trophy, ArrowRight, Play, Clock, Target } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { StatCard } from '../../components/ui/StatCard';
import { ProgressBar } from '../../components/ui/ProgressBar';
import { PageHeader } from '../../components/common/PageHeader';
import { EmptyState } from '../../components/ui/EmptyState';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { getStudentSessions, getTimeUntilSession, isSessionJoinable } from '../../services/liveSessions';
import { getStudentCoursePlan } from '../../services/lessons';
import type { CourseEnrollment, Course, Announcement, Notification, LiveSession } from '../../types/database';
import type { SessionWithDetails } from '../../services/liveSessions';

type EnrolledCourse = CourseEnrollment & { course: Course };

export default function StudentDashboard() {
  const { profile } = useAuth();
  const [enrollments, setEnrollments] = useState<EnrolledCourse[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [completedLessons, setCompletedLessons] = useState(0);
  const [weeklyData, setWeeklyData] = useState<{ day: string; lessons: number }[]>([]);
  const [upcomingSessions, setUpcomingSessions] = useState<SessionWithDetails[]>([]);
  const [liveSessions, setLiveSessions] = useState<SessionWithDetails[]>([]);
  const [nextLesson, setNextLesson] = useState<{ courseId: string; courseTitle: string; lessonTitle: string } | null>(null);
  const [nextGate, setNextGate] = useState<{
    courseId: string; courseTitle: string; activityType: string;
    activityTitle: string; activityId: string; lessonTitle: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile) return;
    const load = async () => {
      const [
        { data: enrData },
        { data: annData },
        { data: notifData },
        { data: progData },
      ] = await Promise.all([
        supabase.from('course_enrollments').select('*, course:courses(*)').eq('student_id', profile.id).order('enrolled_at', { ascending: false }).limit(5),
        supabase.from('announcements').select('*').eq('is_global', true).order('created_at', { ascending: false }).limit(3),
        supabase.from('notifications').select('*').eq('user_id', profile.id).order('created_at', { ascending: false }).limit(5),
        supabase.from('lesson_progress').select('id, completed_at').eq('student_id', profile.id).eq('completed', true),
      ]);

      setEnrollments((enrData ?? []) as any);
      setAnnouncements((annData ?? []) as Announcement[]);
      setNotifications((notifData ?? []) as Notification[]);
      setCompletedLessons(progData?.length ?? 0);

      // Next action across enrolled courses (server-authoritative plan):
      // priority for the dashboard card is live -> blocking gate -> next lesson.
      let foundGate: typeof nextGate = null;
      let foundNext: typeof nextLesson = null;
      for (const enr of (enrData ?? [])) {
        try {
          const plan = await getStudentCoursePlan(enr.course_id);
          if (!foundGate) {
            const gated = plan.find(i => i.access === 'locked' && i.requires_activity_type && i.requires_activity_id);
            if (gated) {
              foundGate = {
                courseId: enr.course_id,
                courseTitle: enr.course?.title ?? 'Course',
                activityType: gated.requires_activity_type as string,
                activityTitle: gated.requires_activity_title ?? (gated.requires_activity_type as string),
                activityId: gated.requires_activity_id as string,
                lessonTitle: gated.title,
              };
            }
          }
          if (!foundNext) {
            const next = plan.find(i => i.access === 'available');
            if (next) {
              foundNext = { courseId: enr.course_id, courseTitle: enr.course?.title ?? 'Course', lessonTitle: next.title };
            }
          }
        } catch {
          // skip course if the plan cannot be resolved
        }
      }
      setNextGate(foundGate);
      setNextLesson(foundNext);

      // Build weekly activity data from lesson_progress completed_at
      const now = new Date();
      const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const weekly = days.map((day, i) => {
        const target = new Date(now);
        target.setDate(now.getDate() - (now.getDay() - i + 7) % 7);
        const dayStr = target.toISOString().split('T')[0];
        const count = (progData ?? []).filter((p: any) => p.completed_at?.startsWith(dayStr)).length;
        return { day, lessons: count };
      });
      setWeeklyData(weekly);

      // Load live sessions
      try {
        const sessions = await getStudentSessions(profile.id);
        setLiveSessions(sessions.filter(s => s.status === 'live'));
        setUpcomingSessions(sessions.filter(s => s.status === 'scheduled').slice(0, 3));
      } catch (e) {
        console.error('Failed to load sessions:', e);
      }

      setLoading(false);
    };
    load();
  }, [profile]);

  if (!profile) return null;

  const unreadCount = notifications.filter(n => !n.is_read).length;

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto animate-fade-in">
      <PageHeader
        title={`Welcome back, ${profile.full_name?.split(' ')[0] ?? 'Learner'}!`}
        subtitle="Continue your Python learning journey"
      />

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard
          title="Completed Lessons"
          value={completedLessons}
          icon={CheckCircle}
          iconBg="bg-emerald-50 dark:bg-emerald-900/30"
          iconColor="text-emerald-600 dark:text-emerald-400"
        />
        <StatCard
          title="XP Points"
          value={profile.xp_points.toLocaleString()}
          icon={Zap}
          iconBg="bg-amber-50 dark:bg-amber-900/30"
          iconColor="text-amber-600 dark:text-amber-400"
        />
        <StatCard
          title="Learning Streak"
          value={`${profile.streak_days} days`}
          icon={Flame}
          iconBg="bg-orange-50 dark:bg-orange-900/30"
          iconColor="text-orange-600 dark:text-orange-400"
        />
        <StatCard
          title="Current Level"
          value={`Level ${profile.level}`}
          icon={Trophy}
          iconBg="bg-primary-50 dark:bg-primary-900/30"
          iconColor="text-primary-600 dark:text-primary-400"
        />
      </div>

      {/* Work On Now */}
      {(() => {
        const live = liveSessions[0];
        if (live) {
          return (
            <div className="card p-5 mb-8 ring-2 ring-red-500 bg-gradient-to-r from-red-50 to-rose-50 dark:from-red-950/40 dark:to-rose-950/40">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-red-100 dark:bg-red-900/40 flex items-center justify-center flex-shrink-0">
                    <Video size={22} className="text-red-600 dark:text-red-400" />
                  </div>
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-widest text-red-600 dark:text-red-400">Work on now</p>
                    <p className="font-bold text-slate-900 dark:text-white">{live.title}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{live.course?.title} · live right now</p>
                  </div>
                </div>
                {live.google_meet_url && (
                  <a href={live.google_meet_url} target="_blank" rel="noopener noreferrer" className="btn-primary flex items-center gap-2">
                    <Video size={15} /> Join Live Class
                  </a>
                )}
              </div>
            </div>
          );
        }
        if (nextGate) {
          const gateHref = nextGate.activityType === 'assignment'
            ? `/student/assignments/${nextGate.activityId}`
            : nextGate.activityType === 'quiz'
            ? '/student/quizzes'
            : `/student/coding-practice/${nextGate.activityId}`;
          const gateLabel = nextGate.activityType === 'assignment' ? 'Assignment'
            : nextGate.activityType === 'quiz' ? 'Quiz' : 'Coding practice';
          return (
            <div className="card p-5 mb-8 bg-gradient-to-r from-amber-500 to-orange-600 shadow-lg shadow-amber-200/50 dark:shadow-none">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0">
                    <Target size={22} className="text-white" />
                  </div>
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-widest text-white/70">Required to continue</p>
                    <p className="font-bold text-white">{nextGate.activityTitle}</p>
                    <p className="text-xs text-white/70">Complete this {gateLabel.toLowerCase()} to unlock &ldquo;{nextGate.lessonTitle}&rdquo; · {nextGate.courseTitle}</p>
                  </div>
                </div>
                <Link to={gateHref} className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-sm font-semibold text-amber-700 hover:bg-amber-50 transition-colors">
                  Open {gateLabel} <ArrowRight size={15} />
                </Link>
              </div>
            </div>
          );
        }
        if (nextLesson) {
          return (
            <div className="card p-5 mb-8 bg-gradient-to-r from-primary-600 to-indigo-700 shadow-lg shadow-primary-200/50 dark:shadow-none">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0">
                    <Play size={22} className="text-white" />
                  </div>
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-widest text-white/70">Continue learning</p>
                    <p className="font-bold text-white">{nextLesson.lessonTitle}</p>
                    <p className="text-xs text-white/70">{nextLesson.courseTitle}</p>
                  </div>
                </div>
                <Link to={`/student/course/${nextLesson.courseId}`} className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-sm font-semibold text-primary-700 hover:bg-primary-50 transition-colors">
                  Continue <ArrowRight size={15} />
                </Link>
              </div>
            </div>
          );
        }
        const upcoming = upcomingSessions.find(s => {
          const start = new Date(s.session_date).getTime();
          return start > Date.now() && start - Date.now() < 3 * 24 * 60 * 60 * 1000;
        });
        if (upcoming) {
          return (
            <div className="card p-5 mb-8">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center flex-shrink-0">
                    <Video size={22} className="text-blue-600 dark:text-blue-400" />
                  </div>
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-widest text-blue-600 dark:text-blue-400">Up next</p>
                    <p className="font-bold text-slate-900 dark:text-white">{upcoming.title}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{upcoming.course?.title} · {getTimeUntilSession(upcoming)}</p>
                  </div>
                </div>
                <Link to={`/student/live-classes/${upcoming.id}`} className="btn-secondary flex items-center gap-2">
                  View Session <ArrowRight size={15} />
                </Link>
              </div>
            </div>
          );
        }
        return null;
      })()}

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Left column */}
        <div className="lg:col-span-2 space-y-6">
          {/* Weekly chart */}
          <div className="card p-6">
            <h2 className="section-title">Weekly Learning Activity</h2>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={weeklyData}>
                <defs>
                  <linearGradient id="lessonsGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2563EB" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#2563EB" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="day" tick={{ fontSize: 12, fill: '#94a3b8' }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: '#94a3b8' }} />
                <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 16px rgba(0,0,0,0.1)' }} />
                <Area type="monotone" dataKey="lessons" stroke="#2563EB" fill="url(#lessonsGrad)" strokeWidth={2} name="Lessons" />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* My Courses */}
          <div className="card p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="section-title mb-0">My Courses</h2>
              <Link to="/student/courses" className="text-sm text-primary-600 dark:text-primary-400 hover:underline flex items-center gap-1">
                View All <ArrowRight size={14} />
              </Link>
            </div>

            {loading ? (
              <div className="space-y-3">
                {[1, 2].map(i => <div key={i} className="h-20 bg-slate-100 dark:bg-slate-700 rounded-xl animate-pulse" />)}
              </div>
            ) : enrollments.length === 0 ? (
              <EmptyState
                icon={BookOpen}
                title="No courses enrolled yet"
                description="Browse our Python courses and start learning today."
                action={<Link to="/courses" className="btn-primary text-sm">Browse Courses</Link>}
              />
            ) : (
              <div className="space-y-3">
                {enrollments.map(({ id, course, progress_percentage }) => (
                  <div key={id} className="flex items-center gap-4 p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                    <div className="w-11 h-11 rounded-xl bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center flex-shrink-0">
                      <BookOpen size={18} className="text-primary-600 dark:text-primary-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-slate-900 dark:text-white text-sm truncate">{course.title}</p>
                      <div className="flex items-center gap-3 mt-1.5">
                        <ProgressBar value={progress_percentage ?? 0} size="sm" className="flex-1" />
                        <span className="text-xs text-slate-500 flex-shrink-0">{Math.round(progress_percentage ?? 0)}%</span>
                      </div>
                    </div>
                    <Link to={`/student/course/${course.id}`} className="btn-ghost flex items-center gap-1 text-xs py-1.5 px-3 flex-shrink-0">
                      <Play size={12} /> Continue
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right column */}
        <div className="space-y-6">
          {/* Live Now Banner */}
          {liveSessions.length > 0 && (
            <div className="card p-4 ring-2 ring-red-500 bg-red-50 dark:bg-red-900/20">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
                <span className="text-sm font-bold text-red-700 dark:text-red-300">Live Now</span>
              </div>
              {liveSessions.map(session => (
                <div key={session.id} className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-slate-900 dark:text-white text-sm">{session.title}</p>
                    <p className="text-xs text-slate-500">{session.course?.title}</p>
                  </div>
                  {session.google_meet_url && isSessionJoinable(session) && (
                    <a
                      href={session.google_meet_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn-primary text-xs flex items-center gap-1.5"
                    >
                      <Video size={12} /> Join
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Upcoming Live Classes */}
          {upcomingSessions.length > 0 && (
            <div className="card p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-bold text-slate-900 dark:text-white">Upcoming Classes</h2>
                <Link to="/student/live-classes" className="text-xs text-primary-600 dark:text-primary-400 hover:underline">View All</Link>
              </div>
              <div className="space-y-3">
                {upcomingSessions.map(session => (
                  <div key={session.id} className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50">
                    <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0">
                      <Video size={16} className="text-blue-600 dark:text-blue-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-900 dark:text-white truncate">{session.title}</p>
                      <p className="text-xs text-slate-500 flex items-center gap-1">
                        <Clock size={10} />
                        {getTimeUntilSession(session)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Level progress */}
          <div className="card p-6">
            <h2 className="font-bold text-slate-900 dark:text-white mb-4">Your Progress</h2>
            <div className="text-center mb-4">
              <div className="w-16 h-16 rounded-2xl gradient-bg flex items-center justify-center mx-auto mb-2 shadow-glow-blue">
                <span className="text-white font-extrabold text-xl">{profile.level}</span>
              </div>
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">Level {profile.level}</p>
            </div>
            <ProgressBar value={profile.xp_points % 500} max={500} showLabel color="teal" />
            <p className="text-xs text-slate-400 text-center mt-2">{profile.xp_points.toLocaleString()} total XP</p>
          </div>

          {/* Quick actions */}
          <div className="card p-6">
            <h2 className="font-bold text-slate-900 dark:text-white mb-4">Quick Actions</h2>
            <div className="space-y-1">
              {[
                { label: 'Live Classes', to: '/student/live-classes', icon: Video },
                { label: 'Take a Quiz', to: '/student/quizzes', icon: Trophy },
                { label: 'View Assignments', to: '/student/assignments', icon: CheckCircle },
              ].map(({ label, to, icon: Icon }) => (
                <Link
                  key={to}
                  to={to}
                  className="flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                >
                  <Icon size={16} className="text-primary-600 dark:text-primary-400 flex-shrink-0" />
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{label}</span>
                  <ArrowRight size={14} className="ml-auto text-slate-400" />
                </Link>
              ))}
            </div>
          </div>

          {/* Announcements */}
          <div className="card p-6">
            <h2 className="font-bold text-slate-900 dark:text-white mb-4">Announcements</h2>
            {announcements.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-4">No announcements yet.</p>
            ) : (
              <div className="space-y-3">
                {announcements.map(a => (
                  <div key={a.id} className="p-3 rounded-xl bg-primary-50 dark:bg-primary-900/20 border border-primary-100 dark:border-primary-800">
                    <p className="text-sm font-semibold text-slate-900 dark:text-white mb-1 line-clamp-1">{a.title}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2">{a.content}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Notifications */}
          {notifications.length > 0 && (
            <div className="card p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-bold text-slate-900 dark:text-white">Notifications</h2>
                {unreadCount > 0 && (
                  <span className="text-xs bg-primary-600 text-white px-2 py-0.5 rounded-full">{unreadCount}</span>
                )}
              </div>
              <div className="space-y-2">
                {notifications.slice(0, 3).map(n => (
                  <div key={n.id} className={`p-3 rounded-xl text-xs ${!n.is_read ? 'bg-blue-50 dark:bg-blue-900/20' : 'bg-slate-50 dark:bg-slate-800/50'}`}>
                    <p className="font-medium text-slate-800 dark:text-slate-200">{n.title}</p>
                    <p className="text-slate-500 dark:text-slate-400 mt-0.5">{n.message}</p>
                  </div>
                ))}
                <Link to="/student/notifications" className="text-xs text-primary-600 dark:text-primary-400 hover:underline block text-center pt-1">
                  View all notifications
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
