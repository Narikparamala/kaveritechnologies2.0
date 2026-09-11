import { NavLink, useNavigate, Link } from 'react-router-dom';
import { LogOut, Repeat, type LucideIcon } from 'lucide-react';
import { Logo } from '../ui/Logo';
import { ThemeToggle } from '../ui/ThemeToggle';
import { useAuth } from '../../contexts/AuthContext';
import { cn } from '../../lib/utils';

interface NavItem {
  label: string;
  icon: LucideIcon;
  to: string;
}

interface SidebarProps {
  navItems: NavItem[];
  basePath: string;
  /** Show the portal chooser entry (faculty & admin layouts). */
  showPortalSwitch?: boolean;
}

export function Sidebar({ navItems, basePath, showPortalSwitch = false }: SidebarProps) {
  const { profile, signOut, isPortalPreview } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate('/', { replace: true });
  };

  const roleLabel: Record<string, string> = {
    student: 'Student',
    faculty: 'Faculty',
    super_admin: 'Super Admin',
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Logo */}
      <div className="px-4 py-5 border-b border-slate-100 dark:border-slate-800 flex-shrink-0">
        <Logo size="sm" />
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-0.5">
        {navItems.map(({ label, icon: Icon, to }) => (
          <NavLink
            key={to}
            to={`${basePath}${to}`}
            className={({ isActive }) => cn('sidebar-link', isActive && 'active')}
          >
            <Icon size={17} className="flex-shrink-0" />
            <span className="truncate">{label}</span>
          </NavLink>
        ))}
      </nav>

      {/* User footer */}
      <div className="px-3 py-4 border-t border-slate-100 dark:border-slate-800 flex-shrink-0 space-y-1">
        <div className="flex items-center gap-3 px-3 py-2">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-primary-500 to-teal-500 flex items-center justify-center flex-shrink-0">
            {profile?.avatar_url ? (
              <img src={profile.avatar_url} alt="" className="w-8 h-8 rounded-xl object-cover" />
            ) : (
              <span className="text-xs font-bold text-white">
                {profile?.full_name?.charAt(0).toUpperCase() ?? 'U'}
              </span>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">
              {profile?.full_name ?? 'Loading...'}
            </p>
            <p className="text-xs text-slate-400 truncate">
              {roleLabel[profile?.role ?? ''] ?? 'User'}
              {isPortalPreview && (
                <span className="ml-1.5 inline-flex items-center rounded bg-amber-100 dark:bg-amber-900/40 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-amber-600 dark:text-amber-400">
                  Preview
                </span>
              )}
            </p>
          </div>
          <ThemeToggle />
        </div>

        {showPortalSwitch && (
          <Link
            to="/portal"
            className="sidebar-link w-full"
            title={isPortalPreview ? 'Return to your portal or switch preview' : 'Switch portal (preview other portals)'}
          >
            <Repeat size={17} className="flex-shrink-0" />
            <span>{isPortalPreview ? 'Exit Preview / Switch Portal' : 'Switch Portal'}</span>
          </Link>
        )}

        <button
          onClick={handleSignOut}
          className="sidebar-link w-full text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-600 dark:hover:text-red-300"
        >
          <LogOut size={17} className="flex-shrink-0" />
          <span>Sign Out</span>
        </button>
      </div>
    </div>
  );
}
