import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  BarChart3,
  CalendarDays,
  ChevronDown,
  ChevronUp,
  Download,
  ExternalLink,
  Filter,
  Layers3,
  Loader2,
  TrendingUp,
  UserCheck,
  UserMinus,
  UserX,
 Users,
} from 'lucide-react';
import { PageHeader } from '../../components/common/PageHeader';
import { EmptyState } from '../../components/ui/EmptyState';
import { Badge } from '../../components/ui/Badge';
import { useToast } from '../../components/ui/Toast';
import {
  getBatchAttendanceHistory,
  getFacultyBatches,
  type BatchAttendanceHistory,
  type StudentTrend,
} from '../../services/batchLiveClasses';

function pct(part: number, total: number): string {
  if (total === 0) return '—';
  return `${Math.round((part / total) * 100)}%`;
}

function statusColor(status: string): string {
  switch (status) {
    case 'completed': return 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400';
    case 'live': return 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400';
    case 'scheduled': return 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400';
    default: return 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300';
  }
}

function StudentTrendRow({ trend, totalSessions }: { trend: StudentTrend; totalSessions: number }) {
  const [open, setOpen] = useState(false);
  const rate = trend.attended + trend.absent + trend.excused > 0
    ? Math.round((trend.attended / (trend.attended + trend.absent + trend.excused)) * 100)
    : null;

  return (
    <>
      <tr
        className="hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer"
        onClick={() => setOpen(o => !o)}
      >
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            {open ? <ChevronUp size={14} className="text-slate-400" /> : <ChevronDown size={14} className="text-slate-400" />}
            <div className="w-8 h-8 rounded-full bg-primary-100 dark:bg-primary-900/30 overflow-hidden flex-shrink-0 flex items-center justify-center">
              {trend.avatar_url ? (
                <img src={trend.avatar_url} alt="" className="w-full h-full object-cover" />
              ) : (
                <span className="text-xs font-bold text-primary-600 dark:text-primary-400">
                  {(trend.full_name || trend.email || '?').charAt(0).toUpperCase()}
                </span>
              )}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-slate-900 dark:text-white truncate">{trend.full_name ?? 'Student'}</p>
              <p className="text-xs text-slate-500 truncate">{trend.email}</p>
            </div>
          </div>
        </td>
        <td className="px-4 py-3 text-sm text-emerald-600 font-medium">{trend.attended}</td>
        <td className="px-4 py-3 text-sm text-red-600 font-medium">{trend.absent}</td>
        <td className="px-4 py-3 text-sm text-amber-600 font-medium">{trend.excused}</td>
        <td className="px-4 py-3 text-sm text-slate-400">{trend.unmarked}</td>
        <td className="px-4 py-3 text-sm">
          {rate === null ? (
            <span className="text-slate-400">No data</span>
          ) : (
            <span className={`font-semibold ${rate >= 75 ? 'text-emerald-600' : rate >= 50 ? 'text-amber-600' : 'text-red-600'}`}>
              {rate}%
            </span>
          )}
        </td>
      </tr>
      {open && (
        <tr className="bg-slate-50 dark:bg-slate-800/40">
          <td colSpan={6} className="px-8 py-4 text-xs text-slate-500 dark:text-slate-400">
            Attended {trend.attended} of {totalSessions} session{totalSessions === 1 ? '' : 's'} in this batch.
            {' '}{trend.unmarked > 0 && `${trend.unmarked} still pending marking.`}
          </td>
        </tr>
      )}
    </>
  );
}

export default function FacultyAttendanceHistoryPage() {
  const { error: showError } = useToast();
  const [batches, setBatches] = useState<{ id: string; name: string; course_id: string | null; course_title: string | null }[]>([]);
  const [selectedBatchId, setSelectedBatchId] = useState<string>('');
  const [history, setHistory] = useState<(BatchAttendanceHistory & { cohortRate?: number | null }) | null>(null);
  const [loading, setLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [sessionsOpen, setSessionsOpen] = useState(true);
  const [sortBy, setSortBy] = useState<'name' | 'rate'>('rate');

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const list = await getFacultyBatches();
        if (!alive) return;
        setBatches(list);
        if (list.length > 0) setSelectedBatchId(list[0].id);
      } catch (e) {
        if (alive) showError('Could not load your batches.');
        console.error(e);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [showError]);

  const loadHistory = useCallback(async (batchId: string) => {
    if (!batchId) return;
    setHistoryLoading(true);
    try {
      const data = await getBatchAttendanceHistory(batchId);
      setHistory(data);
    } catch (e) {
      console.error(e);
      showError('Could not load attendance history for this batch.');
      setHistory(null);
    } finally {
      setHistoryLoading(false);
    }
  }, [showError]);

  useEffect(() => {
    if (selectedBatchId) void loadHistory(selectedBatchId);
  }, [selectedBatchId, loadHistory]);

  const sortedTrends = useMemo(() => {
    if (!history) return [];
    const list = [...history.studentTrends];
    if (sortBy === 'name') {
      list.sort((a, b) => (a.full_name ?? a.email).localeCompare(b.full_name ?? b.email));
    } else {
      const rateOf = (t: StudentTrend) => {
        const marked = t.attended + t.absent + t.excused;
        return marked === 0 ? -1 : t.attended / marked;
      };
      list.sort((a, b) => rateOf(b) - rateOf(a));
    }
    return list;
  }, [history, sortBy]);

  const handleExportCSV = () => {
    if (!history) return;
    const rows: string[] = [];
    rows.push(['Type', 'Student/Session', 'Date', 'Attended', 'Absent', 'Excused', 'Unmarked', 'Rate'].map(c => `"${c}"`).join(','));
    rows.push(['SUMMARY', `${history.batch_name} · ${history.course_title ?? 'No course'}`, '', String(history.active_students), '', '', '', history.cohortRate == null ? '' : `${history.cohortRate}%`].map(c => c).join(','));
    rows.push('');
    rows.push(['STUDENT', 'Email', 'Attended', 'Absent', 'Excused', 'Unmarked'].map(c => `"${c}"`).join(','));
    for (const t of history.studentTrends) {
      const marked = t.attended + t.absent + t.excused;
      rows.push(['STUDENT', t.full_name ?? 'Student', t.email, String(t.attended), String(t.absent), String(t.excused), String(t.unmarked), marked ? `${Math.round((t.attended / marked) * 100)}%` : ''].map(c => `"${c}"`).join(','));
    }
    rows.push('');
    rows.push(['SESSION', 'Date', 'Status', 'Attended', 'Absent', 'Excused', 'Unmarked'].map(c => `"${c}"`).join(','));
    for (const s of history.sessions) {
      const total = s.attended_count + s.absent_count + s.excused_count + s.unmarked_count;
      rows.push(['SESSION', s.title, new Date(s.session_date).toLocaleString(), s.status, String(s.attended_count), String(s.absent_count), String(s.excused_count), String(s.unmarked_count), total ? `${Math.round((s.attended_count / total) * 100)}%` : ''].map(c => `"${c}"`).join(','));
    }
    const url = URL.createObjectURL(new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `attendance-history-${history.batch_name.replace(/[^a-z0-9]+/gi, '-')}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return <div className="flex h-96 items-center justify-center"><Loader2 className="animate-spin text-primary-600" size={32} /></div>;
  }

  if (batches.length === 0) {
    return (
      <div className="p-6 lg:p-8">
        <EmptyState
          icon={Layers3}
          title="No batches yet"
          description="Once an admin assigns you to a batch, its attendance history will show up here."
          action={<Link to="/faculty/live-classes" className="btn-primary text-sm">Go to Live Classes</Link>}
        />
      </div>
    );
  }

  const selectedBatch = batches.find(b => b.id === selectedBatchId);
  const totalSessions = history?.sessions.length ?? 0;
  const totalAttended = history?.sessions.reduce((sum, s) => sum + s.attended_count, 0) ?? 0;
  const totalAbsent = history?.sessions.reduce((sum, s) => sum + s.absent_count, 0) ?? 0;
  const totalExcused = history?.sessions.reduce((sum, s) => sum + s.excused_count, 0) ?? 0;
  const totalUnmarked = history?.sessions.reduce((sum, s) => sum + s.unmarked_count, 0) ?? 0;

  return (
    <div className="p-6 lg:p-8 max-w-6xl mx-auto animate-fade-in">
      <Link to="/faculty/live-classes" className="mb-4 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-primary-600 dark:text-slate-400">
        <ArrowLeft size={16} /> Back to Live Classes
      </Link>

      <PageHeader
        title="Attendance History"
        subtitle="Track attendance trends per batch — session by session and student by student."
        icon={BarChart3}
        action={
          <button onClick={handleExportCSV} disabled={!history} className="btn-secondary flex items-center gap-1.5 text-sm disabled:opacity-50">
            <Download size={14} /> Export CSV
          </button>
        }
      />

      {/* Batch selector */}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Filter size={14} className="text-slate-400" />
        <select
          className="input text-sm py-1.5 w-auto min-w-[200px]"
          value={selectedBatchId}
          onChange={e => setSelectedBatchId(e.target.value)}
        >
          {batches.map(b => (
            <option key={b.id} value={b.id}>
              {b.name}{b.course_title ? ` · ${b.course_title}` : ''}
            </option>
          ))}
        </select>
      </div>

      {historyLoading ? (
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="animate-spin text-primary-600" size={24} />
        </div>
      ) : !history ? (
        <EmptyState icon={BarChart3} title="No data" description="Select a batch to see its attendance history." />
      ) : (
        <>
          {/* Summary cards */}
          <div className="mb-6 grid grid-cols-2 md:grid-cols-5 gap-3">
            {[
              { label: 'Active students', value: history.active_students, icon: Users, color: 'text-blue-500' },
              { label: 'Sessions', value: totalSessions, icon: CalendarDays, color: 'text-violet-500' },
              { label: 'Total attended', value: totalAttended, icon: UserCheck, color: 'text-emerald-500' },
              { label: 'Total absent', value: totalAbsent, icon: UserX, color: 'text-red-500' },
              { label: 'Cohort rate', value: history.cohortRate != null ? `${history.cohortRate}%` : '—', icon: TrendingUp, color: 'text-primary-500' },
            ].map(stat => (
              <div key={stat.label} className="card p-4">
                <stat.icon size={18} className={`${stat.color} mb-2`} />
                <p className="text-2xl font-bold text-slate-900 dark:text-white">{stat.value}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">{stat.label}</p>
              </div>
            ))}
          </div>

          {/* Sessions timeline */}
          <section className="mb-8">
            <button
              onClick={() => setSessionsOpen(o => !o)}
              className="w-full flex items-center justify-between text-left mb-3"
            >
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">Session-by-session breakdown</h2>
              {sessionsOpen ? <ChevronUp size={18} className="text-slate-400" /> : <ChevronDown size={18} className="text-slate-400" />}
            </button>
            {sessionsOpen && (
              totalSessions === 0 ? (
                <EmptyState
                  icon={CalendarDays}
                  title="No live classes scheduled for this batch yet"
                  description="Schedule one from the Live Classes page — every completed class will add itself here."
                  action={<Link to="/faculty/live-classes" className="btn-primary text-sm">Schedule a class</Link>}
                />
              ) : (
                <div className="card divide-y divide-slate-200 dark:divide-slate-700 overflow-x-auto">
                  {history.sessions.map(s => {
                    const total = s.attended_count + s.absent_count + s.excused_count + s.unmarked_count;
                    return (
                      <div key={s.session_id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Link to={`/faculty/live-classes/${s.session_id}/attendance`} className="text-sm font-semibold text-primary-600 hover:underline dark:text-primary-400 line-clamp-1">
                              {s.title}
                            </Link>
                            <Badge className={statusColor(s.status)}>{s.status}</Badge>
                            {s.unlocks_lesson && <Badge variant="teal">unlocks lesson</Badge>}
                          </div>
                          <p className="text-xs text-slate-500 mt-0.5">
                            {new Date(s.session_date).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                            {' · '}{s.duration_minutes} min
                          </p>
                        </div>
                        <div className="flex items-center gap-3 text-xs font-medium flex-shrink-0">
                          <span className="inline-flex items-center gap-1 text-emerald-600"><UserCheck size={13} />{s.attended_count}</span>
                          <span className="inline-flex items-center gap-1 text-red-600"><UserX size={13} />{s.absent_count}</span>
                          <span className="inline-flex items-center gap-1 text-amber-600"><UserMinus size={13} />{s.excused_count}</span>
                          <span className="inline-flex items-center gap-1 text-slate-400"><Users size={13} />{s.unmarked_count}</span>
                          <span className="ml-1 text-slate-600 dark:text-slate-300 w-10 text-right">
                            {pct(s.attended_count, total)}
                          </span>
                          <Link
                            to={`/faculty/live-classes/${s.session_id}/attendance`}
                            className="p-1.5 text-slate-400 hover:text-primary-600"
                            title="Open this session's attendance"
                          >
                            <ExternalLink size={14} />
                          </Link>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )
            )}
          </section>

          {/* Per-student trends */}
          <section>
            <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">Student trends</h2>
              <select className="input text-xs py-1.5 w-auto" value={sortBy} onChange={e => setSortBy(e.target.value as 'name' | 'rate')}>
                <option value="rate">Sort: attendance rate ↓</option>
                <option value="name">Sort: name A→Z</option>
              </select>
            </div>
            {sortedTrends.length === 0 ? (
              <EmptyState icon={Users} title="No students in this batch" description="Add students to the batch to see their attendance trends." />
            ) : (
              <div className="card overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-50 dark:bg-slate-800">
                    <tr>
                      {['Student', 'Attended', 'Absent', 'Excused', 'Unmarked', 'Rate'].map((h, i) => (
                        <th key={h} className={`px-4 py-3 text-xs font-medium text-slate-500 ${i === 0 ? 'text-left' : 'text-left'}`}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                    {sortedTrends.map(t => (
                      <StudentTrendRow key={t.student_id} trend={t} totalSessions={totalSessions} />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Course-wide sessions included - clarification */}
          {selectedBatch?.course_title && (
            <p className="mt-4 text-xs text-slate-400">
              Includes batch-scoped classes and course-wide classes of “{selectedBatch.course_title}” that this batch's students attend.
            </p>
          )}
        </>
      )}
    </div>
  );
}
