import { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, MessageCircle, Phone } from 'lucide-react';
import { PageHeader } from '../../components/common/PageHeader';
import { Badge } from '../../components/ui/Badge';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { EmptyState } from '../../components/ui/EmptyState';
import { Field } from '../../components/ui/Field';
import { useAuth } from '../../contexts/AuthContext';
import {
  LEAD_STATUSES,
  STATUS_BADGE_VARIANT,
  addLeadNote,
  assignLead,
  completeFollowUp,
  getLead,
  getLeadActivities,
  getLeadStatusHistory,
  getOpenFollowUps,
  getStaffOptions,
  rescheduleFollowUp,
  scheduleFollowUp,
  updateLeadStatus,
} from '../../services/marketingLeads';
import type { FollowUpItem, LeadActivity, LeadStatus, LeadStatusHistoryRow, MarketingLead, TouchAttribution } from '../../services/marketingLeads';

function TouchDetails({ title, touch }: { title: string; touch: TouchAttribution | null }) {
  if (!touch) return <Field label={title} value={null} />;
  return (
    <div>
      <p className="text-xs font-semibold text-slate-600">{title}</p>
      <dl className="mt-1 space-y-1">
        <Field label="Source" value={touch.utm_source ?? null} />
        <Field label="Medium" value={touch.utm_medium ?? null} />
        <Field label="Campaign" value={touch.utm_campaign ?? null} />
        <Field label="Content" value={touch.utm_content ?? null} />
        <Field label="Term" value={touch.utm_term ?? null} />
        <Field label="fbclid" value={touch.fbclid ?? null} />
        <Field label="gclid" value={touch.gclid ?? null} />
        <Field label="Landing page" value={touch.landing_page ?? null} />
        <Field label="Referrer" value={touch.referrer ?? null} />
        <Field label="Captured" value={touch.captured_at ? new Date(touch.captured_at).toLocaleString() : null} />
      </dl>
    </div>
  );
}

export default function AdminLeadDetailPage() {
  const { leadId } = useParams<{ leadId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [lead, setLead] = useState<MarketingLead | null>(null);
  const [activities, setActivities] = useState<LeadActivity[]>([]);
  const [history, setHistory] = useState<LeadStatusHistoryRow[]>([]);
  const [staff, setStaff] = useState<{ id: string; full_name: string | null; email: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [followUp, setFollowUp] = useState<FollowUpItem | null>(null);
  const [fuDate, setFuDate] = useState('');
  const [fuTime, setFuTime] = useState('');
  const [fuNote, setFuNote] = useState('');
  const [savingFu, setSavingFu] = useState(false);

  const fetchLead = useCallback(async () => {
    if (!leadId) return;
    try {
      setLoading(true);
      setError(null);
      const [leadData, activityData, historyData, staffData, fuMap] = await Promise.all([
        getLead(leadId),
        getLeadActivities(leadId),
        getLeadStatusHistory(leadId),
        getStaffOptions(),
        getOpenFollowUps([leadId]),
      ]);
      setLead(leadData);
      setActivities(activityData);
      setHistory(historyData);
      setStaff(staffData);
      setFollowUp(fuMap.get(leadId) ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to fetch lead');
    } finally {
      setLoading(false);
    }
  }, [leadId]);

  useEffect(() => {
    void fetchLead();
  }, [fetchLead]);

  const handleStatusChange = async (newStatus: LeadStatus) => {
    if (!lead || !user) return;
    if (newStatus === lead.status) return;
    try {
      await updateLeadStatus(lead.id, lead.status, newStatus, user.id);
      await fetchLead();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update status');
    }
  };

  const handleAddNote = async () => {
    if (!lead || !user || !note.trim()) return;
    setSavingNote(true);
    try {
      await addLeadNote(lead.id, user.id, note.trim());
      setNote('');
      await fetchLead();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add note');
    } finally {
      setSavingNote(false);
    }
  };

  const handleAssign = async (counsellorId: string) => {
    if (!lead || !user) return;
    try {
      await assignLead(lead.id, counsellorId || null, user.id);
      await fetchLead();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to assign counsellor');
    }
  };

  const fuDueIso = (): string | null => {
    if (!fuDate) return null;
    const d = new Date(`${fuDate}T${fuTime || '09:00'}:00`);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  };

  const runFuAction = async (action: () => Promise<void>) => {
    if (!lead) return;
    setSavingFu(true);
    try {
      await action();
      setFuDate('');
      setFuTime('');
      setFuNote('');
      await fetchLead();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update follow-up');
    } finally {
      setSavingFu(false);
    }
  };

  const handleScheduleFu = () => {
    const iso = fuDueIso();
    if (!lead || !user || !iso) return;
    void runFuAction(() => scheduleFollowUp(lead.id, user.id, iso, fuNote.trim() || undefined));
  };

  const handleCompleteFu = () => {
    if (!lead || !user || !followUp) return;
    void runFuAction(() => completeFollowUp(lead.id, user.id, followUp.activityId, fuNote.trim() || undefined));
  };

  const handleRescheduleFu = () => {
    const iso = fuDueIso();
    if (!lead || !user || !followUp || !iso) return;
    void runFuAction(() => rescheduleFollowUp(lead.id, user.id, followUp.activityId, iso, fuNote.trim() || undefined));
  };

  const handleWhatsApp = () => {
    if (!lead) return;
    const text = encodeURIComponent(
      `Hi ${lead.full_name}, regarding your enquiry about ${lead.course_title ?? lead.lead_type}`,
    );
    window.open(`https://wa.me/${lead.phone_e164.replace(/\D/g, '')}?text=${text}`, '_blank');
  };

  if (loading) return <LoadingSpinner />;
  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!lead) return <EmptyState title="Lead not found" description="This lead may have been removed." />;

  return (
    <div className="space-y-6">
      <button
        onClick={() => navigate('/admin/marketing-leads')}
        className="flex items-center gap-1 text-sm text-blue-600 hover:underline"
      >
        <ArrowLeft size={16} /> Back to leads
      </button>

      <PageHeader
        title={lead.full_name}
        subtitle={`Lead #${lead.id.slice(0, 8)}`}
        action={
          <div className="flex items-center gap-2">
            <button
              onClick={handleWhatsApp}
              className="flex items-center gap-1 px-3 py-1.5 bg-green-600 text-white rounded text-sm"
            >
              <MessageCircle size={14} /> WhatsApp
            </button>
            <button
              onClick={() => window.open(`tel:${lead.phone_e164}`)}
              className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white rounded text-sm"
            >
              <Phone size={14} /> Call
            </button>
            <button
              onClick={() => document.getElementById('follow-up-panel')?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
              className="flex items-center gap-1 px-3 py-1.5 bg-amber-500 text-white rounded text-sm"
            >
              Set follow-up
            </button>
            <select
              value={lead.status}
              onChange={e => void handleStatusChange(e.target.value as LeadStatus)}
              className="input w-auto"
            >
              {LEAD_STATUSES.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
        }
      />

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <div className="card p-4">
          <h3 className="font-semibold mb-3">Person</h3>
          <dl className="space-y-2">
            <Field label="Phone" value={lead.phone_display} />
            <Field label="Email" value={lead.email} />
            <Field label="College" value={lead.college} />
            <Field label="Qualification" value={lead.qualification} />
            <Field label="Degree" value={lead.degree} />
            <Field label="Branch" value={lead.branch} />
            <Field label="Graduation Year" value={lead.graduation_year} />
            <Field label="Skills" value={lead.skills} />
            <Field label="Experience" value={lead.experience} />
          </dl>
        </div>

        <div className="card p-4">
          <h3 className="font-semibold mb-3">Interest</h3>
          <dl className="space-y-2">
            <Field label="Lead Type" value={lead.lead_type} />
            <Field label="Course" value={lead.course_title ?? lead.course_slug} />
            <Field label="Internship Area" value={lead.internship_area} />
            <Field label="Message" value={lead.message} />
          </dl>
        </div>

        <div className="card p-4">
          <h3 className="font-semibold mb-3">Attribution</h3>
          <dl className="space-y-3">
            <TouchDetails title="First Touch" touch={lead.first_touch} />
            <TouchDetails title="Last Touch" touch={lead.last_touch} />
            <Field label="Page" value={lead.page_url} />
            <Field label="Assigned" value={lead.assigned?.full_name ?? lead.assigned_counsellor} />
          </dl>
        </div>

        <div className="card p-4">
          <h3 className="font-semibold mb-3">System</h3>
          <dl className="space-y-2">
            <div>
              <dt className="text-xs font-medium text-slate-500">Status</dt>
              <dd className="mt-0.5 text-sm">
                <Badge variant={STATUS_BADGE_VARIANT[lead.status]}>{lead.status}</Badge>
              </dd>
            </div>
            <Field label="Created" value={new Date(lead.created_at).toLocaleString()} />
            <Field label="Received" value={new Date(lead.received_at).toLocaleString()} />
            <div>
              <dt className="text-xs font-medium text-slate-500">Assign Counsellor</dt>
              <dd className="mt-0.5 text-sm">
                <select
                  value={lead.assigned_counsellor ?? ''}
                  onChange={e => void handleAssign(e.target.value)}
                  className="input w-full"
                >
                  <option value="">Unassigned</option>
                  {staff.map(s => (
                    <option key={s.id} value={s.id}>{s.full_name ?? s.email}</option>
                  ))}
                </select>
              </dd>
            </div>
          </dl>
        </div>
      </div>

      <div className="card p-4">
        <h3 className="font-semibold mb-3">Add Note</h3>
        <div className="flex gap-2">
          <textarea
            className="input flex-1"
            rows={2}
            placeholder="Add a follow-up note..."
            value={note}
            onChange={e => setNote(e.target.value)}
          />
          <button
            onClick={() => void handleAddNote()}
            disabled={savingNote || !note.trim()}
            className="btn-primary text-sm disabled:opacity-50"
          >
            Save
          </button>
        </div>
      </div>

      <div className="card p-4" id="follow-up-panel">
        <h3 className="font-semibold mb-3">Follow-up</h3>
        {followUp ? (
          <div className={`mb-3 rounded border p-3 text-sm ${new Date(followUp.dueAt) < new Date() ? 'border-red-300 bg-red-50' : 'border-amber-300 bg-amber-50'}`}>
            <p className="font-medium">
              Due {new Date(followUp.dueAt).toLocaleString()}
              {new Date(followUp.dueAt) < new Date() ? ' — OVERDUE' : ''}
            </p>
            {followUp.note ? <p className="text-slate-600 mt-1">{followUp.note}</p> : null}
            <button
              className="btn-secondary text-xs mt-2"
              disabled={savingFu}
              onClick={handleCompleteFu}
            >
              Mark completed
            </button>
          </div>
        ) : (
          <p className="text-sm text-slate-500 mb-3">No open follow-up.</p>
        )}
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label className="text-xs text-slate-500 block mb-0.5">Date</label>
            <input type="date" className="input w-auto" value={fuDate} onChange={e => setFuDate(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-slate-500 block mb-0.5">Time</label>
            <input type="time" className="input w-auto" value={fuTime} onChange={e => setFuTime(e.target.value)} />
          </div>
          <input
            className="input flex-1 min-w-[180px]"
            placeholder="Follow-up note (optional)"
            value={fuNote}
            onChange={e => setFuNote(e.target.value)}
          />
          {followUp ? (
            <button className="btn-primary text-sm" disabled={savingFu || !fuDate} onClick={handleRescheduleFu}>
              Reschedule
            </button>
          ) : (
            <button className="btn-primary text-sm" disabled={savingFu || !fuDate} onClick={handleScheduleFu}>
              Schedule
            </button>
          )}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card p-4">
          <h3 className="font-semibold mb-3">Activity History</h3>
          {activities.length === 0 ? (
            <p className="text-sm text-slate-500">No activities yet.</p>
          ) : (
            <ul className="space-y-3">
              {activities.map(a => (
                <li key={a.id} className="text-sm">
                  <div className="flex items-center justify-between">
                    <Badge variant="default">{a.activity_type}</Badge>
                    <span className="text-xs text-slate-500">
                      {new Date(a.created_at).toLocaleString()}
                    </span>
                  </div>
                  {a.detail ? (
                    <p className="mt-1 text-slate-600">{JSON.stringify(a.detail)}</p>
                  ) : null}
                  <p className="mt-1 text-xs text-slate-400">
                    by {a.performed?.full_name ?? 'system'}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card p-4">
          <h3 className="font-semibold mb-3">Status History</h3>
          {history.length === 0 ? (
            <p className="text-sm text-slate-500">No status changes yet.</p>
          ) : (
            <ul className="space-y-3">
              {history.map(h => (
                <li key={h.id} className="text-sm">
                  <div className="flex items-center justify-between">
                    <span>
                      {h.from_status ?? 'NEW'} →{' '}
                      <Badge variant={STATUS_BADGE_VARIANT[h.to_status as LeadStatus]}>{h.to_status}</Badge>
                    </span>
                    <span className="text-xs text-slate-500">
                      {new Date(h.created_at).toLocaleString()}
                    </span>
                  </div>
                  {h.note ? <p className="mt-1 text-slate-600">{h.note}</p> : null}
                  <p className="mt-1 text-xs text-slate-400">
                    by {h.changer?.full_name ?? 'system'}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
