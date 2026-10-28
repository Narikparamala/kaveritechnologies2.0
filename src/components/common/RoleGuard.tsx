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

/**
 * Which portal a set of allowed roles describes (used for messaging only).
 * Most pages are single-portal; a few are shared by faculty + admin.
 */
function portalLabelFor(allowedRoles: UserRole[]): string {
  if (allowedRoles.includes('student')) return 'Student';
  if (allowedRoles.includes('faculty') && !allowedRoles.includes('super_admin'))
    return 'Faculty';
  if (allowedRoles.includes('super_admin') && !allowedRoles.includes('faculty'))
    return 'Admin';
  if (allowedRoles.includes('faculty') && allowedRoles.includes('super_admin'))
    return 'Staff';
  return 'Student';
}

const PORTAL_LABELS: Record<UserRole, string> = {
  student: 'Student',
  faculty: 'Faculty',
  super_admin: 'Admin',
};

interface RoleGuardProps {
  allowedRoles: UserRole[];
  children: React.ReactNode;
}

export function RoleGuard({ allowedRoles, children }: RoleGuardProps) {
  const { user, profile, loading, refreshProfile, signOut, realRole, isPortalPreview, switchPortal } =
    useAuth();
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
    const pagePortalLabel = portalLabelFor(allowedRoles);
    const currentPortalLabel = PORTAL_LABELS[profile.role];

    // Common, harmless case: the user is only *previewing* another portal, and    // their real role can open this page. Offer to switch instead of silently    // dumping them on the current portal's dashboard.
    if (isPortalPreview && realRole && allowedRoles.includes(realRole)) {
      const realPortalLabel = PORTAL_LABELS[realRole];
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900 p-6">
          <div className="card max-w-sm w-full p-8 text-center space-y-4">
            <div className="w-16 h-16 rounded-2xl bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center mx-auto">
              <AlertTriangle size={30} className="text-primary-600" />
            </div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">
              Wrong portal preview
            </h2>
            <p className="text-slate-500 dark:text-slate-400 text-sm leading-relaxed">
              This page belongs to the {pagePortalLabel} portal, but you are
              currently previewing the {currentPortalLabel} portal.
            </p>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => switchPortal(realRole)}
                className="btn-primary text-sm"
              >
                Switch to {realPortalLabel} portal
              </button>
              <button
                onClick={() => navigate(ROLE_DASHBOARDS[profile.role], { replace: true })}
                className="btn-secondary text-sm"
              >
                Back to {currentPortalLabel} dashboard
              </button>
            </div>
          </div>
        </div>
      );
    }

    // The role genuinely cannot open this page: show why, then send them home.
    return (
      <WrongPortalNotice
        pagePortalLabel={pagePortalLabel}
        currentPortalLabel={currentPortalLabel}
        dashboardPath={ROLE_DASHBOARDS[profile.role]}
      />
    );
  }

  return <>{children}</>;
}

/**
 * Shown (with a short delay) instead of a silent cross-portal redirect.
 * BUG-7: deep-linking into a portal you don't belong to used to bounce to the
 * current portal's dashboard with no explanation.
 */
function WrongPortalNotice({
  pagePortalLabel,
  currentPortalLabel,
  dashboardPath,
}: {
  pagePortalLabel: string;
  currentPortalLabel: string;
  dashboardPath: string;
}) {
  const navigate = useNavigate();

  useEffect(() => {
    const timer = window.setTimeout(() => {
      navigate(dashboardPath, { replace: true });
    }, 4000);
    return () => window.clearTimeout(timer);
  }, [dashboardPath, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900 p-6">
      <div className="card max-w-sm w-full p-8 text-center space-y-4">
        <div className="w-16 h-16 rounded-2xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center mx-auto">
          <AlertTriangle size={30} className="text-amber-600" />
        </div>
        <h2 className="text-xl font-bold text-slate-900 dark:text-white">
          Wrong portal
        </h2>
        <p className="text-slate-500 dark:text-slate-400 text-sm leading-relaxed">
          This page belongs to the {pagePortalLabel} portal, but your account is
          signed in to the {currentPortalLabel} portal. Taking you back to your
          dashboard…
        </p>
        <button
          onClick={() => navigate(dashboardPath, { replace: true })}
          className="btn-primary text-sm inline-flex items-center gap-2"
        >
          Go now
        </button>
      </div>
    </div>
  );
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
