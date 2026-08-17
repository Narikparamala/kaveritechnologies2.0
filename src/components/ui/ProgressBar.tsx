import { cn } from '../../lib/utils';

interface ProgressBarProps {
  value: number;
  max?: number;
  className?: string;
  barClassName?: string;
  showLabel?: boolean;
  size?: 'sm' | 'md';
  color?: 'blue' | 'teal' | 'green' | 'amber';
}

const colorMap = {
  blue: 'bg-primary-600',
  teal: 'bg-teal-500',
  green: 'bg-emerald-500',
  amber: 'bg-amber-500',
};

const heightMap = { sm: 'h-1.5', md: 'h-2.5' };

export function ProgressBar({
  value,
  max = 100,
  className,
  barClassName,
  showLabel,
  size = 'md',
  color = 'blue',
}: ProgressBarProps) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));

  return (
    <div className={cn('w-full', className)}>
      {showLabel && (
        <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400 mb-1.5">
          <span>Progress</span>
          <span>{Math.round(pct)}%</span>
        </div>
      )}
      <div className={cn('w-full bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden', heightMap[size])}>
        <div
          className={cn('h-full rounded-full transition-all duration-500 ease-out', colorMap[color], barClassName)}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
