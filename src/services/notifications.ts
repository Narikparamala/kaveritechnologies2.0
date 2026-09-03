import { supabase } from '../lib/supabase';
import type { Notification, NotificationPreferences } from '../types/database';

export type NotificationView = 'inbox' | 'unread' | 'archived';

export interface NotificationSummary {
  inbox: number;
  unread: number;
  archived: number;
}

export const DEFAULT_NOTIFICATION_PREFERENCES: Pick<
  NotificationPreferences,
  'assignment_submission_notifications_enabled' | 'assignment_submission_threshold'
> = {
  assignment_submission_notifications_enabled: true,
  assignment_submission_threshold: 50,
};

export async function getNotificationPreferences(userId: string): Promise<NotificationPreferences> {
  const { data, error } = await supabase
    .from('notification_preferences')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;

  if (data) return data as NotificationPreferences;

  const timestamp = new Date().toISOString();
  return {
    user_id: userId,
    ...DEFAULT_NOTIFICATION_PREFERENCES,
    created_at: timestamp,
    updated_at: timestamp,
  };
}

export async function saveNotificationPreferences(
  userId: string,
  preferences: Pick<
    NotificationPreferences,
    'assignment_submission_notifications_enabled' | 'assignment_submission_threshold'
  >
) {
  const { data, error } = await supabase
    .from('notification_preferences')
    .upsert(
      {
        user_id: userId,
        assignment_submission_notifications_enabled: preferences.assignment_submission_notifications_enabled,
        assignment_submission_threshold: preferences.assignment_submission_threshold,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    )
    .select('*')
    .single();

  if (error) throw error;
  return data as NotificationPreferences;
}

export async function getUserNotifications(userId: string, view: NotificationView = 'inbox') {
  let query = supabase
    .from('notifications')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(100);

  if (view === 'archived') {
    query = query.not('archived_at', 'is', null);
  } else {
    query = query.is('archived_at', null);
    if (view === 'unread') query = query.eq('is_read', false);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as Notification[];
}

export async function getNotificationSummary(userId: string): Promise<NotificationSummary> {
  const { data, error } = await supabase
    .from('notifications')
    .select('is_read, archived_at')
    .eq('user_id', userId);

  if (error) throw error;

  return (data ?? []).reduce<NotificationSummary>(
    (summary, item) => {
      if (item.archived_at) summary.archived += 1;
      else {
        summary.inbox += 1;
        if (!item.is_read) summary.unread += 1;
      }
      return summary;
    },
    { inbox: 0, unread: 0, archived: 0 }
  );
}

export async function markNotificationRead(notificationId: string) {
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('id', notificationId);
  if (error) throw error;
}

export async function markAllNotificationsRead(userId: string) {
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('user_id', userId)
    .eq('is_read', false)
    .is('archived_at', null);
  if (error) throw error;
}

export async function setNotificationArchived(notificationId: string, archived: boolean) {
  const { error } = await supabase
    .from('notifications')
    .update({ archived_at: archived ? new Date().toISOString() : null })
    .eq('id', notificationId);
  if (error) throw error;
}

export async function deleteNotification(notificationId: string) {
  const { error } = await supabase
    .from('notifications')
    .delete()
    .eq('id', notificationId);
  if (error) throw error;
}

export function subscribeToUserNotifications(userId: string, onChange: () => void) {
  let refreshTimer: ReturnType<typeof setTimeout> | undefined;
  const channel = supabase
    .channel(`notifications-${userId}-${Date.now()}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${userId}`,
      },
      () => {
        if (refreshTimer) clearTimeout(refreshTimer);
        refreshTimer = setTimeout(onChange, 750);
      }
    )
    .subscribe();

  return () => {
    if (refreshTimer) clearTimeout(refreshTimer);
    void supabase.removeChannel(channel);
  };
}

export async function createNotification(
  userId: string,
  title: string,
  message: string,
  type: Notification['type'] = 'info',
  referenceId?: string,
  referenceType?: string,
  actionUrl?: string
) {
  const { error } = await supabase.from('notifications').insert({
    user_id: userId,
    title,
    message,
    type,
    reference_id: referenceId ?? null,
    reference_type: referenceType ?? null,
    action_url: actionUrl ?? null,
  });
  if (error) throw error;
}
