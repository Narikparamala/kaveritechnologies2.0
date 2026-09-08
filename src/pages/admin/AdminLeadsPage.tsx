import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CalendarClock,
  MessagesSquare,
  Phone,
  UserCheck,
  UserPlus,
  Users,
} from 'lucide-react';
import { PageHeader } from '../../components/common/PageHeader';
import { Badge } from '../../components/ui/Badge';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { EmptyState } from '../../components/ui/EmptyState';
import { StatCard } from '../../components/ui/StatCard';
import {
  EMPTY_FILTERS,
  LEAD_STATUSES,
  LEAD_TYPES,
  STATUS_BADGE_VARIANT,
  getLeadStatusCounts,
  listLeads,
} from '../../services/marketingLeads';
import type { MarketingLead } from '../../services/marketingLeads';

const PAGE_SIZE = 25;

export default function AdminLeadsPage() {
  const navigate = useNavigate();
  const [leads, setLeads] = useState<MarketingLead[]>([]);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [page, setPage] = useState(1);

  const fetchLeads = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [listResult, counts] = await Promise.all([
        listLeads({
          ...EMPTY_FILTERS,
          search,
          status: statusFilter,
          leadType: typeFilter,
          page,
          pageSize: PAGE_SIZE,
        }),
        getLeadStatusCounts(),
      ]);
      setLeads(listResult.leads);
      setTotal(listResult.total);
      setSummary(counts);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to fetch leads');
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter, typeFilter, page]);

  useEffect(() => {
    void fetchLeads();
  }, [fetchLeads]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Marketing Leads"
        subtitle="Prospective students captured from the website"
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <StatCard title="New" value={summary.NEW ?? 0} icon={UserPlus} />
        <StatCard title="Contacted" value={summary.CONTACTED ?? 0} icon={Phone} />
        <StatCard title="Counselling" value={summary.COUNSELLING ?? 0} icon={MessagesSquare} />
        <StatCard title="Follow-up" value={summary.FOLLOW_UP ?? 0} icon={CalendarClock} />
        <StatCard title="Joined" value={summary.JOINED ?? 0} icon={UserCheck} />
        <StatCard title="Total" value={summary.total ?? 0} icon={Users} />
      </div>

      <div className="card p-4">
        <div className="flex flex-wrap gap-3 mb-4">
          <input
            className="input flex-1 min-w-[200px]"
            placeholder="Search name, phone, email..."
            value={search}
            onChange={e => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
          <select
            className="input w-auto"
            value={statusFilter}
            onChange={e => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
          >
            <option value="all">All statuses</option>
            {LEAD_STATUSES.map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <select
            className="input w-auto"
            value={typeFilter}
            onChange={e => {
              setTypeFilter(e.target.value);
              setPage(1);
            }}
          >
            <option value="all">All types</option>
            {LEAD_TYPES.map(t => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>

        {loading ? (
          <LoadingSpinner />
        ) : error ? (
          <p className="text-sm text-red-600">{error}</p>
        ) : leads.length === 0 ? (
          <EmptyState title="No leads found" description="Try adjusting your search or filters." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700 text-left text-slate-500">
                  <th className="py-2 pr-4">Name</th>
                  <th className="py-2 pr-4">Phone</th>
                  <th className="py-2 pr-4">Email</th>
                  <th className="py-2 pr-4">Type</th>
                  <th className="py-2 pr-4">Course</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2 pr-4">Created</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {leads.map(lead => (
                  <tr
                    key={lead.id}
                    className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer"
                    onClick={() => navigate(`/admin/marketing-leads/${lead.id}`)}
                  >
                    <td className="py-2 pr-4 font-medium">{lead.full_name}</td>
                    <td className="py-2 pr-4">{lead.phone_display}</td>
                    <td className="py-2 pr-4">{lead.email ?? '—'}</td>
                    <td className="py-2 pr-4">{lead.lead_type}</td>
                    <td className="py-2 pr-4">{lead.course_title ?? lead.course_slug ?? '—'}</td>
                    <td className="py-2 pr-4">
                      <Badge variant={STATUS_BADGE_VARIANT[lead.status]}>{lead.status}</Badge>
                    </td>
                    <td className="py-2 pr-4 text-slate-500">
                      {new Date(lead.created_at).toLocaleDateString()}
                    </td>
                    <td className="py-2">
                      <button
                        className="text-blue-600 hover:underline"
                        onClick={e => {
                          e.stopPropagation();
                          navigate(`/admin/marketing-leads/${lead.id}`);
                        }}
                      >
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex items-center justify-between mt-4 text-sm text-slate-500">
          <span>{total} lead{total === 1 ? '' : 's'}</span>
          <div className="flex items-center gap-3">
            <button
              className="btn-secondary text-xs"
              disabled={page <= 1}
              onClick={() => setPage(p => Math.max(1, p - 1))}
            >
              Previous
            </button>
            <span>Page {page} of {totalPages}</span>
            <button
              className="btn-secondary text-xs"
              disabled={page >= totalPages}
              onClick={() => setPage(p => p + 1)}
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
