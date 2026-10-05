import { type LucideIcon } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '../../lib/utils';
import { useAppMotion } from '../../contexts/MotionContext';

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
  /** Gently floats the icon — a friendly mascot. Ignored under Reduce motion. */
  mascot?: boolean;
}

export function EmptyState({ icon: Icon, title, description, action, className, mascot }: EmptyStateProps) {
  const { reduced } = useAppMotion();
  const iconBox = 'w-14 h-14 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-4';
  return (
    <div className={cn('flex flex-col items-center justify-center py-16 px-6 text-center', className)}>
      {Icon && (
        mascot && !reduced ? (
          <motion.div
            className={iconBox}
            animate={{ y: [0, -4, 0] }}
            transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut' }}
          >
            <Icon size={24} className="text-slate-400" />
          </motion.div>
        ) : (
          <div className={iconBox}>
            <Icon size={24} className="text-slate-400" />
          </div>
        )
      )}
      <h3 className="text-base font-semibold text-slate-700 dark:text-slate-300 mb-1">{title}</h3>
      {description && <p className="text-sm text-slate-500 dark:text-slate-400 max-w-xs mb-5">{description}</p>}
      {action}
    </div>
  );
}
