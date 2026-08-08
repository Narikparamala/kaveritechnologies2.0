import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  ClipboardList,
  Clock,
  FileQuestion,
  MessageSquare,
  Plus,
  RefreshCw,
  Users,
} from 'lucide-react';
import { PageHeader } from '../../components/common/PageHeader';
import { EmptyState } from '../../components/ui/EmptyState';
import { StatCard } from '../../components/ui/StatCard';
import { useToast } from '../../components/ui/Toast';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { formatRelativeTime, getStatusColor } from '../../lib/utils';
import type { AssignmentSubmission, Course } from '../../types/database';

type RecentSubmission = AssignmentSubmission & {
  assignment: { id: string; title: string } | null;
  student_profile: { full_name: string | null } | null;
};

const EMPTY_METRICS = {
  totalStudents: 0,
  pendingSubmissions: 0,
  totalAssignments: 0,
};

export default function FacultyDashboard() {
  const { profile } = useAuth();
  const { error: toastError } = useToast();
  const [courses, setCourses] = useState<Course[]>([]);
  const [courseStudentCounts, setCourseStudentCounts] = useState<Record<string, number>>({});
  const [metrics, setMetrics] = useState(EMPTY_METRICS);
  const [recentSubmissions, setRecentSubmissions] = useState<RecentSubmission[]>([]);
  const [loading, setLoading] = useState(true);

  const loadDashboard = useCallback(async () => {
    if (!profile) return;

    setLoading(true);
    try {
      const { data: facultyCourses, error: facultyCoursesError } = await supabase
        .from('course_faculty')
        .select('course_id')
        .eq('faculty_id', profile.id);

      if (facultyCoursesError) throw facultyCoursesError;

      const courseIds = (facultyCourses ?? []).map(row => row.course_id);
      if (courseIds.length === 0) {
        setCourses([]);
        setCourseStudentCounts({});
        setMetrics(EMPTY_METRICS);
        setRecentSubmissions([]);
        return;
      }

      const [coursesResult, enrollmentsResult, assignmentsResult] = await Promise.all([
        supabase.from('courses').select('*').in('id', courseIds).order('title'),
        supabase
          .from('course_enrollments')
          .select('course_id, student_id')
          .in('course_id', courseIds)
          .eq('access_status', 'active'),
        supabase.from('assignments').select('id').in('course_id', courseIds),
      ]);

      if (coursesResult.error) throw coursesResult.error;
      if (enrollmentsResult.error) throw enrollmentsResult.error;
      if (assignmentsResult.error) throw assignmentsResult.error;

      const enrollmentCounts: Record<string, number> = {};
      const uniqueStudents = new Set<string>();
      for (const enrollment of enrollmentsResult.data ?? []) {
        enrollmentCounts[enrollment.course_id] = (enrollmentCounts[enrollment.course_id] ?? 0) + 1;
        uniqueStudents.add(enrollment.student_id);
      }

      const assignmentIds = (assignmentsResult.data ?? []).map(assignment => assignment.id);
      let pendingSubmissions = 0;
      let recent: RecentSubmission[] = [];

      if (assignmentIds.length > 0) {
        const [pendingResult, recentResult] = await Promise.all([
          supabase
            .from('assignment_submissions')
            .select('id', { count: 'exact', head: true })
            .in('assignment_id', assignmentIds)
            .eq('status', 'submitted'),
          supabase
            .from('assignment_submissions')
            .select(
              '*, assignment:assignments(id, title), student_profile:profiles!assignment_submissions_student_id_fkey(full_name)',
            )
            .in('assignment_id', assignmentIds)
            .order('submitted_at', { ascending: false })
            .limit(5),
        ]);

        if (pendingResult.error) throw pendingResult.error;
        if (recentResult.error) throw recentResult.error;

        pendingSubmissions = pendingResult.count ?? 0;
        recent = (recentResult.data ?? []) as unknown as RecentSubmission[];
      }

      setCourses((coursesResult.data ?? []) as Course[]);
      setCourseStudentCounts(enrollmentCounts);
      setMetrics({
        totalStudents: uniqueStudents.size,
        pendingSubmissions,
        totalAssignments: assignmentIds.length,
      });
      setRecentSubmissions(recent);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to load dashboard data.';
      toastError('Could not load dashboard', message);
    } finally {
      setLoading(false);
    }
  }, [profile, toastError]);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  if (!profile) return null;

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto animate-fade-in">
      <PageHeader
        title={`Welcome, ${profile.full_name?.split(' ')[0] ?? 'Faculty'}!`}
        subtitle="Your live teaching and assessment overview"
        action={
          <button
            type="button"
            onClick={() => void loadDashboard()}
            disabled={loading}
            className="btn-secondary flex items-center gap-2 px-4"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard title="My Courses" value={loading ? '—' : courses.length} icon={BookOpen} />
        <StatCard
          title="Active Students"
          value={loading ? '—' : metrics.totalStudents}
          icon={Users}
          iconBg="bg-teal-50 dark:bg-teal-900/30"
          iconColor="text-teal-600 dark:text-teal-400"
        />
        <StatCard
          title="Pending Grades"
          value={loading ? '—' : metrics.pendingSubmissions}
          icon={ClipboardList}
          iconBg="bg-amber-50 dark:bg-amber-900/30"
          iconColor="text-amber-600 dark:text-amber-400"
        />
        <StatCard
          title="Total Assignments"
          value={loading ? '—' : metrics.totalAssignments}
          icon={MessageSquare}
          iconBg="bg-emerald-50 dark:bg-emerald-900/30"
          iconColor="text-emerald-600 dark:text-emerald-400"
        />
      </div>

      <div className="card p-5 mb-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-bold text-slate-900 dark:text-white">Quick actions</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">Continue the most common faculty tasks.</p>
          </div>
          <div className="grid grid-cols-2 sm:flex gap-2">
            <Link to="/faculty/assignments/builder/new" className="btn-primary flex items-center justify-center gap-2 px-4 py-2 text-sm">
              <Plus size={16} /> Assignment
            </Link>
            <Link to="/faculty/question-bank" className="btn-secondary flex items-center justify-center gap-2 px-4 py-2 text-sm">
              <FileQuestion size={16} /> Question Bank
            </Link>
            <Link to="/faculty/submissions" className="btn-secondary flex items-center justify-center gap-2 px-4 py-2 text-sm">
              <CheckCircle2 size={16} /> Grade Work
            </Link>
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <div className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="section-title mb-0">My Courses</h2>
            <Link to="/faculty/courses" className="text-sm text-primary-600 dark:text-primary-400 flex items-center gap-1">
              View All <ArrowRight size={14} />
            </Link>
          </div>

          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(item => <div key={item} className="h-16 rounded-xl bg-slate-100 dark:bg-slate-700 animate-pulse" />)}
            </div>
          ) : courses.length === 0 ? (
            <EmptyState icon={BookOpen} title="No assigned courses" description="Contact an administrator to be assigned to a course." />
          ) : (
            <div className="space-y-3">
              {courses.slice(0, 4).map(course => (
                <Link
                  key={course.id}
                  to={`/faculty/courses/${course.id}/builder`}
                  className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-700/70 transition-colors"
                >
                  <div className="w-10 h-10 rounded-xl bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center flex-shrink-0">
                    <BookOpen size={18} className="text-primary-600 dark:text-primary-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-slate-900 dark:text-white text-sm truncate">{course.title}</p>
                    <p className="text-xs text-slate-400 capitalize">
                      {course.difficulty} · {courseStudentCounts[course.id] ?? 0} active students
                    </p>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-lg font-medium ${
                    course.is_published
                      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                      : 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-300'
                  }`}>
                    {course.is_published ? 'Live' : 'Draft'}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="section-title mb-0">Recent Submissions</h2>
            <Link to="/faculty/submissions" className="text-sm text-primary-600 dark:text-primary-400 flex items-center gap-1">
              View All <ArrowRight size={14} />
            </Link>
          </div>

          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(item => <div key={item} className="h-14 rounded-xl bg-slate-100 dark:bg-slate-700 animate-pulse" />)}
            </div>
          ) : recentSubmissions.length === 0 ? (
            <EmptyState icon={ClipboardList} title="No submissions yet" />
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-700">
              {recentSubmissions.map(submission => (
                <Link
                  key={submission.id}
                  to="/faculty/submissions"
                  className="py-3 flex items-center justify-between gap-3 hover:bg-slate-50 dark:hover:bg-slate-700/40 -mx-2 px-2 rounded-xl transition-colors"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-900 dark:text-white truncate">
                      {submission.student_profile?.full_name ?? 'Student'}
                    </p>
                    <p className="text-xs text-slate-400 truncate">{submission.assignment?.title ?? 'Assignment'}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <span className={`badge text-xs capitalize ${getStatusColor(submission.status)}`}>{submission.status}</span>
                    <p className="text-xs text-slate-400 mt-1 flex items-center justify-end gap-1">
                      <Clock size={10} /> {formatRelativeTime(submission.submitted_at)}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
