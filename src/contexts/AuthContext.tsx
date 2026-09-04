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

// Which portals a user may view. A portal switch is a UI-only preview: the
// real database role (realRole) never changes, so server-side RLS still
// authorises every request with the user's actual account permissions.
export function portalRolesFor(realRole: UserRole | null): {
  primary: UserRole;
  previews: UserRole[];
} {
  if (realRole === 'super_admin') {
    return { primary: 'super_admin', previews: ['faculty', 'student'] };
  }
  if (realRole === 'faculty') {
    return { primary: 'faculty', previews: ['student'] };
  }
  return { primary: 'student', previews: [] };
}

export function canSwitchPortal(realRole: UserRole | null): boolean {
  return portalRolesFor(realRole).previews.length > 0;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  role: UserRole | null;
  /** The user's actual role from the database — never changed by previews. */
  realRole: UserRole | null;
  /** True when the UI is showing a different portal than the real role. */
  isPortalPreview: boolean;
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
  /** Switch the UI portal (super_admin/faculty only). UI-only, never the DB role. */
  switchPortal: (role: UserRole) => void;
  /** Return to the user's real portal. */
  resetPortal: () => void;
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

function selectedPortalRole(profile: Profile | null): UserRole | null {
  if (!profile) return null;

  const params = new URLSearchParams(window.location.search);
  const requestedRole = params.get('portal') ?? params.get('developerRole');
  if (requestedRole === 'student' || requestedRole === 'faculty' || requestedRole === 'super_admin') {
    return portalRolesFor(profile.role).primary === requestedRole ||
      portalRolesFor(profile.role).previews.includes(requestedRole)
      ? requestedRole
      : null;
  }

  const selected = sessionStorage.getItem(DEVELOPER_ROLE_KEY);
  const allowed = portalRolesFor(profile.role);
  return selected === allowed.primary || allowed.previews.includes(selected as UserRole)
    ? (selected as UserRole)
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
    realRole: previewRole,
    isPortalPreview: false,
    loading: false,
    isAuthenticated: true,
    signIn: async () => ({ error: null }),
    signUp: async () => ({ error: null }),
    signOut: async () => undefined,
    refreshProfile: async () => previewProfile,
    switchPortal: () => undefined,
    resetPortal: () => undefined,
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

  const portalRole = selectedPortalRole(profile);
  const effectiveProfile =
    profile && portalRole ? { ...profile, role: portalRole } : profile;
  const role = effectiveProfile?.role ?? null;
  const realRole = profile?.role ?? null;

  const switchPortal = (nextRole: UserRole) => {
    const allowed = portalRolesFor(realRole);
    if (allowed.primary !== nextRole && !allowed.previews.includes(nextRole)) {
      return; // never let a preview escape the user's real-role set
    }
    sessionStorage.setItem(DEVELOPER_ROLE_KEY, nextRole);
    window.location.assign(ROLE_DASHBOARDS[nextRole]);
  };

  const resetPortal = () => {
    sessionStorage.removeItem(DEVELOPER_ROLE_KEY);
    if (realRole) window.location.assign(ROLE_DASHBOARDS[realRole]);
  };

  const value: AuthContextType = {
    user,
    session,
    profile: effectiveProfile,
    role,
    realRole,
    isPortalPreview: Boolean(
      realRole && role && role !== realRole && canSwitchPortal(realRole),
    ),
    loading,
    isAuthenticated: Boolean(user && session),
    signIn,
    signUp,
    signOut,
    refreshProfile,
    switchPortal,
    resetPortal,
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
