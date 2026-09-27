import { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { AlertTriangle, LogOut, RefreshCw } from 'lucide-react';
import {
  PREVIEW_ROLE,
  ROLE_DASHBOARDS,
  useAuth,
} from '../../contexts/AuthContext';
import type { UserRole } from '../../types/database';
import { LoadingSpinner } from '../ui/LoadingSpinner';

interface RoleGuardProps {
  allowedRoles: UserRole[];
  children: React.ReactNode;
}

export function RoleGuard({ allowedRoles, children }: RoleGuardProps) {
  const { user, profile, loading, refreshProfile, signOut } = useAuth();
  const navigate = useNavigate();
  const [retrying, setRetrying] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    if (
      PREVIEW_ROLE !== null ||
      loading ||
      retrying ||
      !user ||
      profile ||
      retryCount >= 4
    ) {
      return;
    }

    setRetrying(true);
    const timer = window.setTimeout(() => {
      void refreshProfile().finally(() => {
        setRetryCount(count => count + 1);
        setRetrying(false);
      });
    }, 1000);

    return () => window.clearTimeout(timer);
  }, [loading, profile, refreshProfile, retryCount, retrying, user]);

  const handleSignOut = async () => {
    try {
      await signOut();
    } finally {
      navigate('/login', { replace: true });
    }
  };

  if (PREVIEW_ROLE !== null) return <>{children}</>;
  if (loading || retrying) return <LoadingSpinner fullPage />;
  if (!user) return <Navigate to="/login" replace />;

  if (!profile) {
    if (retryCount < 4) return <LoadingSpinner fullPage />;

    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900 p-6">
        <div className="card max-w-sm w-full p-8 text-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center mx-auto">
            <AlertTriangle size={30} className="text-amber-600" />
          </div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">
            Account setup incomplete
          </h2>
          <p className="text-slate-500 dark:text-slate-400 text-sm leading-relaxed">
            Your authenticated account does not have a platform profile yet.
            Retry once, then contact Kaveri support if the problem continues.
          </p>
          <div className="flex gap-3 justify-center">
            <button
              onClick={() => setRetryCount(0)}
              className="btn-secondary text-sm flex items-center gap-2"
            >
              <RefreshCw size={14} /> Retry
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

  if (!profile.is_active) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900 p-6">
        <div className="card max-w-sm w-full p-8 text-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-red-100 dark:bg-red-900/30 flex items-center justify-center mx-auto">
            <AlertTriangle size={30} className="text-red-600" />
          </div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">
            Account disabled
          </h2>
          <p className="text-slate-500 dark:text-slate-400 text-sm leading-relaxed">
            Your Kaveri LMS account is currently inactive. Contact the academy
            administrator if you believe this is a mistake.
          </p>
          <button
            onClick={() => void handleSignOut()}
            className="btn-primary text-sm inline-flex items-center gap-2"
          >
            <LogOut size={14} /> Sign out
          </button>
        </div>
      </div>
    );
  }

  if (!allowedRoles.includes(profile.role)) {
    return <Navigate to={ROLE_DASHBOARDS[profile.role]} replace />;
  }

  return <>{children}</>;
}

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, profile, loading } = useAuth();
  if (loading) return <LoadingSpinner fullPage />;
  if (!user) return <Navigate to="/login" replace />;
  if (profile && !profile.is_active) {
    return <Navigate to={ROLE_DASHBOARDS[profile.role]} replace />;
  }
  return <>{children}</>;
}
