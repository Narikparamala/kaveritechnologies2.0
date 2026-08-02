import { cn } from '../../lib/utils';

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  fullPage?: boolean;
}

const sizes = { sm: 'h-4 w-4', md: 'h-8 w-8', lg: 'h-12 w-12' };

export function LoadingSpinner({ size = 'md', className, fullPage }: LoadingSpinnerProps) {
  const spinner = (
    <div
      className={cn(
        'animate-spin rounded-full border-2 border-slate-200 dark:border-slate-700 border-t-primary-600',
        sizes[size],
        className
      )}
    />
  );

  if (fullPage) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900">
        <div className="text-center space-y-4">
          {spinner}
          <p className="text-slate-500 dark:text-slate-400 text-sm">Loading...</p>
        </div>
      </div>
    );
  }

  return spinner;
}

export function PageLoader() {
  return (
    <div className="flex items-center justify-center py-20">
      <LoadingSpinner size="lg" />
    </div>
  );
}

export function SkeletonCard() {
  return (
    <div className="card p-5 animate-pulse space-y-3">
      <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-3/4" />
      <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-full" />
      <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-5/6" />
    </div>
  );
}
