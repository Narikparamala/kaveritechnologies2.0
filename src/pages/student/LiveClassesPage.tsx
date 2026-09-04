import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Video, Calendar, Clock, Users, ExternalLink, CheckCircle, XCircle,
  AlertCircle, ChevronRight, Loader2, Play, Hourglass
} from 'lucide-react';
import { PageHeader } from '../../components/common/PageHeader';
import { EmptyState } from '../../components/ui/EmptyState';
import { Badge } from '../../components/ui/Badge';
import { useAuth } from '../../contexts/AuthContext';
import {
  getStudentSessions, registerForSession, isSessionJoinable, getTimeUntilSession,
  type SessionWithDetails
} from '../../services/liveSessions';
import type { LiveSession } from '../../types/database';

function SessionCard({ session, onJoin }: { session: SessionWithDetails; onJoin: (s: SessionWithDetails) => void }) {
  const sessionDate = new Date(session.session_date);
  const isPast = session.status === 'completed' || session.status === 'cancelled';
  const isLive = session.status === 'live';
  const isJoinable = isSessionJoinable(session);
  const timeUntil = getTimeUntilSession(session);

  const statusConfig: Record<string, { bg: string; text: string; icon: React.ReactNode }> = {
    live: { bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-700 dark:text-red-400', icon: <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" /> },
    scheduled: { bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-700 dark:text-blue-400', icon: <Calendar size={12} /> },
    completed: { bg: 'bg-emerald-100 dark:bg-emerald-900/30', text: 'text-emerald-700 dark:text-emerald-400', icon: <CheckCircle size={12} /> },
    cancelled: { bg: 'bg-slate-100 dark:bg-slate-800', text: 'text-slate-600 dark:text-slate-400', icon: <XCircle size={12} /> },
  };
  const cfg = statusConfig[session.status];

  const attendanceConfig: Record<string, { bg: string; text: string }> = {
    registered: { bg: 'bg-slate-100 dark:bg-slate-800', text: 'text-slate-600 dark:text-slate-400' },
    attended: { bg: 'bg-emerald-100 dark:bg-emerald-900/30', text: 'text-emerald-700 dark:text-emerald-400' },
    absent: { bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-700 dark:text-red-400' },
    excused: { bg: 'bg-amber-100 dark:bg-amber-900/30', text: 'text-amber-700 dark:text-amber-400' },
  };
  const attCfg = session.attendance ? attendanceConfig[session.attendance.attendance_status] : null;

  return (
    <div className={`card p-5 transition-all hover:shadow-lg ${isLive ? 'ring-2 ring-red-500' : ''}`}>
      <div className="flex items-start gap-4">
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${cfg.bg}`}>
          {isLive ? <Play size={20} className={cfg.text} /> : <Video size={20} className={cfg.text} />}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <h3 className="font-semibold text-slate-900 dark:text-white text-sm">{session.title}</h3>
            <Badge className={`${cfg.bg} ${cfg.text} flex items-center gap-1`}>
              {cfg.icon}
              {session.status === 'live' ? 'Live Now' : session.status.charAt(0).toUpperCase() + session.status.slice(1)}
            </Badge>
          </div>

          {session.course && (
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">{session.course.title}</p>
          )}

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
              {session.duration_minutes} min
            </span>
          </div>

          {session.faculty && (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Faculty: {session.faculty.full_name || 'Instructor'}
            </p>
          )}

          {/* Attendance status for completed sessions */}
          {isPast && attCfg && session.attendance && (
            <div className={`mt-2 inline-flex items-center px-2 py-1 rounded-lg text-xs ${attCfg.bg} ${attCfg.text}`}>
              {session.attendance.attendance_status.charAt(0).toUpperCase() + session.attendance.attendance_status.slice(1)}
            </div>
          )}

          {/* Recording state for completed sessions */}
          {session.status === 'completed' && (
            <div className="mt-2 flex items-center gap-3 text-xs">
              {session.recording ? (
                <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                  <CheckCircle size={12} />
                  Recording available
                </span>
              ) : (
                <span className="flex items-center gap-1 text-slate-400">
                  <Hourglass size={12} />
                  Recording coming soon
                </span>
              )}
            </div>
          )}

          {/* Countdown for upcoming sessions */}
          {session.status === 'scheduled' && (
            <p className="text-xs text-primary-600 dark:text-primary-400 mt-2">{timeUntil}</p>
          )}
        </div>

        {/* Action button */}
        <div className="flex-shrink-0">
          {isJoinable && session.google_meet_url ? (
            <button
              onClick={() => onJoin(session)}
              className="btn-primary text-xs flex items-center gap-1.5"
            >
              <Video size={14} />
              {isLive ? 'Join Now' : 'Join Class'}
            </button>
          ) : session.status === 'completed' ? (
            <Link
              to={`/student/live-classes/${session.id}`}
              className="btn-secondary text-xs flex items-center gap-1.5"
            >
              {session.recording ? 'Watch Recording' : 'View Session'}
              <ChevronRight size={14} />
            </Link>
          ) : session.status === 'scheduled' ? (
            <span className="text-xs text-slate-400">
              {session.attendance ? 'Registered' : 'Auto-registered'}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default function LiveClassesPage() {
  const { profile } = useAuth();
  const [sessions, setSessions] = useState<SessionWithDetails[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile) return;
    loadSessions();
  }, [profile]);

  const loadSessions = async () => {
    try {
      const data = await getStudentSessions(profile!.id);
      setSessions(data);
    } catch (err) {
      console.error('Failed to load sessions:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleJoinSession = async (session: SessionWithDetails) => {
    if (!session.google_meet_url) return;

    // Register attendance if not already
    if (!session.attendance) {
      try {
        await registerForSession(session.id, profile!.id);
      } catch {
        // Ignore if already registered
      }
    }

    // Open Google Meet in new tab
    window.open(session.google_meet_url, '_blank', 'noopener,noreferrer');
  };

  // Group sessions
  const liveSessions = sessions.filter(s => s.status === 'live');
  const upcomingSessions = sessions.filter(s => s.status === 'scheduled');
  const completedSessions = sessions.filter(s => s.status === 'completed');
  const cancelledSessions = sessions.filter(s => s.status === 'cancelled');

  if (!profile) return null;

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
              Classes run live via Google Meet. After each class the faculty can publish the
              recording and unlock materials — you'll find them on the session page.
            </p>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="animate-spin text-primary-600" size={24} />
        </div>
      ) : sessions.length === 0 ? (
        <EmptyState
          icon={Video}
          title="No live sessions scheduled"
          description="You don't have any live classes scheduled yet. Enroll in a course to see upcoming sessions."
          action={<Link to="/student/courses" className="btn-primary text-sm">Browse Courses</Link>}
        />
      ) : (
        <div className="space-y-8">
          {/* Live Now */}
          {liveSessions.length > 0 && (
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
                Live Now
              </h2>
              <div className="space-y-3">
                {liveSessions.map(session => (
                  <SessionCard key={session.id} session={session} onJoin={handleJoinSession} />
                ))}
              </div>
            </div>
          )}

          {/* Upcoming */}
          {upcomingSessions.length > 0 && (
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-4">
                Upcoming Classes ({upcomingSessions.length})
              </h2>
              <div className="space-y-3">
                {upcomingSessions.map(session => (
                  <SessionCard key={session.id} session={session} onJoin={handleJoinSession} />
                ))}
              </div>
            </div>
          )}

          {/* Completed */}
          {completedSessions.length > 0 && (
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-4">
                Completed Sessions ({completedSessions.length})
              </h2>
              <div className="space-y-3">
                {completedSessions.map(session => (
                  <SessionCard key={session.id} session={session} onJoin={handleJoinSession} />
                ))}
              </div>
            </div>
          )}

          {/* Cancelled */}
          {cancelledSessions.length > 0 && (
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-4">
                Cancelled Sessions
              </h2>
              <div className="space-y-3">
                {cancelledSessions.map(session => (
                  <SessionCard key={session.id} session={session} onJoin={handleJoinSession} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
