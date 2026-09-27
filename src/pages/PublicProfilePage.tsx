import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  ExternalLink, Github, Linkedin, FileText, Code2, Trophy, BookOpen,
  Layers3, FolderKanban, Briefcase, Zap, Flame, Award, Lock, CheckCircle2, Loader2,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { QRCodeSVG } from 'qrcode.react';

/**
 * Public shareable student profile (/u/:slug). Anon-safe: data comes from the
 * SECURITY DEFINER RPC get_public_profile, which only returns data when the
 * student set their profile to public. Designed to be sent to CEOs/HRs.
 */

interface PublicProfileData {
  profile: {
    id: string;
    full_name: string | null;
    avatar_url: string | null;
    bio: string | null;
    xp_points: number;
    level: number;
    streak_days: number;
    linkedin_url: string | null;
    github_url: string | null;
    resume_url: string | null;
    profile_slug: string;
  } | null;
  coding: { solved: number; attempted: number; total_questions_tried: number };
  solved_questions: { title: string; difficulty: string; first_solved_at: string }[];
  mini_projects: {
    assignment_title: string;
    verified_score: number | null;
    max_marks: number | null;
    verified_passed: number | null;
    verified_total: number | null;
  }[];
  quizzes: { attempts: number; passed: number; avg_score_pct: number | null };
  lessons_completed: number;
  courses: { title: string; progress_percentage: number; enrolled_at: string }[];
  batches: string[];
  projects: { title: string; github_url: string | null; live_url: string | null; score: number | null; status: string }[];
}

const difficultyColors: Record<string, string> = {
  easy: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  medium: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  hard: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
};

function Stat({ icon: Icon, value, label, color }: { icon: typeof Code2; value: string | number; label: string; color: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 text-center">
      <Icon size={20} className={`mx-auto mb-2 ${color}`} />
      <p className="text-2xl font-bold text-slate-900 dark:text-white">{value}</p>
      <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
    </div>
  );
}

export default function PublicProfilePage() {
  const { slug } = useParams<{ slug: string }>();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<PublicProfileData | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      setNotFound(false);
      const { data: result, error } = await supabase.rpc('get_public_profile', { p_slug: slug ?? '' });
      if (!active) return;
      if (error || !result || !result.profile) {
        setNotFound(true);
      } else {
        setData(result as PublicProfileData);
      }
      setLoading(false);
    };
    void load();
    return () => { active = false; };
  }, [slug]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center">
        <Loader2 size={32} className="animate-spin text-primary-500" />
      </div>
    );
  }

  if (notFound || !data?.profile) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center p-6">
        <div className="card p-10 text-center max-w-md">
          <Lock size={36} className="mx-auto text-slate-400 mb-4" />
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">Profile not available</h1>
          <p className="text-sm text-slate-500 mt-2">
            This profile is private or the link is invalid. Students control who can see their profile from their Settings.
          </p>
        </div>
      </div>
    );
  }

  const p = data.profile;
  const shareUrl = `${window.location.origin}/u/${p.profile_slug}`;
  const quizAvg = data.quizzes?.avg_score_pct ?? null;
  const totalMiniProjectMarks = data.mini_projects.reduce((sum, m) => sum + (m.verified_score ?? 0), 0);
  const totalMiniProjectMax = data.mini_projects.reduce((sum, m) => sum + (m.max_marks ?? 0), 0);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      {/* Header band */}
      <div className="bg-gradient-to-r from-primary-600 to-teal-600 py-10 px-6">
        <div className="max-w-4xl mx-auto flex flex-col sm:flex-row items-center sm:items-end gap-6">
          <div className="w-24 h-24 rounded-3xl bg-white/15 backdrop-blur flex items-center justify-center flex-shrink-0 overflow-hidden">
            {p.avatar_url ? (
              <img src={p.avatar_url} alt={p.full_name ?? 'Student'} className="w-full h-full object-cover" />
            ) : (
              <span className="text-4xl font-extrabold text-white">{(p.full_name ?? 'S')[0].toUpperCase()}</span>
            )}
          </div>
          <div className="flex-1 text-center sm:text-left">
            <h1 className="text-3xl font-extrabold text-white">{p.full_name}</h1>
            {p.bio && <p className="text-white/80 text-sm mt-1 max-w-xl">{p.bio}</p>}
            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 mt-3">
              {data.batches.map(b => (
                <span key={b} className="inline-flex items-center gap-1 rounded-full bg-white/15 text-white text-xs px-2.5 py-1">
                  <Layers3 size={12} /> {b}
                </span>
              ))}
            </div>
            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 mt-3">
              {p.linkedin_url && (
                <a href={p.linkedin_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-full bg-white text-primary-700 text-xs font-medium px-3 py-1.5 hover:bg-primary-50">
                  <Linkedin size={13} /> LinkedIn
                </a>
              )}
              {p.github_url && (
                <a href={p.github_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-full bg-white text-slate-800 text-xs font-medium px-3 py-1.5 hover:bg-slate-100">
                  <Github size={13} /> GitHub
                </a>
              )}
              {p.resume_url && (
                <a href={p.resume_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-full bg-white text-slate-800 text-xs font-medium px-3 py-1.5 hover:bg-slate-100">
                  <FileText size={13} /> Resume
                </a>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">
        {/* Performance snapshot */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <Stat icon={Code2} value={data.coding.solved} label="Coding problems solved" color="text-blue-500" />
          <Stat icon={Trophy} value={data.quizzes.attempts > 0 && quizAvg !== null ? `${quizAvg}%` : '—'} label="Avg quiz score" color="text-violet-500" />
          <Stat icon={FolderKanban} value={data.mini_projects.length} label="Verified projects" color="text-teal-500" />
          <Stat icon={Briefcase} value={data.projects.length} label="Portfolio projects" color="text-orange-500" />
          <Stat icon={BookOpen} value={data.lessons_completed} label="Lessons completed" color="text-emerald-500" />
          <Stat icon={Award} value={p.level} label={`Level · ${p.xp_points.toLocaleString()} XP`} color="text-amber-500" />
        </div>

        {/* Coding questions */}
        {(data.coding.solved > 0 || data.coding.attempted > 0) && (
          <div className="card p-6">
            <div className="flex items-center gap-2 mb-4">
              <Code2 size={18} className="text-blue-500" />
              <h2 className="font-bold text-slate-900 dark:text-white">Coding questions</h2>
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
              Solved <strong className="text-slate-900 dark:text-white">{data.coding.solved}</strong>
              {data.coding.attempted > 0 && <> · still working on <strong>{data.coding.attempted}</strong></>}
              {' '}{data.coding.total_questions_tried > 0 && <>· tried {data.coding.total_questions_tried} total</>}
            </p>
            {data.solved_questions.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {data.solved_questions.map((q, i) => (
                  <span key={`${q.title}-${i}`} className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 px-2.5 py-1.5 text-xs text-slate-700 dark:text-slate-300">
                    <CheckCircle2 size={12} className="text-emerald-500 flex-shrink-0" />
                    {q.title}
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${difficultyColors[q.difficulty] ?? ''}`}>{q.difficulty}</span>
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Verified mini-projects (VS Code extension) */}
        {data.mini_projects.length > 0 && (
          <div className="card p-6">
            <div className="flex items-center gap-2 mb-4">
              <FolderKanban size={18} className="text-teal-500" />
              <h2 className="font-bold text-slate-900 dark:text-white">Verified mini-projects</h2>
              <span className="text-xs text-slate-400">graded on the platform</span>
            </div>
            {totalMiniProjectMax > 0 && (
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
                Total verified score: <strong className="text-slate-900 dark:text-white">{totalMiniProjectMarks} / {totalMiniProjectMax}</strong>
              </p>
            )}
            <div className="space-y-2">
              {data.mini_projects.map(m => (
                <div key={m.assignment_title} className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60">
                  <CheckCircle2 size={16} className="text-emerald-500 flex-shrink-0" />
                  <p className="flex-1 text-sm font-medium text-slate-900 dark:text-white">{m.assignment_title}</p>
                  {m.verified_passed !== null && m.verified_total !== null && (
                    <span className="text-xs text-slate-500 flex-shrink-0">{m.verified_passed}/{m.verified_total} tests</span>
                  )}
                  {m.verified_score !== null && (
                    <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-400 flex-shrink-0">
                      {m.verified_score}{m.max_marks ? ` / ${m.max_marks}` : ''}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Portfolio projects */}
        {data.projects.length > 0 && (
          <div className="card p-6">
            <div className="flex items-center gap-2 mb-4">
              <Briefcase size={18} className="text-orange-500" />
              <h2 className="font-bold text-slate-900 dark:text-white">Projects</h2>
            </div>
            <div className="space-y-2">
              {data.projects.map(pr => (
                <div key={pr.title} className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900 dark:text-white truncate">{pr.title}</p>
                    {pr.status && <p className="text-xs text-slate-500 capitalize">{pr.status.replace(/_/g, ' ')}{pr.score !== null ? ` · score ${pr.score}` : ''}</p>}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {pr.github_url && <a href={pr.github_url} target="_blank" rel="noreferrer" className="p-2 rounded-lg text-slate-400 hover:text-slate-900 dark:hover:text-white" title="GitHub repo"><Github size={16} /></a>}
                    {pr.live_url && <a href={pr.live_url} target="_blank" rel="noreferrer" className="p-2 rounded-lg text-slate-400 hover:text-primary-600" title="Live demo"><ExternalLink size={16} /></a>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Courses */}
        {data.courses.length > 0 && (
          <div className="card p-6">
            <div className="flex items-center gap-2 mb-4">
              <BookOpen size={18} className="text-emerald-500" />
              <h2 className="font-bold text-slate-900 dark:text-white">Courses</h2>
            </div>
            <div className="space-y-2">
              {data.courses.map(c => (
                <div key={c.title} className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900 dark:text-white truncate">{c.title}</p>
                    <div className="h-1.5 w-full max-w-[240px] rounded-full bg-slate-200 dark:bg-slate-700 mt-1.5 overflow-hidden">
                      <div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.round(c.progress_percentage)}%` }} />
                    </div>
                  </div>
                  <span className="text-xs text-slate-500 flex-shrink-0">{Math.round(c.progress_percentage)}%</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* QR — scan to open on a phone (placements / in-person sharing) */}
        <div className="card p-6 flex flex-col sm:flex-row items-center gap-6">
          <div className="bg-white p-3 rounded-2xl border border-slate-200 dark:border-slate-700 flex-shrink-0">
            <QRCodeSVG value={shareUrl} size={128} level="M" />
          </div>
          <div className="text-center sm:text-left">
            <h2 className="font-bold text-slate-900 dark:text-white">Scan to view this profile</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              Point a phone camera at this code to open {p.full_name}&apos;s verified performance profile — handy at placements and walk-ins.
            </p>
            <p className="text-xs text-primary-600 dark:text-primary-400 mt-2 break-all">{shareUrl}</p>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center py-6 flex items-center justify-center gap-2 text-xs text-slate-400">
          <Zap size={12} className="text-amber-400" />
          <Flame size={12} className="text-orange-400" />
          Verified performance record on Kaveri Academy · {p.streak_days}-day streak
        </div>
      </div>
    </div>
  );
}
