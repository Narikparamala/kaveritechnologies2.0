import { supabase } from '../lib/supabase';
import type { Profile, UserRole } from '../types/database';

function requireProfile(data: unknown, action: string): Profile {
  if (!data || typeof data !== 'object') {
    throw new Error(`${action} did not return an updated profile.`);
  }
  return data as Profile;
}

export async function listPlatformUsers(): Promise<Profile[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data ?? []) as Profile[];
}

export async function setPlatformUserRole(
  userId: string,
  role: UserRole,
): Promise<Profile> {
  const { data, error } = await supabase.rpc('admin_set_user_role', {
    p_user_id: userId,
    p_role: role,
  });

  if (error) throw error;
  return requireProfile(data, 'Role update');
}

export async function setPlatformUserActive(
  userId: string,
  isActive: boolean,
): Promise<Profile> {
  const { data, error } = await supabase.rpc('admin_set_user_active', {
    p_user_id: userId,
    p_is_active: isActive,
  });

  if (error) throw error;
  return requireProfile(data, 'Account status update');
}
