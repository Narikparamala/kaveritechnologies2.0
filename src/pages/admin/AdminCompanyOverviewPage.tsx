import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Users, GraduationCap, BookOpen, Video, Clock, CheckCircle, AlertTriangle, TrendingUp, DollarSign, Calendar } from 'lucide-react';
import { PageHeader } from '../../components/common/PageHeader';
import { StatCard } from '../../components/ui/StatCard';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

interface OverviewStats {
  activeFaculty: number;
  activeStudents: number;
  totalCourses: number;
  upcomingSessions: number;
  pendingGrading: number;
  openSupportRecords: number;
  monthlyPayroll: number;
}

export default function AdminCompanyOverviewPage() {
  const { profile } = useAuth();
  const [stats, setStats] = useState<OverviewStats>({
    activeFaculty: 0,
    activeStudents: 0,
    totalCourses: 0,
    upcomingSessions: 0,
    pendingGrading: 0,
    openSupportRecords: 0,
    monthlyPayroll: 0,
  });
  const [loading, setLoading] = useState(true);
  const [recentActivity, setRecentActivity] = useState<{ action: string; created_at: string; user_name?: string }[]>([]);

  useEffect(() => {
    const load = async () => {
      try {
        const [
          { count: activeFaculty },
          { count: activeStudents },
          { count: totalCourses },
          { count: upcomingSessions },
          { count: pendingGrading },
          { count: openSupportRecords },
          { data: payrollData },
          { data: activityData },
        ] = await Promise.all([
          supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'faculty').eq('is_active', true),
          supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'student').eq('is_active', true),
          supabase.from('courses').select('*', { count: 'exact', head: true }).eq('is_published', true),
          supabase.from('live_sessions').select('*', { count: 'exact', head: true }).eq('status', 'scheduled'),
          supabase.from('assignment_submissions').select('*', { count: 'exact', head: true }).eq('status', 'submitted'),
          supabase.from('student_support_records').select('*', { count: 'exact', head: true }).eq('status', 'open'),
          supabase.from('faculty_employment').select('base_salary').eq('employment_status', 'active'),
          supabase.from('activity_logs').select('action, created_at, user:profiles(full_name)').order('created_at', { ascending: false }).limit(10),
        ]);

        const monthlyPayroll = (payrollData ?? [])
          .filter(p => p.base_salary)
          .reduce((sum, p) => sum + (p.base_salary || 0), 0);

        setStats({
          activeFaculty: activeFaculty ?? 0,
          activeStudents: activeStudents ?? 0,
          totalCourses: totalCourses ?? 0,
          upcomingSessions: upcomingSessions ?? 0,
          pendingGrading: pendingGrading ?? 0,
          openSupportRecords: openSupportRecords ?? 0,
          monthlyPayroll,
        });

        setRecentActivity((activityData ?? []).map((a: any) => ({
          action: a.action,
          created_at: a.created_at,
          user_name: a.user?.full_name,
        })));
      } catch (err) {
        if (import.meta.env.DEV) console.error('Failed to load overview:', err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto animate-fade-in">
      <PageHeader
        title="Company Overview"
        subtitle="Real-time insights across your academy"
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard
          title="Active Faculty"
          value={stats.activeFaculty}
          icon={Users}
          iconBg="bg-blue-50 dark:bg-blue-900/30"
          iconColor="text-blue-600 dark:text-blue-400"
        />
        <StatCard
          title="Active Students"
          value={stats.activeStudents}
          icon={GraduationCap}
          iconBg="bg-emerald-50 dark:bg-emerald-900/30"
          iconColor="text-emerald-600 dark:text-emerald-400"
        />
        <StatCard
          title="Published Courses"
          value={stats.totalCourses}
          icon={BookOpen}
          iconBg="bg-purple-50 dark:bg-purple-900/30"
          iconColor="text-purple-600 dark:text-purple-400"
        />
        <StatCard
          title="Upcoming Classes"
          value={stats.upcomingSessions}
          icon={Video}
          iconBg="bg-amber-50 dark:bg-amber-900/30"
          iconColor="text-amber-600 dark:text-amber-400"
        />
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* Quick Actions */}
          <div className="card p-6">
            <h2 className="font-bold text-slate-900 dark:text-white mb-4">Quick Actions</h2>
            <div className="grid sm:grid-cols-2 gap-3">
              <Link to="/admin/faculty-management" className="flex items-center gap-3 p-4 rounded-xl bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
                <Users className="text-blue-600" size={20} />
                <div>
                  <p className="font-medium text-slate-900 dark:text-white text-sm">Manage Faculty</p>
                  <p className="text-xs text-slate-500">Assign courses, view workload</p>
                </div>
              </Link>
              <Link to="/admin/student-management" className="flex items-center gap-3 p-4 rounded-xl bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
                <GraduationCap className="text-emerald-600" size={20} />
                <div>
                  <p className="font-medium text-slate-900 dark:text-white text-sm">Manage Students</p>
                  <p className="text-xs text-slate-500">Progress, support records</p>
                </div>
              </Link>
              <Link to="/admin/payroll" className="flex items-center gap-3 p-4 rounded-xl bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
                <DollarSign className="text-green-600" size={20} />
                <div>
                  <p className="font-medium text-slate-900 dark:text-white text-sm">Payroll</p>
                  <p className="text-xs text-slate-500">Salary tracking & history</p>
                </div>
              </Link>
              <Link to="/admin/performance-reviews" className="flex items-center gap-3 p-4 rounded-xl bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
                <TrendingUp className="text-purple-600" size={20} />
                <div>
                  <p className="font-medium text-slate-900 dark:text-white text-sm">Performance</p>
                  <p className="text-xs text-slate-500">Reviews & ratings</p>
                </div>
              </Link>
            </div>
          </div>

          {/* Pending Tasks */}
          <div className="card p-6">
            <h2 className="font-bold text-slate-900 dark:text-white mb-4">Needs Attention</h2>
            <div className="space-y-3">
              {stats.pendingGrading > 0 && (
                <div className="flex items-center justify-between p-3 rounded-xl bg-amber-50 dark:bg-amber-900/20">
                  <div className="flex items-center gap-3">
                    <AlertTriangle size={16} className="text-amber-600" />
                    <span className="text-sm text-amber-800 dark:text-amber-200">
                      {stats.pendingGrading} submissions awaiting grading
                    </span>
                  </div>
                  <Link to="/admin/assignments" className="text-xs text-amber-700 dark:text-amber-400 hover:underline">View</Link>
                </div>
              )}
              {stats.openSupportRecords > 0 && (
                <div className="flex items-center justify-between p-3 rounded-xl bg-red-50 dark:bg-red-900/20">
                  <div className="flex items-center gap-3">
                    <AlertTriangle size={16} className="text-red-600" />
                    <span className="text-sm text-red-800 dark:text-red-200">
                      {stats.openSupportRecords} open support records
                    </span>
                  </div>
                  <Link to="/admin/student-management" className="text-xs text-red-700 dark:text-red-400 hover:underline">View</Link>
                </div>
              )}
              {stats.pendingGrading === 0 && stats.openSupportRecords === 0 && (
                <div className="flex items-center gap-3 p-4 text-center text-slate-500">
                  <CheckCircle size={16} className="text-emerald-500 mx-auto" />
                  <span className="text-sm">All caught up! No pending tasks.</span>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          {/* Payroll Summary */}
          <div className="card p-6">
            <h2 className="font-bold text-slate-900 dark:text-white mb-4">Monthly Payroll</h2>
            <p className="text-3xl font-bold text-slate-900 dark:text-white">
              {new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(stats.monthlyPayroll)}
            </p>
            <p className="text-xs text-slate-500 mt-1">For {stats.activeFaculty} active faculty</p>
            <Link to="/admin/payroll" className="text-xs text-primary-600 dark:text-primary-400 hover:underline mt-2 block">
              View payroll details
            </Link>
          </div>

          {/* Recent Activity */}
          <div className="card p-6">
            <h2 className="font-bold text-slate-900 dark:text-white mb-4">Recent Activity</h2>
            {loading ? (
              <div className="space-y-2">
                {[1, 2, 3].map(i => <div key={i} className="h-10 bg-slate-100 dark:bg-slate-700 rounded animate-pulse" />)}
              </div>
            ) : recentActivity.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-4">No recent activity</p>
            ) : (
              <div className="space-y-2">
                {recentActivity.slice(0, 5).map((a, i) => (
                  <div key={i} className="p-2 rounded-lg bg-slate-50 dark:bg-slate-800 text-xs">
                    <p className="text-slate-700 dark:text-slate-300">{a.action}</p>
                    <p className="text-slate-400 mt-0.5">
                      {a.user_name} - {new Date(a.created_at).toLocaleDateString()}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
