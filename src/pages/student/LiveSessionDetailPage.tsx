import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  Video, Calendar, Clock, Users, ExternalLink, CheckCircle, XCircle,
  AlertCircle, ChevronLeft, Loader2, FileText, Code, HelpCircle,
  Download, File, BookOpen, Play, Hourglass, Film,
} from 'lucide-react';
import { PageHeader } from '../../components/common/PageHeader';
import { EmptyState } from '../../components/ui/EmptyState';
import { Badge } from '../../components/ui/Badge';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../components/ui/Toast';
import {
  getStudentSession, getSessionRecordingStatus, registerForSession, isSessionJoinable, getTimeUntilSession,
  type SessionWithDetails
} from '../../services/liveSessions';
import type { SessionResource } from '../../types/database';

const resourceIcons: Record<string, React.ReactNode> = {
  slides: <FileText size={16} />,
  notes: <BookOpen size={16} />,
  practice_questions: <HelpCircle size={16} />,
  code_example: <Code size={16} />,
  quiz: <HelpCircle size={16} />,
  assignment: <FileText size={16} />,
  downloadable: <Download size={16} />,
  recording: <Video size={16} />,
};

function ResourceCard({ resource }: { resource: SessionResource }) {
  const isExternal = resource.external_url;
  const hasContent = resource.content;

  return (
    <div className="card p-4 hover:shadow-md transition-shadow">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center text-primary-600 dark:text-primary-400 flex-shrink-0">
          {resourceIcons[resource.resource_type] || <File size={16} />}
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="font-semibold text-slate-900 dark:text-white text-sm">{resource.title}</h4>
          <p className="text-xs text-slate-500 dark:text-slate-400 capitalize mt-0.5">
            {resource.resource_type.replace('_', ' ')}
          </p>
          {hasContent && (
            <div className="mt-3 p-3 bg-slate-800 dark:bg-slate-950 rounded-lg overflow-x-auto">
              <pre className="text-xs text-slate-200 font-mono whitespace-pre-wrap">{resource.content}</pre>
            </div>
          )}
          {isExternal && (
            <a
              href={resource.external_url!}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-secondary text-xs mt-3 inline-flex items-center gap-1.5"
            >
              <ExternalLink size={12} />
              Open Resource
            </a>
          )}
          {resource.file_url && (
            <a
              href={resource.file_url}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-secondary text-xs mt-3 inline-flex items-center gap-1.5"
            >
              <Download size={12} />
              Download
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

export default function LiveSessionDetailPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const { profile } = useAuth();
  const { error: showError } = useToast();
  const [session, setSession] = useState<SessionWithDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [recordingStatus, setRecordingStatus] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionId || !profile) return;
    loadSession();
  }, [sessionId, profile]);

  const loadSession = async () => {
    try {
      const data = await getStudentSession(sessionId!, profile!.id);
      if (!data) {
        showError('Session not found or you are not enrolled in this course.');
        setLoading(false);
        return;
      }
      setSession(data);
      const status = await getSessionRecordingStatus(sessionId!);
      setRecordingStatus(status);
    } catch (err) {
      console.error('Failed to load session:', err);
      showError('Failed to load session details.');
    } finally {
      setLoading(false);
    }
  };

  const handleJoinSession = async () => {
    if (!session?.google_meet_url) return;
    await registerForSession(session.id, profile!.id);
    window.open(session.google_meet_url, '_blank', 'noopener,noreferrer');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="animate-spin text-primary-600" size={32} />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="p-6 lg:p-8">
        <EmptyState
          icon={Video}
          title="Session not found"
          description="This session may not exist or you don't have access to it."
          action={<Link to="/student/live-classes" className="btn-primary text-sm">Back to Live Classes</Link>}
        />
      </div>
    );
  }

  const sessionDate = new Date(session.session_date);
  const isJoinable = isSessionJoinable(session);
  const isLive = session.status === 'live';
  const isCompleted = session.status === 'completed';
  const isScheduled = session.status === 'scheduled';
  const isCancelled = session.status === 'cancelled';

  const recordingResource = (session.resources ?? []).find(r => r.resource_type === 'recording');
  const otherResources = (session.resources ?? []).filter(r => r.resource_type !== 'recording');
  const showRecording = isCompleted && recordingStatus === 'available' && recordingResource;
  const recordingPending = isCompleted && recordingStatus === 'pending';
  const recordingNone = isCompleted && recordingStatus === 'none';

  const statusConfig: Record<string, { bg: string; text: string }> = {
    live: { bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-700 dark:text-red-400' },
    scheduled: { bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-700 dark:text-blue-400' },
    completed: { bg: 'bg-emerald-100 dark:bg-emerald-900/30', text: 'text-emerald-700 dark:text-emerald-400' },
    cancelled: { bg: 'bg-slate-100 dark:bg-slate-800', text: 'text-slate-600 dark:text-slate-400' },
  };
  const cfg = statusConfig[session.status];


  return (
    <div className="p-6 lg:p-8 max-w-5xl mx-auto animate-fade-in">
      {/* Back link */}
      <Link
        to="/student/live-classes"
        className="inline-flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400 hover:text-primary-600 dark:hover:text-primary-400 mb-4"
      >
        <ChevronLeft size={16} />
        Back to Live Classes
      </Link>

      <PageHeader
        title={session.title}
        subtitle={session.course?.title || 'Course Session'}
      />

      <div className="grid lg:grid-cols-3 gap-6 mt-6">
        {/* Main content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Status banner */}
          {isLive && (
            <div className="p-4 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
                <div>
                  <p className="font-semibold text-red-900 dark:text-red-100">Class is live now</p>
                  <p className="text-xs text-red-700 dark:text-red-300">Join the live session. A recording may be published after the class.</p>
                </div>
              </div>
            </div>
          )}

          {isCompleted && (
            <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800">
              <div className="flex items-center gap-3">
                <CheckCircle className="text-emerald-600 dark:text-emerald-400" size={20} />
                <div>
                  <p className="font-semibold text-emerald-900 dark:text-emerald-100">Session completed</p>
                  <p className="text-xs text-emerald-700 dark:text-emerald-300">
                    {recordingStatus === 'available'
                      ? 'The class recording and materials are available below.'
                      : 'Class is over. Recording and materials appear below when the faculty publishes them.'}
                  </p>
                </div>
              </div>
            </div>
          )}

          {isScheduled && (
            <div className="p-4 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
              <div className="flex items-center gap-3">
                <Calendar className="text-blue-600 dark:text-blue-400" size={20} />
                <div>
                  <p className="font-semibold text-blue-900 dark:text-blue-100">Upcoming live class</p>
                  <p className="text-xs text-blue-700 dark:text-blue-300">
                    Join at the scheduled time. A recording may be published after the class ends.
                  </p>
                </div>
              </div>
            </div>
          )}

          {isCancelled && (
            <div className="p-4 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
              <div className="flex items-center gap-3">
                <XCircle className="text-slate-500 dark:text-slate-400" size={20} />
                <div>
                  <p className="font-semibold text-slate-700 dark:text-slate-300">This class was cancelled</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">No join link is available for a cancelled class.</p>
                </div>
              </div>
            </div>
          )}

          {/* Recording state for completed sessions */}
          {isCompleted && (
            <div className="card p-5">
              <div className="flex items-center gap-3">
                <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${showRecording ? 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400' : 'bg-slate-100 dark:bg-slate-800 text-slate-400'}`}>
                  {showRecording ? <Play size={20} /> : <Film size={20} />}
                </div>
                <div className="flex-1 min-w-0">
                  {showRecording ? (
                    <>
                      <p className="font-semibold text-slate-900 dark:text-white text-sm">Class recording available</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{recordingResource.title}</p>
                    </>
                  ) : recordingPending ? (
                    <>
                      <p className="font-semibold text-slate-900 dark:text-white text-sm">Recording not yet released</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">The faculty is preparing the recording. Check back later.</p>
                    </>
                  ) : (
                    <>
                      <p className="font-semibold text-slate-900 dark:text-white text-sm">Recording coming soon</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">The faculty has not published a recording for this class yet.</p>
                    </>
                  )}
                </div>
                {showRecording && (
                  <a
                    href={recordingResource.external_url || recordingResource.file_url || '#'}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-primary text-xs flex items-center gap-1.5 flex-shrink-0"
                  >
                    <Play size={13} />
                    Watch Recording
                  </a>
                )}
                {recordingPending && (
                  <span className="flex items-center gap-1.5 text-xs text-slate-400 flex-shrink-0">
                    <Hourglass size={13} />
                    Pending
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Description */}
          {session.description && (
            <div className="card p-6">
              <h3 className="font-bold text-slate-900 dark:text-white mb-3">About this session</h3>
              <p className="text-sm text-slate-600 dark:text-slate-300 whitespace-pre-wrap">{session.description}</p>
            </div>
          )}

          {/* Materials (unlocked resources visible per-resource for any active/completed session) */}
          {!isCancelled && otherResources.length > 0 && (
            <div>
              <h3 className="font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                <FileText size={18} />
                {isScheduled ? 'Preparation Materials' : 'Session Materials'}
              </h3>
              <div className="space-y-3">
                {otherResources.map(resource => (
                  <ResourceCard key={resource.id} resource={resource} />
                ))}
              </div>
            </div>
          )}

          {/* Locked/unpublished materials message */}
          {!isCancelled && (isCompleted || isScheduled || isLive) && otherResources.length === 0 && !showRecording && (
            <div className="card p-6 text-center">
              <AlertCircle className="mx-auto text-slate-400 mb-3" size={32} />
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                {isScheduled ? 'No preparation materials released yet' : 'Materials not yet available'}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                {isScheduled
                  ? 'The faculty may release preparation materials before the class.'
                  : 'The faculty will add and unlock session materials here.'}
              </p>
            </div>
          )}

          {/* Preparation notes for scheduled sessions */}
          {isScheduled && session.preparation_notes && (
            <div className="card p-6">
              <h3 className="font-bold text-slate-900 dark:text-white mb-3">Preparation</h3>
              <p className="text-sm text-slate-600 dark:text-slate-300 whitespace-pre-wrap">{session.preparation_notes}</p>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Session details card */}
          <div className="card p-6">
            <div className="flex items-center justify-between mb-4">
              <Badge className={`${cfg.bg} ${cfg.text}`}>
                {isLive && <div className="w-2 h-2 rounded-full bg-current animate-pulse mr-1.5" />}
                {session.status.charAt(0).toUpperCase() + session.status.slice(1)}
              </Badge>
              {session.attendance && (
                <span className="text-xs text-slate-500 dark:text-slate-400 capitalize">
                  {session.attendance.attendance_status}
                </span>
              )}
            </div>

            <div className="space-y-3 text-sm">
              <div className="flex items-center gap-3">
                <Calendar className="text-slate-400" size={16} />
                <span className="text-slate-700 dark:text-slate-300">
                  {sessionDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <Clock className="text-slate-400" size={16} />
                <span className="text-slate-700 dark:text-slate-300">
                  {sessionDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <Users className="text-slate-400" size={16} />
                <span className="text-slate-700 dark:text-slate-300">{session.duration_minutes} minutes</span>
              </div>
            </div>

            {session.faculty && (
              <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700">
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">Instructor</p>
                <p className="text-sm font-medium text-slate-900 dark:text-white">
                  {session.faculty.full_name || 'Instructor'}
                </p>
              </div>
            )}

            {/* Join button for live sessions */}
            {isJoinable && session.google_meet_url && (
              <button
                onClick={handleJoinSession}
                className="btn-primary w-full mt-4 flex items-center justify-center gap-2"
              >
                <Video size={16} />
                {isLive ? 'Join Live Class' : 'Join Session'}
              </button>
            )}

            {/* Countdown for scheduled */}
            {isScheduled && !isJoinable && (
              <div className="mt-4 p-3 rounded-lg bg-slate-100 dark:bg-slate-800 text-center">
                <p className="text-xs text-slate-500 dark:text-slate-400">Starts in</p>
                <p className="text-sm font-bold text-primary-600 dark:text-primary-400">{getTimeUntilSession(session)}</p>
              </div>
            )}

            {/* Add to calendar */}
            {isScheduled && (
              <button
                onClick={() => {
                  const event = new URLSearchParams({
                    action: 'TEMPLATE',
                    text: session.title,
                    dates: `${sessionDate.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')}/${new Date(sessionDate.getTime() + session.duration_minutes * 60000).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')}`,
                    details: session.description || '',
                    location: session.google_meet_url || '',
                  });
                  window.open(`https://calendar.google.com/calendar/render?${event}`, '_blank', 'noopener,noreferrer');
                }}
                className="btn-ghost w-full mt-2 flex items-center justify-center gap-2 text-xs"
              >
                <Calendar size={14} />
                Add to Google Calendar
              </button>
            )}
          </div>

          {/* Attendance info */}
          {session.attendance_required && (
            <div className="card p-4">
              <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
                <AlertCircle size={16} />
                <p className="text-xs font-medium">Attendance required</p>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                This session requires attendance confirmation.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
