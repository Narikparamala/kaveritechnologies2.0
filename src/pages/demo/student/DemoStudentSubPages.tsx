import { Link } from 'react-router-dom';
import {
  FileText, HelpCircle, FolderKanban, Trophy, Award, Download,
  Calendar, BookMarked, Bell, User, Settings, Zap, Flame,
  CheckCircle, Clock, Code, Lock
} from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { PageHeader } from '../../../components/common/PageHeader';
import { Badge } from '../../../components/ui/Badge';
import { ProgressBar } from '../../../components/ui/ProgressBar';
import { StatCard } from '../../../components/ui/StatCard';
import { useDemo } from '../../../contexts/DemoContext';
import {
  DEMO_STUDENT, DEMO_ASSIGNMENTS, DEMO_QUIZZES, DEMO_PROJECTS,
  DEMO_BADGES, DEMO_CERTIFICATE, DEMO_LEADERBOARD,
  DEMO_NOTIFICATIONS, DEMO_CALENDAR_EVENTS, DEMO_WEEKLY_ACTIVITY, DEMO_ANNOUNCEMENTS
} from '../../../data/demoData';
import { formatDate, formatRelativeTime, getDifficultyColor } from '../../../lib/utils';

function RestrictedButton({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  const demo = useDemo()!;
  return (
    <button onClick={() => demo.requireAuth()} className={`btn-primary text-sm ${className}`}>
      {children}
    </button>
  );
}

export function DemoAssignmentsPage() {
  const demo = useDemo()!;
  return (
    <div className="p-6 lg:p-8 max-w-4xl mx-auto animate-fade-in">
      <PageHeader title="Assignments" subtitle="View and submit course assignments" icon={FileText} />
      <div className="space-y-4">
        {DEMO_ASSIGNMENTS.map(a => (
          <div key={a.id} className="card p-5 flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <h3 className="font-semibold text-slate-900 dark:text-white">{a.title}</h3>
                <Badge variant={a.status === 'graded' ? 'success' : 'warning'} className="capitalize text-xs">{a.status}</Badge>
              </div>
              <p className="text-xs text-primary-600 dark:text-primary-400 mb-1">{a.course}</p>
              <p className="text-sm text-slate-500 dark:text-slate-400 line-clamp-2">{a.description}</p>
              {a.score !== undefined && a.status === 'graded' && (
                <>
                  <p className="text-sm text-emerald-600 mt-1 font-medium">Score: {a.score}/{a.max_marks}</p>
                  {a.feedback && <p className="text-xs text-slate-500 italic mt-0.5">"{a.feedback}"</p>}
                </>
              )}
            </div>
            <div className="flex flex-col items-end gap-2 flex-shrink-0">
              {a.due && <span className="flex items-center gap-1 text-xs text-slate-400"><Calendar size={11} /> Due {formatDate(a.due)}</span>}
              <span className="text-xs text-slate-400">Max: {a.max_marks} marks</span>
              {a.status !== 'graded' && <RestrictedButton>Submit</RestrictedButton>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function QuizCard({ q }: { q: typeof DEMO_QUIZZES[0] }) {
  const demo = useDemo()!;
  return (
    <div className="card-hover p-5">
      <div className="flex items-start justify-between gap-2 mb-2">
        <h3 className="font-bold text-slate-900 dark:text-white">{q.title}</h3>
        <span className="text-xs bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 px-2 py-0.5 rounded-full font-medium flex-shrink-0">+{q.xp_reward} XP</span>
      </div>
      <p className="text-xs text-primary-600 dark:text-primary-400 mb-3">{q.course}</p>
      <div className="flex gap-3 text-xs text-slate-400 mb-4">
        <span>{q.questions} questions</span>
        <span>Pass: {q.pass_pct}%</span>
      </div>
      {q.status === 'completed' ? (
        <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 text-center">
          <p className="text-emerald-700 dark:text-emerald-400 font-semibold text-sm">Score: {q.score}%</p>
          <p className="text-xs text-emerald-600">Passed ✓</p>
        </div>
      ) : (
        <button onClick={() => demo.requireAuth()} className="btn-primary w-full text-sm py-2">Start Quiz</button>
      )}
    </div>
  );
}

export function DemoQuizzesPage() {
  return (
    <div className="p-6 lg:p-8 max-w-5xl mx-auto animate-fade-in">
      <PageHeader title="Quizzes" subtitle="Test your knowledge and earn XP" icon={HelpCircle} />
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {DEMO_QUIZZES.map(q => <QuizCard key={q.id} q={q} />)}
      </div>
    </div>
  );
}

export function DemoProjectsPage() {
  const demo = useDemo()!;
  return (
    <div className="p-6 lg:p-8 max-w-5xl mx-auto animate-fade-in">
      <PageHeader title="Projects" subtitle="Build real-world projects for your portfolio" icon={FolderKanban} />
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {DEMO_PROJECTS.map(p => (
          <div key={p.id} className="card-hover p-5 flex flex-col">
            <div className="flex items-start justify-between gap-2 mb-2">
              <h3 className="font-bold text-slate-900 dark:text-white">{p.title}</h3>
              {p.status === 'submitted' && <Badge variant="success" className="text-xs flex-shrink-0">Submitted</Badge>}
              {p.status === 'in_progress' && <Badge variant="warning" className="text-xs flex-shrink-0">In Progress</Badge>}
            </div>
            <div className="flex gap-2 mb-3">
              <span className={`badge capitalize text-xs ${getDifficultyColor(p.difficulty)}`}>{p.difficulty}</span>
              <span className="badge text-xs bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 flex items-center gap-1"><Clock size={10} /> {p.hours}h</span>
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-4 flex-1">{p.description}</p>
            <div className="flex flex-wrap gap-1.5 mb-4">
              {p.tags.slice(0, 3).map(t => (
                <span key={t} className="badge text-xs bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-400">{t}</span>
              ))}
            </div>
            <button onClick={() => demo.requireAuth()} className="btn-primary text-sm py-2 w-full">
              {p.status === 'submitted' ? 'Update Submission' : 'Submit Project'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

export function DemoLeaderboardPage() {
  return (
    <div className="p-6 lg:p-8 max-w-3xl mx-auto animate-fade-in">
      <PageHeader title="Leaderboard" subtitle="Top Python learners ranked by XP" icon={Trophy} />
      <div className="card divide-y divide-slate-100 dark:divide-slate-700">
        {DEMO_LEADERBOARD.map((l, i) => (
          <div key={l.rank} className={`flex items-center gap-4 px-5 py-4 ${l.isDemo ? 'bg-primary-50/40 dark:bg-primary-900/10' : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'}`}>
            <div className={`w-8 text-center font-bold text-sm ${i < 3 ? 'text-amber-500' : 'text-slate-400'}`}>
              {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${l.rank}`}
            </div>
            <div className="w-9 h-9 rounded-xl bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center flex-shrink-0">
              <span className="text-sm font-bold text-primary-700 dark:text-primary-400">{l.name.charAt(0)}</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-slate-900 dark:text-white text-sm truncate">
                {l.name} {l.isDemo && <span className="text-primary-600 text-xs">(You)</span>}
              </p>
              <p className="text-xs text-slate-400">Streak: {l.streak} days</p>
            </div>
            <div className="flex items-center gap-1 font-bold text-sm text-slate-900 dark:text-white">
              <Zap size={13} className="text-amber-500" />
              {l.xp.toLocaleString()}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function DemoCertificatesPage() {
  const demo = useDemo()!;
  return (
    <div className="p-6 lg:p-8 max-w-4xl mx-auto animate-fade-in">
      <PageHeader title="My Certificates" subtitle="Earned certificates of completion" icon={Award} />
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
        <div className="card-hover overflow-hidden">
          <div className="h-40 bg-gradient-to-br from-primary-600 via-primary-700 to-teal-600 flex flex-col items-center justify-center p-6 text-white">
            <Award size={32} className="mb-2 text-yellow-300" />
            <p className="font-bold text-center text-sm">{DEMO_CERTIFICATE.course_title}</p>
          </div>
          <div className="p-5">
            <p className="text-xs text-slate-400 font-mono mb-1">ID: {DEMO_CERTIFICATE.certificate_uid}</p>
            <p className="font-semibold text-slate-900 dark:text-white">{DEMO_CERTIFICATE.student_name}</p>
            <p className="text-xs text-slate-400 mt-1">Issued: {formatDate(DEMO_CERTIFICATE.issued_at)}</p>
            <div className="flex gap-2 mt-4">
              <button onClick={() => demo.requireAuth()} className="flex-1 btn-secondary text-xs py-2">View</button>
              <button onClick={() => demo.requireAuth()} className="flex-1 btn-primary text-xs py-2">Download</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function DemoNotificationsPage() {
  const demo = useDemo()!;
  const TYPE_CONFIG: Record<string, { color: string }> = {
    grade: { color: 'text-emerald-500' },
    announcement: { color: 'text-teal-500' },
    assignment: { color: 'text-primary-500' },
    success: { color: 'text-emerald-500' },
  };
  return (
    <div className="p-6 lg:p-8 max-w-3xl mx-auto animate-fade-in">
      <PageHeader title="Notifications" subtitle={`${DEMO_NOTIFICATIONS.filter(n => !n.is_read).length} unread`} icon={Bell}
        action={<button onClick={() => demo.requireAuth()} className="btn-secondary text-sm">Mark All Read</button>}
      />
      <div className="card divide-y divide-slate-100 dark:divide-slate-700">
        {DEMO_NOTIFICATIONS.map(n => (
          <div key={n.id} className={`flex items-start gap-4 px-5 py-4 ${!n.is_read ? 'bg-primary-50/40 dark:bg-primary-900/10' : ''}`}>
            <div className="w-2.5 h-2.5 rounded-full mt-2 flex-shrink-0" style={{ background: !n.is_read ? '#2563EB' : 'transparent' }} />
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-medium ${!n.is_read ? 'text-slate-900 dark:text-white' : 'text-slate-600 dark:text-slate-400'}`}>{n.title}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{n.message}</p>
              <p className="text-xs text-slate-400 mt-1">{formatRelativeTime(n.created_at)}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function DemoCalendarPage() {
  const now = new Date();
  return (
    <div className="p-6 lg:p-8 max-w-4xl mx-auto animate-fade-in">
      <PageHeader title="Learning Calendar" subtitle="Upcoming assignments, quizzes, and events" icon={Calendar} />
      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 card p-6">
          <h2 className="font-bold text-slate-900 dark:text-white mb-4">{now.toLocaleString('default', { month: 'long', year: 'numeric' })}</h2>
          <div className="grid grid-cols-7 gap-1 text-center mb-2">
            {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => <div key={d} className="text-xs font-medium text-slate-400 py-1">{d}</div>)}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: new Date(now.getFullYear(), now.getMonth(), 1).getDay() }).map((_, i) => <div key={`e-${i}`} />)}
            {Array.from({ length: new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() }, (_, i) => i + 1).map(day => {
              const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
              const hasEvent = DEMO_CALENDAR_EVENTS.some(e => e.date === dateStr);
              const isToday = day === now.getDate();
              return (
                <div key={day} className={`aspect-square flex flex-col items-center justify-center rounded-xl text-sm font-medium ${isToday ? 'bg-primary-600 text-white' : hasEvent ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400' : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400'}`}>
                  {day}
                  {hasEvent && !isToday && <div className="w-1 h-1 rounded-full bg-amber-500 mt-0.5" />}
                </div>
              );
            })}
          </div>
        </div>
        <div className="card p-6">
          <h2 className="font-bold text-slate-900 dark:text-white mb-4">Upcoming</h2>
          <div className="space-y-3">
            {DEMO_CALENDAR_EVENTS.filter(e => new Date(e.date) >= now).map(ev => (
              <div key={ev.date + ev.title} className={`p-3 rounded-xl ${ev.type === 'quiz' ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400' : ev.type === 'assignment' ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-400' : 'bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-400'}`}>
                <p className="text-xs font-medium mb-0.5">{new Date(ev.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</p>
                <p className="text-sm font-semibold">{ev.title}</p>
                <p className="text-xs capitalize mt-0.5">{ev.type}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function DemoNotesPage() {
  const demo = useDemo()!;
  return (
    <div className="p-6 lg:p-8 max-w-4xl mx-auto animate-fade-in">
      <PageHeader title="Notes & Bookmarks" subtitle="Personal study notes and bookmarked lessons" icon={BookMarked} />
      <div className="card p-12 text-center">
        <div className="w-16 h-16 rounded-2xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center mx-auto mb-4">
          <Lock size={24} className="text-amber-600 dark:text-amber-400" />
        </div>
        <h3 className="font-bold text-slate-900 dark:text-white mb-2">Notes are personal</h3>
        <p className="text-slate-500 dark:text-slate-400 text-sm mb-6 max-w-sm mx-auto">
          Sign in to create, edit, and view your personal lesson notes and bookmarks.
        </p>
        <button onClick={() => demo.requireAuth()} className="btn-primary">Sign In to Access Notes</button>
      </div>
    </div>
  );
}

function DownloadBtn() {
  const demo = useDemo()!;
  return (
    <button onClick={() => demo.requireAuth()} className="btn-secondary text-xs py-1.5 px-3 flex items-center gap-1">
      <Download size={12} /> Download
    </button>
  );
}

export function DemoDownloadsPage() {
  const RESOURCES = [
    { title: 'Python Quick Reference Sheet', type: 'PDF', course: 'Python Fundamentals', size: '1.2 MB' },
    { title: 'OOP Concepts Guide', type: 'PDF', course: 'Python Intermediate', size: '2.4 MB' },
    { title: 'Data Structures Cheatsheet', type: 'PDF', course: 'Python Fundamentals', size: '800 KB' },
  ];
  return (
    <div className="p-6 lg:p-8 max-w-4xl mx-auto animate-fade-in">
      <PageHeader title="Downloads" subtitle="Downloadable course resources" icon={Download} />
      <div className="card divide-y divide-slate-100 dark:divide-slate-700">
        {RESOURCES.map(r => (
          <div key={r.title} className="flex items-center gap-4 p-4">
            <div className="w-10 h-10 rounded-xl bg-red-50 dark:bg-red-900/20 flex items-center justify-center flex-shrink-0">
              <FileText size={18} className="text-red-600 dark:text-red-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-slate-900 dark:text-white text-sm">{r.title}</p>
              <p className="text-xs text-slate-400">{r.course} · {r.size} · {r.type}</p>
            </div>
            <DownloadBtn />
          </div>
        ))}
      </div>
    </div>
  );
}

export function DemoRoadmapPage() {
  const roadmap = [
    { phase: 'Phase 1: Python Foundations', color: 'from-emerald-500 to-teal-500', topics: [{ t: 'Introduction to Python', done: true }, { t: 'Variables & Data Types', done: true }, { t: 'Operators', done: true }, { t: 'Conditional Statements', done: false }, { t: 'Loops', done: false }] },
    { phase: 'Phase 2: Core Python', color: 'from-primary-500 to-primary-700', topics: [{ t: 'Functions', done: false }, { t: 'Lists & Tuples', done: false }, { t: 'Dictionaries', done: false }, { t: 'OOP', done: false }, { t: 'File Handling', done: false }] },
    { phase: 'Phase 3: Advanced Python', color: 'from-slate-600 to-slate-800', topics: [{ t: 'Decorators', done: false }, { t: 'Generators', done: false }, { t: 'Async Python', done: false }, { t: 'Regular Expressions', done: false }, { t: 'Testing', done: false }] },
    { phase: 'Phase 4: Professional Python', color: 'from-teal-500 to-cyan-600', topics: [{ t: 'FastAPI/Flask', done: false }, { t: 'Data Science', done: false }, { t: 'Pandas & NumPy', done: false }, { t: 'Automation', done: false }, { t: 'Deployment', done: false }] },
  ];
  return (
    <div className="p-6 lg:p-8 max-w-4xl mx-auto animate-fade-in">
      <PageHeader title="Learning Roadmap" subtitle="Your structured Python learning path" icon={Map as any} />
      <div className="space-y-8">
        {roadmap.map(({ phase, color, topics }) => (
          <div key={phase}>
            <div className={`p-4 rounded-2xl bg-gradient-to-r ${color} mb-4`}>
              <h2 className="font-bold text-white">{phase}</h2>
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              {topics.map(({ t, done }) => (
                <div key={t} className={`card p-4 flex items-center gap-3 ${done ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-100 dark:border-emerald-800' : ''}`}>
                  <CheckCircle size={16} className={done ? 'text-emerald-500' : 'text-slate-300 dark:text-slate-600'} />
                  <span className={`text-sm font-medium ${done ? 'text-emerald-700 dark:text-emerald-400 line-through' : 'text-slate-700 dark:text-slate-300'}`}>{t}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function DemoSandboxPage() {
  const demo = useDemo()!;
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3 bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 flex-shrink-0">
        <Code size={18} className="text-teal-400" />
        <span className="font-bold text-slate-900 dark:text-white">Code Sandbox</span>
        <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-lg font-bold">DEMO</span>
      </div>
      <div className="flex-1 flex items-center justify-center bg-slate-950">
        <div className="text-center max-w-sm px-6">
          <Code size={48} className="text-slate-600 mx-auto mb-4" />
          <h3 className="font-bold text-white mb-2">Code Sandbox</h3>
          <p className="text-slate-400 text-sm mb-6">The multi-file code sandbox is available to signed-in users. Create an account to save files, open multiple files, and organize your code projects.</p>
          <button onClick={() => demo.requireAuth()} className="btn-primary">Sign In to Use Sandbox</button>
        </div>
      </div>
    </div>
  );
}

export function DemoProfilePage() {
  const demo = useDemo()!;
  return (
    <div className="p-6 lg:p-8 max-w-3xl mx-auto animate-fade-in">
      <PageHeader title="Profile" subtitle="Demo user profile preview" icon={User} />
      <div className="card p-8 mb-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5 mb-8 pb-8 border-b border-slate-100 dark:border-slate-700">
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center flex-shrink-0">
            <span className="text-3xl font-extrabold text-white">K</span>
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">{DEMO_STUDENT.full_name}</h2>
              <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-lg font-bold">DEMO</span>
            </div>
            <p className="text-sm text-slate-500">{DEMO_STUDENT.email}</p>
            <Badge variant="info" className="mt-2">Student</Badge>
          </div>
          <button onClick={() => demo.requireAuth()} className="btn-secondary text-sm">Edit Profile</button>
        </div>
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="text-center p-4 rounded-xl bg-amber-50 dark:bg-amber-900/20">
            <div className="flex items-center justify-center gap-1.5 mb-1"><Zap size={16} className="text-amber-500" /><span className="font-bold text-lg">{DEMO_STUDENT.xp_points.toLocaleString()}</span></div>
            <p className="text-xs text-slate-500">Total XP</p>
          </div>
          <div className="text-center p-4 rounded-xl bg-orange-50 dark:bg-orange-900/20">
            <div className="flex items-center justify-center gap-1.5 mb-1"><Flame size={16} className="text-orange-500" /><span className="font-bold text-lg">{DEMO_STUDENT.streak_days}</span></div>
            <p className="text-xs text-slate-500">Day Streak</p>
          </div>
          <div className="text-center p-4 rounded-xl bg-primary-50 dark:bg-primary-900/20">
            <span className="font-bold text-lg block mb-1">Lv. {DEMO_STUDENT.level}</span>
            <p className="text-xs text-slate-500">Level</p>
          </div>
        </div>
        <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-900/20 text-center">
          <p className="text-sm text-amber-700 dark:text-amber-400 font-medium">This is a demo profile. <button onClick={() => demo.requireAuth()} className="underline">Create an account</button> to set up your real profile.</p>
        </div>
      </div>
    </div>
  );
}

export function DemoSettingsPage() {
  const demo = useDemo()!;
  return (
    <div className="p-6 lg:p-8 max-w-2xl mx-auto animate-fade-in">
      <PageHeader title="Settings" subtitle="Demo settings preview" icon={Settings} />
      <div className="card p-8 text-center">
        <Lock size={32} className="text-slate-300 mx-auto mb-4" />
        <h3 className="font-bold text-slate-900 dark:text-white mb-2">Settings require an account</h3>
        <p className="text-slate-500 text-sm mb-6">Create a free account to manage your preferences, notification settings, and account security.</p>
        <button onClick={() => demo.requireAuth()} className="btn-primary">Create Free Account</button>
      </div>
    </div>
  );
}

// Re-export Map for roadmap
import { Map } from 'lucide-react';
