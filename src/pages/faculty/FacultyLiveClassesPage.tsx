import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Video, Plus, Calendar, Clock, Users, MoreVertical, Edit, Play, CheckCircle,
  XCircle, ExternalLink, Loader2, AlertCircle, HelpCircle, Trash2, Filter, FileText
} from 'lucide-react';
import { PageHeader } from '../../components/common/PageHeader';
import { EmptyState } from '../../components/ui/EmptyState';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../components/ui/Toast';
import {
  getFacultySessions, startSession, completeSession, cancelSession, deleteSession, isValidGoogleMeetUrl,
  type SessionWithDetails
} from '../../services/liveSessions';
import { getFacultyCourses } from '../../services/faculty';
import type { LiveSession, Course } from '../../types/database';

function SessionCard({
  session,
  onToggleMenu,
  openMenu,
  onStart,
  onComplete,
  onCancel,
  onDelete,
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
  const isScheduled = session.status === 'scheduled';
  const hasMeetLink = Boolean(session.google_meet_url && isValidGoogleMeetUrl(session.google_meet_url));

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

          {/* Primary session actions should be visible, not hidden in the menu. */}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {(isScheduled || isLive) && hasMeetLink && (
              <a
                href={session.google_meet_url!}
                target="_blank"
                rel="noopener noreferrer"
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-white transition-colors ${
                  isLive ? 'bg-red-600 hover:bg-red-700' : 'bg-primary-600 hover:bg-primary-700'
                }`}
              >
                <ExternalLink size={13} />
                {isLive ? 'Join Live Class' : 'Open Google Meet'}
              </a>
            )}

            {isScheduled && hasMeetLink && (
              <button
                type="button"
                onClick={() => onStart(session.id)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
              >
                <Play size={13} />
                Start Class
              </button>
            )}

            {isLive && (
              <button
                type="button"
                onClick={() => onComplete(session.id)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-slate-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800"
              >
                <CheckCircle size={13} />
                Complete Class
              </button>
            )}

            <Link
              to={`/faculty/live-classes/${session.id}/attendance`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              <Users size={13} />
              {isCompleted ? 'View Attendance' : 'Attendance'}
            </Link>

            {(isCompleted || isLive || isScheduled) && (
              <Link
                to={`/faculty/live-classes/${session.id}/edit`}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                <FileText size={13} />
                {isCompleted ? 'Materials & Recording' : 'Manage Materials'}
              </Link>
            )}

            {isScheduled && !hasMeetLink && (
              <>
                <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-600 dark:text-amber-400">
                  <AlertCircle size={13} />
                  Meet link not generated
                </span>
                <Link
                  to={`/faculty/live-classes/${session.id}/edit`}
                  className="text-xs font-semibold text-primary-600 hover:underline dark:text-primary-400"
                >
                  Edit session
                </Link>
              </>
            )}
          </div>
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
              <div className="absolute right-0 top-full mt-1 w-48 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 py-1 z-50">
                {isScheduled && (
                  <>
                    <Link
                      to={`/faculty/live-classes/${session.id}/edit`}
                      className="w-full px-4 py-2 text-left text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-2"
                      onClick={() => onToggleMenu('')}
                    >
                      <Edit size={14} /> Edit Session
                    </Link>
                    <Link
                      to={`/faculty/live-classes/${session.id}/attendance`}
                      className="w-full px-4 py-2 text-left text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-2"
                      onClick={() => onToggleMenu('')}
                    >
                      <Users size={14} /> View Attendance
                    </Link>
                    {session.google_meet_url && isValidGoogleMeetUrl(session.google_meet_url) && (
                      <a
                        href={session.google_meet_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-full px-4 py-2 text-left text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-2"
                        onClick={() => onToggleMenu('')}
                      >
                        <ExternalLink size={14} /> Open Meet Link
                      </a>
                    )}
                    <hr className="my-1 border-slate-200 dark:border-slate-700" />
                    <button
                      onClick={() => { onToggleMenu(''); onStart(session.id); }}
                      className="w-full px-4 py-2 text-left text-sm text-emerald-600 dark:text-emerald-400 hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-2"
                    >
                      <Play size={14} /> Start Session
                    </button>
                    <button
                      onClick={() => { onToggleMenu(''); onCancel(session.id); }}
                      className="w-full px-4 py-2 text-left text-sm text-red-600 dark:text-red-400 hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-2"
                    >
                      <XCircle size={14} /> Cancel Session
                    </button>
                  </>
                )}
                {isLive && (
                  <>
                    {session.google_meet_url && isValidGoogleMeetUrl(session.google_meet_url) && (
                      <a
                        href={session.google_meet_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-full px-4 py-2 text-left text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-2"
                        onClick={() => onToggleMenu('')}
                      >
                        <ExternalLink size={14} /> Join Meeting
                      </a>
                    )}
                    <Link
                      to={`/faculty/live-classes/${session.id}/attendance`}
                      className="w-full px-4 py-2 text-left text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-2"
                      onClick={() => onToggleMenu('')}
                    >
                      <Users size={14} /> Manage Attendance
                    </Link>
                    <hr className="my-1 border-slate-200 dark:border-slate-700" />
                    <button
                      onClick={() => { onToggleMenu(''); onComplete(session.id); }}
                      className="w-full px-4 py-2 text-left text-sm text-emerald-600 dark:text-emerald-400 hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-2"
                    >
                      <CheckCircle size={14} /> Complete Session
                    </button>
                  </>
                )}
                {isCompleted && (
                  <>
                    <Link
                      to={`/faculty/live-classes/${session.id}/edit`}
                      className="w-full px-4 py-2 text-left text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-2"
                      onClick={() => onToggleMenu('')}
                    >
                      <Edit size={14} /> Edit Session
                    </Link>
                    <Link
                      to={`/faculty/live-classes/${session.id}/attendance`}
                      className="w-full px-4 py-2 text-left text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-2"
                      onClick={() => onToggleMenu('')}
                    >
                      <Users size={14} /> View Attendance
                    </Link>
                    <hr className="my-1 border-slate-200 dark:border-slate-700" />
                    <button
                      onClick={() => { onToggleMenu(''); onDelete(session.id); }}
                      className="w-full px-4 py-2 text-left text-sm text-red-600 dark:text-red-400 hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-2"
                    >
                      <Trash2 size={14} /> Delete Session
                    </button>
                  </>
                )}
                {isCancelled && (
                  <button
                    onClick={() => { onToggleMenu(''); onDelete(session.id); }}
                    className="w-full px-4 py-2 text-left text-sm text-red-600 dark:text-red-400 hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-2"
                  >
                    <Trash2 size={14} /> Delete Session
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function FacultyLiveClassesPage() {
  const { profile } = useAuth();
  const { success, error: showError } = useToast();
  const [sessions, setSessions] = useState<SessionWithDetails[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [filterCourse, setFilterCourse] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [showGoogleMeetHelp, setShowGoogleMeetHelp] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  useEffect(() => {
    if (!profile) return;
    loadSessions();
    getFacultyCourses(profile.id).then(setCourses).catch(() => {});
  }, [profile]);

  const loadSessions = async () => {
    try {
      const data = await getFacultySessions(profile!.id);
      setSessions(data);
    } catch (err) {
      console.error('Failed to load sessions:', err);
      showError('Failed to load live sessions.');
    } finally {
      setLoading(false);
    }
  };

  const handleStartSession = async (sessionId: string) => {
    try {
      await startSession(sessionId);
      success('Session started! Students can now join.');
      loadSessions();
    } catch (err) {
      showError('Failed to start session.');
    }
  };

  const handleCompleteSession = async (sessionId: string) => {
    try {
      await completeSession(sessionId, false, false);
      success('Session completed! Add materials and a recording from Edit Session, then unlock them for students.');
      loadSessions();
    } catch (err) {
      showError('Failed to complete session.');
    }
  };

  const handleCancelSession = async (sessionId: string) => {
    if (!confirm('Are you sure you want to cancel this session? Students will be notified.')) return;
    try {
      await cancelSession(sessionId);
      success('Session cancelled. Students have been notified.');
      loadSessions();
    } catch (err) {
      showError('Failed to cancel session.');
    }
  };

  const handleDeleteSession = async () => {
    if (!deleteTarget) return;
    try {
      await deleteSession(deleteTarget);
      success('Session deleted.');
      setDeleteTarget(null);
      loadSessions();
    } catch (err) {
      showError('Failed to delete session.');
    }
  };

  const filtered = filterCourse ? sessions.filter(s => s.course_id === filterCourse) : sessions;
  const liveSessions = filtered.filter(s => s.status === 'live');
  const scheduledSessions = filtered.filter(s => s.status === 'scheduled');
  const completedSessions = filtered.filter(s => s.status === 'completed');
  const cancelledSessions = filtered.filter(s => s.status === 'cancelled');

  if (!profile) return null;

  return (
    <div className="p-6 lg:p-8 max-w-5xl mx-auto animate-fade-in">
      <PageHeader
        title="Live Classes"
        subtitle="Schedule and manage Google Meet sessions for your courses"
        action={
          <div className="flex gap-2">
            <button
              onClick={() => setShowGoogleMeetHelp(true)}
              className="btn-ghost text-xs flex items-center gap-1.5"
            >
              <HelpCircle size={14} />
              Google Meet Help
            </button>
            <Link to="/faculty/live-classes/create" className="btn-primary text-sm flex items-center gap-1.5">
              <Plus size={16} />
              Schedule Live Class
            </Link>
          </div>
        }
      />

      {courses.length > 1 && (
        <div className="flex items-center gap-2 mb-6">
          <Filter size={14} className="text-slate-400" />
          <select
            className="input text-sm py-1.5 w-auto"
            value={filterCourse}
            onChange={e => setFilterCourse(e.target.value)}
          >
            <option value="">All Courses</option>
            {courses.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
          </select>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="animate-spin text-primary-600" size={24} />
        </div>
      ) : sessions.length === 0 ? (
        <EmptyState
          icon={Video}
          title="No live sessions scheduled"
          description="Create your first live class to engage with your students."
          action={<Link to="/faculty/live-classes/create" className="btn-primary text-sm">Schedule Live Class</Link>}
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
                    onDelete={setDeleteTarget}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Scheduled */}
          {scheduledSessions.length > 0 && (
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-4">
                Scheduled Classes ({scheduledSessions.length})
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
                    onDelete={setDeleteTarget}
                  />
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
                  <SessionCard
                    key={session.id}
                    session={session}
                    onToggleMenu={setOpenMenu}
                    openMenu={openMenu}
                    onStart={handleStartSession}
                    onComplete={handleCompleteSession}
                    onCancel={handleCancelSession}
                    onDelete={setDeleteTarget}
                  />
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
                  <SessionCard
                    key={session.id}
                    session={session}
                    onToggleMenu={setOpenMenu}
                    openMenu={openMenu}
                    onStart={handleStartSession}
                    onComplete={handleCompleteSession}
                    onCancel={handleCancelSession}
                    onDelete={setDeleteTarget}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Delete Confirmation */}
      <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Delete Session" size="sm">
        <p className="text-sm text-slate-600 dark:text-slate-300 mb-4">Are you sure you want to permanently delete this session?</p>
        <div className="flex gap-3 justify-end">
          <button onClick={() => setDeleteTarget(null)} className="btn-secondary">Cancel</button>
          <button onClick={handleDeleteSession} className="btn-primary bg-red-600 hover:bg-red-700 flex items-center gap-2">
            <Trash2 size={14} /> Delete
          </button>
        </div>
      </Modal>

      {/* Google Meet Help Modal */}
      <Modal
        open={showGoogleMeetHelp}
        onClose={() => setShowGoogleMeetHelp(false)}
        title="How to Use Google Meet"
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Follow these steps to set up Google Meet for your live classes:
          </p>
          <ol className="space-y-3 text-sm text-slate-600 dark:text-slate-300 list-decimal list-inside">
            <li>Go to Google Calendar or Google Meet</li>
            <li>Create a new meeting and copy the Meet link</li>
            <li>Paste the link when creating a Live Class in Kaveri Academy</li>
            <li>Start the session when class begins</li>
            <li>Mark the session completed after class ends</li>
            <li>Unlock slides and materials for students</li>
          </ol>
          <div className="flex gap-2 mt-4">
            <a
              href="https://meet.google.com"
              target="_blank"
              rel="noopener noreferrer"
              className="btn-primary text-sm flex items-center gap-2"
            >
              <ExternalLink size={14} />
              Open Google Meet
            </a>
            <button onClick={() => setShowGoogleMeetHelp(false)} className="btn-secondary text-sm">
              Close
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
