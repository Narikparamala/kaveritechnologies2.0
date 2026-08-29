import { createContext, useContext, useEffect, useState, useRef, type ReactNode } from 'react';
import type { User, Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import type { Profile, UserRole } from '../types/database';

// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ PREVIEW MODE Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
// Set to 'student' | 'faculty' | 'super_admin' to bypass login in preview.
// Set to null to restore normal authentication.
const configuredPreviewRole = import.meta.env.DEV ? import.meta.env.VITE_PREVIEW_ROLE : undefined;
export const PREVIEW_ROLE: UserRole | null = configuredPreviewRole === 'student' || configuredPreviewRole === 'faculty' || configuredPreviewRole === 'super_admin' ? configuredPreviewRole : null;
export const DEVELOPER_EMAIL = 'narikparamala@gmail.com';
export const DEVELOPER_ROLE_KEY = 'kaveri-developer-role';

function selectedDeveloperRole(profile: Profile | null): UserRole | null {
  if (!import.meta.env.DEV || profile?.email?.toLowerCase() !== DEVELOPER_EMAIL) return null;

  const requestedRole = new URLSearchParams(window.location.search).get('developerRole');
  if (requestedRole === 'student' || requestedRole === 'faculty' || requestedRole === 'super_admin') {
    return requestedRole;
  }

  const selected = sessionStorage.getItem(DEVELOPER_ROLE_KEY);
  return selected === 'student' || selected === 'faculty' || selected === 'super_admin' ? selected : null;
}
// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

const PREVIEW_PROFILE: Profile = {
  id: '00000000-0000-0000-0000-000000000001',
  email: 'preview@kaveri.academy',
  full_name: 'Preview Student',
  avatar_url: null,
  phone: null,
  bio: null,
  role: PREVIEW_ROLE ?? 'student',
  xp_points: 1250,
  level: 3,
  streak_days: 7,
  last_active_date: new Date().toISOString(),
  is_active: true,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  role: UserRole | null;
  loading: boolean;
  isAuthenticated: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<Profile | null>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const ROLE_DASHBOARDS: Record<UserRole, string> = {
  student: '/student/dashboard',
  faculty: '/faculty/dashboard',
  super_admin: '/admin/dashboard',
};

async function fetchProfileById(userId: string): Promise<Profile | null> {
  // Retry up to 5 times with delay Ã¢â‚¬â€ trigger may not have fired yet
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (data) return data as Profile;
    if (error) console.error('Profile fetch error:', error);
    // Wait before retrying (trigger may be delayed)
    if (attempt < 4) await new Promise(r => setTimeout(r, 800));
  }
  return null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  // Preview mode: skip Supabase auth entirely
  if (PREVIEW_ROLE !== null) {
    const noopAsync = async () => ({ error: null });
    const noopVoid = async () => {};
    return (
      <AuthContext.Provider value={{
        user: { id: PREVIEW_PROFILE.id, email: PREVIEW_PROFILE.email } as any,
        session: {} as any,
        profile: { ...PREVIEW_PROFILE, role: PREVIEW_ROLE },
        role: PREVIEW_ROLE,
        loading: false,
        isAuthenticated: true,
        signIn: noopAsync,
        signUp: noopAsync,
        signOut: noopVoid,
        refreshProfile: async () => ({ ...PREVIEW_PROFILE, role: PREVIEW_ROLE }),
      }}>
        {children}
      </AuthContext.Provider>
    );
  }

  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const initializedRef = useRef(false);

  const refreshProfile = async (userId?: string): Promise<Profile | null> => {
    const id = userId ?? user?.id;
    if (!id) return null;
    const p = await fetchProfileById(id);
    setProfile(p);
    return p;
  };

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) {
        fetchProfileById(s.user.id).then(p => {
          setProfile(p);
          setLoading(false);
          initializedRef.current = true;
        });
      } else {
        setLoading(false);
        initializedRef.current = true;
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      setUser(s?.user ?? null);

      if (!s?.user) {
        setProfile(null);
        setLoading(false);
        return;
      }

      // Handle all meaningful auth events
      if (
        event === 'INITIAL_SESSION' ||
        event === 'SIGNED_IN' ||
        event === 'TOKEN_REFRESHED' ||
        event === 'USER_UPDATED'
      ) {
        (async () => {
          const p = await fetchProfileById(s.user.id);
          setProfile(p);
          setLoading(false);
        })();
      } else if (event === 'SIGNED_OUT') {
        setProfile(null);
        setLoading(false);
      } else if (event === 'PASSWORD_RECOVERY') {
        // Password recovery - user has valid session but may need to reset password
        (async () => {
          const p = await fetchProfileById(s.user.id);
          setProfile(p);
          setLoading(false);
        })();
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string): Promise<{ error: string | null }> => {
    setLoading(true);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setLoading(false);
      if (error.message.toLowerCase().includes('invalid login credentials') ||
          error.message.toLowerCase().includes('invalid credentials')) {
        return { error: 'Invalid email or password. Please check your credentials and try again.' };
      }
      if (error.message.toLowerCase().includes('email not confirmed')) {
        return { error: 'Please verify your email address before signing in. Check your inbox.' };
      }
      return { error: error.message };
    }

    // Fetch profile immediately after sign in
    if (data.user) {
      const p = await fetchProfileById(data.user.id);
      setProfile(p);
      setLoading(false);
      return { error: null };
    }

    setLoading(false);
    return { error: null };
  };

  const signUp = async (email: string, password: string, fullName: string): Promise<{ error: string | null }> => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
        // Do not pass role Ã¢â‚¬â€ trigger always assigns 'student'
      },
    });

    if (error) {
      if (error.message.toLowerCase().includes('already registered') ||
          error.message.toLowerCase().includes('user already registered')) {
        return { error: 'An account with this email already exists. Please sign in instead.' };
      }
      if (error.message.toLowerCase().includes('password')) {
        return { error: 'Password must be at least 6 characters long.' };
      }
      return { error: error.message };
    }

    // If email confirmation is disabled (our case), user is immediately active
    if (data.user && data.session) {
      setUser(data.user);
      setSession(data.session);
      // Wait for trigger to create profile
      const p = await fetchProfileById(data.user.id);
      setProfile(p);
      return { error: null };
    }

    // Email confirmation required
    if (data.user && !data.session) {
      return { error: null }; // Success Ã¢â‚¬â€ user needs to confirm email
    }

    return { error: 'Something went wrong. Please try again.' };
  };

  const signOut = async () => {
    sessionStorage.removeItem(DEVELOPER_ROLE_KEY);
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setProfile(null);
  };

  const developerRole = selectedDeveloperRole(profile);
  const effectiveProfile = profile && developerRole ? { ...profile, role: developerRole } : profile;
  const role = effectiveProfile?.role ?? null;
  const isAuthenticated = !!user && !!session;

  return (
    <AuthContext.Provider value={{
      user,
      session,
      profile: effectiveProfile,
      role,
      loading,
      isAuthenticated,
      signIn,
      signUp,
      signOut,
      refreshProfile,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export { ROLE_DASHBOARDS };
