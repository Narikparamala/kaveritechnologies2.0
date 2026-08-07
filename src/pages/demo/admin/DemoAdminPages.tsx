import {
  Users, BookOpen, Award, BarChart2, Activity, GraduationCap,
  Link2, ClipboardList, HelpCircle, FolderKanban, Megaphone, Trophy,
  HardDrive, Settings, Shield, User, TrendingUp, Plus, Edit2, Trash2,
  MoreVertical, Lock, Bell
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend
} from 'recharts';
import { PageHeader } from '../../../components/common/PageHeader';
import { StatCard } from '../../../components/ui/StatCard';
import { Badge } from '../../../components/ui/Badge';
import { useDemo } from '../../../contexts/DemoContext';
import {
  DEMO_ADMIN_STATS, DEMO_ADMIN_USERS, DEMO_ADMIN_COURSES,
  DEMO_MONTHLY_DATA, DEMO_ADMIN, DEMO_ANNOUNCEMENTS
} from '../../../data/demoData';
import { formatDate, getDifficultyColor } from '../../../lib/utils';

const PIE_COLORS = ['#2563EB', '#14B8A6', '#EF4444'];

function LockedButton({ label, className = '' }: { label: string; className?: string }) {
  const demo = useDemo()!;
  return (
    <button onClick={() => demo.requireAuth()} className={`btn-primary text-sm flex items-center gap-2 ${className}`}>
      {label}
    </button>
  );
}

function DemoLockedSection({ title, icon: Icon, msg }: { title: string; icon: any; msg: string }) {
  const demo = useDemo()!;
  return (
    <div className="p-6 lg:p-8 max-w-3xl mx-auto animate-fade-in">
      <PageHeader title={title} icon={Icon} />
      <div className="card p-12 text-center">
        <div className="w-16 h-16 rounded-2xl bg-primary-50 dark:bg-primary-900/30 flex items-center justify-center mx-auto mb-4">
          <Icon size={28} className="text-primary-600 dark:text-primary-400" />
        </div>
        <h3 className="font-bold text-slate-900 dark:text-white mb-2">Demo Preview</h3>
        <p className="text-slate-500 dark:text-slate-400 text-sm mb-6 max-w-sm mx-auto">{msg}</p>
        <button onClick={() => demo.requireAuth()} className="btn-primary">Create Account for Full Access</button>
      </div>
    </div>
  );
}

export function DemoAdminDashboard() {
  const demo = useDemo()!;
  const diffData = [
    { name: 'Beginner', value: 3 },
    { name: 'Intermediate', value: 4 },
    { name: 'Advanced', value: 1 },
  ];

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto animate-fade-in">
      <PageHeader title="Platform Overview" subtitle="Super Admin Demo Dashboard — Static Preview" icon={BarChart2} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard title="Total Users" value={DEMO_ADMIN_STATS.total_users.toLocaleString()} icon={Users} />
        <StatCard title="Faculty Members" value={DEMO_ADMIN_STATS.faculty} icon={Users} iconBg="bg-teal-50 dark:bg-teal-900/30" iconColor="text-teal-600 dark:text-teal-400" />
        <StatCard title="Published Courses" value={DEMO_ADMIN_STATS.published_courses} icon={BookOpen} iconBg="bg-emerald-50 dark:bg-emerald-900/30" iconColor="text-emerald-600 dark:text-emerald-400" />
        <StatCard title="Certificates Issued" value={DEMO_ADMIN_STATS.certificates} icon={Award} iconBg="bg-amber-50 dark:bg-amber-900/30" iconColor="text-amber-600 dark:text-amber-400" />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard title="Total Students" value={DEMO_ADMIN_STATS.students.toLocaleString()} icon={GraduationCap} iconBg="bg-primary-50 dark:bg-primary-900/30" iconColor="text-primary-600" />
        <StatCard title="Enrollments" value={DEMO_ADMIN_STATS.enrollments.toLocaleString()} icon={BookOpen} iconBg="bg-teal-50 dark:bg-teal-900/30" iconColor="text-teal-600" />
        <StatCard title="Submissions" value={DEMO_ADMIN_STATS.submissions} icon={ClipboardList} iconBg="bg-emerald-50 dark:bg-emerald-900/30" iconColor="text-emerald-600" />
        <StatCard title="Platform Growth" value={`+${DEMO_ADMIN_STATS.growth_percent}%`} icon={TrendingUp} iconBg="bg-amber-50 dark:bg-amber-900/30" iconColor="text-amber-600" />
      </div>

      <div className="grid lg:grid-cols-3 gap-6 mb-6">
        <div className="lg:col-span-2 card p-6">
          <h2 className="section-title">Monthly Growth (Enrollments)</h2>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={DEMO_MONTHLY_DATA}>
              <defs>
                <linearGradient id="adminGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#2563EB" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#2563EB" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#94a3b8' }} />
              <YAxis tick={{ fontSize: 12, fill: '#94a3b8' }} />
              <Tooltip contentStyle={{ borderRadius: '12px', border: 'none' }} />
              <Area type="monotone" dataKey="enrollments" stroke="#2563EB" fill="url(#adminGrad)" strokeWidth={2} name="Enrollments" />
              <Area type="monotone" dataKey="users" stroke="#14B8A6" fill="transparent" strokeWidth={2} strokeDasharray="4 4" name="New Users" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div className="card p-6">
          <h2 className="section-title">Courses by Difficulty</h2>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={diffData} cx="50%" cy="50%" innerRadius={50} outerRadius={75} paddingAngle={3} dataKey="value">
                {diffData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i]} />)}
              </Pie>
              <Legend formatter={(v) => <span className="text-xs text-slate-600 dark:text-slate-400">{v}</span>} />
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <div className="card p-6">
          <h2 className="section-title">Recent Sign-Ups</h2>
          <div className="divide-y divide-slate-100 dark:divide-slate-700">
            {DEMO_ADMIN_USERS.slice(0, 5).map(u => (
              <div key={u.id} className="flex items-center gap-3 py-3">
                <div className="w-9 h-9 rounded-xl bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center flex-shrink-0">
                  <span className="font-bold text-primary-700 dark:text-primary-400 text-sm">{u.name.charAt(0)}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-900 dark:text-white truncate">{u.name}</p>
                  <p className="text-xs text-slate-400 truncate">{u.email}</p>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-lg capitalize ${u.role === 'faculty' ? 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400' : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400'}`}>{u.role}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="card p-6">
          <h2 className="section-title">Recent Activity</h2>
          <div className="space-y-3">
            {[
              { icon: Activity, text: 'New student enrolled: Python Fundamentals', time: '5m ago', color: 'text-emerald-500' },
              { icon: Award, text: 'Certificate issued to Sneha Pillai', time: '1h ago', color: 'text-amber-500' },
              { icon: Users, text: '3 new users registered today', time: '2h ago', color: 'text-primary-500' },
              { icon: TrendingUp, text: 'Quiz completed with 92% score', time: '3h ago', color: 'text-teal-500' },
              { icon: BookOpen, text: 'New lesson published in Python OOP', time: '5h ago', color: 'text-primary-500' },
            ].map(({ icon: Icon, text, time, color }, i) => (
              <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50">
                <Icon size={15} className={`${color} flex-shrink-0`} />
                <p className="text-sm text-slate-700 dark:text-slate-300 flex-1">{text}</p>
                <span className="text-xs text-slate-400 flex-shrink-0">{time}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function DemoAdminUsersPage() {
  const demo = useDemo()!;
  const ROLE_COLORS: Record<string, any> = { student: 'default', faculty: 'teal', super_admin: 'error' };
  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto animate-fade-in">
      <PageHeader title="All Users" subtitle={`${DEMO_ADMIN_STATS.total_users} total users (demo preview)`} icon={Users} />
      <div className="card divide-y divide-slate-100 dark:divide-slate-700">
        {DEMO_ADMIN_USERS.map(u => (
          <div key={u.id} className="flex items-center gap-4 px-5 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/50">
            <div className="w-10 h-10 rounded-xl bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center flex-shrink-0">
              <span className="font-bold text-primary-700 dark:text-primary-400">{u.name.charAt(0)}</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-slate-900 dark:text-white text-sm truncate">{u.name}</p>
              <p className="text-xs text-slate-400 truncate">{u.email}</p>
            </div>
            <div className="hidden sm:flex items-center gap-4 text-xs text-slate-500">
              <span>{u.xp.toLocaleString()} XP</span>
              <span>Lv. {u.level}</span>
            </div>
            <Badge variant={ROLE_COLORS[u.role] ?? 'default'} className="capitalize text-xs">{u.role.replace('_', ' ')}</Badge>
            <button onClick={() => demo.requireAuth()} className="btn-ghost py-1 px-2 opacity-50 hover:opacity-100"><MoreVertical size={14} /></button>
          </div>
        ))}
      </div>
    </div>
  );
}

export function DemoAdminStudentsPage() {
  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto animate-fade-in">
      <PageHeader title="Students" subtitle={`${DEMO_ADMIN_STATS.students} registered students (demo)`} icon={GraduationCap} />
      <div className="card divide-y divide-slate-100 dark:divide-slate-700">
        {DEMO_ADMIN_USERS.filter(u => u.role === 'student').map(u => (
          <div key={u.id} className="flex items-center gap-4 px-5 py-4">
            <div className="w-10 h-10 rounded-xl bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center flex-shrink-0">
              <span className="font-bold text-primary-700 dark:text-primary-400">{u.name.charAt(0)}</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-slate-900 dark:text-white">{u.name}</p>
              <p className="text-xs text-slate-400">{u.email}</p>
            </div>
            <div className="hidden sm:flex gap-6 text-xs text-center text-slate-500">
              <div><p className="font-bold text-slate-900 dark:text-white">{u.xp.toLocaleString()}</p><p>XP</p></div>
              <div><p className="font-bold text-slate-900 dark:text-white">Lv.{u.level}</p><p>Level</p></div>
              <div><p className="font-bold text-slate-900 dark:text-white">{formatDate(u.joined)}</p><p>Joined</p></div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function DemoAdminFacultyPage() {
  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto animate-fade-in">
      <PageHeader title="Faculty Members" subtitle={`${DEMO_ADMIN_STATS.faculty} faculty (demo)`} icon={Users} />
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {DEMO_ADMIN_USERS.filter(u => u.role === 'faculty').map(u => (
          <div key={u.id} className="card p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-12 h-12 rounded-2xl bg-teal-100 dark:bg-teal-900/30 flex items-center justify-center">
                <span className="text-lg font-bold text-teal-700 dark:text-teal-400">{u.name.charAt(0)}</span>
              </div>
              <div>
                <p className="font-bold text-slate-900 dark:text-white">{u.name}</p>
                <Badge variant="teal" className="text-xs">Faculty</Badge>
              </div>
            </div>
            <p className="text-xs text-slate-400">{u.email}</p>
            <p className="text-xs text-slate-400 mt-1">{u.xp.toLocaleString()} XP · Level {u.level}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export function DemoAdminCoursesPage() {
  const demo = useDemo()!;
  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto animate-fade-in">
      <PageHeader title="Courses" subtitle="Course management (demo)" icon={BookOpen}
        action={<button onClick={() => demo.requireAuth()} className="btn-primary flex items-center gap-2"><Plus size={14} /> New Course</button>}
      />
      <div className="card divide-y divide-slate-100 dark:divide-slate-700">
        {DEMO_ADMIN_COURSES.map(c => (
          <div key={c.id} className="flex items-center gap-4 px-5 py-4">
            <div className="w-10 h-10 rounded-xl bg-primary-50 dark:bg-primary-900/30 flex items-center justify-center flex-shrink-0">
              <BookOpen size={18} className="text-primary-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-slate-900 dark:text-white truncate">{c.title}</p>
              <p className="text-xs text-slate-400">{c.faculty} · {c.students.toLocaleString()} students</p>
            </div>
            <span className={`badge capitalize text-xs ${getDifficultyColor(c.difficulty)}`}>{c.difficulty}</span>
            <Badge variant={c.is_published ? 'success' : 'default'} className="text-xs">{c.is_published ? 'Published' : 'Draft'}</Badge>
            <button onClick={() => demo.requireAuth()} className="btn-ghost py-1 px-2 text-xs flex items-center gap-1"><Edit2 size={12} /> Edit</button>
          </div>
        ))}
      </div>
    </div>
  );
}

export function DemoAdminCourseAssignments() {
  const demo = useDemo()!;
  const assignments = [
    { course: 'Python Fundamentals', faculty: 'Dr. Kavitha Murthy' },
    { course: 'Python Intermediate', faculty: 'Priya Sharma' },
    { course: 'Python Data Science', faculty: 'Rajesh Kumar' },
  ];
  return (
    <div className="p-6 lg:p-8 max-w-4xl mx-auto animate-fade-in">
      <PageHeader title="Course Assignments" subtitle="Faculty assignments (demo)" icon={Link2}
        action={<button onClick={() => demo.requireAuth()} className="btn-primary flex items-center gap-2"><Plus size={14} /> Assign Faculty</button>}
      />
      <div className="card divide-y divide-slate-100 dark:divide-slate-700">
        {assignments.map(a => (
          <div key={a.course} className="flex items-center gap-4 px-5 py-4">
            <div className="flex-1">
              <p className="font-medium text-slate-900 dark:text-white">{a.course}</p>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-teal-100 dark:bg-teal-900/30 flex items-center justify-center"><span className="text-xs font-bold text-teal-700">{a.faculty.charAt(0)}</span></div>
              <p className="text-sm text-slate-700 dark:text-slate-300">{a.faculty}</p>
            </div>
            <button onClick={() => demo.requireAuth()} className="btn-ghost py-1 px-2"><Trash2 size={14} className="text-red-400" /></button>
          </div>
        ))}
      </div>
    </div>
  );
}

export function DemoAdminAnalyticsPage() {
  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto animate-fade-in">
      <PageHeader title="Platform Analytics" subtitle="Comprehensive metrics (demo preview)" icon={BarChart2} />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard title="Total Users" value="248" icon={Users} />
        <StatCard title="Active Courses" value="8" icon={BookOpen} iconBg="bg-teal-50 dark:bg-teal-900/30" iconColor="text-teal-600" />
        <StatCard title="Certificates" value="64" icon={Award} iconBg="bg-amber-50 dark:bg-amber-900/30" iconColor="text-amber-600" />
        <StatCard title="Growth" value="+18.4%" icon={TrendingUp} iconBg="bg-emerald-50 dark:bg-emerald-900/30" iconColor="text-emerald-600" />
      </div>
      <div className="card p-6">
        <h2 className="section-title">Monthly Enrollments vs New Users</h2>
        <ResponsiveContainer width="100%" height={280}>
          <AreaChart data={DEMO_MONTHLY_DATA}>
            <defs>
              <linearGradient id="e2" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#2563EB" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#2563EB" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="u2" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#14B8A6" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#14B8A6" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#94a3b8' }} />
            <YAxis tick={{ fontSize: 12, fill: '#94a3b8' }} />
            <Tooltip contentStyle={{ borderRadius: '12px', border: 'none' }} />
            <Area type="monotone" dataKey="enrollments" stroke="#2563EB" fill="url(#e2)" strokeWidth={2} name="Enrollments" />
            <Area type="monotone" dataKey="users" stroke="#14B8A6" fill="url(#u2)" strokeWidth={2} name="New Users" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function DemoAdminCertificatesPage() {
  const demo = useDemo()!;
  const certs = [
    { student: 'Sneha Pillai', course: 'Python Fundamentals', uid: 'KTA-A1B2C3D4', date: '2026-06-28' },
    { student: 'Anjali Desai', course: 'Python Fundamentals', uid: 'KTA-E5F6G7H8', date: '2026-07-01' },
    { student: 'Rohit Verma', course: 'Python Intermediate', uid: 'KTA-I9J0K1L2', date: '2026-07-03' },
  ];
  return (
    <div className="p-6 lg:p-8 max-w-5xl mx-auto animate-fade-in">
      <PageHeader title="Certificates" subtitle="3 issued (demo)" icon={Award}
        action={<button onClick={() => demo.requireAuth()} className="btn-primary flex items-center gap-2"><Plus size={14} /> Issue Certificate</button>}
      />
      <div className="card divide-y divide-slate-100 dark:divide-slate-700">
        {certs.map(c => (
          <div key={c.uid} className="flex items-center gap-4 px-5 py-4">
            <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center"><Award size={18} className="text-amber-600" /></div>
            <div className="flex-1">
              <p className="font-medium text-slate-900 dark:text-white">{c.student}</p>
              <p className="text-xs text-slate-400">{c.course}</p>
            </div>
            <p className="text-xs font-mono text-slate-500 hidden sm:block">{c.uid}</p>
            <p className="text-xs text-slate-400">{c.date}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export function DemoAdminAnnouncementsPage() {
  const demo = useDemo()!;
  return (
    <div className="p-6 lg:p-8 max-w-4xl mx-auto animate-fade-in">
      <PageHeader title="Announcements" subtitle="Platform announcements (demo)" icon={Megaphone}
        action={<button onClick={() => demo.requireAuth()} className="btn-primary flex items-center gap-2"><Plus size={14} /> New Announcement</button>}
      />
      <div className="space-y-4">
        {DEMO_ANNOUNCEMENTS.map(a => (
          <div key={a.id} className="card p-5">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-bold text-slate-900 dark:text-white mb-1">{a.title}</h3>
                <p className="text-sm text-slate-600 dark:text-slate-400 mb-2">{a.content}</p>
                <Badge variant="success" className="text-xs">Global</Badge>
              </div>
              <button onClick={() => demo.requireAuth()} className="btn-ghost py-1 px-2"><Trash2 size={14} className="text-red-400" /></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function DemoAdminLeaderboardPage() {
  const { DEMO_LEADERBOARD } = { DEMO_LEADERBOARD: [
    { rank: 1, name: 'Anjali Desai', xp: 4250, level: 8 },
    { rank: 2, name: 'Rohit Verma', xp: 3980, level: 7 },
    { rank: 3, name: 'Sneha Pillai', xp: 3560, level: 7 },
    { rank: 4, name: 'Kiran Kumar', xp: 1250, level: 3 },
    { rank: 5, name: 'Arjun Nair', xp: 1100, level: 3 },
  ]};
  return (
    <div className="p-6 lg:p-8 max-w-3xl mx-auto animate-fade-in">
      <PageHeader title="Leaderboard" subtitle="Top students (demo)" icon={Trophy} />
      <div className="card divide-y divide-slate-100 dark:divide-slate-700">
        {DEMO_LEADERBOARD.map((l, i) => (
          <div key={l.rank} className="flex items-center gap-4 px-5 py-4">
            <div className={`w-8 text-center font-bold ${i < 3 ? 'text-amber-500' : 'text-slate-400'}`}>{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${l.rank}`}</div>
            <div className="w-9 h-9 rounded-xl bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center"><span className="font-bold text-primary-700 dark:text-primary-400 text-sm">{l.name.charAt(0)}</span></div>
            <div className="flex-1"><p className="font-medium text-slate-900 dark:text-white text-sm">{l.name}</p><p className="text-xs text-slate-400">Level {l.level}</p></div>
            <span className="font-bold text-slate-900 dark:text-white">{l.xp.toLocaleString()} XP</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function DemoAdminSettingsPage() {
  const demo = useDemo()!;
  const settings = [
    { key: 'platform_name', value: 'Kaveri Technologies Academy', desc: 'Platform display name' },
    { key: 'tagline', value: 'Learn Python. Build Projects. Become Industry Ready.', desc: 'Platform tagline' },
    { key: 'contact_email', value: 'info@kaveritech.com', desc: 'Support email' },
    { key: 'maintenance_mode', value: 'false', desc: 'Maintenance mode flag' },
  ];
  return (
    <div className="p-6 lg:p-8 max-w-3xl mx-auto animate-fade-in">
      <PageHeader title="Platform Settings" subtitle="Global settings (demo — read only)" icon={Settings}
        action={<button onClick={() => demo.requireAuth()} className="btn-primary text-sm">Edit Settings</button>}
      />
      <div className="card p-6 space-y-5">
        {settings.map(s => (
          <div key={s.key}>
            <label className="label capitalize">{s.key.replace(/_/g, ' ')}</label>
            <p className="text-xs text-slate-400 mb-1.5">{s.desc}</p>
            <div className="input bg-slate-50 dark:bg-slate-800/50 text-slate-500 cursor-not-allowed">{s.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function DemoAdminStoragePage() {
  return <DemoLockedSection title="Storage Manager" icon={HardDrive} msg="Upload, organize, and manage course thumbnails, lesson resources, student submissions, and certificates. Requires Supabase storage configuration." />;
}

export function DemoAdminRolesPage() {
  return <DemoLockedSection title="Roles & Permissions" icon={Shield} msg="Configure role-based access control, custom permissions, and manage what each role can access across the platform." />;
}

export function DemoAdminProfilePage() {
  const demo = useDemo()!;
  return (
    <div className="p-6 lg:p-8 max-w-2xl mx-auto animate-fade-in">
      <PageHeader title="Profile" icon={User} />
      <div className="card p-6">
        <div className="flex items-center gap-4 mb-6">
          <div className="w-16 h-16 rounded-2xl bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
            <span className="text-2xl font-bold text-red-700 dark:text-red-400">{DEMO_ADMIN.full_name.charAt(0)}</span>
          </div>
          <div>
            <div className="flex items-center gap-2"><h2 className="font-bold text-slate-900 dark:text-white">{DEMO_ADMIN.full_name}</h2><span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-lg font-bold">DEMO</span></div>
            <p className="text-sm text-slate-500">Super Admin · {DEMO_ADMIN.email}</p>
          </div>
        </div>
        <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-900/20 text-center">
          <p className="text-sm text-amber-700 dark:text-amber-400"><button onClick={() => demo.requireAuth()} className="underline">Create an admin account</button> to manage the real platform.</p>
        </div>
      </div>
    </div>
  );
}

export function DemoAdminNotificationsPage() {
  const demo = useDemo()!;
  return (
    <div className="p-6 lg:p-8 max-w-3xl mx-auto animate-fade-in">
      <PageHeader title="Notifications" subtitle="Platform notifications (demo)" icon={Bell} />
      <div className="card divide-y divide-slate-100 dark:divide-slate-700">
        {[
          { msg: '5 new users registered this week', time: '1h ago', unread: true },
          { msg: 'Python Data Science course reached 100 enrollments', time: '3h ago', unread: true },
          { msg: 'Platform maintenance completed successfully', time: '1d ago', unread: false },
          { msg: 'New faculty account awaiting approval', time: '2d ago', unread: false },
        ].map((n, i) => (
          <div key={i} className={`flex items-start gap-4 px-5 py-4 ${n.unread ? 'bg-primary-50/40 dark:bg-primary-900/10' : ''}`}>
            {n.unread && <div className="w-2 h-2 bg-primary-500 rounded-full mt-2 flex-shrink-0" />}
            {!n.unread && <div className="w-2 flex-shrink-0" />}
            <div>
              <p className="text-sm text-slate-700 dark:text-slate-300">{n.msg}</p>
              <p className="text-xs text-slate-400 mt-1">{n.time}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function DemoAdminAssignmentsPage() {
  return <DemoLockedSection title="Assignment Manager" icon={ClipboardList} msg="View and manage all course assignments, submissions, and grading across the entire platform." />;
}

export function DemoAdminQuizzesPage() {
  return <DemoLockedSection title="Quiz Manager" icon={HelpCircle} msg="Create, edit, and manage quizzes, questions, and quiz analytics across all courses." />;
}

export function DemoAdminProjectsPage() {
  return <DemoLockedSection title="Projects Manager" icon={FolderKanban} msg="Manage project listings, review student submissions, and track project completion rates." />;
}
