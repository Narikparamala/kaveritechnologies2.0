import { useCallback, useEffect, useState } from 'react';
import { Video, Loader2, ExternalLink, CircleDot } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../contexts/AuthContext';
import { useToast } from '../../../components/ui/Toast';
import { joinLiveSession } from '../../../services/batchLiveClasses';

/**
 * "Next class" banner for the course workspace. The student's batches are
 * their registration — no per-session signup. Shows the upcoming (or running)
 * batch / course-wide session with a countdown and a Join button that becomes
 * active 10 minutes before start; joining opens Meet and auto-marks
 * attendance (which releases the lesson when the session unlocks it).
 */
type NextSession = {
  id: string;
  title: string;
  batch_name: string | null;
  session_date: string;
  duration_minutes: number;
  google_meet_url: string | null;
};

function sessionEnd(s: NextSession): number {
  return new Date(s.session_date).getTime() + s.duration_minutes * 60_000;
}

export function NextClassBanner({ courseId }: { courseId: string }) {
  const { profile } = useAuth();
  const { success, error: showError } = useToast();
  const [session, setSession] = useState<NextSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [, setTick] = useState(0);

  const load = useCallback(async () => {
    if (!profile) return;
    try {
      // Batches the student belongs to (their auto-registration for classes).
      const { data: myBatches } = await supabase
        .from('batch_students')
        .select('batch_id, batch:batches!inner(id, name, course_id)')
        .eq('student_id', profile.id)
        .eq('status', 'active');
      const batchList = ((myBatches ?? []) as unknown as Array<{ batch: { id: string; name: string; course_id: string } }>)
        .map(b => b.batch)
        .filter(b => b?.course_id === courseId);
      const batchIds = batchList.map(b => b.id);

      // The next session of this course visible to the student: batch-scoped
      // (their batches) or course-wide. RLS enforces visibility; here we just
      // pick the soonest one that has not ended.
      let query = supabase
        .from('live_sessions')
        .select('id, title, batch_id, session_date, duration_minutes, google_meet_url, status')
        .eq('course_id', courseId)
        .in('status', ['scheduled', 'live'])
        .gte('session_date', new Date(Date.now() - 3 * 60 * 60_000).toISOString())
        .order('session_date')
        .limit(10);
      if (batchIds.length > 0) {
        query = query.or(`batch_id.is.null,batch_id.in.(${batchIds.join(',')})`);
      } else {
        query = query.is('batch_id', null);
      }
      const { data: sessions } = await query;
      // batch_id is new (typed DB schema not yet regenerated) — go through unknown.
      const rows = (sessions ?? []) as unknown as Array<NextSession & { batch_id: string | null }>;
      const upcoming = rows
        .map(s => ({ ...s, batch_name: batchList.find(b => b.id === s.batch_id)?.name ?? null }))
        .find(s => sessionEnd(s) > Date.now());
      setSession(upcoming ?? null);
    } catch {
      setSession(null);
    } finally {
      setLoading(false);
    }
  }, [profile, courseId]);

  useEffect(() => { void load(); }, [load]);
  // Re-render every 30s so the countdown and the join window stay honest.
  useEffect(() => {
    const t = window.setInterval(() => setTick(x => x + 1), 30_000);
    return () => window.clearInterval(t);
  }, []);

  const doJoin = async () => {
    if (!session) return;
    setJoining(true);
    try {
      const meetUrl = await joinLiveSession(session.id);
      if (meetUrl) window.open(meetUrl, '_blank', 'noopener,noreferrer');
      else success('Attendance marked — this class has no Meet link.');
      void load();
    } catch (e) {
      showError(e instanceof Error ? e.message : 'Could not join the class.');
    } finally {
      setJoining(false);
    }
  };

  if (loading) return null;
  if (!session) return null;

  const start = new Date(session.session_date).getTime();
  const end = sessionEnd(session);
  const now = Date.now();
  const windowOpen = now >= start - 10 * 60_000 && now <= end;
  const isLive = now >= start && now <= end;
  const msToStart = start - now;
  const countdown = msToStart > 0
    ? msToStart >= 86_400_000
      ? `starts in ${Math.floor(msToStart / 86_400_000)}d ${Math.floor((msToStart % 86_400_000) / 3_600_000)}h`
      : msToStart >= 3_600_000
        ? `starts in ${Math.floor(msToStart / 3_600_000)}h ${Math.floor((msToStart % 3_600_000) / 60_000)}m`
        : `starts in ${Math.max(1, Math.floor(msToStart / 60_000))} min`
    : 'live now';

  const timeLabel = new Date(session.session_date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return (
    <div className={`flex-shrink-0 flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-sm border-b ${
      isLive
        ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-100 dark:border-emerald-900'
        : 'bg-white dark:bg-slate-900 border-slate-100 dark:border-slate-800'
    }`}>
      {isLive
        ? <CircleDot size={14} className="text-emerald-600 animate-pulse flex-shrink-0" />
        : <Video size={14} className="text-primary-600 flex-shrink-0" />}
      <span className="font-medium text-slate-900 dark:text-white truncate">
        {isLive ? 'Class live now' : 'Next class'}: {session.title}
      </span>
      <span className="text-xs text-slate-500 dark:text-slate-400">
        {timeLabel}{session.batch_name ? ` · ${session.batch_name}` : ''} · {!windowOpen && countdown}
      </span>
      <div className="flex-1" />
      <button
        onClick={doJoin}
        disabled={!windowOpen || joining}
        title={session.google_meet_url ? undefined : 'No Meet link for this class yet — joining still marks your attendance.'}
        className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50 ${
          windowOpen ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-400 cursor-not-allowed'
        }`}
      >
        {joining ? <Loader2 size={12} className="animate-spin" /> : windowOpen ? <ExternalLink size={12} /> : null}
        {windowOpen ? 'Join class' : 'Join (10 min before)'}
      </button>
    </div>
  );
}
