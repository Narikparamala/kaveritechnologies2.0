import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, Users, ClipboardList, MessageSquare, ArrowRight, Clock } from 'lucide-react';
import { StatCard } from '../../components/ui/StatCard';
import { PageHeader } from '../../components/common/PageHeader';
import { EmptyState } from '../../components/ui/EmptyState';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { formatRelativeTime } from '../../lib/utils';
import type { Course, AssignmentSubmission, Assignment } from '../../types/database';

export default function FacultyDashboard() {
  const { profile } = useAuth();
  const [courses, setCourses] = useState<Course[]>([]);
  const [totalStudents, setTotalStudents] = useState(0);
  const [pendingSubmissions, setPendingSubmissions] = useState(0);
  const [recentSubs, setRecentSubs] = useState<(AssignmentSubmission & { assignment: Assignment; student_profile: any })[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile) return;
    const load = async () => {
      const { data: cfData } = await supabase.from('course_faculty').select('course_id').eq('faculty_id', profile.id);
      const courseIds = (cfData ?? []).map((c: any) => c.course_id);

      const [{ data: cData }, { data: enrData }] = await Promise.all([
        courseIds.length ? supabase.from('courses').select('*').in('id', courseIds) : { data: [] },
        courseIds.length ? supabase.from('course_enrollments').select('student_id').in('course_id', courseIds) : { data: [] },
      ]);

      setCourses((cData ?? []) as Course[]);
      setTotalStudents(new Set((enrData ?? []).map((e: any) => e.student_id)).size);

      if (courseIds.length) {
        const { data: asgData } = await supabase.from('assignments').select('id').in('course_id', courseIds);
        const asgIds = (asgData ?? []).map((a: any) => a.id);
        if (asgIds.length) {
          const [{ data: pending }, { data: recent }] = await Promise.all([
            supabase.from('assignment_submissions').select('id').in('assignment_id', asgIds).eq('status', 'submitted'),
            supabase.from('assignment_submissions').select('*, assignment:assignments(*), student_profile:profiles(full_name)').in('assignment_id', asgIds).order('submitted_at', { ascending: false }).limit(5),
          ]);
          setPendingSubmissions(pending?.length ?? 0);
          setRecentSubs((recent ?? []) as any);
        }
      }
      setLoading(false);
    };
    load();
  }, [profile]);

  if (!profile) return null;

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto animate-fade-in">
      <PageHeader
        title={`Welcome, ${profile.full_name?.split(' ')[0] ?? 'Faculty'}!`}
        subtitle="Manage your courses and students"
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard title="My Courses" value={courses.length} icon={BookOpen} />
        <StatCard title="Total Students" value={totalStudents} icon={Users} iconBg="bg-teal-50 dark:bg-teal-900/30" iconColor="text-teal-600 dark:text-teal-400" />
        <StatCard title="Pending Grades" value={pendingSubmissions} icon={ClipboardList} iconBg="bg-amber-50 dark:bg-amber-900/30" iconColor="text-amber-600 dark:text-amber-400" />
        <StatCard title="Total Assignments" value="—" icon={MessageSquare} iconBg="bg-emerald-50 dark:bg-emerald-900/30" iconColor="text-emerald-600 dark:text-emerald-400" />
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* My Courses */}
        <div className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="section-title mb-0">My Courses</h2>
            <Link to="/faculty/courses" className="text-sm text-primary-600 dark:text-primary-400 flex items-center gap-1">View All <ArrowRight size={14} /></Link>
          </div>
          {courses.length === 0 ? (
            <EmptyState icon={BookOpen} title="No assigned courses" description="Contact admin to get assigned to courses." />
          ) : (
            <div className="space-y-3">
              {courses.slice(0, 4).map(c => (
                <div key={c.id} className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50">
                  <div className="w-10 h-10 rounded-xl bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center flex-shrink-0">
                    <BookOpen size={18} className="text-primary-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-slate-900 dark:text-white text-sm truncate">{c.title}</p>
                    <p className="text-xs text-slate-400 capitalize">{c.difficulty} · {c.enrollment_count} students</p>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-lg font-medium ${c.is_published ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-slate-100 text-slate-500'}`}>
                    {c.is_published ? 'Live' : 'Draft'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Submissions */}
        <div className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="section-title mb-0">Recent Submissions</h2>
            <Link to="/faculty/submissions" className="text-sm text-primary-600 dark:text-primary-400 flex items-center gap-1">View All <ArrowRight size={14} /></Link>
          </div>
          {recentSubs.length === 0 ? (
            <EmptyState icon={ClipboardList} title="No submissions yet" />
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-700">
              {recentSubs.map(sub => (
                <div key={sub.id} className="py-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-slate-900 dark:text-white">{(sub.student_profile as any)?.full_name ?? 'Student'}</p>
                    <p className="text-xs text-slate-400">{(sub.assignment as any)?.title}</p>
                  </div>
                  <div className="text-right">
                    <span className="badge bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 text-xs capitalize">{sub.status}</span>
                    <p className="text-xs text-slate-400 mt-1 flex items-center gap-1"><Clock size={10} /> {formatRelativeTime(sub.submitted_at)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
