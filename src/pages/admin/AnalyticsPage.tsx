import { useState, useEffect } from 'react';
import { BarChart2, Users, BookOpen, Award, Zap, Loader2, TrendingUp, GraduationCap } from 'lucide-react';
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { PageHeader } from '../../components/common/PageHeader';
import { StatCard } from '../../components/ui/StatCard';
import { supabase } from '../../lib/supabase';

interface PlatformStats {
  totalUsers: number;
  totalStudents: number;
  totalFaculty: number;
  activeCourses: number;
  totalEnrollments: number;
  certificatesIssued: number;
  totalXP: number;
  completedEnrollments: number;
}

interface CoursePerf {
  name: string;
  students: number;
  completion: number;
}

interface RoleBreakdown {
  name: string;
  value: number;
}

const COLORS = ['#2563EB', '#14B8A6', '#F59E0B', '#EF4444', '#8B5CF6'];

export default function AnalyticsPage() {
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [coursePerf, setCoursePerf] = useState<CoursePerf[]>([]);
  const [roleBreakdown, setRoleBreakdown] = useState<RoleBreakdown[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadAnalytics(); }, []);

  async function loadAnalytics() {
    setLoading(true);
    try {
      const [profilesRes, coursesRes, enrollmentsRes, certsRes, xpRes] = await Promise.all([
        supabase.from('profiles').select('role'),
        supabase.from('courses').select('id, title, enrollment_count, is_published').eq('is_published', true),
        supabase.from('course_enrollments').select('course_id, progress_percentage, completed_at, access_status'),
        supabase.from('certificates').select('id'),
        supabase.from('xp_transactions').select('amount'),
      ]);

      const profiles = profilesRes.data ?? [];
      const courses = coursesRes.data ?? [];
      const enrollments = enrollmentsRes.data ?? [];
      const certs = certsRes.data ?? [];
      const xpTxns = xpRes.data ?? [];

      const totalStudents = profiles.filter(p => p.role === 'student').length;
      const totalFaculty = profiles.filter(p => p.role === 'faculty').length;
      const totalAdmins = profiles.filter(p => p.role === 'super_admin').length;
      const totalXP = xpTxns.reduce((s, t) => s + (t.amount || 0), 0);
      const completedEnrollments = enrollments.filter(e => e.completed_at).length;

      setStats({
        totalUsers: profiles.length,
        totalStudents,
        totalFaculty,
        activeCourses: courses.length,
        totalEnrollments: enrollments.length,
        certificatesIssued: certs.length,
        totalXP,
        completedEnrollments,
      });

      setRoleBreakdown([
        { name: 'Students', value: totalStudents },
        { name: 'Faculty', value: totalFaculty },
        { name: 'Admins', value: totalAdmins },
      ].filter(r => r.value > 0));

      const perf: CoursePerf[] = courses.slice(0, 10).map(c => {
        const courseEnr = enrollments.filter(e => e.course_id === c.id);
        const completed = courseEnr.filter(e => e.completed_at).length;
        const completionRate = courseEnr.length > 0 ? Math.round((completed / courseEnr.length) * 100) : 0;
        return {
          name: c.title.length > 25 ? c.title.slice(0, 22) + '...' : c.title,
          students: c.enrollment_count || courseEnr.length,
          completion: completionRate,
        };
      });

      setCoursePerf(perf);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }

  if (loading || !stats) {
    return (
      <div className="p-6 lg:p-8 max-w-7xl mx-auto flex items-center justify-center min-h-[400px]">
        <Loader2 className="animate-spin text-primary-500" size={32} />
      </div>
    );
  }

  const formatNum = (n: number) => n >= 1000000 ? `${(n / 1000000).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(n);

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto animate-fade-in">
      <PageHeader title="Platform Analytics" subtitle="Live platform performance metrics" icon={BarChart2} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard title="Total Users" value={formatNum(stats.totalUsers)} icon={Users} />
        <StatCard title="Active Courses" value={String(stats.activeCourses)} icon={BookOpen} iconBg="bg-teal-50 dark:bg-teal-900/30" iconColor="text-teal-600" />
        <StatCard title="Certificates Issued" value={formatNum(stats.certificatesIssued)} icon={Award} iconBg="bg-amber-50 dark:bg-amber-900/30" iconColor="text-amber-600" />
        <StatCard title="Total XP Earned" value={formatNum(stats.totalXP)} icon={Zap} iconBg="bg-emerald-50 dark:bg-emerald-900/30" iconColor="text-emerald-600" />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard title="Total Students" value={formatNum(stats.totalStudents)} icon={GraduationCap} iconBg="bg-sky-50 dark:bg-sky-900/30" iconColor="text-sky-600" />
        <StatCard title="Total Faculty" value={String(stats.totalFaculty)} icon={Users} iconBg="bg-violet-50 dark:bg-violet-900/30" iconColor="text-violet-600" />
        <StatCard title="Total Enrollments" value={formatNum(stats.totalEnrollments)} icon={TrendingUp} iconBg="bg-rose-50 dark:bg-rose-900/30" iconColor="text-rose-600" />
        <StatCard title="Course Completions" value={formatNum(stats.completedEnrollments)} icon={Award} iconBg="bg-lime-50 dark:bg-lime-900/30" iconColor="text-lime-600" />
      </div>

      <div className="grid lg:grid-cols-3 gap-6 mb-6">
        {coursePerf.length > 0 && (
          <div className="lg:col-span-2 card p-6">
            <h2 className="section-title">Course Enrollment</h2>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={coursePerf}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#94a3b8' }} interval={0} angle={-20} textAnchor="end" height={60} />
                <YAxis tick={{ fontSize: 12, fill: '#94a3b8' }} />
                <Tooltip
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 16px rgba(0,0,0,0.1)' }}
                  formatter={(value, name) => [value, name === 'students' ? 'Students' : 'Completion %']}
                />
                <Bar dataKey="students" fill="#2563EB" radius={[6, 6, 0, 0]} name="Students" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {roleBreakdown.length > 0 && (
          <div className="card p-6">
            <h2 className="section-title">User Breakdown</h2>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={roleBreakdown} cx="50%" cy="50%" innerRadius={55} outerRadius={80} paddingAngle={3} dataKey="value">
                  {roleBreakdown.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(v: any) => [v, 'Users']} />
              </PieChart>
            </ResponsiveContainer>
            <div className="space-y-2 mt-2">
              {roleBreakdown.map(({ name, value }, i) => (
                <div key={name} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                    <span className="text-slate-600 dark:text-slate-400">{name}</span>
                  </div>
                  <span className="font-medium text-slate-900 dark:text-white">{value}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {coursePerf.length > 0 && (
        <div className="card p-6">
          <h2 className="section-title">Course Completion Rates</h2>
          <ResponsiveContainer width="100%" height={Math.max(200, coursePerf.length * 45)}>
            <BarChart data={coursePerf} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 12, fill: '#94a3b8' }} domain={[0, 100]} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: '#94a3b8' }} width={180} />
              <Tooltip formatter={(v: any) => [`${v}%`, 'Completion']} />
              <Bar dataKey="completion" fill="#14B8A6" radius={[0, 6, 6, 0]} name="Completion %" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
