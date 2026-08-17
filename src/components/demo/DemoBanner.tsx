import { Link } from 'react-router-dom';
import { Info, LogIn, UserPlus } from 'lucide-react';

export function DemoBanner() {
  return (
    <div className="sticky top-0 z-40 bg-gradient-to-r from-amber-500/95 via-amber-400/95 to-amber-500/95 backdrop-blur-sm border-b border-amber-400/50 px-4 py-2.5">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 text-amber-900 min-w-0">
          <Info size={16} className="flex-shrink-0" />
          <p className="text-xs sm:text-sm font-medium truncate">
            <span className="font-bold">Demo Mode</span>
            <span className="hidden sm:inline"> — You are viewing sample data. Sign in or create an account to save progress, enroll in courses, submit work, or manage content.</span>
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Link
            to="/login"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-900/20 hover:bg-amber-900/30 text-amber-900 text-xs font-semibold transition-colors whitespace-nowrap"
          >
            <LogIn size={12} /> Sign In
          </Link>
          <Link
            to="/register"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-900 hover:bg-amber-800 text-white text-xs font-semibold transition-colors whitespace-nowrap"
          >
            <UserPlus size={12} /> Create Account
          </Link>
        </div>
      </div>
    </div>
  );
}
