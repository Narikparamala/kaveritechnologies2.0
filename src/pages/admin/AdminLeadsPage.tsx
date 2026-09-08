import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { UserPlus, PhoneCall, CalendarClock, MessagesSquare, UserCheck, Users } from 'lucide-react';
import { PageHeader } from '../../components/common/PageHeader';
import { Badge } from '../../components/ui/Badge';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { EmptyState } from '../../components/ui/EmptyState';
import { StatCard } from '../../components/ui/StatCard';
import {
  listLeads, getLeadStatusCounts, getLeadCourseOptions, getStaffOptions,
  getOpenFollowUps, getFollowUpBoard, EMPTY_FILTERS,
  STATUS_BADGE_VARIANT, LEAD_STATUSES, LEAD_TYPES,
} from '../../services/marketingLeads';
import type {
  MarketingLead, LeadStatus, LeadType, FollowUpItem, FollowUpBucket,
} from '../../services/marketingLeads';

const TYPE_OPTIONS: LeadType[] = [...LEAD_TYPES];
const STATUS_OPTIONS: LeadStatus[] = [...LEAD_STATUSES];

export default function AdminLeadsPage() {
  const navigate = useNavigate();
  const [leads, setLeads] = useState<MarketingLead[]>([]);
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [fuBoard, setFuBoard] = useState<FollowUpBucket | null>(null);
  const [followUps, setFollowUps] = useState<Map<string, FollowUpItem>>(new Map());
  const [courses, setCourses] = useState<{ slug: string; title: string | null }[]>([]);
  const [staff, setStaff] = useState<{ id: string; full_name: string | null; email: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState({ ...EMPTY_FILTERS });
  const [fuTab, setFuTab] = useState<'overdue' | 'today' | 'upcoming'>('today');

  const load = useCallback(async () => {
    try {
      setLoading(true); setError(null);
      const [list, c, board] = await Promise.all([
        listLeads(filters), getLeadStatusCounts(), getFollowUpBoard(),
      ]);
      setLeads(list.leads); setTotal(list.total); setCounts(c); setFuBoard(board);
      setFollowUps(await getOpenFollowUps(list.leads.map(l => l.id)));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load leads.');
    } finally { setLoading(false); }
  }, [filters]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    getLeadCourseOptions().then(setCourses).catch(() => setCourses([]));
    getStaffOptions().then(setStaff).catch(() => setStaff([]));
  }, []);

  const set = (patch: Partial<typeof filters>) => setFilters(f => ({ ...f, page: 1, ...patch }));
  const totalPages = Math.max(1, Math.ceil(total / filters.pageSize));
  const fuDueCount = fuBoard ? fuBoard.overdue.length + fuBoard.today.length : 0;

  return (
    <div className="space-y-6">
      <PageHeader title="Marketing Leads" subtitle="Prospects from the marketing site — follow up, counsel, convert" />

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <StatCard title="New" value={counts.NEW ?? 0} icon={UserPlus} />
        <StatCard title="Contacted" value={counts.CONTACTED ?? 0} icon={PhoneCall} iconColor="text-teal-600" iconBg="bg-teal-50 dark:bg-teal-900/30" />
        <StatCard title="Follow-up due" value={fuDueCount} icon={CalendarClock} iconColor="text-amber-600" iconBg="bg-amber-50 dark:bg-amber-900/30" />
        <StatCard title="Counselling" value={counts.COUNSELLING ?? 0} icon={MessagesSquare} iconColor="text-amber-600" iconBg="bg-amber-50 dark:bg-amber-900/30" />
        <StatCard title="Joined" value={counts.JOINED ?? 0} icon={UserCheck} iconColor="text-emerald-600" iconBg="bg-emerald-50 dark:bg-emerald-900/30" />
        <StatCard title="Total leads" value={Object.values(counts).reduce((a, b) => a + b, 0)} icon={Users} />
      </div>

      {fuBoard && (fuBoard.overdue.length + fuBoard.today.length + fuBoard.upcoming.length > 0) && (
        <section className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
          <div className="flex gap-2 mb-3">
            {(['overdue', 'today', 'upcoming'] as const).map(t => (
              <button key={t} onClick={() => setFuTab(t)}
                className={'px-3 py-1.5 text-sm rounded-lg capitalize ' + (fuTab === t
                  ? 'bg-primary-600 text-white'
                  : 'border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700')}>
                {t} ({fuBoard[t].length})
              </button>
            ))}
          </div>
          {fuBoard[fuTab].length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">Nothing {fuTab}.</p>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-700">
              {fuBoard[fuTab].map(({ lead, followUp }) => (
                <li key={followUp.activityId} className="py-2 flex flex-wrap items-center gap-2">
                  <button onClick={() => navigate('/admin/marketing-leads/' + lead.id)}
                    className="font-medium text-slate-900 dark:text-white hover:text-primary-600">{lead.full_name}</button>
                  <span className="text-sm text-slate-500">{lead.phone_display}</span>
                  <span className="text-sm text-slate-500 dark:text-slate-400">due {new Date(followUp.dueAt).toLocaleString()}</span>
                  {followUp.note && <span className="text-sm text-slate-400 flex-1 min-w-40 truncate">{followUp.note}</span>}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <section className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
        <div className="flex flex-wrap gap-2 mb-4">
          <input value={filters.search} onChange={e => set({ search: e.target.value })}
            placeholder="Search name, phone, email..."
            className="flex-1 min-w-52 px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900" />
          <select value={filters.status} onChange={e => set({ status: e.target.value })}
            className="px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900">
            <option value="all">All statuses</option>
            {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={filters.leadType} onChange={e => set({ leadType: e.target.value })}
            className="px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900">
            <option value="all">All types</option>
            {TYPE_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <select value={filters.course} onChange={e => set({ course: e.target.value })}
            className="px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900">
            <option value="all">All courses</option>
            {courses.map(c => <option key={c.slug} value={c.slug}>{c.title || c.slug}</option>)}
          </select>
          <select value={filters.assigned} onChange={e => set({ assigned: e.target.value })}
            className="px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900">
            <option value="all">All staff</option>
            <option value="unassigned">Unassigned</option>
            {staff.map(s => <option key={s.id} value={s.id}>{s.full_name || s.email}</option>)}
          </select>
          <input type="date" value={filters.createdFrom} onChange={e => set({ createdFrom: e.target.value })}
            className="px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900" />
          <input type="date" value={filters.createdTo} onChange={e => set({ createdTo: e.target.value })}
            className="px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900" />
          <button onClick={() => setFilters({ ...EMPTY_FILTERS })}
            className="px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700">Clear</button>
        </div>

        {loading ? <LoadingSpinner /> : error ? (
          <EmptyState title="Could not load leads" description={error} />
        ) : leads.length === 0 ? (
          <EmptyState title="No leads found" description="Adjust the filters or wait for new submissions from the marketing site." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700 text-left text-slate-500 dark:text-slate-400">
                  <th className="py-2 pr-4 font-medium">Name</th>
                  <th className="py-2 pr-4 font-medium">Phone</th>
                  <th className="py-2 pr-4 font-medium">Email</th>
                  <th className="py-2 pr-4 font-medium">Type</th>
                  <th className="py-2 pr-4 font-medium">Course / Interest</th>
                  <th className="py-2 pr-4 font-medium">Source / Campaign</th>
                  <th className="py-2 pr-4 font-medium">Status</th>
                  <th className="py-2 pr-4 font-medium">Assigned</th>
                  <th className="py-2 pr-4 font-medium">Next follow-up</th>
                  <th className="py-2 font-medium">Created</th>
                </tr>
              </thead>
              <tbody>
                {leads.map(lead => {
                  const fu = followUps.get(lead.id);
                  const fuOverdue = fu && new Date(fu.dueAt) < new Date();
                  return (
                    <tr key={lead.id} onClick={() => navigate('/admin/marketing-leads/' + lead.id)}
                      className="border-b border-slate-100 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/50 cursor-pointer">
                      <td className="py-2 pr-4 font-medium text-slate-900 dark:text-white">{lead.full_name}</td>
                      <td className="py-2 pr-4">{lead.phone_display}</td>
                      <td className="py-2 pr-4">{lead.email ?? '—'}</td>
                      <td className="py-2 pr-4">{lead.lead_type}</td>
                      <td className="py-2 pr-4">{lead.course_title ?? lead.course_slug ?? lead.internship_area ?? '—'}</td>
                      <td className="py-2 pr-4">
                        {[lead.last_touch?.utm_source, lead.last_touch?.utm_campaign].filter(Boolean).join(' / ') || '—'}
                      </td>
                      <td className="py-2 pr-4"><Badge variant={STATUS_BADGE_VARIANT[lead.status]}>{lead.status}</Badge></td>
                      <td className="py-2 pr-4">{lead.assigned?.full_name ?? lead.assigned?.email ?? 'Unassigned'}</td>
                      <td className="py-2 pr-4">
                        {fu ? (
                          <span className={fuOverdue ? 'text-red-600 dark:text-red-400' : ''}>
                            {new Date(fu.dueAt).toLocaleDateString()}
                          </span>
                        ) : '—'}
                      </td>
                      <td className="py-2 text-slate-500">{new Date(lead.created_at).toLocaleDateString()}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {total > filters.pageSize && (
          <div className="flex items-center justify-between mt-4 text-sm">
            <span className="text-slate-500">
              {total} lead{total === 1 ? '' : 's'} — page {filters.page} of {totalPages}
            </span>
            <div className="flex gap-2">
              <button disabled={filters.page <= 1} onClick={() => setFilters(f => ({ ...f, page: f.page - 1 }))}
                className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-700">Previous</button>
              <button disabled={filters.page >= totalPages} onClick={() => setFilters(f => ({ ...f, page: f.page + 1 }))}
                className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-700">Next</button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
