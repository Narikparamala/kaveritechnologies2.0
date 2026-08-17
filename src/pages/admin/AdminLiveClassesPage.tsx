import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Video, Calendar, Clock, Users, MoreVertical, Edit, Play, CheckCircle,
  XCircle, ExternalLink, Loader2, AlertCircle, Plus, Trash2, Filter
} from 'lucide-react';
import { PageHeader } from '../../components/common/PageHeader';
import { EmptyState } from '../../components/ui/EmptyState';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../components/ui/Toast';
import { supabase } from '../../lib/supabase';
import {
  getAllSessions, startSession, completeSession, cancelSession, deleteSession,
  getSessionStats, isValidGoogleMeetUrl,
  type SessionWithDetails
} from '../../services/liveSessions';
import type { Course, LiveSession } from '../../types/database';

function SessionCard({
  session,
  onToggleMenu,
  openMenu,
  onStart,
  onComplete,
  onCancel,
  onDelete
}: {
  session: SessionWithDetails;
  onToggleMenu: (id: string) => void;
  openMenu: string | null;
  onStart: (id: string) => void;
  onComplete: (id: string) => void;
  onCancel: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const sessionDate = new Date(session.session_date);
  const isLive = session.status === 'live';
  const isCompleted = session.status === 'completed';
  const isCancelled = session.status === 'cancelled';

  const statusConfig: Record<string, { bg: string; text: string }> = {
    live: { bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-700 dark:text-red-400' },
    scheduled: { bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-700 dark:text-blue-400' },
    completed: { bg: 'bg-emerald-100 dark:bg-emerald-900/30', text: 'text-emerald-700 dark:text-emerald-400' },
    cancelled: { bg: 'bg-slate-100 dark:bg-slate-800', text: 'text-slate-600 dark:text-slate-400' },
  };
  const cfg = statusConfig[session.status];

  return (
    <div className={`card p-5 relative ${isLive ? 'ring-2 ring-red-500' : ''}`}>
      <div className="flex items-start gap-4">
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${cfg.bg}`}>
          <Video size={20} className={cfg.text} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <h3 className="font-semibold text-slate-900 dark:text-white text-sm">{session.title}</h3>
            <Badge className={`${cfg.bg} ${cfg.text}`}>
              {isLive && <div className="w-2 h-2 rounded-full bg-current animate-pulse mr-1" />}
              {session.status.charAt(0).toUpperCase() + session.status.slice(1)}
            </Badge>
          </div>

          {session.course && (
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">{session.course.title}</p>
          )}

          <div className="flex items-center gap-4 text-xs text-slate-500 dark:text-slate-400">
            <span className="flex items-center gap-1">
              <Calendar size={12} />
              {sessionDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
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

          {session.google_meet_url && isValidGoogleMeetUrl(session.google_meet_url) && (
            <a
              href={session.google_meet_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 mt-2 hover:underline"
            >
              <ExternalLink size={12} />
              Meet Link
            </a>
          )}

          {/* Unlock status for completed */}
          {isCompleted && (
            <div className="mt-2 flex items-center gap-3 text-xs">
              <span className={`flex items-center gap-1 ${session.slides_unlocked ? 'text-emerald-600' : 'text-slate-400'}`}>
                {session.slides_unlocked ? <CheckCircle size={12} /> : <AlertCircle size={12} />}
                Slides {session.slides_unlocked ? 'Unlocked' : 'Locked'}
              </span>
              <span className={`flex items-center gap-1 ${session.materials_unlocked ? 'text-emerald-600' : 'text-slate-400'}`}>
                {session.materials_unlocked ? <CheckCircle size={12} /> : <AlertCircle size={12} />}
                Materials {session.materials_unlocked ? 'Unlocked' : 'Locked'}
              </span>
            </div>
          )}
        </div>

        {/* Actions dropdown */}
        <div className="relative">
          <button
            onClick={() => onToggleMenu(session.id)}
            className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
          >
            <MoreVertical size={16} className="text-slate-400" />
          </button>

          {openMenu === session.id && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => onToggleMenu('')} />
              <div className="absolute right-0 top-full mt-1 w-56 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 py-1 z-50">
                {!isCancelled && (
                  <>
                    <Link
                      to={`/admin/live-classes/${session.id}/edit`}
                      className="w-full px-4 py-2 text-left text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-2"
                      onClick={() => onToggleMenu('')}
                    >
                      <Edit size={14} /> Edit Session
                    </Link>
                    <Link
                      to={`/admin/live-classes/${session.id}/attendance`}
                      className="w-full px-4 py-2 text-left text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-2"
                      onClick={() => onToggleMenu('')}
                    >
                      <Users size={14} /> Manage Attendance
                    </Link>
                  </>
                )}
                {session.status === 'scheduled' && (
                  <>
                    <hr className="my-1 border-slate-200 dark:border-slate-700" />
                    <button
                      onClick={() => { onToggleMenu(''); onStart(session.id); }}
                      className="w-full px-4 py-2 text-left text-sm text-emerald-600 dark:text-emerald-400 hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-2"
                    >
                      <Play size={14} /> Start Session
                    </button>
                    <button
                      onClick={() => { onToggleMenu(''); onCancel(session.id); }}
                      className="w-full px-4 py-2 text-left text-sm text-amber-600 dark:text-amber-400 hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-2"
                    >
                      <XCircle size={14} /> Cancel Session
                    </button>
                  </>
                )}
                {session.status === 'live' && (
                  <>
                    <hr className="my-1 border-slate-200 dark:border-slate-700" />
                    <button
                      onClick={() => { onToggleMenu(''); onComplete(session.id); }}
                      className="w-full px-4 py-2 text-left text-sm text-emerald-600 dark:text-emerald-400 hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-2"
                    >
                      <CheckCircle size={14} /> Complete Session
                    </button>
                  </>
                )}
                <hr className="my-1 border-slate-200 dark:border-slate-700" />
                <button
                  onClick={() => { onToggleMenu(''); onDelete(session.id); }}
                  className="w-full px-4 py-2 text-left text-sm text-red-600 dark:text-red-400 hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-2"
                >
                  <Trash2 size={14} /> Delete Session
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function AdminLiveClassesPage() {
  const { profile } = useAuth();
  const { success, error: showError } = useToast();
  const [sessions, setSessions] = useState<SessionWithDetails[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [stats, setStats] = useState<{ scheduled: number; live: number; completed: number; cancelled: number; totalAttendance: number; attendedCount: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [openMenu, setOpenMenu] = useState<string | null>(null);

  // Filters
  const [filterCourse, setFilterCourse] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  useEffect(() => {
    loadData();
  }, [filterCourse, filterStatus]);

  const loadData = async () => {
    try {
      const filters: { courseId?: string; status?: string } = {};
      if (filterCourse) filters.courseId = filterCourse;
      if (filterStatus) filters.status = filterStatus;

      const [sessionsData, coursesData, statsData] = await Promise.all([
        getAllSessions(filters),
        supabase.from('courses').select('*').order('title'),
        getSessionStats()
      ]);

      setSessions(sessionsData);
      setCourses((coursesData.data || []) as Course[]);
      setStats(statsData);
    } catch (err) {
      console.error('Failed to load data:', err);
      showError('Failed to load live sessions.');
    } finally {
      setLoading(false);
    }
  };

  const handleStartSession = async (sessionId: string) => {
    try {
      await startSession(sessionId);
      success('Session started!');
      loadData();
    } catch (err) {
      showError('Failed to start session.');
    }
  };

  const handleCompleteSession = async (sessionId: string) => {
    try {
      await completeSession(sessionId, true, true);
      success('Session completed and materials unlocked.');
      loadData();
    } catch (err) {
      showError('Failed to complete session.');
    }
  };

  const handleCancelSession = async (sessionId: string) => {
    if (!confirm('Are you sure you want to cancel this session?')) return;
    try {
      await cancelSession(sessionId);
      success('Session cancelled.');
      loadData();
    } catch (err) {
      showError('Failed to cancel session.');
    }
  };

  const handleDeleteSession = async (sessionId: string) => {
    if (!confirm('Are you sure you want to delete this session? This cannot be undone.')) return;
    try {
      await deleteSession(sessionId);
      success('Session deleted.');
      loadData();
    } catch (err) {
      showError('Failed to delete session.');
    }
  };

  // Group sessions
  const liveSessions = sessions.filter(s => s.status === 'live');
  const scheduledSessions = sessions.filter(s => s.status === 'scheduled');
  const completedSessions = sessions.filter(s => s.status === 'completed');
  const cancelledSessions = sessions.filter(s => s.status === 'cancelled');

  return (
    <div className="p-6 lg:p-8 max-w-6xl mx-auto animate-fade-in">
      <PageHeader
        title="Live Classes"
        subtitle="Manage all live sessions across the platform"
        action={
          <Link to="/admin/live-classes/create" className="btn-primary text-sm flex items-center gap-1.5">
            <Plus size={16} />
            Create Live Session
          </Link>
        }
      />

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-6 gap-4 mb-6">
          <div className="card p-4 text-center">
            <p className="text-2xl font-bold text-blue-600">{stats.scheduled}</p>
            <p className="text-xs text-slate-500">Scheduled</p>
          </div>
          <div className="card p-4 text-center">
            <p className="text-2xl font-bold text-red-600">{stats.live}</p>
            <p className="text-xs text-slate-500">Live Now</p>
          </div>
          <div className="card p-4 text-center">
            <p className="text-2xl font-bold text-emerald-600">{stats.completed}</p>
            <p className="text-xs text-slate-500">Completed</p>
          </div>
          <div className="card p-4 text-center">
            <p className="text-2xl font-bold text-slate-600">{stats.cancelled}</p>
            <p className="text-xs text-slate-500">Cancelled</p>
          </div>
          <div className="card p-4 text-center">
            <p className="text-2xl font-bold text-primary-600">{stats.totalAttendance}</p>
            <p className="text-xs text-slate-500">Total Registered</p>
          </div>
          <div className="card p-4 text-center">
            <p className="text-2xl font-bold text-emerald-600">
              {stats.totalAttendance > 0 ? Math.round((stats.attendedCount / stats.totalAttendance) * 100) : 0}%
            </p>
            <p className="text-xs text-slate-500">Attendance Rate</p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="card p-4 mb-6 flex flex-wrap gap-4 items-center">
        <div className="flex items-center gap-2">
          <Filter size={16} className="text-slate-400" />
          <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Filters:</span>
        </div>
        <select
          className="input-field text-sm py-1.5"
          value={filterCourse}
          onChange={e => setFilterCourse(e.target.value)}
        >
          <option value="">All Courses</option>
          {courses.map(c => (
            <option key={c.id} value={c.id}>{c.title}</option>
          ))}
        </select>
        <select
          className="input-field text-sm py-1.5"
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
        >
          <option value="">All Status</option>
          <option value="scheduled">Scheduled</option>
          <option value="live">Live</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="animate-spin text-primary-600" size={24} />
        </div>
      ) : sessions.length === 0 ? (
        <EmptyState
          icon={Video}
          title="No live sessions found"
          description="Create your first live class to get started."
          action={<Link to="/admin/live-classes/create" className="btn-primary text-sm">Create Live Session</Link>}
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
                  <SessionCard
                    key={session.id}
                    session={session}
                    onToggleMenu={setOpenMenu}
                    openMenu={openMenu}
                    onStart={handleStartSession}
                    onComplete={handleCompleteSession}
                    onCancel={handleCancelSession}
                    onDelete={handleDeleteSession}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Scheduled */}
          {scheduledSessions.length > 0 && (
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-4">
                Scheduled ({scheduledSessions.length})
              </h2>
              <div className="space-y-3">
                {scheduledSessions.map(session => (
                  <SessionCard
                    key={session.id}
                    session={session}
                    onToggleMenu={setOpenMenu}
                    openMenu={openMenu}
                    onStart={handleStartSession}
                    onComplete={handleCompleteSession}
                    onCancel={handleCancelSession}
                    onDelete={handleDeleteSession}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Completed */}
          {completedSessions.length > 0 && (
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-4">
                Completed ({completedSessions.length})
              </h2>
              <div className="space-y-3">
                {completedSessions.slice(0, 10).map(session => (
                  <SessionCard
                    key={session.id}
                    session={session}
                    onToggleMenu={setOpenMenu}
                    openMenu={openMenu}
                    onStart={handleStartSession}
                    onComplete={handleCompleteSession}
                    onCancel={handleCancelSession}
                    onDelete={handleDeleteSession}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Cancelled */}
          {cancelledSessions.length > 0 && (
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-4">
                Cancelled ({cancelledSessions.length})
              </h2>
              <div className="space-y-3">
                {cancelledSessions.map(session => (
                  <SessionCard
                    key={session.id}
                    session={session}
                    onToggleMenu={setOpenMenu}
                    openMenu={openMenu}
                    onStart={handleStartSession}
                    onComplete={handleCompleteSession}
                    onCancel={handleCancelSession}
                    onDelete={handleDeleteSession}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
