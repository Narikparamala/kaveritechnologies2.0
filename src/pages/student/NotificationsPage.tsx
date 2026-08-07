import { useEffect, useState } from 'react';
import { Bell, CheckCheck, Info, CheckCircle, AlertTriangle, XCircle, Megaphone, Star } from 'lucide-react';
import { PageHeader } from '../../components/common/PageHeader';
import { EmptyState } from '../../components/ui/EmptyState';
import { useAuth } from '../../contexts/AuthContext';
import { getUserNotifications, markNotificationRead, markAllNotificationsRead } from '../../services/notifications';
import { formatRelativeTime } from '../../lib/utils';
import type { Notification } from '../../types/database';

const TYPE_CONFIG: Record<string, { icon: any; color: string; bg: string }> = {
  info: { icon: Info, color: 'text-blue-500', bg: 'bg-blue-100 dark:bg-blue-900/30' },
  success: { icon: CheckCircle, color: 'text-emerald-500', bg: 'bg-emerald-100 dark:bg-emerald-900/30' },
  warning: { icon: AlertTriangle, color: 'text-amber-500', bg: 'bg-amber-100 dark:bg-amber-900/30' },
  error: { icon: XCircle, color: 'text-red-500', bg: 'bg-red-100 dark:bg-red-900/30' },
  assignment: { icon: Bell, color: 'text-primary-500', bg: 'bg-primary-100 dark:bg-primary-900/30' },
  announcement: { icon: Megaphone, color: 'text-teal-500', bg: 'bg-teal-100 dark:bg-teal-900/30' },
  grade: { icon: Star, color: 'text-emerald-500', bg: 'bg-emerald-100 dark:bg-emerald-900/30' },
};

export default function NotificationsPage() {
  const { profile } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile) return;
    getUserNotifications(profile.id).then(data => {
      setNotifications(data);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [profile]);

  const handleMarkAll = async () => {
    if (!profile) return;
    await markAllNotificationsRead(profile.id);
    setNotifications(ns => ns.map(n => ({ ...n, is_read: true })));
  };

  const handleMarkOne = async (id: string) => {
    await markNotificationRead(id);
    setNotifications(ns => ns.map(n => n.id === id ? { ...n, is_read: true } : n));
  };

  const unreadCount = notifications.filter(n => !n.is_read).length;

  return (
    <div className="p-6 lg:p-8 max-w-3xl mx-auto animate-fade-in">
      <PageHeader
        title="Notifications"
        subtitle={unreadCount > 0 ? `${unreadCount} unread` : 'All caught up'}
        icon={Bell}
        action={
          unreadCount > 0 ? (
            <button onClick={handleMarkAll} className="btn-secondary text-sm flex items-center gap-2">
              <CheckCheck size={14} /> Mark All Read
            </button>
          ) : undefined
        }
      />

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <div key={i} className="h-16 bg-slate-100 dark:bg-slate-800 rounded-2xl animate-pulse" />)}
        </div>
      ) : notifications.length === 0 ? (
        <EmptyState
          icon={Bell}
          title="No notifications yet"
          description="You're all caught up! Notifications will appear here for assignments, grades, and announcements."
        />
      ) : (
        <div className="card divide-y divide-slate-100 dark:divide-slate-700">
          {notifications.map(n => {
            const config = TYPE_CONFIG[n.type] ?? TYPE_CONFIG.info;
            const Icon = config.icon;
            return (
              <div
                key={n.id}
                className={`flex items-start gap-4 px-5 py-4 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors ${!n.is_read ? 'bg-primary-50/40 dark:bg-primary-900/10' : ''}`}
                onClick={() => !n.is_read && handleMarkOne(n.id)}
              >
                <div className={`w-9 h-9 rounded-xl ${config.bg} flex items-center justify-center flex-shrink-0`}>
                  <Icon size={16} className={config.color} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium ${!n.is_read ? 'text-slate-900 dark:text-white' : 'text-slate-600 dark:text-slate-400'}`}>
                    {n.title}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-2">{n.message}</p>
                  <p className="text-xs text-slate-400 mt-1.5">{formatRelativeTime(n.created_at)}</p>
                </div>
                {!n.is_read && (
                  <div className="w-2.5 h-2.5 bg-primary-500 rounded-full mt-2 flex-shrink-0" />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
