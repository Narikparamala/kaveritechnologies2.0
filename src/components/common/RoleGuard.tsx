import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth, ROLE_DASHBOARDS, PREVIEW_ROLE } from '../../contexts/AuthContext';
import { LoadingSpinner } from '../ui/LoadingSpinner';
import { useEffect, useState } from 'react';
import type { UserRole } from '../../types/database';

interface RoleGuardProps {
  allowedRoles: UserRole[];
  children: React.ReactNode;
}

export function RoleGuard({ allowedRoles, children }: RoleGuardProps) {
  const { user, profile, loading, refreshProfile, signOut } = useAuth();
  const navigate = useNavigate();
  const [retrying, setRetrying] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  // Preview mode: bypass all role checks
  if (PREVIEW_ROLE !== null) return <>{children}</>;


  // If user exists but profile not loaded, retry fetching profile
  useEffect(() => {
    if (!loading && !retrying && user && !profile && retryCount < 4) {
      setRetrying(true);
      const timer = setTimeout(async () => {
        await refreshProfile();
        setRetryCount(c => c + 1);
        setRetrying(false);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [loading, user, profile, retryCount, retrying]);

  if (loading || retrying) return <LoadingSpinner fullPage />;

  // Not authenticated — go to login
  if (!user) return <Navigate to="/login" replace />;

  // Profile still not found after retries — show error UI
  if (!profile) {
    if (retryCount >= 4) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900 p-6">
          <div className="max-w-sm w-full text-center space-y-4">
            <div className="w-16 h-16 rounded-2xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center mx-auto">
              <span className="text-3xl">⚠️</span>
            </div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">Account Setup Incomplete</h2>
            <p className="text-slate-500 dark:text-slate-400 text-sm leading-relaxed">
              Your profile could not be loaded. This may happen if your account was just created. Please sign out and sign back in.
            </p>
            <div className="flex gap-3 justify-center">
              <button
                onClick={() => { setRetryCount(0); }}
                className="btn-secondary text-sm"
              >
                Retry
              </button>
              <button
                onClick={async () => {
                  await signOut();
                  navigate('/login', { replace: true });
                }}
                className="btn-primary text-sm"
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      );
    }
    // Still loading profile
    return <LoadingSpinner fullPage />;
  }

  // Authenticated but wrong role — redirect to correct dashboard
  if (!allowedRoles.includes(profile.role)) {
    return <Navigate to={ROLE_DASHBOARDS[profile.role]} replace />;
  }

  return <>{children}</>;
}

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <LoadingSpinner fullPage />;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}
