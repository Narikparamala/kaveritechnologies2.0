import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import type { Profile, UserRole } from '../types/database';

const configuredPreviewRole = import.meta.env.DEV
  ? import.meta.env.VITE_PREVIEW_ROLE
  : undefined;

export const PREVIEW_ROLE: UserRole | null =
  configuredPreviewRole === 'student' ||
  configuredPreviewRole === 'faculty' ||
  configuredPreviewRole === 'super_admin'
    ? configuredPreviewRole
    : null;

export const DEVELOPER_EMAIL = 'narikparamala@gmail.com';
export const DEVELOPER_ROLE_KEY = 'kaveri-developer-role';

export const ROLE_DASHBOARDS: Record<UserRole, string> = {
  student: '/student/dashboard',
  faculty: '/faculty/dashboard',
  super_admin: '/admin/dashboard',
};

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  role: UserRole | null;
  loading: boolean;
  isAuthenticated: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (
    email: string,
    password: string,
    fullName: string,
  ) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<Profile | null>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

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

function selectedDeveloperRole(profile: Profile | null): UserRole | null {
  if (
    !import.meta.env.DEV ||
    profile?.email?.toLowerCase() !== DEVELOPER_EMAIL
  ) {
    return null;
  }

  const requestedRole = new URLSearchParams(window.location.search).get(
    'developerRole',
  );
  if (
    requestedRole === 'student' ||
    requestedRole === 'faculty' ||
    requestedRole === 'super_admin'
  ) {
    return requestedRole;
  }

  const selected = sessionStorage.getItem(DEVELOPER_ROLE_KEY);
  return selected === 'student' ||
    selected === 'faculty' ||
    selected === 'super_admin'
    ? selected
    : null;
}

async function fetchProfileById(userId: string): Promise<Profile | null> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (data) return data as Profile;
    if (error && import.meta.env.DEV) {
      console.error('Profile fetch error:', error);
    }
    if (attempt < 4) {
      await new Promise(resolve => window.setTimeout(resolve, 800));
    }
  }

  return null;
}

function PreviewAuthProvider({ children }: { children: ReactNode }) {
  const previewRole = PREVIEW_ROLE ?? 'student';
  const previewProfile = { ...PREVIEW_PROFILE, role: previewRole };
  const previewUser = {
    id: previewProfile.id,
    email: previewProfile.email,
  } as User;
  const previewSession = { user: previewUser } as Session;

  const value: AuthContextType = {
    user: previewUser,
    session: previewSession,
    profile: previewProfile,
    role: previewRole,
    loading: false,
    isAuthenticated: true,
    signIn: async () => ({ error: null }),
    signUp: async () => ({ error: null }),
    signOut: async () => undefined,
    refreshProfile: async () => previewProfile,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

function SupabaseAuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshProfileForUser = useCallback(
    async (userId: string): Promise<Profile | null> => {
      const nextProfile = await fetchProfileById(userId);
      setProfile(nextProfile);
      return nextProfile;
    },
    [],
  );

  const refreshProfile = useCallback(async (): Promise<Profile | null> => {
    if (!user?.id) return null;
    return refreshProfileForUser(user.id);
  }, [refreshProfileForUser, user?.id]);

  useEffect(() => {
    let active = true;

    const applySession = async (nextSession: Session | null) => {
      if (!active) return;

      setSession(nextSession);
      setUser(nextSession?.user ?? null);

      if (!nextSession?.user) {
        setProfile(null);
        setLoading(false);
        return;
      }

      const nextProfile = await fetchProfileById(nextSession.user.id);
      if (!active) return;
      setProfile(nextProfile);
      setLoading(false);
    };

    void supabase.auth.getSession().then(({ data, error }) => {
      if (error && import.meta.env.DEV) {
        console.error('Initial session error:', error);
      }
      void applySession(data.session);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      // Defer database work until the auth client has released its internal
      // state-change lock.
      window.setTimeout(() => void applySession(nextSession), 0);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const signIn = async (
    email: string,
    password: string,
  ): Promise<{ error: string | null }> => {
    setLoading(true);
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setLoading(false);
      const message = error.message.toLowerCase();
      if (
        message.includes('invalid login credentials') ||
        message.includes('invalid credentials')
      ) {
        return {
          error: 'Invalid email or password. Please check your credentials and try again.',
        };
      }
      if (message.includes('email not confirmed')) {
        return {
          error: 'Please verify your email address before signing in. Check your inbox.',
        };
      }
      return { error: error.message };
    }

    if (data.user) {
      setUser(data.user);
      setSession(data.session);
      await refreshProfileForUser(data.user.id);
    }
    setLoading(false);
    return { error: null };
  };

  const signUp = async (
    email: string,
    password: string,
    fullName: string,
  ): Promise<{ error: string | null }> => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    });

    if (error) {
      const message = error.message.toLowerCase();
      if (
        message.includes('already registered') ||
        message.includes('user already registered')
      ) {
        return {
          error: 'An account with this email already exists. Please sign in instead.',
        };
      }
      if (message.includes('password')) {
        return { error: 'Password must be at least 6 characters long.' };
      }
      return { error: error.message };
    }

    if (data.user && data.session) {
      setUser(data.user);
      setSession(data.session);
      await refreshProfileForUser(data.user.id);
    }

    return data.user
      ? { error: null }
      : { error: 'Something went wrong. Please try again.' };
  };

  const signOut = async () => {
    sessionStorage.removeItem(DEVELOPER_ROLE_KEY);
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    setUser(null);
    setSession(null);
    setProfile(null);
  };

  const developerRole = selectedDeveloperRole(profile);
  const effectiveProfile =
    profile && developerRole ? { ...profile, role: developerRole } : profile;
  const role = effectiveProfile?.role ?? null;

  const value: AuthContextType = {
    user,
    session,
    profile: effectiveProfile,
    role,
    loading,
    isAuthenticated: Boolean(user && session),
    signIn,
    signUp,
    signOut,
    refreshProfile,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  return PREVIEW_ROLE ? (
    <PreviewAuthProvider>{children}</PreviewAuthProvider>
  ) : (
    <SupabaseAuthProvider>{children}</SupabaseAuthProvider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
