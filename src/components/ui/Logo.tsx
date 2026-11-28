import { cn } from '../../lib/utils';
import { useCompanyBranding } from '../../hooks/useCompanyBranding';

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

/**
 * Split a display name into the two lines Logo renders, keeping today's
 * layout exactly for the default brand: "Kaveri Technologies Academy"
 * renders as "Kaveri Technologies" / "Academy". Any other name ending
 * in "Academy" splits the same way; any other name renders on one line.
 */
function splitDisplayName(displayName: string): { line1: string; line2: string | null } {
  const suffix = ' Academy';
  if (displayName.endsWith(suffix) && displayName.length > suffix.length) {
    return { line1: displayName.slice(0, -suffix.length), line2: 'Academy' };
  }
  return { line1: displayName, line2: null };
}

export function Logo({ size = 'md', showText = true, className }: LogoProps) {
  // DB-backed branding, falling back to today's hardcoded values when
  // the company_settings row is absent — layout/behaviour unchanged.
  const { branding } = useCompanyBranding();
  const { line1, line2 } = splitDisplayName(branding.displayName);
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <img
        src={branding.logoUrl}
        alt={branding.displayName}
        className={cn(sizes[size], 'rounded-xl object-contain bg-white shadow-sm border border-slate-100')}
      />
      {showText && (
        <div>
          <span className={cn('font-bold text-slate-900 dark:text-white leading-tight block', textSizes[size])}>
            {line1}
          </span>
          {line2 && (
            <span className="text-xs text-primary-600 dark:text-primary-400 font-medium -mt-0.5 block">{line2}</span>
          )}
        </div>
      )}
    </div>
  );
}
