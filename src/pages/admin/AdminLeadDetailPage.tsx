import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { PageHeader } from '../../components/common/PageHeader';
import { Badge } from '../../components/ui/Badge';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { EmptyState } from '../../components/ui/EmptyState';
import { Field } from '../../components/ui/Field';
import { Modal } from '../../components/ui/Modal';
import { supabase } from '../../lib/supabase';
import { COMPANY } from '../../lib/company';
import {
  getLead, getLeadActivities, getLeadStatusHistory, getStaffOptions,
  updateLeadStatus, addLeadNote, scheduleFollowUp, completeFollowUp,
  rescheduleFollowUp, assignLead, computeOpenFollowUps,
  STATUS_BADGE_VARIANT, LEAD_STATUSES,
} from '../../services/marketingLeads';
import type {
  MarketingLead, LeadActivity, LeadStatusHistoryRow, LeadStatus,
} from '../../services/marketingLeads';

type StaffOption = { id: string; full_name: string | null; email: string };

export default function AdminLeadDetailPage() {
  const { leadId: id } = useParams<{ leadId: string }>();
  const navigate = useNavigate();
  const [lead, setLead] = useState<MarketingLead | null>(null);
  const [activities, setActivities] = useState<LeadActivity[]>([]);
  const [history, setHistory] = useState<LeadStatusHistoryRow[]>([]);
  const [staff, setStaff] = useState<StaffOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [statusModal, setStatusModal] = useState(false);
  const [nextStatus, setNextStatus] = useState<LeadStatus | ''>('');
  const [statusNote, setStatusNote] = useState('');
  const [fuModal, setFuModal] = useState(false);
  const [fuDate, setFuDate] = useState('');
  const [fuTime, setFuTime] = useState('');
  const [fuNote, setFuNote] = useState('');
  const [assignModal, setAssignModal] = useState(false);
  const [assignTo, setAssignTo] = useState('');

  const load = useCallback(async () => {
    if (!id) return;
    try {
      setLoading(true); setError(null);
      const [l, acts, hist, st] = await Promise.all([
        getLead(id), getLeadActivities(id), getLeadStatusHistory(id), getStaffOptions(),
      ]);
      if (!l) { setError('Lead not found.'); return; }
      setLead(l); setActivities(acts); setHistory(hist); setStaff(st);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load lead.');
    } finally { setLoading(false); }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const actorId = async (): Promise<string | null> => {
    const { data } = await supabase.auth.getUser();
    return data.user?.id ?? null;
  };

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try { await fn(); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Action failed.'); }
    finally { setBusy(false); }
  };

  if (loading) return <LoadingSpinner />;
  if (error && !lead) {
    return (
      <EmptyState title="Lead unavailable" description={error}
        action={<button onClick={() => navigate('/admin/marketing-leads')} className="btn-secondary">Back to leads</button>} />
    );
  }
  if (!lead) return null;

  const openFu = [...computeOpenFollowUps(activities).values()].sort((a, b) => a.dueAt.localeCompare(b.dueAt))[0] ?? null;
  const waText = encodeURIComponent(
    'Hello ' + lead.full_name + ', this is ' + COMPANY.brandName + ' regarding your enquiry' +
    (lead.course_title ? ' about ' + lead.course_title : '') + '.',
  );
  const waNumber = '91' + lead.phone_e164.replace(/^91/, '');

  const saveStatus = () => run(async () => {
    const actor = await actorId();
    if (!lead || !nextStatus || !actor) throw new Error('Sign-in required to update status.');
    await updateLeadStatus(lead.id, lead.status, nextStatus, actor, statusNote.trim() || undefined);
    setStatusModal(false); setNextStatus(''); setStatusNote('');
  });

  const saveNote = () => run(async () => {
    const actor = await actorId();
    if (!lead || !note.trim() || !actor) throw new Error('Sign-in required to add a note.');
    await addLeadNote(lead.id, actor, note.trim());
    setNote('');
  });

  const saveFollowUp = (rescheduleActivityId?: string) => run(async () => {
    const actor = await actorId();
    if (!lead || !fuDate || !actor) throw new Error('Pick a follow-up date first.');
    const dueAt = new Date(fuDate + 'T' + (fuTime || '10:00')).toISOString();
    if (rescheduleActivityId) {
      await rescheduleFollowUp(lead.id, actor, rescheduleActivityId, dueAt, fuNote.trim() || undefined);
    } else {
      await scheduleFollowUp(lead.id, actor, dueAt, fuNote.trim() || undefined);
    }
    setFuModal(false); setFuDate(''); setFuTime(''); setFuNote('');
  });

  const saveAssign = () => run(async () => {
    const actor = await actorId();
    if (!lead || !actor) throw new Error('Sign-in required to assign.');
    await assignLead(lead.id, assignTo || null, actor);
    setAssignModal(false); setAssignTo('');
  });

  const assignedName = lead.assigned?.full_name || lead.assigned?.email || null;

  return (
    <div className="space-y-6">
      <PageHeader title={lead.full_name} subtitle={'Lead ' + lead.id.slice(0, 8) + ' / ' + lead.lead_type}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={STATUS_BADGE_VARIANT[lead.status]}>{lead.status}</Badge>
            <a href={'https://wa.me/' + waNumber + '?text=' + waText} target="_blank" rel="noreferrer"
              className="px-3 py-1.5 text-sm rounded-lg bg-emerald-600 text-white hover:bg-emerald-700">WhatsApp</a>
            <a href={'tel:+91' + lead.phone_e164}
              className="px-3 py-1.5 text-sm rounded-lg bg-primary-600 text-white hover:bg-primary-700">Call</a>
            <button onClick={() => { setNextStatus(lead.status); setStatusModal(true); }} disabled={busy}
              className="px-3 py-1.5 text-sm rounded-lg border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800">Change status</button>
            <button onClick={() => setFuModal(true)} disabled={busy}
              className="px-3 py-1.5 text-sm rounded-lg border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800">Set follow-up</button>
            <button onClick={() => { setAssignTo(lead.assigned_counsellor ?? ''); setAssignModal(true); }} disabled={busy}
              className="px-3 py-1.5 text-sm rounded-lg border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800">Assign</button>
          </div>
        } />
      {error && <div className="rounded-lg bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400 text-sm px-4 py-2">{error}</div>}

      {openFu && (
        <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-4 py-3 flex flex-wrap items-center gap-3">
          <span className="text-sm font-medium text-amber-800 dark:text-amber-300">
            Follow-up due {new Date(openFu.dueAt).toLocaleString()}
          </span>
          {openFu.note && <span className="text-sm text-amber-700 dark:text-amber-400 flex-1 min-w-40">{openFu.note}</span>}
          <button disabled={busy} onClick={() => run(async () => {
            const actor = await actorId();
            if (!actor) throw new Error('Sign-in required.');
            await completeFollowUp(lead.id, actor, openFu.activityId);
          })} className="px-3 py-1.5 text-sm rounded-lg bg-amber-600 text-white hover:bg-amber-700">Mark completed</button>
          <button disabled={busy} onClick={() => setFuModal(true)}
            className="px-3 py-1.5 text-sm rounded-lg border border-amber-400 text-amber-800 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/40">Reschedule</button>
        </div>
      )}

      <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-4">
        <section className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
          <h3 className="font-semibold text-slate-900 dark:text-white mb-3">Person</h3>
          <dl className="space-y-3">
            <Field label="Phone" value={lead.phone_display} />
            <Field label="Email" value={lead.email} />
            <Field label="College" value={lead.college} />
            <Field label="Qualification" value={lead.qualification} />
            <Field label="Degree" value={lead.degree} />
            <Field label="Branch" value={lead.branch} />
            <Field label="Graduation year" value={lead.graduation_year} />
            <Field label="Skills" value={lead.skills} />
            <Field label="Experience" value={lead.experience} />
          </dl>
        </section>
        <section className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
          <h3 className="font-semibold text-slate-900 dark:text-white mb-3">Interest</h3>
          <dl className="space-y-3">
            <Field label="Lead type" value={lead.lead_type} />
            <Field label="Course" value={lead.course_slug} />
            <Field label="Course title" value={lead.course_title} />
            <Field label="Internship area" value={lead.internship_area} />
            <Field label="Message" value={lead.message} />
          </dl>
        </section>
        <section className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
          <h3 className="font-semibold text-slate-900 dark:text-white mb-3">Attribution</h3>
          <dl className="space-y-3">
            <Field label="Landing page" value={lead.first_touch?.landing_page ?? lead.page_url} />
            <Field label="First source / medium" value={[lead.first_touch?.utm_source, lead.first_touch?.utm_medium].filter(Boolean).join(' / ') || null} />
            <Field label="First campaign" value={lead.first_touch?.utm_campaign} />
            <Field label="Last source / medium" value={[lead.last_touch?.utm_source, lead.last_touch?.utm_medium].filter(Boolean).join(' / ') || null} />
            <Field label="Last campaign" value={lead.last_touch?.utm_campaign} />
            <Field label="fbclid" value={lead.first_touch?.fbclid ?? lead.last_touch?.fbclid} />
            <Field label="gclid" value={lead.first_touch?.gclid ?? lead.last_touch?.gclid} />
          </dl>
        </section>
        <section className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
          <h3 className="font-semibold text-slate-900 dark:text-white mb-3">System</h3>
          <dl className="space-y-3">
            <Field label="Status" value={lead.status} />
            <Field label="Created" value={new Date(lead.created_at).toLocaleString()} />
            <Field label="Received" value={new Date(lead.received_at).toLocaleString()} />
            <Field label="Assigned staff" value={assignedName} />
            <Field label="Converted profile" value={lead.converted_profile_id} />
            <Field label="Spam flag" value={lead.spam_flag ? 'Yes' : 'No'} />
          </dl>
          <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
            A lead is a prospect only. JOINED is a CRM status — student accounts are created solely by the explicit admission flow.
          </p>
        </section>
      </div>

      <section className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
        <h3 className="font-semibold text-slate-900 dark:text-white mb-3">Internal note</h3>
        <div className="flex flex-col sm:flex-row gap-2">
          <textarea rows={2} value={note} onChange={e => setNote(e.target.value)}
            placeholder="e.g. Called student, interested in Python Full Stack, requested demo tomorrow."
            className="flex-1 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm" />
          <button onClick={saveNote} disabled={busy || !note.trim()}
            className="self-start px-4 py-2 text-sm rounded-lg bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50">Add note</button>
        </div>
      </section>

      <div className="grid lg:grid-cols-2 gap-4">
        <section className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
          <h3 className="font-semibold text-slate-900 dark:text-white mb-3">Activity history</h3>
          {activities.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">No activities yet.</p>
          ) : (
            <ol className="space-y-3">
              {activities.map(a => (
                <li key={a.id} className="border-l-2 border-slate-200 dark:border-slate-600 pl-3">
                  <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                    <Badge variant="default">{a.activity_type}</Badge>
                    <span>{new Date(a.created_at).toLocaleString()}</span>
                    {a.performed?.full_name && <span>/ {a.performed.full_name}</span>}
                  </div>
                  {a.detail && typeof a.detail.text === 'string' && (
                    <p className="mt-1 text-sm text-slate-800 dark:text-slate-200">{a.detail.text}</p>
                  )}
                  {a.detail && typeof a.detail.due_at === 'string' && (
                    <p className="mt-1 text-sm text-slate-800 dark:text-slate-200">
                      Follow-up due {new Date(a.detail.due_at).toLocaleString()}
                      {typeof a.detail.note === 'string' ? ' — ' + a.detail.note : ''}
                    </p>
                  )}
                </li>
              ))}
            </ol>
          )}
        </section>
        <section className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
          <h3 className="font-semibold text-slate-900 dark:text-white mb-3">Status history</h3>
          {history.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">No status changes recorded.</p>
          ) : (
            <ol className="space-y-3">
              {history.map(h => (
                <li key={h.id} className="border-l-2 border-primary-200 dark:border-primary-800 pl-3">
                  <div className="text-sm text-slate-800 dark:text-slate-200">
                    {h.from_status ? h.from_status + ' → ' : ''}<strong>{h.to_status}</strong>
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    {new Date(h.created_at).toLocaleString()}{h.changer?.full_name ? ' / ' + h.changer.full_name : ''}
                    {h.note ? ' — ' + h.note : ''}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>

      <Modal open={statusModal} onClose={() => setStatusModal(false)} title="Change status">
        <div className="space-y-3">
          <select value={nextStatus} onChange={e => setNextStatus(e.target.value as LeadStatus)}
            className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm">
            {LEAD_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <textarea rows={2} value={statusNote} onChange={e => setStatusNote(e.target.value)} placeholder="Optional note for this transition"
            className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm" />
          <div className="flex justify-end gap-2">
            <button onClick={() => setStatusModal(false)} className="px-4 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-600">Cancel</button>
            <button onClick={saveStatus} disabled={busy || !nextStatus}
              className="px-4 py-2 text-sm rounded-lg bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50">Save status</button>
          </div>
        </div>
      </Modal>

      <Modal open={fuModal} onClose={() => setFuModal(false)} title={openFu ? 'Reschedule follow-up' : 'Set follow-up'}>
        <div className="space-y-3">
          <input type="date" value={fuDate} onChange={e => setFuDate(e.target.value)}
            className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm" />
          <input type="time" value={fuTime} onChange={e => setFuTime(e.target.value)}
            className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm" />
          <textarea rows={2} value={fuNote} onChange={e => setFuNote(e.target.value)} placeholder="Follow-up note"
            className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm" />
          <div className="flex justify-end gap-2">
            <button onClick={() => setFuModal(false)} className="px-4 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-600">Cancel</button>
            <button onClick={() => saveFollowUp(openFu?.activityId)} disabled={busy || !fuDate}
              className="px-4 py-2 text-sm rounded-lg bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50">
              {openFu ? 'Reschedule' : 'Schedule'}
            </button>
          </div>
        </div>
      </Modal>

      <Modal open={assignModal} onClose={() => setAssignModal(false)} title="Assign lead">
        <div className="space-y-3">
          <select value={assignTo} onChange={e => setAssignTo(e.target.value)}
            className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm">
            <option value="">Unassigned</option>
            {staff.map(s => <option key={s.id} value={s.id}>{s.full_name || s.email}</option>)}
          </select>
          <div className="flex justify-end gap-2">
            <button onClick={() => setAssignModal(false)} className="px-4 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-600">Cancel</button>
            <button onClick={saveAssign} disabled={busy}
              className="px-4 py-2 text-sm rounded-lg bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50">Save assignment</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
