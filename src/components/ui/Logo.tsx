import { cn } from '../../lib/utils';

interface LogoProps {
  size?: 'sm' | 'md' | 'lg';
  showText?: boolean;
  className?: string;
}

const sizes = {
  sm: 'h-8 w-8',
  md: 'h-10 w-10',
  lg: 'h-14 w-14',
};

const textSizes = {
  sm: 'text-sm',
  md: 'text-base',
  lg: 'text-xl',
};

export function Logo({ size = 'md', showText = true, className }: LogoProps) {
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <img
        src="/assets/images/WhatsApp_Image_2026-06-16_at_10.34.22.jpeg"
        alt="Kaveri Technologies Academy"
        className={cn(sizes[size], 'rounded-xl object-contain bg-white shadow-sm border border-slate-100')}
      />
      {showText && (
        <div>
          <span className={cn('font-bold text-slate-900 dark:text-white leading-tight block', textSizes[size])}>
            Kaveri Technologies
          </span>
          <span className="text-xs text-primary-600 dark:text-primary-400 font-medium -mt-0.5 block">Academy</span>
        </div>
      )}
    </div>
  );
}
