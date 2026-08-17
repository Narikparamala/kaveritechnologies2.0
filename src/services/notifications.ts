import { supabase } from '../lib/supabase';
import type { Notification } from '../types/database';

export async function getUserNotifications(userId: string) {
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data ?? []) as Notification[];
}

export async function markNotificationRead(notificationId: string) {
  await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('id', notificationId);
}

export async function markAllNotificationsRead(userId: string) {
  await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('user_id', userId)
    .eq('is_read', false);
}

export async function createNotification(
  userId: string,
  title: string,
  message: string,
  type: Notification['type'] = 'info',
  referenceId?: string,
  referenceType?: string
) {
  await supabase.from('notifications').insert({
    user_id: userId,
    title,
    message,
    type,
    reference_id: referenceId ?? null,
    reference_type: referenceType ?? null,
  });
}
