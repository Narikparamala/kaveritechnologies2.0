import { useState, useEffect } from 'react';
import { Calendar, Clock, FileText, HelpCircle, Video, Loader2 } from 'lucide-react';
import { PageHeader } from '../../components/common/PageHeader';
import { EmptyState } from '../../components/ui/EmptyState';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

interface CalendarEvent {
  date: string;
  title: string;
  type: 'quiz' | 'assignment' | 'live_session';
  courseTitle: string;
}

const TYPE_STYLES: Record<string, string> = {
  quiz: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400',
  assignment: 'bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-400',
  live_session: 'bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-400',
};

const TYPE_ICONS = { quiz: HelpCircle, assignment: FileText, live_session: Video };

export default function CalendarPage() {
  const { profile } = useAuth();
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const now = new Date();

  useEffect(() => {
    if (!profile) return;
    loadEvents();
  }, [profile]);

  async function loadEvents() {
    if (!profile) return;
    setLoading(true);
    try {
      const { data: enrollments } = await supabase
        .from('course_enrollments')
        .select('course_id, courses(title)')
        .eq('student_id', profile.id)
        .eq('access_status', 'active');

      if (!enrollments?.length) { setEvents([]); return; }

      const courseIds = enrollments.map(e => e.course_id);
      const courseMap = new Map(enrollments.map(e => [e.course_id, (e as any).courses?.title ?? 'Unknown']));

      const [quizRes, assignRes, sessionRes] = await Promise.all([
        supabase
          .from('quizzes')
          .select('title, course_id, created_at')
          .in('course_id', courseIds)
          .eq('is_published', true),
        supabase
          .from('assignments')
          .select('title, course_id, due_date')
          .in('course_id', courseIds)
          .eq('is_published', true)
          .not('due_date', 'is', null),
        supabase
          .from('live_sessions')
          .select('title, course_id, session_date')
          .in('course_id', courseIds)
          .in('status', ['scheduled', 'live']),
      ]);

      const items: CalendarEvent[] = [];

      (quizRes.data ?? []).forEach(q => items.push({
        date: q.created_at.slice(0, 10),
        title: q.title,
        type: 'quiz',
        courseTitle: courseMap.get(q.course_id) ?? '',
      }));

      (assignRes.data ?? []).forEach(a => items.push({
        date: a.due_date!.slice(0, 10),
        title: a.title,
        type: 'assignment',
        courseTitle: courseMap.get(a.course_id) ?? '',
      }));

      (sessionRes.data ?? []).forEach(s => items.push({
        date: s.session_date.slice(0, 10),
        title: s.title,
        type: 'live_session',
        courseTitle: courseMap.get(s.course_id) ?? '',
      }));

      items.sort((a, b) => a.date.localeCompare(b.date));
      setEvents(items);
    } catch {
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }

  const upcoming = events.filter(e => new Date(e.date) >= new Date(now.toISOString().slice(0, 10)));
  const eventDates = new Set(events.map(e => e.date));

  if (loading) {
    return (
      <div className="p-6 lg:p-8 max-w-4xl mx-auto flex items-center justify-center min-h-[400px]">
        <Loader2 className="animate-spin text-primary-500" size={32} />
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 max-w-4xl mx-auto animate-fade-in">
      <PageHeader title="Learning Calendar" subtitle="Upcoming assignments, quizzes, and live sessions" icon={Calendar} />

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 card p-6">
          <h2 className="font-bold text-slate-900 dark:text-white mb-4">
            {now.toLocaleString('default', { month: 'long', year: 'numeric' })}
          </h2>
          <div className="grid grid-cols-7 gap-1 text-center mb-2">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
              <div key={d} className="text-xs font-medium text-slate-400 py-1">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: new Date(now.getFullYear(), now.getMonth(), 1).getDay() }).map((_, i) => (
              <div key={`empty-${i}`} />
            ))}
            {Array.from({ length: new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() }, (_, i) => i + 1).map(day => {
              const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
              const hasEvent = eventDates.has(dateStr);
              const isToday = day === now.getDate();
              return (
                <div
                  key={day}
                  className={`aspect-square flex flex-col items-center justify-center rounded-xl text-sm font-medium transition-colors ${
                    isToday ? 'bg-primary-600 text-white' :
                    hasEvent ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400' :
                    'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {day}
                  {hasEvent && !isToday && <div className="w-1 h-1 rounded-full bg-amber-500 mt-0.5" />}
                </div>
              );
            })}
          </div>
        </div>

        <div className="card p-6">
          <h2 className="font-bold text-slate-900 dark:text-white mb-4">Upcoming Events</h2>
          <div className="space-y-3">
            {upcoming.length === 0 ? (
              <p className="text-sm text-slate-400">No upcoming events.</p>
            ) : upcoming.slice(0, 10).map((ev, i) => {
              const Icon = TYPE_ICONS[ev.type];
              return (
                <div key={`${ev.date}-${ev.title}-${i}`} className={`p-3 rounded-xl ${TYPE_STYLES[ev.type]}`}>
                  <p className="text-xs font-medium mb-0.5">
                    {new Date(ev.date + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                  </p>
                  <p className="text-sm font-semibold">{ev.title}</p>
                  <div className="flex items-center gap-1 mt-1">
                    <Icon size={11} />
                    <span className="text-xs">{ev.courseTitle}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
