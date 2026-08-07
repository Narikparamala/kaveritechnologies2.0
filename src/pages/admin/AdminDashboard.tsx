import { useEffect, useState } from 'react';
import { Users, BookOpen, Award, BarChart2, Activity } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import { StatCard } from '../../components/ui/StatCard';
import { PageHeader } from '../../components/common/PageHeader';
import { EmptyState } from '../../components/ui/EmptyState';
import { supabase } from '../../lib/supabase';
import type { Profile, Course } from '../../types/database';

const DIFFICULTY_COLORS = ['#22C55E', '#2563EB', '#EF4444'];

const MONTHLY_DATA = [
  { month: 'Jan', enrollments: 0 },
  { month: 'Feb', enrollments: 0 },
  { month: 'Mar', enrollments: 0 },
  { month: 'Apr', enrollments: 0 },
  { month: 'May', enrollments: 0 },
  { month: 'Jun', enrollments: 0 },
  { month: 'Jul', enrollments: 0 },
];

export default function AdminDashboard() {
  const [counts, setCounts] = useState({ students: 0, faculty: 0, courses: 0, certificates: 0, enrollments: 0 });
  const [courses, setCourses] = useState<Course[]>([]);
  const [recentUsers, setRecentUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const [
        { data: students },
        { data: faculty },
        { data: cData },
        { data: certs },
        { data: users },
        { data: enrollments },
      ] = await Promise.all([
        supabase.from('profiles').select('id').eq('role', 'student'),
        supabase.from('profiles').select('id').eq('role', 'faculty'),
        supabase.from('courses').select('*').eq('is_published', true),
        supabase.from('certificates').select('id'),
        supabase.from('profiles').select('*').order('created_at', { ascending: false }).limit(8),
        supabase.from('course_enrollments').select('id'),
      ]);
      setCounts({
        students: students?.length ?? 0,
        faculty: faculty?.length ?? 0,
        courses: cData?.length ?? 0,
        certificates: certs?.length ?? 0,
        enrollments: enrollments?.length ?? 0,
      });
      setCourses((cData ?? []) as Course[]);
      setRecentUsers((users ?? []) as Profile[]);
      setLoading(false);
    };
    load();
  }, []);

  const difficultyData = [
    { name: 'Beginner', value: courses.filter(c => c.difficulty === 'beginner').length },
    { name: 'Intermediate', value: courses.filter(c => c.difficulty === 'intermediate').length },
    { name: 'Advanced', value: courses.filter(c => c.difficulty === 'advanced').length },
  ].filter(d => d.value > 0);

  const monthlyData = MONTHLY_DATA.map((m, i) => ({
    ...m,
    enrollments: i === new Date().getMonth() ? counts.enrollments : 0,
  }));

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto animate-fade-in">
      <PageHeader title="Platform Overview" subtitle="Super Admin Dashboard — Complete Platform Control" icon={BarChart2} />

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard title="Total Students" value={loading ? '—' : counts.students.toLocaleString()} icon={Users} />
        <StatCard title="Faculty Members" value={loading ? '—' : counts.faculty} icon={Users}
          iconBg="bg-teal-50 dark:bg-teal-900/30" iconColor="text-teal-600 dark:text-teal-400" />
        <StatCard title="Published Courses" value={loading ? '—' : counts.courses} icon={BookOpen}
          iconBg="bg-emerald-50 dark:bg-emerald-900/30" iconColor="text-emerald-600 dark:text-emerald-400" />
        <StatCard title="Certificates Issued" value={loading ? '—' : counts.certificates} icon={Award}
          iconBg="bg-amber-50 dark:bg-amber-900/30" iconColor="text-amber-600 dark:text-amber-400" />
      </div>

      <div className="grid lg:grid-cols-3 gap-6 mb-6">
        {/* Enrollment trend */}
        <div className="lg:col-span-2 card p-6">
          <h2 className="section-title">Total Enrollments by Month</h2>
          {counts.enrollments === 0 ? (
            <EmptyState icon={BarChart2} title="No enrollment data yet" description="Enrollment chart will populate as students join." className="py-8" />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={monthlyData}>
                <defs>
                  <linearGradient id="enrGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2563EB" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#2563EB" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#94a3b8' }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: '#94a3b8' }} />
                <Tooltip contentStyle={{ borderRadius: '12px', border: 'none' }} />
                <Area type="monotone" dataKey="enrollments" stroke="#2563EB" fill="url(#enrGrad)" strokeWidth={2} name="Enrollments" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Difficulty breakdown */}
        <div className="card p-6">
          <h2 className="section-title">Courses by Difficulty</h2>
          {difficultyData.length === 0 ? (
            <EmptyState icon={BookOpen} title="No courses yet" className="py-8" />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={difficultyData} cx="50%" cy="45%" innerRadius={50} outerRadius={75} paddingAngle={3} dataKey="value">
                  {difficultyData.map((_, i) => <Cell key={i} fill={DIFFICULTY_COLORS[i]} />)}
                </Pie>
                <Legend formatter={(v) => <span className="text-xs text-slate-600 dark:text-slate-400">{v}</span>} />
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Recent users */}
        <div className="card p-6">
          <h2 className="section-title">Recent Sign-Ups</h2>
          {recentUsers.length === 0 ? (
            <EmptyState icon={Users} title="No users yet" />
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-700">
              {recentUsers.map(u => (
                <div key={u.id} className="flex items-center gap-3 py-3">
                  <div className="w-9 h-9 rounded-xl bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center flex-shrink-0">
                    <span className="text-sm font-bold text-primary-700 dark:text-primary-400">{u.full_name?.charAt(0) ?? 'U'}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900 dark:text-white truncate">{u.full_name ?? 'Unknown'}</p>
                    <p className="text-xs text-slate-400 truncate">{u.email}</p>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-lg capitalize ${
                    u.role === 'super_admin' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' :
                    u.role === 'faculty' ? 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400' :
                    'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400'
                  }`}>
                    {u.role.replace('_', ' ')}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Summary stats */}
        <div className="card p-6">
          <h2 className="section-title">Platform Summary</h2>
          <div className="space-y-4">
            {[
              { label: 'Total Registered Users', value: counts.students + counts.faculty, icon: Users, color: 'text-primary-600' },
              { label: 'Total Enrollments', value: counts.enrollments, icon: BookOpen, color: 'text-emerald-600' },
              { label: 'Certificates Issued', value: counts.certificates, icon: Award, color: 'text-amber-600' },
              { label: 'Published Courses', value: counts.courses, icon: Activity, color: 'text-teal-600' },
            ].map(({ label, value, icon: Icon, color }) => (
              <div key={label} className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50">
                <div className="flex items-center gap-3">
                  <Icon size={16} className={color} />
                  <span className="text-sm text-slate-600 dark:text-slate-400">{label}</span>
                </div>
                <span className="font-bold text-slate-900 dark:text-white">{loading ? '—' : value.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
