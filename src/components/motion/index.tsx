// Shared motion primitives for the student experience.
//
// Rules (agreed design):
// - Animations guide, never block: nothing here intercepts clicks or hides info.
// - Celebrations last ~1s maximum.
// - Every primitive collapses to a plain static render when the user enables
//   "Reduce motion" (Settings) or their OS reports prefers-reduced-motion.
// - Faculty surfaces deliberately do not use these (professional + restrained).

import { AnimatePresence, motion, type Variants } from 'framer-motion';
import { type ReactNode } from 'react';
import { BookOpen, Code2, HelpCircle, Monitor, PlayCircle, Rocket } from 'lucide-react';
import { useAppMotion } from '../../contexts/MotionContext';

const fadeUpParent: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.05 } },
};

const fadeUpChild: Variants = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3, ease: 'easeOut' } },
};

/** Scroll-triggered fade + slide up, runs once. Used for page card grids. */
export function FadeUp({ children, className, delay = 0, amount = 0.15 }: {
  children: ReactNode;
  className?: string;
  delay?: number;
  amount?: number;
}) {
  const { reduced } = useAppMotion();
  if (reduced) return <div className={className}>{children}</div>;
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 14 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount }}
      transition={{ duration: 0.4, delay, ease: 'easeOut' }}
    >
      {children}
    </motion.div>
  );
}

/** Parent for lists whose children animate in one after another. */
export function Stagger({ children, className }: { children: ReactNode; className?: string }) {
  const { reduced } = useAppMotion();
  if (reduced) return <div className={className}>{children}</div>;
  return (
    <motion.div
      className={className}
      variants={fadeUpParent}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, amount: 0.1 }}
    >
      {children}
    </motion.div>
  );
}

/** Child of <Stagger>. */
export function StaggerItem({ children, className }: { children: ReactNode; className?: string }) {
  const { reduced } = useAppMotion();
  if (reduced) return <div className={className}>{children}</div>;
  return <motion.div className={className} variants={fadeUpChild}>{children}</motion.div>;
}

/** One-shot mount reveal for panels/cards that appear without scrolling. */
export function Reveal({ children, className, delay = 0 }: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  const { reduced } = useAppMotion();
  if (reduced) return <div className={className}>{children}</div>;
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay, ease: 'easeOut' }}
    >
      {children}
    </motion.div>
  );
}

/** Spring scale-in for badges, checkmarks, counters. */
export function PopIn({ children, className, delay = 0 }: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  const { reduced } = useAppMotion();
  if (reduced) return <span className={className}>{children}</span>;
  return (
    <motion.span
      className={className}
      initial={{ scale: 0.4, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 500, damping: 24, delay }}
    >
      {children}
    </motion.span>
  );
}

/** Height-collapsing container for sidebar chapter expand/collapse. */
export function Collapsible({ open, children }: { open: boolean; children: ReactNode }) {
  const { reduced } = useAppMotion();
  if (reduced) return open ? <>{children}</> : null;
  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.div
          key="content"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.22, ease: 'easeOut' }}
          className="overflow-hidden"
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Gentle attention pulse for the "next up" item. Subtle by design. */
export function PulseDot({ children, className }: { children: ReactNode; className?: string }) {
  const { reduced } = useAppMotion();
  if (reduced) return <span className={className}>{children}</span>;
  return (
    <motion.span
      className={className}
      animate={{ scale: [1, 1.08, 1] }}
      transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
    >
      {children}
    </motion.span>
  );
}

/**
 * ~0.8s confetti burst. Purely decorative, absolutely positioned and
 * pointer-events-none so it can never block a click.
 */
export function CelebrationBurst({ show }: { show: boolean }) {
  const { reduced } = useAppMotion();
  if (reduced || !show) return null;
  const colors = ['#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ef4444', '#14b8a6'];
  const particles = Array.from({ length: 14 });
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-50">
      {particles.map((_, i) => {
        const angle = (i / particles.length) * Math.PI * 2;
        const dist = 56 + (i % 3) * 24;
        return (
          <motion.span
            key={i}
            className="absolute left-1/2 top-1/2 block h-1.5 w-1.5 rounded-full"
            style={{ backgroundColor: colors[i % colors.length] }}
            initial={{ x: '-50%', y: '-50%', opacity: 1, scale: 1 }}
            animate={{
              x: `calc(-50% + ${Math.round(Math.cos(angle) * dist)}px)`,
              y: `calc(-50% + ${Math.round(Math.sin(angle) * dist - 24)}px)`,
              opacity: 0,
              scale: 0.5,
            }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
          />
        );
      })}
    </div>
  );
}

/** Circle + check that draws itself (~0.6s). */
export function AnimatedCheck({ size = 18, className = '' }: { size?: number; className?: string }) {
  const { reduced } = useAppMotion();
  if (reduced) {
    return (
      <svg viewBox="0 0 24 24" width={size} height={size} className={className} aria-hidden>
        <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2" />
        <path d="M8 12.5l2.8 2.8L16.5 9.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  return (
    <motion.svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={className}
      aria-hidden
      initial="hidden"
      animate="visible"
    >
      <motion.circle
        cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2"
        variants={{ hidden: { pathLength: 0, opacity: 0.4 }, visible: { pathLength: 1, opacity: 1 } }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
      />
      <motion.path
        d="M8 12.5l2.8 2.8L16.5 9.5" fill="none" stroke="currentColor" strokeWidth="2.2"
        strokeLinecap="round" strokeLinejoin="round"
        variants={{ hidden: { pathLength: 0 }, visible: { pathLength: 1 } }}
        transition={{ duration: 0.3, delay: 0.3, ease: 'easeOut' }}
      />
    </motion.svg>
  );
}

export type LessonIconKind = 'video' | 'quiz' | 'code' | 'reading' | 'live' | 'project';

/** Small lesson-type icon with restrained motion: a hover bounce for quizzes,
 *  a blinking caret for coding. Everything else stays static unless hovered. */
export function LessonTypeIcon({ kind, size = 12, className = '' }: {
  kind: LessonIconKind;
  size?: number;
  className?: string;
}) {
  const { reduced } = useAppMotion();
  if (kind === 'code' && !reduced) {
    return (
      <motion.span className="relative inline-flex" whileHover={{ scale: 1.2 }} transition={{ type: 'spring', stiffness: 400, damping: 20 }}>
        <Code2 size={size} className={className} />
        <motion.span
          aria-hidden
          className="absolute -bottom-0.5 -right-0.5 h-[3px] w-[3px] rounded-[1px] bg-current"
          animate={{ opacity: [1, 0.15, 1] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: 'linear' }}
        />
      </motion.span>
    );
  }
  const icon =
    kind === 'video' ? <PlayCircle size={size} className={className} />
    : kind === 'quiz' ? <HelpCircle size={size} className={className} />
    : kind === 'code' ? <Code2 size={size} className={className} />
    : kind === 'live' ? <Monitor size={size} className={className} />
    : kind === 'project' ? <Rocket size={size} className={className} />
    : <BookOpen size={size} className={className} />;
  if (reduced) return icon;
  return (
    <motion.span
      className="inline-flex"
      whileHover={{ scale: 1.2, rotate: kind === 'quiz' ? 8 : 0 }}
      transition={{ type: 'spring', stiffness: 400, damping: 20 }}
    >
      {icon}
    </motion.span>
  );
}
