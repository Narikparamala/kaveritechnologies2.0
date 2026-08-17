import { Video, Calendar, Clock, Users, ExternalLink, CheckCircle, AlertCircle } from 'lucide-react';
import { PageHeader } from '../../../components/common/PageHeader';
import { Badge } from '../../../components/ui/Badge';
import { useDemo } from '../../../contexts/DemoContext';

const DEMO_SESSIONS = [
  {
    id: 'demo-1',
    title: 'Introduction to Python Fundamentals',
    course: 'Python Fundamentals',
    faculty: 'Dr. Priya Sharma',
    date: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
    duration: 90,
    status: 'scheduled',
    slidesUnlocked: false,
    materialsUnlocked: false,
  },
  {
    id: 'demo-2',
    title: 'Control Flow and Functions Workshop',
    course: 'Python Fundamentals',
    faculty: 'Prof. Kiran Kumar',
    date: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
    duration: 75,
    status: 'scheduled',
    slidesUnlocked: false,
    materialsUnlocked: false,
  },
  {
    id: 'demo-3',
    title: 'Data Structures Deep Dive',
    course: 'Python Fundamentals',
    faculty: 'Dr. Priya Sharma',
    date: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    duration: 90,
    status: 'completed',
    slidesUnlocked: true,
    materialsUnlocked: true,
  },
  {
    id: 'demo-4',
    title: 'Live Coding: Functions in Action',
    course: 'Python Fundamentals',
    faculty: 'Prof. Kiran Kumar',
    date: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
    duration: 60,
    status: 'live',
    slidesUnlocked: false,
    materialsUnlocked: false,
  },
];

function SessionCard({ session, onJoin }: { session: typeof DEMO_SESSIONS[0]; onJoin: () => void }) {
  const sessionDate = new Date(session.date);
  const isLive = session.status === 'live';
  const isCompleted = session.status === 'completed';

  const statusConfig: Record<string, { bg: string; text: string; icon: React.ReactNode }> = {
    live: { bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-700 dark:text-red-400', icon: <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" /> },
    scheduled: { bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-700 dark:text-blue-400', icon: <Calendar size={12} /> },
    completed: { bg: 'bg-emerald-100 dark:bg-emerald-900/30', text: 'text-emerald-700 dark:text-emerald-400', icon: <CheckCircle size={12} /> },
    cancelled: { bg: 'bg-slate-100 dark:bg-slate-800', text: 'text-slate-600 dark:text-slate-400', icon: null },
  };
  const cfg = statusConfig[session.status];

  return (
    <div className={`card p-5 ${isLive ? 'ring-2 ring-red-500' : ''}`}>
      <div className="flex items-start gap-4">
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${cfg.bg}`}>
          <Video size={20} className={cfg.text} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <h3 className="font-semibold text-slate-900 dark:text-white text-sm">{session.title}</h3>
            <Badge className={`${cfg.bg} ${cfg.text} flex items-center gap-1`}>
              {cfg.icon}
              {isLive ? 'Live Now' : session.status.charAt(0).toUpperCase() + session.status.slice(1)}
            </Badge>
          </div>

          <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">{session.course}</p>

          <div className="flex items-center gap-4 text-xs text-slate-500 dark:text-slate-400 mb-2">
            <span className="flex items-center gap-1">
              <Calendar size={12} />
              {sessionDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
            </span>
            <span className="flex items-center gap-1">
              <Clock size={12} />
              {sessionDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
            </span>
            <span className="flex items-center gap-1">
              <Users size={12} />
              {session.duration} min
            </span>
          </div>

          <p className="text-xs text-slate-500 dark:text-slate-400">Faculty: {session.faculty}</p>

          {isCompleted && (
            <div className="mt-2 flex items-center gap-3 text-xs">
              <span className={`flex items-center gap-1 ${session.slidesUnlocked ? 'text-emerald-600' : 'text-slate-400'}`}>
                {session.slidesUnlocked ? <CheckCircle size={12} /> : <AlertCircle size={12} />}
                Slides {session.slidesUnlocked ? 'Available' : 'Locked'}
              </span>
              <span className={`flex items-center gap-1 ${session.materialsUnlocked ? 'text-emerald-600' : 'text-slate-400'}`}>
                {session.materialsUnlocked ? <CheckCircle size={12} /> : <AlertCircle size={12} />}
                Materials {session.materialsUnlocked ? 'Available' : 'Locked'}
              </span>
            </div>
          )}
        </div>

        <div className="flex-shrink-0">
          {(isLive || session.status === 'scheduled') && (
            <button onClick={onJoin} className="btn-primary text-xs flex items-center gap-1.5">
              <Video size={14} />
              {isLive ? 'Join Now' : 'Join Class'}
            </button>
          )}
          {isCompleted && session.materialsUnlocked && (
            <button onClick={onJoin} className="btn-secondary text-xs flex items-center gap-1.5">
              View Materials
              <ExternalLink size={12} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function DemoLiveClassesPage() {
  const demo = useDemo()!;

  const handleJoin = () => {
    demo.requireAuth();
  };

  const liveSessions = DEMO_SESSIONS.filter(s => s.status === 'live');
  const scheduledSessions = DEMO_SESSIONS.filter(s => s.status === 'scheduled');
  const completedSessions = DEMO_SESSIONS.filter(s => s.status === 'completed');

  return (
    <div className="p-6 lg:p-8 max-w-5xl mx-auto animate-fade-in">
      <PageHeader
        title="Live Classes"
        subtitle="Join live Google Meet sessions with your instructors"
      />

      {/* Info banner */}
      <div className="mb-6 p-4 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
        <div className="flex items-start gap-3">
          <Video className="text-blue-600 dark:text-blue-400 flex-shrink-0" size={20} />
          <div>
            <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
              Live interactive sessions
            </p>
            <p className="text-xs text-blue-700 dark:text-blue-300 mt-1">
              All classes are conducted live via Google Meet. No recordings are available.
              Session materials unlock after class completion.
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-8">
        {/* Live Now */}
        {liveSessions.length > 0 && (
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
              Live Now (Demo)
            </h2>
            <div className="space-y-3">
              {liveSessions.map(session => (
                <SessionCard key={session.id} session={session} onJoin={handleJoin} />
              ))}
            </div>
          </div>
        )}

        {/* Scheduled */}
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-4">
            Upcoming Classes ({scheduledSessions.length}) - Demo
          </h2>
          <div className="space-y-3">
            {scheduledSessions.map(session => (
              <SessionCard key={session.id} session={session} onJoin={handleJoin} />
            ))}
          </div>
        </div>

        {/* Completed */}
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-4">
            Completed Sessions ({completedSessions.length}) - Demo
          </h2>
          <div className="space-y-3">
            {completedSessions.map(session => (
              <SessionCard key={session.id} session={session} onJoin={handleJoin} />
            ))}
          </div>
        </div>
      </div>

      <div className="mt-8 p-4 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
        <p className="text-sm text-amber-800 dark:text-amber-200">
          This is a demo preview. Sign in to access real live classes and session materials.
        </p>
      </div>
    </div>
  );
}
