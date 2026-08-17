import { Link } from 'react-router-dom';
import { BookOpen, CheckCircle, Zap, Flame, Trophy, ArrowRight, Play, Lock } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { StatCard } from '../../../components/ui/StatCard';
import { ProgressBar } from '../../../components/ui/ProgressBar';
import { PageHeader } from '../../../components/common/PageHeader';
import { useDemo } from '../../../contexts/DemoContext';
import {
  DEMO_STUDENT, DEMO_COURSES, DEMO_WEEKLY_ACTIVITY,
  DEMO_ANNOUNCEMENTS, DEMO_NOTIFICATIONS, DEMO_BADGES, DEMO_ASSIGNMENTS
} from '../../../data/demoData';
import { formatRelativeTime } from '../../../lib/utils';

export default function DemoStudentDashboard() {
  const demo = useDemo()!;

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto animate-fade-in">
      <PageHeader
        title={`Welcome back, ${DEMO_STUDENT.full_name.split(' ')[0]}!`}
        subtitle="Continue your Python learning journey"
      />

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard title="Completed Lessons" value={DEMO_STUDENT.completed_lessons}
          icon={CheckCircle} iconBg="bg-emerald-50 dark:bg-emerald-900/30" iconColor="text-emerald-600 dark:text-emerald-400" />
        <StatCard title="XP Points" value={DEMO_STUDENT.xp_points.toLocaleString()}
          icon={Zap} iconBg="bg-amber-50 dark:bg-amber-900/30" iconColor="text-amber-600 dark:text-amber-400" />
        <StatCard title="Learning Streak" value={`${DEMO_STUDENT.streak_days} days`}
          icon={Flame} iconBg="bg-orange-50 dark:bg-orange-900/30" iconColor="text-orange-600 dark:text-orange-400" />
        <StatCard title="Current Level" value={`Level ${DEMO_STUDENT.level}`}
          icon={Trophy} iconBg="bg-primary-50 dark:bg-primary-900/30" iconColor="text-primary-600 dark:text-primary-400" />
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Left column */}
        <div className="lg:col-span-2 space-y-6">
          {/* Continue learning */}
          <div className="card p-5 bg-gradient-to-r from-primary-600 to-primary-700 text-white">
            <p className="text-white/70 text-xs font-medium mb-1">CONTINUE WHERE YOU LEFT OFF</p>
            <h3 className="font-bold text-lg mb-0.5">Conditional Statements</h3>
            <p className="text-white/70 text-sm mb-4">Python Full Stack Development · Chapter 3</p>
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <div className="flex justify-between text-xs text-white/70 mb-1.5">
                  <span>Course Progress</span><span>38%</span>
                </div>
                <ProgressBar value={38} size="sm" barClassName="bg-teal-400" className="flex-1" />
              </div>
              <Link to="/demo/student/lesson/conditionals" className="flex-shrink-0 flex items-center gap-2 bg-white text-primary-700 px-4 py-2.5 rounded-xl font-semibold text-sm hover:bg-primary-50 transition-colors">
                <Play size={14} /> Resume
              </Link>
            </div>
          </div>

          {/* Weekly chart */}
          <div className="card p-6">
            <h2 className="section-title">Weekly Learning Activity</h2>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={DEMO_WEEKLY_ACTIVITY}>
                <defs>
                  <linearGradient id="demoGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2563EB" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#2563EB" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="day" tick={{ fontSize: 12, fill: '#94a3b8' }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: '#94a3b8' }} />
                <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 16px rgba(0,0,0,0.1)' }} />
                <Area type="monotone" dataKey="lessons" stroke="#2563EB" fill="url(#demoGrad)" strokeWidth={2} name="Lessons" />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* My Courses */}
          <div className="card p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="section-title mb-0">My Courses</h2>
              <Link to="/demo/student/courses" className="text-sm text-primary-600 dark:text-primary-400 hover:underline flex items-center gap-1">
                View All <ArrowRight size={14} />
              </Link>
            </div>
            <div className="space-y-3">
              {DEMO_COURSES.map(c => (
                <div key={c.id} className="flex items-center gap-4 p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50">
                  <div className="w-11 h-11 rounded-xl bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center flex-shrink-0">
                    <BookOpen size={18} className="text-primary-600 dark:text-primary-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-slate-900 dark:text-white text-sm truncate">{c.title}</p>
                    <div className="flex items-center gap-3 mt-1.5">
                      <ProgressBar value={c.progress} size="sm" className="flex-1" />
                      <span className="text-xs text-slate-500 flex-shrink-0">{c.progress}%</span>
                    </div>
                  </div>
                  <button
                    onClick={() => demo.requireAuth()}
                    className="btn-ghost flex items-center gap-1 text-xs py-1.5 px-3 flex-shrink-0"
                  >
                    <Play size={12} /> Continue
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Upcoming Assignment */}
          <div className="card p-5 border-l-4 border-l-amber-400">
            <p className="text-xs font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider mb-1">Upcoming Assignment</p>
            <h3 className="font-bold text-slate-900 dark:text-white">{DEMO_ASSIGNMENTS[0].title}</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5 mb-3">{DEMO_ASSIGNMENTS[0].course}</p>
            <div className="flex items-center justify-between">
              <span className="text-xs text-amber-600 dark:text-amber-400 font-medium">Due: Friday, 6:00 PM</span>
              <button onClick={() => demo.requireAuth()} className="btn-primary text-xs py-1.5 px-4">Submit</button>
            </div>
          </div>
        </div>

        {/* Right column */}
        <div className="space-y-6">
          {/* Level progress */}
          <div className="card p-6">
            <h2 className="font-bold text-slate-900 dark:text-white mb-4">Your Progress</h2>
            <div className="text-center mb-4">
              <div className="w-16 h-16 rounded-2xl gradient-bg flex items-center justify-center mx-auto mb-2 shadow-glow-blue">
                <span className="text-white font-extrabold text-xl">{DEMO_STUDENT.level}</span>
              </div>
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">Python Explorer</p>
            </div>
            <ProgressBar value={DEMO_STUDENT.xp_points % 500} max={500} showLabel color="teal" />
            <p className="text-xs text-slate-400 text-center mt-2">{DEMO_STUDENT.xp_points.toLocaleString()} total XP</p>
          </div>

          {/* Badges */}
          <div className="card p-6">
            <h2 className="font-bold text-slate-900 dark:text-white mb-4">Achievement Badges</h2>
            <div className="grid grid-cols-3 gap-3">
              {DEMO_BADGES.map(b => (
                <div key={b.id} className={`flex flex-col items-center p-3 rounded-xl border-2 transition-all ${b.earned ? 'border-transparent bg-slate-50 dark:bg-slate-800' : 'border-dashed border-slate-200 dark:border-slate-700 opacity-50'}`}>
                  <span className="text-2xl mb-1">{b.icon}</span>
                  <p className="text-xs font-medium text-slate-700 dark:text-slate-300 text-center leading-tight">{b.title}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Quick Actions */}
          <div className="card p-6">
            <h2 className="font-bold text-slate-900 dark:text-white mb-4">Quick Actions</h2>
            <div className="space-y-1">
              {[
                { label: 'Python Playground', to: '/demo/student/playground' },
                { label: 'Take a Quiz', restricted: true },
                { label: 'View Assignments', to: '/demo/student/assignments' },
                { label: 'Leaderboard', to: '/demo/student/leaderboard' },
              ].map(({ label, to, restricted }) => (
                restricted ? (
                  <button key={label} onClick={() => demo.requireAuth()} className="flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors w-full text-left">
                    <Lock size={15} className="text-slate-300 dark:text-slate-600 flex-shrink-0" />
                    <span className="text-sm font-medium text-slate-500 dark:text-slate-500">{label}</span>
                    <span className="ml-auto text-xs text-amber-500 font-medium">Sign in</span>
                  </button>
                ) : (
                  <Link key={label} to={to!} className="flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                    <ArrowRight size={15} className="text-primary-500 flex-shrink-0" />
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{label}</span>
                  </Link>
                )
              ))}
            </div>
          </div>

          {/* Announcements */}
          <div className="card p-6">
            <h2 className="font-bold text-slate-900 dark:text-white mb-4">Announcements</h2>
            <div className="space-y-3">
              {DEMO_ANNOUNCEMENTS.slice(0, 2).map(a => (
                <div key={a.id} className="p-3 rounded-xl bg-primary-50 dark:bg-primary-900/20 border border-primary-100 dark:border-primary-800">
                  <p className="text-sm font-semibold text-slate-900 dark:text-white mb-1 line-clamp-1">{a.title}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2">{a.content}</p>
                  <p className="text-xs text-slate-400 mt-1">{formatRelativeTime(a.created_at)}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
