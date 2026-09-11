import { Link } from 'react-router-dom';
import { X, LogIn, UserPlus, Play } from 'lucide-react';
import { Logo } from '../ui/Logo';

interface AuthRequiredModalProps {
  open: boolean;
  onClose: () => void;
}

export function AuthRequiredModal({ open, onClose }: AuthRequiredModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      {/* Modal */}
      <div className="relative w-full max-w-md bg-white dark:bg-slate-800 rounded-3xl shadow-2xl border border-slate-100 dark:border-slate-700 overflow-hidden animate-fade-in">
        {/* Top gradient strip */}
        <div className="h-1.5 bg-gradient-to-r from-primary-600 via-teal-500 to-primary-600" />

        <div className="p-8">
          {/* Close */}
          <button
            onClick={onClose}
            className="absolute top-5 right-5 p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
          >
            <X size={18} />
          </button>

          {/* Logo + Title */}
          <div className="text-center mb-6">
            <Logo size="sm" className="justify-center mb-4" />
            <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-3">
              Create an account to continue
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
              Demo mode lets you explore the platform. Sign in or create an account to save your learning progress, enroll in courses, submit assignments, take quizzes, manage content, and access your personal dashboard.
            </p>
          </div>

          {/* Actions */}
          <div className="space-y-3">
            <Link
              to="/register"
              className="flex items-center justify-center gap-2 w-full py-3 rounded-2xl bg-primary-600 hover:bg-primary-700 text-white font-semibold text-sm transition-all hover:shadow-glow-blue"
              onClick={onClose}
            >
              <UserPlus size={16} /> Create Free Account
            </Link>
            <Link
              to="/login"
              className="flex items-center justify-center gap-2 w-full py-3 rounded-2xl border-2 border-slate-200 dark:border-slate-600 hover:border-primary-400 dark:hover:border-primary-500 text-slate-700 dark:text-slate-300 font-semibold text-sm transition-all"
              onClick={onClose}
            >
              <LogIn size={16} /> Sign In to Your Account
            </Link>
            <button
              onClick={onClose}
              className="flex items-center justify-center gap-2 w-full py-2.5 rounded-2xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 text-sm font-medium transition-colors"
            >
              <Play size={14} /> Continue Exploring Demo
            </button>
          </div>

          <p className="text-center text-xs text-slate-400 mt-4">
            Create an account to start real courses. Access to course content follows enrolment.
          </p>
        </div>
      </div>
    </div>
  );
}
