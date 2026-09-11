import { useCallback, useEffect, useState } from 'react';
import { UserPlus, Search, Clock, Inbox, Eye } from 'lucide-react';
import { PageHeader } from '../../components/common/PageHeader';
import { Badge } from '../../components/ui/Badge';
import { EmptyState } from '../../components/ui/EmptyState';
import { useToast } from '../../components/ui/Toast';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

type RequestRow = {
  id: string;
  student_id: string;
  course_id: string;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  message: string | null;
  requested_at: string;
  reviewed_at: string | null;
  review_note: string | null;
  student: { full_name: string | null; email: string | null } | null;
  course: { title: string | null } | null;
};

type Filter = 'pending' | 'approved' | 'rejected' | 'all';

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  pending: { label: 'Pending', cls: 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400' },
  approved: { label: 'Approved', cls: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400' },
  rejected: { label: 'Rejected', cls: 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400' },
  cancelled: { label: 'Cancelled', cls: 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400' },
};

export default function FacultyEnrollmentRequestsPage() {
  const { profile } = useAuth();
  const { error: toastError } = useToast();
  const [rows, setRows] = useState<RequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('pending');
  const [detailTarget, setDetailTarget] = useState<RequestRow | null>(null);

  const load = useCallback(async () => {
    if (!profile) return;
    setLoading(true);

    // Faculty see requests for courses they teach
    const { data: facultyCourses } = await supabase
      .from('course_faculty')
      .select('course_id')
      .eq('faculty_id', profile.id);

    const courseIds = (facultyCourses ?? []).map(c => c.course_id);

    let query = supabase
      .from('enrollment_requests')
      .select('*, student:profiles!enrollment_requests_student_id_fkey(full_name,email), course:courses(title)')
      .order('requested_at', { ascending: false });

    // If faculty teaches specific courses, filter to those; otherwise show all
    if (courseIds.length > 0) {
      query = query.in('course_id', courseIds);
    }

    const { data, error } = await query;
    if (error) { toastError('Load failed', error.message); setLoading(false); return; }
    setRows((data ?? []) as RequestRow[]);
    setLoading(false);
  }, [profile, toastError]);

  useEffect(() => { void load(); }, [load]);

  const filtered = rows.filter(r => {
    const matchFilter = filter === 'all' || r.status === filter;
    const q = search.toLowerCase();
    const matchSearch = !q
      || (r.student?.full_name ?? '').toLowerCase().includes(q)
      || (r.student?.email ?? '').toLowerCase().includes(q)
      || (r.course?.title ?? '').toLowerCase().includes(q)
      || (r.message ?? '').toLowerCase().includes(q);
    return matchFilter && matchSearch;
  });

  const counts = (status: Filter) => status === 'all' ? rows.length : rows.filter(r => r.status === status).length;

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto animate-fade-in">
      <PageHeader
        title="Enrollment Requests"
        subtitle="View student course access requests (admin approval required)"
        icon={UserPlus}
        action={
          <Badge variant="warning" className="text-xs">
            <Clock size={11} className="mr-1" /> {counts('pending')} pending
          </Badge>
        }
      />

      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
          <input className="input pl-11" placeholder="Search student, email, course or payment ref..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {(['pending', 'approved', 'rejected', 'all'] as Filter[]).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors capitalize ${filter === f ? 'bg-primary-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'}`}
            >
              {f === 'all' ? `All (${counts('all')})` : `${f} (${counts(f)})`}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">{[1, 2, 3].map(i => <div key={i} className="h-24 bg-slate-100 dark:bg-slate-800 rounded-2xl animate-pulse" />)}</div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={Inbox} title="No requests here" description="Student enrollment requests for your courses will appear here." />
      ) : (
        <div className="card divide-y divide-slate-100 dark:divide-slate-700">
          {filtered.map(r => {
            const badge = STATUS_BADGE[r.status] ?? { label: r.status, cls: 'bg-slate-100 text-slate-500' };
            return (
              <div key={r.id} className="px-5 py-4">
                <div className="flex flex-wrap items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-primary-50 dark:bg-primary-900/30 flex items-center justify-center flex-shrink-0">
                    <UserPlus size={18} className="text-primary-600 dark:text-primary-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-slate-900 dark:text-white text-sm truncate">
                      {r.student?.full_name ?? 'Unknown student'}
                      <span className="font-normal text-slate-400"> · {r.student?.email ?? ''}</span>
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      Requested access to <strong className="text-slate-700 dark:text-slate-300">{r.course?.title ?? 'a course'}</strong> · {new Date(r.requested_at).toLocaleString()}
                    </p>
                    {r.message && (
                      <p className="text-xs text-amber-600 dark:text-amber-400 mt-1 font-medium">
                        💳 Payment ref: {r.message}
                      </p>
                    )}
                    {r.review_note && (
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Note: {r.review_note}</p>
                    )}
                  </div>
                  <Badge className={`text-xs ${badge.cls}`}>{badge.label}</Badge>
                  <button
                    onClick={() => setDetailTarget(r)}
                    className="inline-flex items-center gap-1.5 py-2 px-3 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors flex-shrink-0"
                  >
                    <Eye size={13} /> View
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Detail modal */}
      <div className={`fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm transition-opacity ${detailTarget ? 'opacity-100' : 'opacity-0 pointer-events-none'}`} onClick={() => setDetailTarget(null)}>
        <div className="card max-w-md w-full mx-4 p-6 space-y-4" onClick={e => e.stopPropagation()}>
          <h3 className="font-bold text-slate-900 dark:text-white">Request Details</h3>
          {detailTarget && (
            <div className="space-y-3 text-sm">
              <div>
                <p className="text-slate-400 text-xs">Student</p>
                <p className="font-medium text-slate-800 dark:text-slate-200">{detailTarget.student?.full_name ?? 'Unknown'}</p>
                <p className="text-xs text-slate-500">{detailTarget.student?.email ?? ''}</p>
              </div>
              <div>
                <p className="text-slate-400 text-xs">Course</p>
                <p className="font-medium text-slate-800 dark:text-slate-200">{detailTarget.course?.title ?? 'Unknown'}</p>
              </div>
              <div>
                <p className="text-slate-400 text-xs">Requested</p>
                <p className="text-slate-700 dark:text-slate-300">{new Date(detailTarget.requested_at).toLocaleString()}</p>
              </div>
              {detailTarget.message && (
                <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                  <p className="text-xs text-amber-600 dark:text-amber-400 font-medium">💳 Payment Reference</p>
                  <p className="text-sm font-mono text-amber-800 dark:text-amber-300 mt-1">{detailTarget.message}</p>
                </div>
              )}
              <div>
                <p className="text-slate-400 text-xs">Status</p>
                <Badge className={`text-xs mt-1 ${STATUS_BADGE[detailTarget.status]?.cls ?? ''}`}>{STATUS_BADGE[detailTarget.status]?.label ?? detailTarget.status}</Badge>
              </div>
              {detailTarget.review_note && (
                <div>
                  <p className="text-slate-400 text-xs">Admin Note</p>
                  <p className="text-slate-700 dark:text-slate-300">{detailTarget.review_note}</p>
                </div>
              )}
              <p className="text-xs text-slate-400 italic">Only admins can approve or reject enrollment requests.</p>
            </div>
          )}
          <div className="flex justify-end">
            <button onClick={() => setDetailTarget(null)} className="btn-secondary text-sm">Close</button>
          </div>
        </div>
      </div>
    </div>
  );
}
