import { useCallback, useEffect, useState } from 'react';
import { UserPlus, Search, CheckCircle, XCircle, Clock, Inbox } from 'lucide-react';
import { PageHeader } from '../../components/common/PageHeader';
import { Modal } from '../../components/ui/Modal';
import { Badge } from '../../components/ui/Badge';
import { EmptyState } from '../../components/ui/EmptyState';
import { useToast } from '../../components/ui/Toast';
import { supabase } from '../../lib/supabase';

type RequestRow = {
  id: string;
  student_id: string;
  course_id: string;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  message: string | null;
  requested_at: string;
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

export default function AdminEnrollmentRequestsPage() {
  const { success, error: toastError } = useToast();
  const [rows, setRows] = useState<RequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('pending');
  const [approveTarget, setApproveTarget] = useState<RequestRow | null>(null);
  const [rejectTarget, setRejectTarget] = useState<RequestRow | null>(null);
  const [rejectNote, setRejectNote] = useState('');
  const [acting, setActing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('enrollment_requests')
      .select('*, student:profiles!enrollment_requests_student_id_fkey(full_name,email), course:courses(title)')
      .order('requested_at', { ascending: false });
    if (error) { toastError('Load failed', error.message); setLoading(false); return; }
    setRows((data ?? []) as RequestRow[]);
    setLoading(false);
  }, [toastError]);

  useEffect(() => { void load(); }, [load]);

  const approve = async (target: RequestRow) => {
    setActing(true);
    const { error } = await supabase.rpc('approve_enrollment_request', { p_request_id: target.id });
    setActing(false);
    if (error) {
      toastError('Approval failed', error.message);
      return;
    }
    success('Request approved', `${target.student?.full_name ?? 'Student'} now has course access.`);
    setApproveTarget(null);
    await load();
  };

  const reject = async (target: RequestRow) => {
    setActing(true);
    const { error } = await supabase.rpc('reject_enrollment_request', {
      p_request_id: target.id,
      p_review_note: rejectNote.trim() || null,
    });
    setActing(false);
    if (error) {
      toastError('Reject failed', error.message);
      return;
    }
    success('Request rejected', `${target.student?.full_name ?? 'Student'} was not granted access.`);
    setRejectTarget(null);
    setRejectNote('');
    await load();
  };

  const filtered = rows.filter(r => {
    const matchFilter = filter === 'all' || r.status === filter;
    const q = search.toLowerCase();
    const matchSearch = !q
      || (r.student?.full_name ?? '').toLowerCase().includes(q)
      || (r.student?.email ?? '').toLowerCase().includes(q)
      || (r.course?.title ?? '').toLowerCase().includes(q);
    return matchFilter && matchSearch;
  });

  const counts = (status: Filter) => status === 'all' ? rows.length : rows.filter(r => r.status === status).length;

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto animate-fade-in">
      <PageHeader
        title="Enrollment Requests"
        subtitle="Review and approve student course access requests"
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
          <input className="input pl-11" placeholder="Search student, email or course..." value={search} onChange={e => setSearch(e.target.value)} />
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
        <EmptyState icon={Inbox} title="No requests here" description="Student course requests will appear here for review." />
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
                    {r.message && <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 italic">“{r.message}”</p>}
                    {r.status === 'rejected' && r.review_note && (
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Review note: {r.review_note}</p>
                    )}
                  </div>
                  <Badge className={`text-xs ${badge.cls}`}>{badge.label}</Badge>
                  {r.status === 'pending' && (
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        onClick={() => setApproveTarget(r)}
                        className="inline-flex items-center gap-1.5 py-2 px-3 rounded-xl bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 transition-colors"
                      >
                        <CheckCircle size={13} /> Approve
                      </button>
                      <button
                        onClick={() => { setRejectTarget(r); setRejectNote(''); }}
                        className="inline-flex items-center gap-1.5 py-2 px-3 rounded-xl border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 text-xs font-semibold hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                      >
                        <XCircle size={13} /> Reject
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Approve confirmation */}
      <Modal open={!!approveTarget} onClose={() => { if (!acting) setApproveTarget(null); }} title="Approve request?" size="sm">
        <div className="space-y-3">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Approve <strong>{approveTarget?.student?.full_name ?? 'this student'}</strong> for{' '}
            <strong>{approveTarget?.course?.title ?? 'this course'}</strong>? They will immediately receive course access.
          </p>
          <div className="flex gap-3 justify-end">
            <button onClick={() => setApproveTarget(null)} className="btn-secondary" disabled={acting}>Cancel</button>
            <button onClick={() => approveTarget && approve(approveTarget)} disabled={acting} className="btn-primary flex items-center gap-2 disabled:opacity-60">
              {acting ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : null}
              Confirm Approval
            </button>
          </div>
        </div>
      </Modal>

      {/* Reject confirmation */}
      <Modal open={!!rejectTarget} onClose={() => { if (!acting) setRejectTarget(null); }} title="Reject request?" size="sm">
        <div className="space-y-3">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Reject <strong>{rejectTarget?.student?.full_name ?? 'this student'}</strong> for{' '}
            <strong>{rejectTarget?.course?.title ?? 'this course'}</strong>? The student will not receive access.
          </p>
          <div>
            <label className="label">Note for the student (optional)</label>
            <textarea
              className="input min-h-[70px] resize-none"
              placeholder="e.g. Admissions for this batch are full. Please contact us about the next batch."
              value={rejectNote}
              onChange={e => setRejectNote(e.target.value)}
            />
          </div>
          <div className="flex gap-3 justify-end">
            <button onClick={() => setRejectTarget(null)} className="btn-secondary" disabled={acting}>Cancel</button>
            <button onClick={() => rejectTarget && reject(rejectTarget)} disabled={acting} className="btn-primary bg-red-600 hover:bg-red-700 flex items-center gap-2 disabled:opacity-60">
              {acting ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : null}
              Confirm Rejection
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
