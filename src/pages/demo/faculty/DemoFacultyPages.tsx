import { Link } from 'react-router-dom';
import {
  BookOpen, Users, ClipboardList, MessageSquare, BarChart2,
  Megaphone, Plus, Edit2, Trash2, Star, CheckCircle, Clock, Calendar,
  HelpCircle, FolderKanban, FileText, Bell, User, Settings, Lock
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { PageHeader } from '../../../components/common/PageHeader';
import { StatCard } from '../../../components/ui/StatCard';
import { ProgressBar } from '../../../components/ui/ProgressBar';
import { Badge } from '../../../components/ui/Badge';
import { useDemo } from '../../../contexts/DemoContext';
import {
  DEMO_FACULTY, DEMO_FACULTY_COURSES, DEMO_STUDENT_PROGRESS,
  DEMO_SUBMISSIONS, DEMO_ANNOUNCEMENTS, DEMO_CALENDAR_EVENTS
} from '../../../data/demoData';
import { formatDate, formatRelativeTime } from '../../../lib/utils';

function LockedAction({ label, icon: Icon }: { label: string; icon?: any }) {
  const demo = useDemo()!;
  return (
    <button onClick={() => demo.requireAuth()} className="btn-primary text-sm flex items-center gap-2">
      {Icon && <Icon size={14} />} {label}
    </button>
  );
}

export function DemoFacultyDashboard() {
  const demo = useDemo()!;
  const chartData = DEMO_FACULTY_COURSES.map(c => ({ name: c.title.split(':')[0], completion: c.completion, students: c.students }));

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto animate-fade-in">
      <PageHeader title={`Welcome, ${DEMO_FACULTY.full_name.split(' ')[0]}!`} subtitle="Faculty Demo Dashboard" />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard title="Assigned Courses" value={2} icon={BookOpen} />
        <StatCard title="Total Students" value={86} icon={Users} iconBg="bg-teal-50 dark:bg-teal-900/30" iconColor="text-teal-600 dark:text-teal-400" />
        <StatCard title="Pending Grades" value={14} icon={ClipboardList} iconBg="bg-amber-50 dark:bg-amber-900/30" iconColor="text-amber-600 dark:text-amber-400" />
        <StatCard title="Avg Completion" value="64%" icon={BarChart2} iconBg="bg-emerald-50 dark:bg-emerald-900/30" iconColor="text-emerald-600 dark:text-emerald-400" />
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* My Courses */}
        <div className="card p-6">
          <h2 className="section-title">Assigned Courses</h2>
          <div className="space-y-3">
            {DEMO_FACULTY_COURSES.map(c => (
              <div key={c.id} className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50">
                <div className="w-10 h-10 rounded-xl bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center flex-shrink-0">
                  <BookOpen size={18} className="text-primary-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-slate-900 dark:text-white text-sm truncate">{c.title}</p>
                  <p className="text-xs text-slate-400">{c.students} students · {c.completion}% avg completion</p>
                </div>
                <Badge variant="success" className="text-xs">Live</Badge>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Submissions */}
        <div className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="section-title mb-0">Recent Submissions</h2>
            <Link to="/demo/faculty/submissions" className="text-sm text-primary-600 hover:underline">View all</Link>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-700">
            {DEMO_SUBMISSIONS.slice(0, 4).map(sub => (
              <div key={sub.id} className="py-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-slate-900 dark:text-white">{sub.student}</p>
                  <p className="text-xs text-slate-400">{sub.assignment}</p>
                </div>
                <div className="text-right">
                  <Badge variant={sub.status === 'graded' ? 'success' : 'info'} className="text-xs capitalize">{sub.status}</Badge>
                  <p className="text-xs text-slate-400 mt-1">{formatRelativeTime(sub.submitted)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Course completion chart */}
        <div className="card p-6 lg:col-span-2">
          <h2 className="section-title">Course Completion Overview</h2>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#94a3b8' }} />
              <YAxis tick={{ fontSize: 12, fill: '#94a3b8' }} domain={[0, 100]} />
              <Tooltip formatter={(v: any) => [`${v}%`, 'Completion']} contentStyle={{ borderRadius: '12px', border: 'none' }} />
              <Bar dataKey="completion" fill="#2563EB" radius={[6, 6, 0, 0]} name="Completion %" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

export function DemoFacultyCoursesPage() {
  const demo = useDemo()!;
  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto animate-fade-in">
      <PageHeader title="My Courses" subtitle="Courses you are assigned to teach" icon={BookOpen} />
      <div className="grid sm:grid-cols-2 gap-6">
        {DEMO_FACULTY_COURSES.map(c => (
          <div key={c.id} className="card-hover overflow-hidden">
            <div className="h-36 bg-gradient-to-br from-primary-600 to-primary-800 flex items-center justify-center relative">
              <BookOpen size={40} className="text-white/20" />
              <div className="absolute top-3 left-3"><Badge variant="success" className="text-xs">Published</Badge></div>
            </div>
            <div className="p-5">
              <h3 className="font-bold text-slate-900 dark:text-white mb-2">{c.title}</h3>
              <div className="grid grid-cols-3 gap-2 text-center mb-4">
                <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-800"><p className="font-bold text-slate-900 dark:text-white">{c.students}</p><p className="text-xs text-slate-400">Students</p></div>
                <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-800"><p className="font-bold text-slate-900 dark:text-white">{c.lessons}</p><p className="text-xs text-slate-400">Lessons</p></div>
                <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-800"><p className="font-bold text-slate-900 dark:text-white">{c.completion}%</p><p className="text-xs text-slate-400">Avg. Done</p></div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => demo.requireAuth()} className="flex-1 btn-secondary text-xs py-2 flex items-center justify-center gap-1"><Edit2 size={12} /> Edit Course</button>
                <button onClick={() => demo.requireAuth()} className="flex-1 btn-primary text-xs py-2">View Students</button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function DemoFacultySubmissionsPage() {
  const demo = useDemo()!;
  return (
    <div className="p-6 lg:p-8 max-w-5xl mx-auto animate-fade-in">
      <PageHeader title="Student Submissions" subtitle="Review and grade assignment submissions" icon={MessageSquare} />
      <div className="card divide-y divide-slate-100 dark:divide-slate-700">
        {DEMO_SUBMISSIONS.map(sub => (
          <div key={sub.id} className="p-5 flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <p className="font-semibold text-slate-900 dark:text-white">{sub.student}</p>
                <Badge variant={sub.status === 'graded' ? 'success' : 'info'} className="text-xs capitalize">{sub.status}</Badge>
              </div>
              <p className="text-sm text-primary-600 dark:text-primary-400 mb-0.5">{sub.assignment}</p>
              <p className="text-xs text-slate-400">{sub.course} · Submitted {formatDate(sub.submitted)}</p>
              {sub.score !== undefined && <p className="text-sm text-emerald-600 font-medium mt-1">Score: {sub.score}/100</p>}
            </div>
            {sub.status !== 'graded' && (
              <button onClick={() => demo.requireAuth()} className="btn-primary text-sm py-2 px-4 flex-shrink-0 self-start flex items-center gap-1">
                <Star size={14} /> Grade
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export function DemoStudentProgressPage() {
  return (
    <div className="p-6 lg:p-8 max-w-5xl mx-auto animate-fade-in">
      <PageHeader title="Student Progress" subtitle="Track how your students are progressing" icon={BarChart2} />
      <div className="card divide-y divide-slate-100 dark:divide-slate-700">
        {DEMO_STUDENT_PROGRESS.map((s, i) => (
          <div key={i} className="flex items-center gap-4 px-5 py-4">
            <div className="w-9 h-9 rounded-xl bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center flex-shrink-0">
              <span className="font-bold text-primary-700 dark:text-primary-400 text-sm">{s.name.charAt(0)}</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-slate-900 dark:text-white text-sm">{s.name}</p>
              <p className="text-xs text-slate-400">{s.course}</p>
              <div className="flex items-center gap-3 mt-2">
                <ProgressBar value={s.progress} size="sm" className="flex-1" />
                <span className="text-xs text-slate-500 flex-shrink-0">{s.progress}%</span>
              </div>
            </div>
            <div className="hidden sm:block text-right text-xs text-slate-400">
              <p>{s.completed}/{s.total} lessons</p>
              <p>Active: {formatDate(s.last_active)}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function DemoFacultyAnnouncementsPage() {
  const demo = useDemo()!;
  return (
    <div className="p-6 lg:p-8 max-w-4xl mx-auto animate-fade-in">
      <PageHeader title="Announcements" subtitle="Post announcements for your course students" icon={Megaphone}
        action={<button onClick={() => demo.requireAuth()} className="btn-primary flex items-center gap-2"><Plus size={14} /> New Announcement</button>}
      />
      <div className="space-y-4">
        {DEMO_ANNOUNCEMENTS.map(a => (
          <div key={a.id} className="card p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1">
                <h3 className="font-bold text-slate-900 dark:text-white mb-1">{a.title}</h3>
                <p className="text-xs text-slate-400 mb-3">{formatRelativeTime(a.created_at)}</p>
                <p className="text-sm text-slate-600 dark:text-slate-400">{a.content}</p>
              </div>
              <button onClick={() => demo.requireAuth()} className="btn-ghost py-1.5 px-2 text-red-400"><Trash2 size={14} /></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function DemoLockedPage({ title, icon: Icon, message }: { title: string; icon: any; message: string }) {
  const demo = useDemo()!;
  return (
    <div className="p-6 lg:p-8 max-w-3xl mx-auto animate-fade-in">
      <PageHeader title={title} icon={Icon} />
      <div className="card p-12 text-center">
        <div className="w-16 h-16 rounded-2xl bg-primary-50 dark:bg-primary-900/30 flex items-center justify-center mx-auto mb-4">
          <Icon size={28} className="text-primary-600 dark:text-primary-400" />
        </div>
        <h3 className="font-bold text-slate-900 dark:text-white mb-2">Demo Preview</h3>
        <p className="text-slate-500 dark:text-slate-400 text-sm mb-6 max-w-sm mx-auto">{message}</p>
        <button onClick={() => demo.requireAuth()} className="btn-primary">Create Account for Full Access</button>
      </div>
    </div>
  );
}

export function DemoCourseBuildPage() {
  return <DemoLockedPage title="Course Builder" icon={BookOpen} message="Build chapters, lessons, add videos, markdown notes, code examples, and resources. Sign in as faculty to access the full course builder." />;
}

export function DemoFacultyLessonsPage() {
  return <DemoLockedPage title="Lesson Manager" icon={FileText} message="Create, edit, reorder, and publish lessons with video, markdown notes, code examples, and downloadable resources." />;
}

export function DemoFacultyAssignmentsPage() {
  const demo = useDemo()!;
  const assignments = [
    { title: 'Build a Student Grade Calculator', due: '2026-07-11', submissions: 18, graded: 9, status: 'active' },
    { title: 'Number Guessing Game', due: '2026-07-05', submissions: 34, graded: 34, status: 'closed' },
    { title: 'To-Do List CLI App', due: '2026-07-18', submissions: 4, graded: 0, status: 'active' },
  ];
  return (
    <div className="p-6 lg:p-8 max-w-5xl mx-auto animate-fade-in">
      <PageHeader title="Assignments" subtitle="Manage course assignments" icon={ClipboardList}
        action={<button onClick={() => demo.requireAuth()} className="btn-primary flex items-center gap-2"><Plus size={14} /> New Assignment</button>}
      />
      <div className="card divide-y divide-slate-100 dark:divide-slate-700">
        {assignments.map(a => (
          <div key={a.title} className="flex items-center gap-4 px-5 py-4">
            <div className="flex-1">
              <p className="font-medium text-slate-900 dark:text-white">{a.title}</p>
              <p className="text-xs text-slate-400">Due: {a.due} · {a.submissions} submissions · {a.graded} graded</p>
            </div>
            <Badge variant={a.status === 'active' ? 'success' : 'default'} className="capitalize text-xs">{a.status}</Badge>
            <button onClick={() => demo.requireAuth()} className="btn-ghost py-1.5 px-2"><Edit2 size={14} /></button>
          </div>
        ))}
      </div>
    </div>
  );
}

export function DemoFacultyQuizzesPage() {
  return <DemoLockedPage title="Quiz Manager" icon={HelpCircle} message="Create quizzes, add MCQ/true-false/coding questions, set pass percentage, and publish for your students." />;
}

export function DemoFacultyProjectsPage() {
  return <DemoLockedPage title="Projects" icon={FolderKanban} message="Create project briefs, review student submissions, and provide feedback on project work." />;
}

export function DemoFacultyProfilePage() {
  const demo = useDemo()!;
  return (
    <div className="p-6 lg:p-8 max-w-2xl mx-auto animate-fade-in">
      <PageHeader title="Profile" icon={User} />
      <div className="card p-6">
        <div className="flex items-center gap-4 mb-6">
          <div className="w-16 h-16 rounded-2xl bg-teal-100 dark:bg-teal-900/30 flex items-center justify-center">
            <span className="text-2xl font-bold text-teal-700 dark:text-teal-400">{DEMO_FACULTY.full_name.charAt(0)}</span>
          </div>
          <div>
            <div className="flex items-center gap-2"><h2 className="font-bold text-slate-900 dark:text-white">{DEMO_FACULTY.full_name}</h2><span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-lg font-bold">DEMO</span></div>
            <p className="text-sm text-slate-500">Python Trainer · {DEMO_FACULTY.email}</p>
            <p className="text-xs text-slate-400 mt-1">{DEMO_FACULTY.bio}</p>
          </div>
        </div>
        <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-900/20 text-center">
          <p className="text-sm text-amber-700 dark:text-amber-400"><button onClick={() => demo.requireAuth()} className="underline">Create a faculty account</button> to set up your real profile and manage your courses.</p>
        </div>
      </div>
    </div>
  );
}

export function DemoFacultySettingsPage() {
  const demo = useDemo()!;
  return (
    <div className="p-6 lg:p-8 max-w-2xl mx-auto animate-fade-in">
      <PageHeader title="Settings" icon={Settings} />
      <div className="card p-8 text-center">
        <Lock size={32} className="text-slate-300 mx-auto mb-4" />
        <h3 className="font-bold text-slate-900 dark:text-white mb-2">Settings require an account</h3>
        <p className="text-slate-500 text-sm mb-6">Sign in to manage your faculty account settings.</p>
        <button onClick={() => demo.requireAuth()} className="btn-primary">Create Account</button>
      </div>
    </div>
  );
}

export function DemoFacultyCalendarPage() {
  const now = new Date();
  return (
    <div className="p-6 lg:p-8 max-w-4xl mx-auto animate-fade-in">
      <PageHeader title="Calendar" subtitle="Schedule and upcoming events" icon={Calendar} />
      <div className="card p-6">
        <h2 className="font-bold text-slate-900 dark:text-white mb-4">{now.toLocaleString('default', { month: 'long', year: 'numeric' })}</h2>
        <div className="space-y-3">
          {DEMO_CALENDAR_EVENTS.map(ev => (
            <div key={ev.date + ev.title} className="flex items-center gap-4 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50">
              <div className="text-center flex-shrink-0 w-12">
                <p className="text-xs text-slate-400">{new Date(ev.date).toLocaleDateString('en-IN', { month: 'short' })}</p>
                <p className="font-bold text-slate-900 dark:text-white">{new Date(ev.date).getDate()}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-slate-900 dark:text-white">{ev.title}</p>
                <p className="text-xs text-slate-400 capitalize">{ev.type}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function DemoFacultyNotificationsPage() {
  return (
    <div className="p-6 lg:p-8 max-w-3xl mx-auto animate-fade-in">
      <PageHeader title="Notifications" icon={Bell} />
      <div className="card divide-y divide-slate-100 dark:divide-slate-700">
        {[
          { title: 'Submission received', msg: 'Kiran Kumar submitted Assignment: Grade Calculator', time: '2h ago', unread: true },
          { title: 'New enrollment', msg: '3 new students enrolled in Python Full Stack Development', time: '5h ago', unread: true },
          { title: 'Quiz completed', msg: 'Anjali Desai scored 95% on Python Basics Quiz', time: '1d ago', unread: false },
        ].map((n, i) => (
          <div key={i} className={`flex items-start gap-4 px-5 py-4 ${n.unread ? 'bg-primary-50/40 dark:bg-primary-900/10' : ''}`}>
            {n.unread && <div className="w-2 h-2 bg-primary-500 rounded-full mt-2 flex-shrink-0" />}
            {!n.unread && <div className="w-2 flex-shrink-0" />}
            <div>
              <p className="text-sm font-medium text-slate-900 dark:text-white">{n.title}</p>
              <p className="text-xs text-slate-500 mt-0.5">{n.msg}</p>
              <p className="text-xs text-slate-400 mt-1">{n.time}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
