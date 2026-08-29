import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth, ROLE_DASHBOARDS, DEVELOPER_EMAIL, DEVELOPER_ROLE_KEY } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { AlertCircle, LogOut, RefreshCw } from 'lucide-react';

/**
 * Intermediate page visited right after OAuth login.
 * Waits for session and profile to be established, then redirects to the correct role dashboard.
 * Handles Google OAuth callback where profile creation may be delayed.
 */
export default function AuthRedirectPage() {
  const { profile, loading, user, refreshProfile, signOut } = useAuth();
  const navigate = useNavigate();
  const attemptsRef = useRef(0);
  const [error, setError] = useState<string | null>(null);
  const [waitingForSession, setWaitingForSession] = useState(true);
  const maxAttempts = 8;

  useEffect(() => {
    // First, wait for session to be established
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        setWaitingForSession(false);
        return true;
      }
      return false;
    };

    checkSession();
  }, []);

  useEffect(() => {
    // If profile is loaded, redirect immediately
    if (profile && user) {
      if (import.meta.env.DEV && profile.email?.toLowerCase() === DEVELOPER_EMAIL) {
        sessionStorage.removeItem(DEVELOPER_ROLE_KEY);
        navigate('/developer-role', { replace: true });
        return;
      }
      navigate(ROLE_DASHBOARDS[profile.role], { replace: true });
      return;
    }

    // Still loading session or profile
    if (loading || waitingForSession) {
      return;
    }

    // If no user after session check, redirect to login
    if (!user && !waitingForSession) {
      navigate('/login', { replace: true });
      return;
    }

    // User exists but profile not loaded — retry fetching profile
    if (user && !profile && attemptsRef.current < maxAttempts) {
      attemptsRef.current += 1;
      const timer = setTimeout(async () => {
        try {
          const p = await refreshProfile();
          if (p) {
            navigate(ROLE_DASHBOARDS[p.role], { replace: true });
          } else if (attemptsRef.current >= maxAttempts) {
            // Profile doesn't exist, create it manually
            await createProfileManually();
          }
        } catch (err) {
          if (import.meta.env.DEV) {
            console.error('Profile refresh error:', err);
          }
        }
      }, 600);
      return () => clearTimeout(timer);
    }

    // Give up after max attempts — show error UI
    if (user && !profile && attemptsRef.current >= maxAttempts) {
      setError('Could not load your profile. Please try again.');
    }
  }, [profile, loading, user, waitingForSession, navigate]);

  const createProfileManually = async () => {
    if (!user) return;

    try {
      // Get user metadata from Google OAuth
      const fullName = user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split('@')[0] || 'User';

      // Create profile via upsert (in case trigger didn't fire)
      const { data: newProfile, error: insertError } = await supabase
        .from('profiles')
        .upsert({
          id: user.id,
          email: user.email,
          full_name: fullName,
          role: 'student', // Always default to student for new OAuth users
        }, { onConflict: 'id' })
        .select()
        .single();

      if (insertError) {
        if (import.meta.env.DEV) {
          console.error('Manual profile creation error:', insertError);
        }
        setError('Could not create your profile. Please contact support.');
        return;
      }

      if (newProfile) {
        // Refresh the auth context with the new profile
        await refreshProfile();
        navigate(ROLE_DASHBOARDS[newProfile.role], { replace: true });
      }
    } catch (err) {
      if (import.meta.env.DEV) {
        console.error('Profile creation exception:', err);
      }
      setError('An unexpected error occurred. Please try again.');
    }
  };

  const handleRetry = async () => {
    setError(null);
    attemptsRef.current = 0;
    await refreshProfile();
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/login', { replace: true });
  };

  // Show error UI if profile creation failed
  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900 p-6">
        <div className="max-w-sm w-full text-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-red-100 dark:bg-red-900/30 flex items-center justify-center mx-auto">
            <AlertCircle size={32} className="text-red-500" />
          </div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">Sign In Incomplete</h2>
          <p className="text-slate-500 dark:text-slate-400 text-sm leading-relaxed">
            {error}
          </p>
          <div className="flex gap-3 justify-center pt-2">
            <button onClick={handleRetry} className="btn-secondary text-sm flex items-center gap-2">
              <RefreshCw size={14} /> Try Again
            </button>
            <button onClick={handleSignOut} className="btn-primary text-sm flex items-center gap-2">
              <LogOut size={14} /> Sign Out
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-900 p-6">
      <LoadingSpinner size="lg" />
      <p className="mt-4 text-slate-500 dark:text-slate-400 text-sm animate-pulse">
        {waitingForSession ? 'Completing sign in...' : 'Loading your profile...'}
      </p>
    </div>
  );
}
