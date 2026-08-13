import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Briefcase,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CircleDot,
  ClipboardList,
  Clock3,
  FolderKanban,
  Loader2,
  RefreshCw,
  Video,
} from 'lucide-react';
import { PageHeader } from '../../components/common/PageHeader';
import { EmptyState } from '../../components/ui/EmptyState';
import { useToast } from '../../components/ui/Toast';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { getFacultySessions } from '../../services/liveSessions';
import {
  getFacultyTeachingWork,
  TEACHING_MODE_LABELS,
  TEACHING_STATUS_LABELS,
} from '../../services/facultyTeachingWork';
import type { Assignment, FacultyTeachingWork, LiveSession, Project } from '../../types/database';

type EventType = 'live_session' | 'assignment' | 'project' | 'teaching_work';
type EventFilter = 'all' | EventType | 'deadlines';

interface FacultyCalendarEvent {
  id: string;
  type: EventType;
  title: string;
  courseTitle: string;
  date: string;
  startsAt: string;
  status: string;
  detail: string;
  route: string;
}

const EVENT_META: Record<EventType, {
  label: string;
  dot: string;
  badge: string;
  icon: typeof Video;
}> = {
  live_session: {
    label: 'Live class',
    dot: 'bg-teal-500',
    badge: 'bg-teal-50 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300',
    icon: Video,
  },
  assignment: {
    label: 'Assignment',
    dot: 'bg-blue-500',
    badge: 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
    icon: ClipboardList,
  },
  project: {
    label: 'Project',
    dot: 'bg-violet-500',
    badge: 'bg-violet-50 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300',
    icon: FolderKanban,
  },
  teaching_work: {
    label: 'Teaching work',
    dot: 'bg-amber-500',
    badge: 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
    icon: Briefcase,
  },
};

const WEEK_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function localDateKey(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

function dateKeyFromTimestamp(value: string): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value.slice(0, 10) : localDateKey(parsed);
}

function dateFromKey(value: string): Date {
  return new Date(`${value}T00:00:00`);
}

function combineDateAndTime(date: string, time?: string | null): string {
  return `${date}T${time?.slice(0, 8) || '00:00:00'}`;
}

function courseTitleFromRelation(relation: unknown, fallback = 'Course'): string {
  const value = Array.isArray(relation) ? relation[0] : relation;
  if (value && typeof value === 'object' && 'title' in value) {
    return String((value as { title?: unknown }).title || fallback);
  }
  return fallback;
}

function errorMessage(reason: unknown): string {
  if (reason instanceof Error) return reason.message;
  if (reason && typeof reason === 'object' && 'message' in reason) {
    return String((reason as { message?: unknown }).message || 'Unknown error');
  }
  return 'Unknown error';
}

function displayTime(event: FacultyCalendarEvent): string {
  const parsed = new Date(event.startsAt);
  if (Number.isNaN(parsed.getTime())) return event.detail;
  const time = parsed.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
  return event.type === 'assignment' || event.type === 'project' ? `Due ${time}` : time;
}

function EventRow({ event, onOpen }: { event: FacultyCalendarEvent; onOpen: () => void }) {
  const meta = EVENT_META[event.type];
  const Icon = meta.icon;

  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full text-left rounded-xl border border-slate-200 dark:border-slate-700 p-3.5 hover:border-primary-300 dark:hover:border-primary-700 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors"
    >
      <div className="flex items-start gap-3">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${meta.badge}`}>
          <Icon size={17} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <p className="font-semibold text-sm text-slate-900 dark:text-white truncate">{event.title}</p>
            <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${meta.badge}`}>
              {meta.label}
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">{event.courseTitle}</p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-xs text-slate-500 dark:text-slate-400">
            <span className="inline-flex items-center gap-1"><Clock3 size={12} />{displayTime(event)}</span>
            <span>{event.detail}</span>
            <span className="capitalize">{event.status.replaceAll('_', ' ')}</span>
          </div>
        </div>
      </div>
    </button>
  );
}

export default function FacultyCalendarPage() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const { warning } = useToast();
  const today = useMemo(() => new Date(), []);
  const todayKey = localDateKey(today);
  const [month, setMonth] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState(todayKey);
  const [filter, setFilter] = useState<EventFilter>('all');
  const [events, setEvents] = useState<FacultyCalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadEvents = useCallback(async (isRefresh = false) => {
    if (!profile?.id) return;
    isRefresh ? setRefreshing(true) : setLoading(true);

    try {
      const { data: courseRows, error: courseError } = await supabase
        .from('course_faculty')
        .select('course_id, course:courses(id, title)')
        .eq('faculty_id', profile.id);

      if (courseError) throw courseError;

      const courseIds = Array.from(new Set((courseRows ?? []).map(row => row.course_id).filter(Boolean)));
      const courseMap = new Map(
        (courseRows ?? []).map(row => [row.course_id, courseTitleFromRelation((row as any).course)]),
      );

      const assignmentPromise = courseIds.length
        ? (async () => {
            const { data, error } = await supabase
              .from('assignments')
              .select('*')
              .in('course_id', courseIds)
              .not('due_date', 'is', null);
            if (error) throw error;
            return (data ?? []) as Assignment[];
          })()
        : Promise.resolve([] as Assignment[]);

      const projectPromise = courseIds.length
        ? (async () => {
            const { data, error } = await supabase
              .from('projects')
              .select('*')
              .in('course_id', courseIds)
              .not('due_at', 'is', null);
            if (error) throw error;
            return (data ?? []) as Project[];
          })()
        : Promise.resolve([] as Project[]);

      const results = await Promise.allSettled([
        getFacultySessions(profile.id),
        getFacultyTeachingWork(profile.id),
        assignmentPromise,
        projectPromise,
      ]);

      const [sessionResult, workResult, assignmentResult, projectResult] = results;
      const sessions = sessionResult.status === 'fulfilled' ? sessionResult.value : [];
      const teachingWork = workResult.status === 'fulfilled' ? workResult.value : [];
      const assignments = assignmentResult.status === 'fulfilled' ? assignmentResult.value : [];
      const projects = projectResult.status === 'fulfilled' ? projectResult.value : [];
      const failed = results.filter(result => result.status === 'rejected');

      if (failed.length) {
        const firstFailure = failed[0] as PromiseRejectedResult;
        warning('Some calendar items could not load', errorMessage(firstFailure.reason));
      }

      const items: FacultyCalendarEvent[] = [];
      const sessionIds = new Set(sessions.map(session => session.id));

      sessions.forEach((session: LiveSession) => {
        items.push({
          id: session.id,
          type: 'live_session',
          title: session.title,
          courseTitle: session.course?.title ?? courseMap.get(session.course_id) ?? 'Course',
          date: dateKeyFromTimestamp(session.session_date),
          startsAt: session.session_date,
          status: session.status,
          detail: `${session.duration_minutes} min`,
          route: `/faculty/live-classes/${session.id}/edit`,
        });
      });

      teachingWork.forEach((work: FacultyTeachingWork) => {
        if (work.live_session_id && sessionIds.has(work.live_session_id)) return;
        items.push({
          id: work.id,
          type: 'teaching_work',
          title: work.title,
          courseTitle: work.course?.title ?? work.batch?.name ?? 'Teaching work',
          date: work.scheduled_date,
          startsAt: combineDateAndTime(work.scheduled_date, work.start_time),
          status: TEACHING_STATUS_LABELS[work.status],
          detail: TEACHING_MODE_LABELS[work.delivery_mode],
          route: '/faculty/batches',
        });
      });

      assignments.forEach(assignment => {
        if (!assignment.due_date) return;
        items.push({
          id: assignment.id,
          type: 'assignment',
          title: assignment.title,
          courseTitle: courseMap.get(assignment.course_id) ?? 'Course',
          date: dateKeyFromTimestamp(assignment.due_date),
          startsAt: assignment.due_date,
          status: assignment.status,
          detail: `${assignment.max_marks} marks`,
          route: `/faculty/assignments/builder/${assignment.id}`,
        });
      });

      projects.forEach(project => {
        if (!project.due_at) return;
        items.push({
          id: project.id,
          type: 'project',
          title: project.title,
          courseTitle: project.course_id ? courseMap.get(project.course_id) ?? 'Course' : 'Independent project',
          date: dateKeyFromTimestamp(project.due_at),
          startsAt: project.due_at,
          status: project.is_published ? 'published' : 'draft',
          detail: `${project.max_marks} marks`,
          route: `/faculty/projects/${project.id}/builder`,
        });
      });

      items.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
      setEvents(items);
    } catch (error) {
      setEvents([]);
      warning('Calendar could not load', errorMessage(error));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [profile?.id, warning]);

  useEffect(() => {
    void loadEvents();
  }, [loadEvents]);

  const filteredEvents = useMemo(() => events.filter(event => {
    if (filter === 'all') return true;
    if (filter === 'deadlines') return event.type === 'assignment' || event.type === 'project';
    return event.type === filter;
  }), [events, filter]);

  const monthEvents = useMemo(() => events.filter(event => {
    const date = dateFromKey(event.date);
    return date.getFullYear() === month.getFullYear() && date.getMonth() === month.getMonth();
  }), [events, month]);

  const gridDays = useMemo(() => {
    const firstDay = new Date(month.getFullYear(), month.getMonth(), 1);
    const gridStart = new Date(firstDay);
    gridStart.setDate(firstDay.getDate() - firstDay.getDay());
    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(gridStart);
      date.setDate(gridStart.getDate() + index);
      return date;
    });
  }, [month]);

  const eventsByDate = useMemo(() => {
    const grouped = new Map<string, FacultyCalendarEvent[]>();
    filteredEvents.forEach(event => grouped.set(event.date, [...(grouped.get(event.date) ?? []), event]));
    return grouped;
  }, [filteredEvents]);

  const selectedEvents = eventsByDate.get(selectedDate) ?? [];
  const upcomingEvents = filteredEvents
    .filter(event => event.date >= todayKey)
    .slice(0, 8);

  const changeMonth = (offset: number) => {
    const next = new Date(month.getFullYear(), month.getMonth() + offset, 1);
    setMonth(next);
    setSelectedDate(localDateKey(next));
  };

  const goToday = () => {
    setMonth(new Date(today.getFullYear(), today.getMonth(), 1));
    setSelectedDate(todayKey);
  };

  const filters: { value: EventFilter; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'live_session', label: 'Live classes' },
    { value: 'deadlines', label: 'Deadlines' },
    { value: 'teaching_work', label: 'Teaching work' },
  ];

  if (loading) {
    return (
      <div className="min-h-[520px] flex items-center justify-center">
        <Loader2 size={32} className="animate-spin text-primary-500" />
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto animate-fade-in">
      <PageHeader
        title="Faculty Calendar"
        subtitle="Live classes, deadlines, and your teaching schedule in one place"
        icon={CalendarDays}
        action={(
          <button type="button" onClick={() => void loadEvents(true)} className="btn-secondary inline-flex items-center gap-2" disabled={refreshing}>
            <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} /> Refresh
          </button>
        )}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {[
          { label: 'Events this month', value: monthEvents.length, icon: CalendarDays, color: 'text-primary-600 bg-primary-50 dark:bg-primary-900/30' },
          { label: 'Live classes', value: monthEvents.filter(event => event.type === 'live_session').length, icon: Video, color: 'text-teal-600 bg-teal-50 dark:bg-teal-900/30' },
          { label: 'Deadlines', value: monthEvents.filter(event => event.type === 'assignment' || event.type === 'project').length, icon: ClipboardList, color: 'text-violet-600 bg-violet-50 dark:bg-violet-900/30' },
          { label: 'Teaching work', value: monthEvents.filter(event => event.type === 'teaching_work').length, icon: Briefcase, color: 'text-amber-600 bg-amber-50 dark:bg-amber-900/30' },
        ].map(item => {
          const Icon = item.icon;
          return (
            <div key={item.label} className="card p-4 flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${item.color}`}><Icon size={19} /></div>
              <div><p className="text-xl font-bold text-slate-900 dark:text-white">{item.value}</p><p className="text-xs text-slate-500 dark:text-slate-400">{item.label}</p></div>
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        {filters.map(item => (
          <button
            key={item.value}
            type="button"
            onClick={() => setFilter(item.value)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              filter === item.value
                ? 'bg-primary-600 text-white'
                : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-primary-300'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="grid xl:grid-cols-[minmax(0,1fr)_360px] gap-6">
        <section className="card overflow-hidden">
          <div className="flex items-center justify-between gap-3 p-4 border-b border-slate-200 dark:border-slate-700">
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => changeMonth(-1)} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Previous month"><ChevronLeft size={18} /></button>
              <button type="button" onClick={() => changeMonth(1)} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Next month"><ChevronRight size={18} /></button>
              <h2 className="font-bold text-slate-900 dark:text-white ml-1">
                {month.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}
              </h2>
            </div>
            <button type="button" onClick={goToday} className="btn-secondary text-sm">Today</button>
          </div>

          <div className="grid grid-cols-7 border-b border-slate-200 dark:border-slate-700">
            {WEEK_DAYS.map(day => <div key={day} className="py-2.5 text-center text-xs font-semibold text-slate-400">{day}</div>)}
          </div>
          <div className="grid grid-cols-7">
            {gridDays.map(date => {
              const key = localDateKey(date);
              const dayEvents = eventsByDate.get(key) ?? [];
              const inMonth = date.getMonth() === month.getMonth();
              const isToday = key === todayKey;
              const selected = key === selectedDate;
              return (
                <button
                  type="button"
                  key={key}
                  onClick={() => setSelectedDate(key)}
                  className={`relative min-h-[92px] p-2 text-left border-b border-r border-slate-100 dark:border-slate-800 transition-colors ${
                    selected ? 'bg-primary-50 dark:bg-primary-900/20 ring-1 ring-inset ring-primary-400' : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                  } ${inMonth ? '' : 'opacity-40'}`}
                >
                  <span className={`inline-flex w-7 h-7 items-center justify-center rounded-full text-xs font-semibold ${
                    isToday ? 'bg-primary-600 text-white' : 'text-slate-700 dark:text-slate-300'
                  }`}>{date.getDate()}</span>
                  <div className="mt-1 space-y-1">
                    {dayEvents.slice(0, 2).map(event => (
                      <div key={`${event.type}-${event.id}`} className="flex items-center gap-1 min-w-0">
                        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${EVENT_META[event.type].dot}`} />
                        <span className="text-[10px] text-slate-600 dark:text-slate-400 truncate">{event.title}</span>
                      </div>
                    ))}
                    {dayEvents.length > 2 && <p className="text-[10px] text-primary-600 dark:text-primary-400">+{dayEvents.length - 2} more</p>}
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        <aside className="space-y-6">
          <section className="card p-5">
            <div className="flex items-center justify-between gap-3 mb-4">
              <div>
                <p className="text-xs font-medium text-primary-600 dark:text-primary-400 uppercase tracking-wide">Selected day</p>
                <h2 className="font-bold text-slate-900 dark:text-white mt-0.5">
                  {dateFromKey(selectedDate).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}
                </h2>
              </div>
              <span className="text-xs font-medium text-slate-500">{selectedEvents.length} event{selectedEvents.length === 1 ? '' : 's'}</span>
            </div>
            <div className="space-y-3">
              {selectedEvents.length ? selectedEvents.map(event => (
                <EventRow key={`${event.type}-${event.id}`} event={event} onOpen={() => navigate(event.route)} />
              )) : (
                <EmptyState icon={CircleDot} title="No events" description="Nothing is scheduled for this day." className="py-8" />
              )}
            </div>
          </section>

          <section className="card p-5">
            <h2 className="font-bold text-slate-900 dark:text-white mb-4">Coming up</h2>
            <div className="space-y-3">
              {upcomingEvents.length ? upcomingEvents.map(event => (
                <div key={`upcoming-${event.type}-${event.id}`}>
                  <p className="text-[11px] font-medium text-slate-400 mb-1.5">
                    {dateFromKey(event.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', weekday: 'short' })}
                  </p>
                  <EventRow event={event} onOpen={() => navigate(event.route)} />
                </div>
              )) : <p className="text-sm text-slate-500 dark:text-slate-400">No upcoming items for this filter.</p>}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
