import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: string | Date, fmt = 'MMM d, yyyy') {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('en-IN', {
    year: fmt.includes('yyyy') ? 'numeric' : undefined,
    month: fmt.includes('MMM') ? 'short' : fmt.includes('MM') ? '2-digit' : undefined,
    day: fmt.includes('d') ? 'numeric' : undefined,
  });
}

export function formatRelativeTime(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return formatDate(d);
}

export function truncate(text: string, maxLen = 100): string {
  return text.length <= maxLen ? text : text.slice(0, maxLen).trimEnd() + '…';
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function getDifficultyColor(difficulty: string): string {
  switch (difficulty) {
    case 'beginner': return 'text-emerald-600 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-900/30';
    case 'intermediate': return 'text-amber-600 bg-amber-50 dark:text-amber-400 dark:bg-amber-900/30';
    case 'advanced': return 'text-red-600 bg-red-50 dark:text-red-400 dark:bg-red-900/30';
    default: return 'text-slate-600 bg-slate-100 dark:text-slate-400 dark:bg-slate-800';
  }
}

export function getStatusColor(status: string): string {
  switch (status) {
    case 'submitted': return 'text-blue-600 bg-blue-50 dark:text-blue-400 dark:bg-blue-900/30';
    case 'graded': return 'text-green-600 bg-green-50 dark:text-green-400 dark:bg-green-900/30';
    case 'returned': return 'text-amber-600 bg-amber-50 dark:text-amber-400 dark:bg-amber-900/30';
    case 'resubmitted': return 'text-purple-600 bg-purple-50 dark:text-purple-400 dark:bg-purple-900/30';
    default: return 'text-slate-600 bg-slate-100';
  }
}

export function calculateXPLevel(xp: number): { level: number; progress: number; nextLevelXP: number } {
  const baseXP = 100;
  const level = Math.floor(Math.sqrt(xp / baseXP)) + 1;
  const currentLevelXP = Math.pow(level - 1, 2) * baseXP;
  const nextLevelXP = Math.pow(level, 2) * baseXP;
  const progress = ((xp - currentLevelXP) / (nextLevelXP - currentLevelXP)) * 100;
  return { level, progress, nextLevelXP };
}
