/**
 * BUG-3: several dashboards rendered their zero / empty states inside a
 * blank data period (2-5 s fetch), so users saw "0 students", empty tables
 * and then the real data pop in. These primitives let pages show honest
 * loading shapes instead.
 */

export function Skeleton({ className = '' }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={`animate-pulse rounded-md bg-slate-200 dark:bg-slate-700 ${className}`}
    />
  );
}

/** Mirrors the typical "grid of stat cards" header used on admin pages. */
export function SkeletonStats({
  count = 6,
  cols = 'grid-cols-2 md:grid-cols-3',
  className = '',
}: {
  count?: number;
  cols?: string;
  className?: string;
}) {
  return (
    <div className={`grid ${cols} gap-4 ${className}`} aria-busy="true">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="card p-4">
          <Skeleton className="h-6 w-10 mx-auto mb-2" />
          <Skeleton className="h-3 w-16 mx-auto" />
        </div>
      ))}
    </div>
  );
}

/** Mirrors the typical single StatCard used on student/faculty pages. */
export function SkeletonStatCards({ count = 3, className = '' }: { count?: number; className?: string }) {
  return (
    <div className={`grid grid-cols-1 sm:grid-cols-${count} gap-4 ${className}`} aria-busy="true">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="card p-5">
          <Skeleton className="h-4 w-24 mb-3" />
          <Skeleton className="h-8 w-16 mb-1" />
          <Skeleton className="h-3 w-32" />
        </div>
      ))}
    </div>
  );
}

/** Mirrors a data table with the given number of rows. */
export function SkeletonTable({
  rows = 5,
  cols = 4,
  className = '',
}: {
  rows?: number;
  cols?: number;
  className?: string;
}) {
  return (
    <div className={`card overflow-hidden ${className}`} aria-busy="true">
      <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800">
        <Skeleton className="h-3 w-40" />
      </div>
      <div className="divide-y divide-slate-100 dark:divide-slate-800">
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} className="flex items-center gap-3 px-4 py-3">
            {Array.from({ length: cols }).map((_, c) => (
              <Skeleton
                key={c}
                className={c === 0 ? 'h-3 flex-[2] max-w-[180px]' : 'h-3 flex-1 max-w-[80px]'}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Mirrors a list of horizontal cards/rows (activity feeds, lead rows, etc.). */
export function SkeletonList({ rows = 5, className = '' }: { rows?: number; className?: string }) {
  return (
    <div className={`space-y-3 ${className}`} aria-busy="true">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="card p-4 flex items-center gap-4">
          <Skeleton className="h-9 w-9 rounded-full shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3 w-1/3" />
            <Skeleton className="h-3 w-2/3" />
          </div>
        </div>
      ))}
    </div>
  );
}
