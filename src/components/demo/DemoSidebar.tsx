import { NavLink } from 'react-router-dom';
import { Link } from 'react-router-dom';
import { type LucideIcon, LogIn } from 'lucide-react';
import { Logo } from '../ui/Logo';
import { ThemeToggle } from '../ui/ThemeToggle';
import { cn } from '../../lib/utils';

interface NavItem {
  label: string;
  icon: LucideIcon;
  to: string;
}

interface DemoSidebarProps {
  navItems: NavItem[];
  basePath: string;
  identity: { name: string; email: string; roleLabel: string };
}

export function DemoSidebar({ navItems, basePath, identity }: DemoSidebarProps) {
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

      {/* Demo user footer */}
      <div className="px-3 py-4 border-t border-slate-100 dark:border-slate-800 flex-shrink-0 space-y-2">
        {/* Identity */}
        <div className="px-3 py-2 flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center flex-shrink-0">
            <span className="text-xs font-bold text-amber-700 dark:text-amber-400">
              {identity.name.charAt(0)}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">{identity.name}</p>
              <span className="flex-shrink-0 text-xs bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 px-1.5 py-0.5 rounded-md font-bold">DEMO</span>
            </div>
            <p className="text-xs text-slate-400 truncate">{identity.roleLabel}</p>
          </div>
          <ThemeToggle />
        </div>

        {/* Sign in CTA */}
        <Link
          to="/login"
          className="flex items-center gap-2 w-full px-3 py-2.5 rounded-xl bg-primary-600 hover:bg-primary-700 text-white text-xs font-semibold transition-colors"
        >
          <LogIn size={14} />
          Sign In for Real Access
        </Link>
      </div>
    </div>
  );
}
