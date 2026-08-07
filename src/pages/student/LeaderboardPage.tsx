import { useEffect, useState } from 'react';
import { Trophy, Medal, Flame, Zap } from 'lucide-react';
import { PageHeader } from '../../components/common/PageHeader';
import { SkeletonCard } from '../../components/ui/LoadingSpinner';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import type { Profile } from '../../types/database';

export default function LeaderboardPage() {
  const { profile } = useAuth();
  const [leaders, setLeaders] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from('profiles')
      .select('*')
      .eq('role', 'student')
      .order('xp_points', { ascending: false })
      .limit(50)
      .then(({ data }) => {
        setLeaders((data ?? []) as Profile[]);
        setLoading(false);
      });
  }, []);

  const medals = ['🥇', '🥈', '🥉'];

  return (
    <div className="p-6 lg:p-8 max-w-3xl mx-auto animate-fade-in">
      <PageHeader title="Leaderboard" subtitle="Top Python learners ranked by XP" icon={Trophy} />

      {/* Top 3 podium */}
      {!loading && leaders.length >= 3 && (
        <div className="flex items-end justify-center gap-4 mb-8">
          {[leaders[1], leaders[0], leaders[2]].map((l, i) => {
            const rank = i === 0 ? 2 : i === 1 ? 1 : 3;
            const heights = ['h-28', 'h-36', 'h-24'];
            return (
              <div key={l.id} className="flex flex-col items-center gap-2">
                <div className="w-12 h-12 rounded-2xl bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center">
                  <span className="font-bold text-primary-700 dark:text-primary-400">{l.full_name?.charAt(0)}</span>
                </div>
                <p className="text-xs font-semibold text-slate-900 dark:text-white text-center truncate max-w-[80px]">{l.full_name}</p>
                <p className="text-xs text-slate-400">{l.xp_points.toLocaleString()} XP</p>
                <div className={`${heights[i]} w-20 rounded-t-2xl flex items-start justify-center pt-3 ${rank === 1 ? 'bg-gradient-to-b from-yellow-400 to-amber-500' : rank === 2 ? 'bg-gradient-to-b from-slate-300 to-slate-400' : 'bg-gradient-to-b from-amber-600 to-amber-700'}`}>
                  <span className="text-2xl">{medals[rank - 1]}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Full list */}
      {loading ? (
        <div className="space-y-3">{[1, 2, 3, 4, 5].map(i => <SkeletonCard key={i} />)}</div>
      ) : (
        <div className="card divide-y divide-slate-100 dark:divide-slate-700">
          {leaders.map((l, i) => {
            const isMe = l.id === profile?.id;
            return (
              <div key={l.id} className={`flex items-center gap-4 px-5 py-4 transition-colors ${isMe ? 'bg-primary-50 dark:bg-primary-900/20' : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'}`}>
                <div className={`w-8 text-center font-bold text-sm ${i < 3 ? 'text-amber-500' : 'text-slate-400'}`}>
                  {i < 3 ? medals[i] : `#${i + 1}`}
                </div>
                <div className="w-9 h-9 rounded-xl bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center flex-shrink-0">
                  {l.avatar_url ? (
                    <img src={l.avatar_url} alt="" className="w-9 h-9 rounded-xl object-cover" />
                  ) : (
                    <span className="text-sm font-bold text-primary-700 dark:text-primary-400">{l.full_name?.charAt(0)}</span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-slate-900 dark:text-white text-sm truncate">
                    {l.full_name} {isMe && <span className="text-primary-600 text-xs">(You)</span>}
                  </p>
                  <p className="text-xs text-slate-400">Level {l.level}</p>
                </div>
                <div className="flex items-center gap-4 text-right">
                  <div className="hidden sm:block text-xs text-orange-500 flex items-center gap-1">
                    <Flame size={12} /> {l.streak_days}d
                  </div>
                  <div className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-1">
                    <Zap size={13} className="text-amber-500" />
                    {l.xp_points.toLocaleString()}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
