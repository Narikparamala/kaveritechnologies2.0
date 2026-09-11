import { useEffect, useState } from 'react';
import { CalendarCheck2, UserCheck, UserX } from 'lucide-react';
import { PageHeader } from '../../components/common/PageHeader';
import { Badge } from '../../components/ui/Badge';
import { EmptyState } from '../../components/ui/EmptyState';
import { useToast } from '../../components/ui/Toast';
import { supabase } from '../../lib/supabase';

type RegistrationRow = {
  id: string;
  email: string;
  full_name: string | null;
  status: string;
  registered_at: string | null;
  linked: boolean;
  workshop: { id: string; name: string; starts_at: string | null; venue: string | null } | null;
};

export default function AdminWorkshopsPage() {
  const { error: toastError } = useToast();
  const [rows, setRows] = useState<RegistrationRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data, error } = await supabase
        .from('workshop_registrations')
        .select('id,email,full_name,status,registered_at,user_id,workshop:workshops(id,name,starts_at,venue)')
        .order('created_at', { ascending: false })
        .limit(100);
      if (!active) return;
      if (error) {
        toastError('Load failed', error.message);
        setLoading(false);
        return;
      }
      setRows((data ?? []).map((r: any) => ({ ...r, linked: Boolean(r.user_id) })) as RegistrationRow[]);
      setLoading(false);
    })();
    return () => { active = false; };
  }, [toastError]);

  const total = rows.length;
  const linked = rows.filter(r => r.linked).length;
  const external = total - linked;

  if (loading) return <div className="p-6 lg:p-8"><p className="text-slate-500">Loading workshop registrations…</p></div>;

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto animate-fade-in">
      <PageHeader
        title="Workshop Registrations"
        subtitle="Platform registrations synced from the Kaveri workshop app (Apps Script remains the registration source)"
      />

      <div className="grid sm:grid-cols-3 gap-4 mb-6">
        <div className="card p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center">
              <CalendarCheck2 size={18} className="text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900 dark:text-white">{total}</p>
              <p className="text-xs text-slate-500">Total registrations</p>
            </div>
          </div>
        </div>
        <div className="card p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center">
              <UserCheck size={18} className="text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900 dark:text-white">{linked}</p>
              <p className="text-xs text-slate-500">Linked to LMS accounts</p>
            </div>
          </div>
        </div>
        <div className="card p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center">
              <UserX size={18} className="text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900 dark:text-white">{external}</p>
              <p className="text-xs text-slate-500">External attendees / leads</p>
            </div>
          </div>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="card p-8">
          <EmptyState
            title="No workshop registrations yet"
            description="Registrations appear here after the workshop app syncs its first successful registration to the platform."
          />
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-slate-400 border-b border-slate-100 dark:border-slate-800">
                  <th className="px-5 py-3 font-medium">Attendee</th>
                  <th className="px-5 py-3 font-medium">Workshop</th>
                  <th className="px-5 py-3 font-medium">Link</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium">Registered</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.id} className="border-b border-slate-50 dark:border-slate-800/60 last:border-0">
                    <td className="px-5 py-3">
                      <p className="font-medium text-slate-900 dark:text-white">{r.full_name ?? '—'}</p>
                      <p className="text-xs text-slate-500">{r.email}</p>
                    </td>
                    <td className="px-5 py-3">
                      <p className="text-slate-700 dark:text-slate-300">{r.workshop?.name ?? '—'}</p>
                      {r.workshop?.starts_at && (
                        <p className="text-xs text-slate-400">
                          {new Date(r.workshop.starts_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                          {r.workshop.venue ? ` · ${r.workshop.venue}` : ''}
                        </p>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      {r.linked ? (
                        <Badge variant="success">Linked</Badge>
                      ) : (
                        <Badge variant="warning">External</Badge>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      <span className="badge text-xs bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 capitalize">{r.status}</span>
                    </td>
                    <td className="px-5 py-3 text-slate-500 text-xs">
                      {r.registered_at ? new Date(r.registered_at).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <p className="text-xs text-slate-400 mt-3">
        External attendees are retained as leads only — they are never exposed to students. Workshop bridge V1; see docs/ecosystem-integration-design.md.
      </p>
    </div>
  );
}