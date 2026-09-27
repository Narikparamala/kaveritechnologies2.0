import { supabase } from '../lib/supabase';

/**
 * Platform-level feature switches backed by the platform_settings table
 * (Admin → Platform Settings). Falls back to defaults when the table is
 * unreachable so no student page can break because of a settings outage.
 */
export const DEFAULT_SETTINGS: Record<string, string> = {
  content_auto_update: 'true',
  maintenance_mode: 'false',
};

export const getPlatformSettings = async (): Promise<Record<string, string>> => {
  try {
    const { data, error } = await supabase.from('platform_settings').select('key, value');
    if (error) throw error;
    return { ...DEFAULT_SETTINGS, ...Object.fromEntries((data ?? []).map(r => [r.key, r.value ?? ''])) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  };
};

export const isContentAutoUpdateEnabled = async (): Promise<boolean> => {
  const settings = await getPlatformSettings();
  return settings.content_auto_update !== 'false';
};

/**
 * Curated "new technologies" feed shown on the student dashboard when
 * content_auto_update is enabled. Admins can edit this list in
 * src/services/platformSettings.ts — no database change needed.
 */
export interface TechNewsItem {
  title: string;
  summary: string;
  tag: string;
}

export const TECH_NEWS_SEED: TechNewsItem[] = [
  {
    title: 'Python 3.13 in the classroom',
    summary: 'The free-threaded build and a smarter interactive shell make Python faster and friendlier — the Academy playground runs 3.12+ syntax today.',
    tag: 'Python',
  },
  {
    title: 'AI pair-programming is now a job skill',
    summary: 'Interviews increasingly ask how you use AI tools responsibly: prompt, verify, test. Practice explaining your code out loud.',
    tag: 'AI Tools',
  },
  {
    title: 'SQL is eating analytics again',
    summary: 'DuckDB and Postgres extensions push SQL further — strong query skills remain the highest-ROI skill for data roles.',
    tag: 'Databases',
  },
  {
    title: 'Edge deployment goes mainstream',
    summary: 'Vercel, Cloudflare Workers and serverless Postgres mean your full-stack projects deploy globally in minutes. Ship a portfolio this month.',
    tag: 'Cloud',
  },
  {
    title: 'Security basics every developer needs',
    summary: 'Row-Level Security, least-privilege keys and input validation are interview topics — this platform runs on all three.',
    tag: 'Security',
  },
  {
    title: 'Typing + terminals still matter',
    summary: 'Automation and DevOps roles test CLI fluency. Try the playground, then graduate to a real terminal on your laptop.',
    tag: 'Foundations',
  },
];

export const getTechNews = async (): Promise<TechNewsItem[]> => {
  const enabled = await isContentAutoUpdateEnabled();
  return enabled ? TECH_NEWS_SEED : [];
};
