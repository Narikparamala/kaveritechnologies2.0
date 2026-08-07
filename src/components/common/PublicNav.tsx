import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import { Logo } from '../ui/Logo';
import { ThemeToggle } from '../ui/ThemeToggle';
import { useAuth } from '../../contexts/AuthContext';
import { cn } from '../../lib/utils';

const navLinks = [
  { label: 'Home', to: '/' },
  { label: 'Courses', to: '/courses' },
  { label: 'Pricing', to: '/pricing' },
  { label: 'About', to: '/about' },
  { label: 'Contact', to: '/contact' },
];

export function PublicNav() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { user, profile } = useAuth();
  const location = useLocation();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => setMobileOpen(false), [location]);

  const getDashboardPath = () => {
    if (!user) return '/login';
    if (!profile) return '/auth/redirect';
    if (profile.role === 'super_admin') return '/admin/dashboard';
    if (profile.role === 'faculty') return '/faculty/dashboard';
    return '/student/dashboard';
  };

  return (
    <header
      className={cn(
        'fixed top-0 inset-x-0 z-50 transition-all duration-300',
        scrolled
          ? 'bg-white/95 dark:bg-slate-900/95 backdrop-blur-md shadow-sm border-b border-slate-100 dark:border-slate-800'
          : 'bg-transparent'
      )}
    >
      <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between h-16">
        <Link to="/">
          <Logo size="sm" />
        </Link>

        {/* Desktop nav */}
        <ul className="hidden md:flex items-center gap-1">
          {navLinks.map(({ label, to }) => (
            <li key={to}>
              <Link
                to={to}
                className={cn(
                  'px-4 py-2 rounded-xl text-sm font-medium transition-colors',
                  location.pathname === to
                    ? 'text-primary-600 bg-primary-50 dark:text-primary-400 dark:bg-primary-900/20'
                    : scrolled
                    ? 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800'
                    : 'text-white/90 hover:text-white hover:bg-white/10'
                )}
              >
                {label}
              </Link>
            </li>
          ))}
        </ul>

        <div className="hidden md:flex items-center gap-3">
          <ThemeToggle />
          {user ? (
            <Link to={getDashboardPath()} className="btn-primary text-sm py-2">
              Dashboard
            </Link>
          ) : (
            <>
              <Link
                to="/login"
                className={cn(
                  'px-4 py-2 rounded-xl text-sm font-medium transition-colors',
                  scrolled ? 'text-slate-600 dark:text-slate-300 hover:text-slate-900' : 'text-white/90 hover:text-white'
                )}
              >
                Sign In
              </Link>
              <Link to="/register" className="btn-primary text-sm py-2">
                Get Started
              </Link>
            </>
          )}
        </div>

        {/* Mobile menu button */}
        <div className="md:hidden flex items-center gap-2">
          <ThemeToggle />
          <button
            onClick={() => setMobileOpen(o => !o)}
            className={cn('p-2 rounded-xl', scrolled ? 'text-slate-600 dark:text-slate-300' : 'text-white')}
          >
            {mobileOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </nav>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="md:hidden bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 px-4 py-4 space-y-2 animate-fade-in">
          {navLinks.map(({ label, to }) => (
            <Link
              key={to}
              to={to}
              className="block px-4 py-2.5 rounded-xl text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 text-sm font-medium"
            >
              {label}
            </Link>
          ))}
          <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2">
            {user ? (
              <Link to={getDashboardPath()} className="btn-primary text-sm w-full text-center block">
                Dashboard
              </Link>
            ) : (
              <>
                <Link to="/login" className="block px-4 py-2.5 text-center rounded-xl text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 text-sm font-medium">
                  Sign In
                </Link>
                <Link to="/register" className="btn-primary text-sm w-full text-center block">
                  Get Started
                </Link>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
