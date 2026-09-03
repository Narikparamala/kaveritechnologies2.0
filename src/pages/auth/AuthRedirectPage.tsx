import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, LogOut, RefreshCw } from 'lucide-react';
import {
  DEVELOPER_EMAIL,
  DEVELOPER_ROLE_KEY,
  ROLE_DASHBOARDS,
  useAuth,
} from '../../contexts/AuthContext';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';

const MAX_PROFILE_ATTEMPTS = 8;

export default function AuthRedirectPage() {
  const { profile, loading, user, refreshProfile, signOut } = useAuth();
  const navigate = useNavigate();
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (loading) return;

    if (!user) {
      navigate('/login', { replace: true });
      return;
    }

    if (profile) {
      if (
        import.meta.env.DEV &&
        profile.email.toLowerCase() === DEVELOPER_EMAIL
      ) {
        sessionStorage.removeItem(DEVELOPER_ROLE_KEY);
        navigate('/developer-role', { replace: true });
      } else {
        navigate(ROLE_DASHBOARDS[profile.role], { replace: true });
      }
      return;
    }

    if (attempt >= MAX_PROFILE_ATTEMPTS) {
      setError(
        'Your account is authenticated, but its LMS profile was not created. Please retry or contact Kaveri support.',
      );
      return;
    }

    const timer = window.setTimeout(() => {
      void refreshProfile()
        .catch(() => undefined)
        .finally(() => setAttempt(current => current + 1));
    }, 700);

    return () => window.clearTimeout(timer);
  }, [attempt, loading, navigate, profile, refreshProfile, user]);

  const handleRetry = () => {
    setAttempt(0);
    setError(null);
    void refreshProfile();
  };

  const handleSignOut = async () => {
    try {
      await signOut();
    } finally {
      navigate('/login', { replace: true });
    }
  };

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900 p-6">
        <div className="card max-w-sm w-full p-8 text-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-red-100 dark:bg-red-900/30 flex items-center justify-center mx-auto">
            <AlertCircle size={32} className="text-red-500" />
          </div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">
            Sign-in incomplete
          </h2>
          <p className="text-slate-500 dark:text-slate-400 text-sm leading-relaxed">
            {error}
          </p>
          <div className="flex gap-3 justify-center pt-2">
            <button
              onClick={handleRetry}
              className="btn-secondary text-sm flex items-center gap-2"
            >
              <RefreshCw size={14} /> Try again
            </button>
            <button
              onClick={() => void handleSignOut()}
              className="btn-primary text-sm flex items-center gap-2"
            >
              <LogOut size={14} /> Sign out
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
        Completing secure sign-in…
      </p>
    </div>
  );
}
