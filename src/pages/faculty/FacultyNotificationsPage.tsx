import { useCallback, useEffect, useState, type LucideIcon } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Archive,
  Bell,
  BellRing,
  CheckCheck,
  CheckCircle,
  ExternalLink,
  Info,
  Inbox,
  Loader2,
  Megaphone,
  RefreshCw,
  RotateCcw,
  Save,
  Settings,
  Star,
  Trash2,
  AlertTriangle,
  XCircle,
} from 'lucide-react';
import { PageHeader } from '../../components/common/PageHeader';
import { EmptyState } from '../../components/ui/EmptyState';
import { useToast } from '../../components/ui/Toast';
import { useAuth } from '../../contexts/AuthContext';
import { formatRelativeTime } from '../../lib/utils';
import {
  deleteNotification,
  DEFAULT_NOTIFICATION_PREFERENCES,
  getNotificationPreferences,
  getNotificationSummary,
  getUserNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  saveNotificationPreferences,
  setNotificationArchived,
  subscribeToUserNotifications,
  type NotificationSummary,
  type NotificationView,
} from '../../services/notifications';
import type { Notification } from '../../types/database';

const THRESHOLD_OPTIONS = [10, 25, 50, 100, 200];

const TYPE_CONFIG: Record<string, { icon: LucideIcon; color: string; bg: string; label: string }> = {
  info: { icon: Info, color: 'text-blue-500', bg: 'bg-blue-100 dark:bg-blue-900/30', label: 'Information' },
  success: { icon: CheckCircle, color: 'text-emerald-500', bg: 'bg-emerald-100 dark:bg-emerald-900/30', label: 'Success' },
  warning: { icon: AlertTriangle, color: 'text-amber-500', bg: 'bg-amber-100 dark:bg-amber-900/30', label: 'Attention' },
  error: { icon: XCircle, color: 'text-red-500', bg: 'bg-red-100 dark:bg-red-900/30', label: 'Error' },
  assignment: { icon: BellRing, color: 'text-primary-500', bg: 'bg-primary-100 dark:bg-primary-900/30', label: 'Assignment' },
  announcement: { icon: Megaphone, color: 'text-teal-500', bg: 'bg-teal-100 dark:bg-teal-900/30', label: 'Announcement' },
  grade: { icon: Star, color: 'text-violet-500', bg: 'bg-violet-100 dark:bg-violet-900/30', label: 'Grade' },
  submission: { icon: Inbox, color: 'text-indigo-500', bg: 'bg-indigo-100 dark:bg-indigo-900/30', label: 'Submissions' },
  quiz: { icon: BellRing, color: 'text-cyan-500', bg: 'bg-cyan-100 dark:bg-cyan-900/30', label: 'Quiz' },
  project: { icon: Star, color: 'text-fuchsia-500', bg: 'bg-fuchsia-100 dark:bg-fuchsia-900/30', label: 'Project' },
  live_class: { icon: Bell, color: 'text-sky-500', bg: 'bg-sky-100 dark:bg-sky-900/30', label: 'Live class' },
  student: { icon: Info, color: 'text-lime-600', bg: 'bg-lime-100 dark:bg-lime-900/30', label: 'Student' },
  support: { icon: AlertTriangle, color: 'text-orange-500', bg: 'bg-orange-100 dark:bg-orange-900/30', label: 'Support' },
};

const FILTERS: Array<{ value: NotificationView; label: string; icon: LucideIcon }> = [
  { value: 'inbox', label: 'Inbox', icon: Inbox },
  { value: 'unread', label: 'Unread', icon: BellRing },
  { value: 'archived', label: 'Archived', icon: Archive },
];

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && error && 'message' in error) return String(error.message);
  return 'Please try again.';
}

export default function FacultyNotificationsPage() {
  const navigate = useNavigate();
  const { error: showError, success: showSuccess } = useToast();
  const { profile } = useAuth();
  const [view, setView] = useState<NotificationView>('inbox');
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [summary, setSummary] = useState<NotificationSummary>({ inbox: 0, unread: 0, archived: 0 });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const [preferencesLoading, setPreferencesLoading] = useState(false);
  const [preferencesSaving, setPreferencesSaving] = useState(false);
  const [submissionNotificationsEnabled, setSubmissionNotificationsEnabled] = useState(
    DEFAULT_NOTIFICATION_PREFERENCES.assignment_submission_notifications_enabled
  );
  const [submissionThreshold, setSubmissionThreshold] = useState(
    DEFAULT_NOTIFICATION_PREFERENCES.assignment_submission_threshold
  );

  const load = useCallback(async (initial = false) => {
    if (!profile?.id) return;
    initial ? setLoading(true) : setRefreshing(true);
    try {
      const [items, counts] = await Promise.all([
        getUserNotifications(profile.id, view),
        getNotificationSummary(profile.id),
      ]);
      setNotifications(items);
      setSummary(counts);
    } catch (error) {
      showError('Could not load notifications', errorMessage(error));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [profile?.id, showError, view]);

  useEffect(() => {
    void load(true);
  }, [load]);

  useEffect(() => {
    if (!profile?.id) return;
    return subscribeToUserNotifications(profile.id, () => void load(false));
  }, [load, profile?.id]);

  const runItemAction = async (id: string, action: () => Promise<void>, success: string) => {
    setBusyId(id);
    try {
      await action();
      showSuccess(success);
      await load(false);
    } catch (error) {
      showError('Notification action failed', errorMessage(error));
    } finally {
      setBusyId(null);
    }
  };

  const handleOpen = async (notification: Notification) => {
    if (!notification.is_read) {
      try {
        await markNotificationRead(notification.id);
        setNotifications(items => items.map(item => item.id === notification.id ? { ...item, is_read: true } : item));
        setSummary(current => ({ ...current, unread: Math.max(0, current.unread - 1) }));
      } catch (error) {
        showError('Could not mark notification as read', errorMessage(error));
      }
    }

    if (notification.action_url?.startsWith('/')) navigate(notification.action_url);
  };

  const handleMarkAll = async () => {
    if (!profile?.id || summary.unread === 0) return;
    try {
      await markAllNotificationsRead(profile.id);
      showSuccess('All notifications marked as read');
      await load(false);
    } catch (error) {
      showError('Could not mark all as read', errorMessage(error));
    }
  };

  const openPreferences = async () => {
    if (!profile?.id) return;
    setPreferencesOpen(true);
    setPreferencesLoading(true);
    try {
      const preferences = await getNotificationPreferences(profile.id);
      setSubmissionNotificationsEnabled(preferences.assignment_submission_notifications_enabled);
      setSubmissionThreshold(preferences.assignment_submission_threshold);
    } catch (error) {
      showError('Could not load notification preferences', errorMessage(error));
    } finally {
      setPreferencesLoading(false);
    }
  };

  const handleSavePreferences = async () => {
    if (!profile?.id) return;
    const threshold = Math.trunc(Number(submissionThreshold));
    if (!Number.isFinite(threshold) || threshold < 1 || threshold > 10000) {
      showError('Invalid submission threshold', 'Enter a whole number between 1 and 10,000.');
      return;
    }

    setPreferencesSaving(true);
    try {
      await saveNotificationPreferences(profile.id, {
        assignment_submission_notifications_enabled: submissionNotificationsEnabled,
        assignment_submission_threshold: threshold,
      });
      setSubmissionThreshold(threshold);
      setPreferencesOpen(false);
      showSuccess('Notification preferences saved');
    } catch (error) {
      showError('Could not save notification preferences', errorMessage(error));
    } finally {
      setPreferencesSaving(false);
    }
  };

  const countFor = (filter: NotificationView) => {
    if (filter === 'inbox') return summary.inbox;
    if (filter === 'unread') return summary.unread;
    return summary.archived;
  };

  return (
    <div className="p-6 lg:p-8 max-w-5xl mx-auto animate-fade-in">
      <PageHeader
        title="Notifications"
        subtitle={summary.unread > 0 ? `${summary.unread} unread update${summary.unread === 1 ? '' : 's'}` : 'You are all caught up'}
        icon={Bell}
        action={
          <div className="flex items-center gap-2">
            <button
              onClick={() => void openPreferences()}
              className="btn-secondary text-sm flex items-center gap-2"
            >
              <Settings size={14} /> Preferences
            </button>
            <button
              onClick={() => void load(false)}
              className="btn-secondary text-sm flex items-center gap-2"
              disabled={refreshing}
            >
              <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} /> Refresh
            </button>
            {summary.unread > 0 && (
              <button onClick={() => void handleMarkAll()} className="btn-primary text-sm flex items-center gap-2">
                <CheckCheck size={14} /> Mark all read
              </button>
            )}
          </div>
        }
      />

      <div className="grid grid-cols-3 gap-3 mb-6">
        {FILTERS.map(filter => {
          const Icon = filter.icon;
          const active = view === filter.value;
          return (
            <button
              key={filter.value}
              onClick={() => setView(filter.value)}
              className={`card p-4 text-left transition-all ${active ? 'ring-2 ring-primary-500 bg-primary-50/60 dark:bg-primary-900/15' : 'hover:border-primary-300'}`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Icon size={17} className={active ? 'text-primary-500' : 'text-slate-400'} />
                  <span className="text-sm font-semibold text-slate-700 dark:text-slate-200 truncate">{filter.label}</span>
                </div>
                <span className="text-lg font-bold text-slate-900 dark:text-white">{countFor(filter.value)}</span>
              </div>
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <div key={i} className="h-28 bg-slate-100 dark:bg-slate-800 rounded-2xl animate-pulse" />)}
        </div>
      ) : notifications.length === 0 ? (
        <EmptyState
          icon={view === 'archived' ? Archive : view === 'unread' ? BellRing : Bell}
          title={view === 'archived' ? 'No archived notifications' : view === 'unread' ? 'No unread notifications' : 'No notifications yet'}
          description={view === 'archived' ? 'Notifications you archive will appear here.' : 'New teaching updates, submissions, announcements, and reminders will appear here.'}
        />
      ) : (
        <div className="space-y-3">
          {notifications.map(notification => {
            const config = TYPE_CONFIG[notification.type] ?? TYPE_CONFIG.info;
            const Icon = config.icon;
            const busy = busyId === notification.id;
            const hasAction = Boolean(notification.action_url?.startsWith('/'));
            return (
              <article
                key={notification.id}
                onClick={() => void handleOpen(notification)}
                className={`card p-5 flex items-start gap-4 transition-all ${hasAction || !notification.is_read ? 'cursor-pointer hover:border-primary-300 hover:shadow-md' : ''} ${!notification.is_read ? 'border-l-4 border-l-primary-500 bg-primary-50/40 dark:bg-primary-900/10' : ''}`}
              >
                <div className={`w-11 h-11 rounded-xl ${config.bg} flex items-center justify-center flex-shrink-0`}>
                  <Icon size={19} className={config.color} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className={`text-sm ${notification.is_read ? 'font-semibold text-slate-700 dark:text-slate-200' : 'font-bold text-slate-900 dark:text-white'}`}>
                      {notification.title}
                    </h3>
                    <span className="badge badge-neutral text-[10px]">{config.label}</span>
                    {!notification.is_read && <span className="w-2 h-2 rounded-full bg-primary-500" title="Unread" />}
                  </div>
                  <p className="text-sm text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">{notification.message}</p>
                  <div className="flex items-center gap-3 mt-2 text-xs text-slate-400">
                    <span>{formatRelativeTime(notification.created_at)}</span>
                    {hasAction && <span className="inline-flex items-center gap-1 text-primary-500 font-medium">Open related page <ExternalLink size={11} /></span>}
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0" onClick={event => event.stopPropagation()}>
                  {busy ? (
                    <Loader2 size={17} className="animate-spin text-slate-400 m-2" />
                  ) : (
                    <>
                      <button
                        className="p-2 rounded-lg text-slate-400 hover:text-primary-500 hover:bg-primary-50 dark:hover:bg-primary-900/20"
                        title={view === 'archived' ? 'Restore' : 'Archive'}
                        onClick={() => void runItemAction(
                          notification.id,
                          () => setNotificationArchived(notification.id, view !== 'archived'),
                          view === 'archived' ? 'Notification restored' : 'Notification archived'
                        )}
                      >
                        {view === 'archived' ? <RotateCcw size={16} /> : <Archive size={16} />}
                      </button>
                      <button
                        className="p-2 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
                        title="Delete"
                        onClick={() => {
                          if (window.confirm('Delete this notification permanently?')) {
                            void runItemAction(notification.id, () => deleteNotification(notification.id), 'Notification deleted');
                          }
                        }}
                      >
                        <Trash2 size={16} />
                      </button>
                    </>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {preferencesOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4"
          onMouseDown={event => {
            if (event.target === event.currentTarget && !preferencesSaving) setPreferencesOpen(false);
          }}
        >
          <section className="card w-full max-w-xl overflow-hidden shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="notification-preferences-title">
            <header className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 px-6 py-5">
              <div>
                <h2 id="notification-preferences-title" className="text-lg font-bold text-slate-900 dark:text-white">
                  Notification preferences
                </h2>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Control high-volume assignment alerts.</p>
              </div>
              <button
                type="button"
                className="p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:text-slate-200 dark:hover:bg-slate-800"
                onClick={() => setPreferencesOpen(false)}
                disabled={preferencesSaving}
                aria-label="Close notification preferences"
              >
                <XCircle size={19} />
              </button>
            </header>

            {preferencesLoading ? (
              <div className="h-72 flex items-center justify-center">
                <Loader2 size={28} className="animate-spin text-primary-500" />
              </div>
            ) : (
              <div className="p-6 space-y-6">
                <label className="flex items-start justify-between gap-5 rounded-xl border border-slate-200 dark:border-slate-700 p-4 cursor-pointer">
                  <span>
                    <span className="block font-semibold text-slate-900 dark:text-white">Assignment submission updates</span>
                    <span className="block text-sm text-slate-500 dark:text-slate-400 mt-1">
                      Keep one live notification per assignment instead of one notification per student.
                    </span>
                  </span>
                  <input
                    type="checkbox"
                    className="mt-1 h-5 w-5 accent-primary-600"
                    checked={submissionNotificationsEnabled}
                    onChange={event => setSubmissionNotificationsEnabled(event.target.checked)}
                  />
                </label>

                <div className={submissionNotificationsEnabled ? '' : 'opacity-50 pointer-events-none'}>
                  <label htmlFor="submission-notification-threshold" className="label">
                    Alert me again after every
                  </label>
                  <div className="flex items-center gap-3">
                    <input
                      id="submission-notification-threshold"
                      type="number"
                      min={1}
                      max={10000}
                      step={1}
                      className="input flex-1"
                      value={submissionThreshold}
                      onChange={event => setSubmissionThreshold(Number(event.target.value))}
                    />
                    <span className="text-sm font-medium text-slate-600 dark:text-slate-300">submissions</span>
                  </div>
                  <div className="flex flex-wrap gap-2 mt-3">
                    {THRESHOLD_OPTIONS.map(option => (
                      <button
                        key={option}
                        type="button"
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${submissionThreshold === option ? 'bg-primary-600 border-primary-600 text-white' : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-primary-400'}`}
                        onClick={() => setSubmissionThreshold(option)}
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-3 leading-relaxed">
                    The notification count still updates for every submission. It becomes unread on the first submission and whenever the count reaches this interval—for example 50, 100, 150.
                  </p>
                </div>

                <div className="rounded-xl bg-primary-50 dark:bg-primary-900/20 border border-primary-100 dark:border-primary-800 p-4 text-sm text-primary-800 dark:text-primary-200">
                  Even with 1,000 students, each assignment uses only one grouped notification row.
                </div>
              </div>
            )}

            <footer className="flex justify-end gap-3 border-t border-slate-200 dark:border-slate-700 px-6 py-4">
              <button type="button" className="btn-secondary" onClick={() => setPreferencesOpen(false)} disabled={preferencesSaving}>
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary flex items-center gap-2"
                onClick={() => void handleSavePreferences()}
                disabled={preferencesLoading || preferencesSaving}
              >
                {preferencesSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                Save preferences
              </button>
            </footer>
          </section>
        </div>
      )}
    </div>
  );
}
