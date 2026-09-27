import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  Award,
  BarChart2,
  CheckCircle2,
  Code2,
  Download,
  RefreshCw,
  Search,
  Users,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { PageHeader } from '../../components/common/PageHeader';
import { EmptyState } from '../../components/ui/EmptyState';
import { ProgressBar } from '../../components/ui/ProgressBar';
import { StatCard } from '../../components/ui/StatCard';
import { useToast } from '../../components/ui/Toast';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';

type AssignedCourse = {
  id: string;
  title: string;
};

type EnrollmentRow = {
  id: string;
  course_id: string;
  student_id: string;
  enrolled_at: string;
  completed_at: string | null;
  progress_percentage: number | null;
  access_status: string | null;
  course: AssignedCourse | null;
  student: {
    id: string;
    full_name: string | null;
    email: string;
    avatar_url: string | null;
    last_active_date: string | null;
    is_active: boolean;
  } | null;
};

type AssignmentRow = {
  id: string;
  course_id: string;
  max_marks: number | null;
  status: string | null;
  is_published: boolean | null;
};

type SubmissionRow = {
  assignment_id: string;
  student_id: string;
  status: string;
  score: number | null;
  submitted_at: string | null;
  updated_at: string | null;
};

type CodingAttemptRow = {
  student_id: string;
  status: string;
  passed_test_cases: number;
  total_test_cases: number;
  last_attempted_at: string | null;
  updated_at: string | null;
};

type AttendanceRow = {
  session_id: string;
  student_id: string;
  attendance_status: string;
  joined_at: string | null;
  updated_at: string | null;
};

type StudentMetric = {
  key: string;
  studentId: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  courseId: string;
  courseTitle: string;
  progress: number;
  assignmentsCompleted: number;
  assignmentsTotal: number;
  assignmentCompletion: number;
  averageMarks: number | null;
  codingSolved: number;
  codingAttempted: number;
  attendancePresent: number;
  attendanceTotal: number;
  attendanceRate: number | null;
  lastActivity: string | null;
  state: 'completed' | 'on_track' | 'attention';
};

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;

  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim()) return message;
  }

  return 'Something went wrong.';
}

function clampPercent(value: number | null | undefined) {
  return Math.max(0, Math.min(100, Number(value ?? 0)));
}

function mostRecent(values: Array<string | null | undefined>) {
  const available = values.filter(Boolean) as string[];
  if (!available.length) return null;
  return available.sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0];
}

function daysSince(value: string | null) {
  if (!value) return Number.POSITIVE_INFINITY;
  return Math.floor((Date.now() - new Date(value).getTime()) / 86_400_000);
}

function formatActivity(value: string | null) {
  if (!value) return 'No activity yet';
  const days = daysSince(value);
  if (days <= 0) return 'Active today';
  if (days === 1) return 'Active yesterday';
  if (days < 30) return `Active ${days} days ago`;
  return `Active ${new Date(value).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`;
}

function csvCell(value: string | number | null) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

export default function StudentProgressPage() {
  const { profile: faculty } = useAuth();
  const toast = useToast();
  const [courses, setCourses] = useState<AssignedCourse[]>([]);
  const [metrics, setMetrics] = useState<StudentMetric[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [courseFilter, setCourseFilter] = useState('all');

  const loadProgress = async () => {
    if (!faculty) return;
    setLoading(true);

    try {
      const { data: facultyCourses, error: facultyCoursesError } = await supabase
        .from('course_faculty')
        .select('course_id, course:courses(id, title)')
        .eq('faculty_id', faculty.id);

      if (facultyCoursesError) throw facultyCoursesError;

      const assignedCourses = Array.from(
        new Map(
          (facultyCourses ?? [])
            .map((item: any) => item.course as AssignedCourse | null)
            .filter((course): course is AssignedCourse => Boolean(course))
            .map(course => [course.id, course] as const),
        ).values(),
      );

      setCourses(assignedCourses);
      const courseIds = assignedCourses.map(course => course.id);

      if (!courseIds.length) {
        setMetrics([]);
        return;
      }

      const { data: enrollmentData, error: enrollmentError } = await supabase
        .from('course_enrollments')
        .select(`
          id,
          course_id,
          student_id,
          enrolled_at,
          completed_at,
          progress_percentage,
          access_status,
          course:courses(id, title),
          student:profiles!course_enrollments_student_id_fkey(id, full_name, email, avatar_url, last_active_date, is_active)
        `)
        .in('course_id', courseIds)
        .neq('access_status', 'revoked')
        .order('enrolled_at', { ascending: false });

      if (enrollmentError) throw enrollmentError;

      const enrollments = (enrollmentData ?? []) as unknown as EnrollmentRow[];
      if (!enrollments.length) {
        setMetrics([]);
        return;
      }

      const studentIds = Array.from(new Set(enrollments.map(item => item.student_id)));

      const { data: assignmentData, error: assignmentError } = await supabase
        .from('assignments')
        .select('id, course_id, max_marks, status, is_published')
        .in('course_id', courseIds);

      if (assignmentError) throw assignmentError;

      const assignments = ((assignmentData ?? []) as AssignmentRow[]).filter(
        assignment => assignment.is_published || assignment.status === 'published' || assignment.status === 'closed',
      );
      const assignmentIds = assignments.map(assignment => assignment.id);

      let submissions: SubmissionRow[] = [];
      if (assignmentIds.length) {
        const { data, error } = await supabase
          .from('assignment_submissions')
          .select('assignment_id, student_id, status, score, submitted_at, updated_at')
          .in('assignment_id', assignmentIds)
          .in('student_id', studentIds);
        if (error) throw error;
        submissions = (data ?? []) as SubmissionRow[];
      }

      let codingAttempts: CodingAttemptRow[] = [];
      const codingResult = await supabase
        .from('coding_question_attempts')
        .select('student_id, status, passed_test_cases, total_test_cases, last_attempted_at, updated_at')
        .in('student_id', studentIds);
      if (!codingResult.error) codingAttempts = (codingResult.data ?? []) as CodingAttemptRow[];

      const { data: liveSessionData, error: liveSessionError } = await supabase
        .from('live_sessions')
        .select('id, course_id')
        .in('course_id', courseIds);
      if (liveSessionError) throw liveSessionError;

      const sessionCourse = new Map((liveSessionData ?? []).map((session: any) => [session.id, session.course_id]));
      const sessionIds = Array.from(sessionCourse.keys());
      let attendance: AttendanceRow[] = [];
      if (sessionIds.length) {
        const { data, error } = await supabase
          .from('session_attendance')
          .select('session_id, student_id, attendance_status, joined_at, updated_at')
          .in('session_id', sessionIds)
          .in('student_id', studentIds);
        if (error) throw error;
        attendance = (data ?? []) as AttendanceRow[];
      }

      const assignmentById = new Map(assignments.map(assignment => [assignment.id, assignment]));
      const codingByStudent = new Map<string, CodingAttemptRow[]>();
      codingAttempts.forEach(attempt => {
        codingByStudent.set(attempt.student_id, [...(codingByStudent.get(attempt.student_id) ?? []), attempt]);
      });

      const nextMetrics = enrollments
        .filter(enrollment => enrollment.student && enrollment.course)
        .map(enrollment => {
          const courseAssignments = assignments.filter(assignment => assignment.course_id === enrollment.course_id);
          const studentSubmissions = submissions.filter(submission => {
            const assignment = assignmentById.get(submission.assignment_id);
            return submission.student_id === enrollment.student_id && assignment?.course_id === enrollment.course_id;
          });

          const completedAssignmentIds = new Set(
            studentSubmissions
              .filter(submission => ['submitted', 'graded'].includes(submission.status))
              .map(submission => submission.assignment_id),
          );
          const graded = studentSubmissions.filter(submission => submission.status === 'graded' && submission.score !== null);
          const scorePercentages = graded.map(submission => {
            const maximum = Number(assignmentById.get(submission.assignment_id)?.max_marks ?? 100) || 100;
            return clampPercent((Number(submission.score) / maximum) * 100);
          });

          const studentCoding = codingByStudent.get(enrollment.student_id) ?? [];
          const solvedCoding = studentCoding.filter(attempt =>
            attempt.status === 'solved' ||
            (attempt.total_test_cases > 0 && attempt.passed_test_cases >= attempt.total_test_cases),
          ).length;

          const studentAttendance = attendance.filter(item =>
            item.student_id === enrollment.student_id && sessionCourse.get(item.session_id) === enrollment.course_id,
          );
          const presentAttendance = studentAttendance.filter(item =>
            ['attended', 'present', 'late'].includes(item.attendance_status),
          ).length;

          const progress = clampPercent(enrollment.progress_percentage);
          const assignmentCompletion = courseAssignments.length
            ? Math.round((completedAssignmentIds.size / courseAssignments.length) * 100)
            : 0;
          const lastActivity = mostRecent([
            enrollment.student?.last_active_date,
            ...studentSubmissions.map(item => item.updated_at ?? item.submitted_at),
            ...studentCoding.map(item => item.last_attempted_at ?? item.updated_at),
            ...studentAttendance.map(item => item.joined_at ?? item.updated_at),
          ]);
          const needsAttention = progress < 25 && daysSince(enrollment.enrolled_at) > 14
            || daysSince(lastActivity) > 14
            || courseAssignments.length > 0 && assignmentCompletion < 50 && daysSince(enrollment.enrolled_at) > 14;

          return {
            key: `${enrollment.student_id}-${enrollment.course_id}`,
            studentId: enrollment.student_id,
            name: enrollment.student?.full_name || 'Student',
            email: enrollment.student?.email || '',
            avatarUrl: enrollment.student?.avatar_url || null,
            courseId: enrollment.course_id,
            courseTitle: enrollment.course?.title || 'Course',
            progress,
            assignmentsCompleted: completedAssignmentIds.size,
            assignmentsTotal: courseAssignments.length,
            assignmentCompletion,
            averageMarks: scorePercentages.length
              ? Math.round(scorePercentages.reduce((total, score) => total + score, 0) / scorePercentages.length)
              : null,
            codingSolved: solvedCoding,
            codingAttempted: studentCoding.length,
            attendancePresent: presentAttendance,
            attendanceTotal: studentAttendance.length,
            attendanceRate: studentAttendance.length
              ? Math.round((presentAttendance / studentAttendance.length) * 100)
              : null,
            lastActivity,
            state: progress >= 100 || Boolean(enrollment.completed_at)
              ? 'completed'
              : needsAttention ? 'attention' : 'on_track',
          } satisfies StudentMetric;
        });

      setMetrics(nextMetrics);
    } catch (error) {
      setMetrics([]);
      toast.error('Could not load student progress', errorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadProgress();
    // The faculty id is the only value that should trigger a fresh dashboard load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [faculty?.id]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return metrics.filter(metric => {
      const matchesCourse = courseFilter === 'all' || metric.courseId === courseFilter;
      const matchesSearch = !needle
        || metric.name.toLowerCase().includes(needle)
        || metric.email.toLowerCase().includes(needle)
        || metric.courseTitle.toLowerCase().includes(needle);
      return matchesCourse && matchesSearch;
    });
  }, [courseFilter, metrics, search]);

  const summary = useMemo(() => {
    const uniqueStudents = new Set(metrics.map(metric => metric.studentId));
    const activeStudents = new Set(
      metrics.filter(metric => daysSince(metric.lastActivity) <= 14).map(metric => metric.studentId),
    );
    const attentionStudents = new Set(
      metrics.filter(metric => metric.state === 'attention').map(metric => metric.studentId),
    );
    const average = metrics.length
      ? Math.round(metrics.reduce((total, metric) => total + metric.progress, 0) / metrics.length)
      : 0;
    return {
      total: uniqueStudents.size,
      average,
      active: activeStudents.size,
      attention: attentionStudents.size,
    };
  }, [metrics]);

  const chartData = useMemo(() => courses.map(course => {
    const courseMetrics = metrics.filter(metric => metric.courseId === course.id);
    return {
      name: course.title.length > 18 ? `${course.title.slice(0, 18)}…` : course.title,
      progress: courseMetrics.length
        ? Math.round(courseMetrics.reduce((total, metric) => total + metric.progress, 0) / courseMetrics.length)
        : 0,
      students: new Set(courseMetrics.map(metric => metric.studentId)).size,
    };
  }), [courses, metrics]);

  const exportCsv = () => {
    if (!filtered.length) {
      toast.warning('Nothing to export', 'Change the filters or wait until students enroll.');
      return;
    }

    const headers = [
      'Student', 'Email', 'Course', 'Course progress', 'Assignments completed',
      'Assignments total', 'Average marks', 'Coding solved', 'Coding attempted',
      'Attendance rate', 'Last activity', 'Status',
    ];
    const rows = filtered.map(metric => [
      metric.name,
      metric.email,
      metric.courseTitle,
      `${metric.progress}%`,
      metric.assignmentsCompleted,
      metric.assignmentsTotal,
      metric.averageMarks === null ? 'Not graded' : `${metric.averageMarks}%`,
      metric.codingSolved,
      metric.codingAttempted,
      metric.attendanceRate === null ? 'No sessions' : `${metric.attendanceRate}%`,
      metric.lastActivity ?? '',
      metric.state.replace('_', ' '),
    ]);
    const csv = [headers, ...rows].map(row => row.map(csvCell).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `student-progress-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto animate-fade-in">
      <PageHeader
        title="Student Progress"
        subtitle="Track course progress, assignments, coding practice, and attendance"
        icon={BarChart2}
        action={(
          <div className="flex gap-2">
            <button className="btn-secondary" onClick={() => void loadProgress()} disabled={loading}>
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
              Refresh
            </button>
            <button className="btn-primary" onClick={exportCsv}>
              <Download size={16} />
              Export CSV
            </button>
          </div>
        )}
      />

      {loading ? (
        <div className="space-y-6">
          <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4">
            {[0, 1, 2, 3].map(item => <div key={item} className="h-32 card animate-pulse" />)}
          </div>
          <div className="h-72 card animate-pulse" />
        </div>
      ) : metrics.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No student data yet"
          description="Students will appear here after they enroll in one of your assigned courses."
        />
      ) : (
        <>
          <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
            <StatCard title="Students" value={summary.total} subtitle="Across assigned courses" icon={Users} />
            <StatCard
              title="Average progress"
              value={`${summary.average}%`}
              subtitle="Course enrollment progress"
              icon={BarChart2}
              iconColor="text-violet-600"
              iconBg="bg-violet-50 dark:bg-violet-900/30"
            />
            <StatCard
              title="Active learners"
              value={summary.active}
              subtitle="Activity in the last 14 days"
              icon={Activity}
              iconColor="text-emerald-600"
              iconBg="bg-emerald-50 dark:bg-emerald-900/30"
            />
            <StatCard
              title="Needs attention"
              value={summary.attention}
              subtitle="Low progress or inactive"
              icon={AlertTriangle}
              iconColor="text-amber-600"
              iconBg="bg-amber-50 dark:bg-amber-900/30"
            />
          </div>

          <div className="card p-5 lg:p-6 mb-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-5">
              <div>
                <h2 className="section-title mb-0">Course overview</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Average progress for each course you teach</p>
              </div>
              <span className="text-xs text-slate-400">{summary.total} unique students</span>
            </div>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={chartData} margin={{ left: -12, right: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-slate-200 dark:text-slate-700" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#94a3b8' }} />
                <Tooltip
                  formatter={(value, _name, item) => [`${Number(value ?? 0)}% (${item.payload.students} students)`, 'Average progress']}
                  contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 4px 18px rgba(0,0,0,.12)' }}
                />
                <Bar dataKey="progress" fill="#2563EB" radius={[7, 7, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="card overflow-hidden">
            <div className="p-4 border-b border-slate-100 dark:border-slate-700 flex flex-col md:flex-row gap-3">
              <div className="relative flex-1">
                <Search size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  className="input pl-10"
                  placeholder="Search student, email, or course..."
                  value={search}
                  onChange={event => setSearch(event.target.value)}
                />
              </div>
              <select className="input md:w-64" value={courseFilter} onChange={event => setCourseFilter(event.target.value)}>
                <option value="all">All courses</option>
                {courses.map(course => <option key={course.id} value={course.id}>{course.title}</option>)}
              </select>
            </div>

            {filtered.length === 0 ? (
              <EmptyState icon={Search} title="No matching students" description="Try a different search or course filter." />
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-700">
                {filtered.map(metric => (
                  <div key={metric.key} className="p-5 hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors">
                    <div className="flex flex-col xl:flex-row xl:items-center gap-5">
                      <div className="flex items-center gap-3 xl:w-72 min-w-0">
                        {metric.avatarUrl ? (
                          <img className="w-11 h-11 rounded-xl object-cover" src={metric.avatarUrl} alt="" />
                        ) : (
                          <div className="w-11 h-11 rounded-xl bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center text-primary-700 dark:text-primary-300 font-bold">
                            {metric.name.charAt(0).toUpperCase()}
                          </div>
                        )}
                        <div className="min-w-0">
                          <Link to={`/faculty/students/${metric.studentId}`} className="font-semibold text-slate-900 dark:text-white hover:text-primary-600 block truncate">
                            {metric.name}
                          </Link>
                          <p className="text-xs text-slate-400 truncate">{metric.email}</p>
                          <p className="text-xs text-primary-600 dark:text-primary-400 truncate mt-0.5">{metric.courseTitle}</p>
                        </div>
                      </div>

                      <div className="flex-1 grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        <div>
                          <div className="flex justify-between text-xs mb-1.5">
                            <span className="text-slate-500 dark:text-slate-400">Course progress</span>
                            <span className="font-semibold text-slate-700 dark:text-slate-200">{Math.round(metric.progress)}%</span>
                          </div>
                          <ProgressBar value={metric.progress} size="sm" color={metric.state === 'attention' ? 'amber' : 'blue'} />
                        </div>
                        <div className="flex items-center gap-2.5">
                          <Award size={18} className="text-violet-500" />
                          <div>
                            <p className="text-xs text-slate-500 dark:text-slate-400">Assignments</p>
                            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                              {metric.assignmentsCompleted}/{metric.assignmentsTotal}
                              {metric.averageMarks !== null && <span className="text-xs font-normal text-slate-400"> · {metric.averageMarks}% avg</span>}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2.5">
                          <Code2 size={18} className="text-cyan-500" />
                          <div>
                            <p className="text-xs text-slate-500 dark:text-slate-400">Coding practice</p>
                            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{metric.codingSolved}/{metric.codingAttempted} solved</p>
                          </div>
                        </div>
                        <div>
                          <p className="text-xs text-slate-500 dark:text-slate-400">Attendance</p>
                          <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                            {metric.attendanceRate === null ? 'No sessions yet' : `${metric.attendanceRate}% (${metric.attendancePresent}/${metric.attendanceTotal})`}
                          </p>
                        </div>
                      </div>

                      <div className="xl:w-40 xl:text-right">
                        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${
                          metric.state === 'completed'
                            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                            : metric.state === 'attention'
                              ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
                              : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                        }`}>
                          {metric.state === 'completed' ? <CheckCircle2 size={13} /> : metric.state === 'attention' ? <AlertTriangle size={13} /> : <Activity size={13} />}
                          {metric.state === 'completed' ? 'Completed' : metric.state === 'attention' ? 'Needs attention' : 'On track'}
                        </span>
                        <p className="text-[11px] text-slate-400 mt-1.5">{formatActivity(metric.lastActivity)}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
