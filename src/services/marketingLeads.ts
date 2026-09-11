// Marketing Leads CRM service.
// Talks to the frozen production lead schema using the authenticated
// browser client only — every query flows through existing RLS policies.
// IMPORTANT: marketing_lead_activities is append-only by RLS (select +
// insert, no update). Follow-up completion/rescheduling is modelled as
// appended activity events, never row updates.

import { supabase } from '../lib/supabase';

export const LEAD_STATUSES = ['NEW', 'CONTACTED', 'INTERESTED', 'COUNSELLING', 'DEMO_SCHEDULED', 'FOLLOW_UP', 'JOINED', 'NOT_INTERESTED', 'INVALID', 'NO_RESPONSE'] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const LEAD_TYPES = ['course_enquiry', 'general_training', 'career_return', 'computer_skills', 'internship', 'project_mentoring', 'trainer_application'] as const;
export type LeadType = (typeof LEAD_TYPES)[number];

export interface TouchAttribution {
  utm_source?: string; utm_medium?: string; utm_campaign?: string;
  utm_content?: string; utm_term?: string; fbclid?: string; gclid?: string;
  landing_page?: string; referrer?: string; captured_at?: string;
}

export interface MarketingLead {
  id: string; lead_type: LeadType; full_name: string; phone_e164: string; phone_display: string;
  email: string | null; college: string | null; qualification: string | null; degree: string | null;
  branch: string | null; graduation_year: string | null; skills: string | null; internship_area: string | null;
  experience: string | null; resume_url: string | null; message: string | null; course_slug: string | null;
  course_title: string | null; first_touch: TouchAttribution | null; last_touch: TouchAttribution | null;
  page_url: string | null; status: LeadStatus;
  status_history: { status: string; at: string; by: string }[];
  assigned_counsellor: string | null; converted_profile_id: string | null;
  spam_flag: boolean; honeypot_triggered: boolean; received_at: string; created_at: string; updated_at: string;
  assigned?: { id: string; full_name: string | null; email: string } | null;
}

export interface LeadActivity {
  id: string; lead_id: string; activity_type: string;
  detail: Record<string, unknown> | null; performed_by: string | null; created_at: string;
  performed?: { id: string; full_name: string | null } | null;
}

export interface LeadStatusHistoryRow {
  id: string; lead_id: string; from_status: string | null; to_status: string;
  changed_by: string | null; note: string | null; created_at: string;
  changer?: { id: string; full_name: string | null } | null;
}

export interface LeadAssignmentRow {
  id: string; lead_id: string; counsellor_id: string; assigned_at: string; assigned_by: string | null;
  counsellor?: { id: string; full_name: string | null; email: string } | null;
}

export interface LeadListFilters {
  search: string; status: string; leadType: string; course: string; assigned: string;
  createdFrom: string; createdTo: string; page: number; pageSize: number;
}

export const EMPTY_FILTERS: LeadListFilters = {
  search: '', status: 'all', leadType: 'all', course: 'all', assigned: 'all',
  createdFrom: '', createdTo: '', page: 1, pageSize: 25,
};

export const STATUS_BADGE_VARIANT: Record<LeadStatus, 'default' | 'success' | 'warning' | 'error' | 'info' | 'teal'> = {
  NEW: 'info', CONTACTED: 'teal', INTERESTED: 'teal', COUNSELLING: 'warning', DEMO_SCHEDULED: 'warning',
  FOLLOW_UP: 'warning', JOINED: 'success', NOT_INTERESTED: 'default', INVALID: 'error', NO_RESPONSE: 'default',
};

const LEAD_EMBED = 'assigned:profiles!marketing_leads_assigned_counsellor_fkey(id,full_name,email)';
// ============================================================
// Queries
// ============================================================

export async function listLeads(filters: LeadListFilters): Promise<{ leads: MarketingLead[]; total: number }> {
  let query = supabase
    .from('marketing_leads')
    .select(LEAD_EMBED, { count: 'exact' })
    .order('created_at', { ascending: false })
    .range((filters.page - 1) * filters.pageSize, filters.page * filters.pageSize - 1);

  if (filters.search.trim()) {
    const term = filters.search.trim().replace(/[,%()]/g, '');
    query = query.or(
      `full_name.ilike.%${term}%,phone_e164.ilike.%${term}%,email.ilike.%${term}%`,
    );
  }
  if (filters.status !== 'all') query = query.eq('status', filters.status);
  if (filters.leadType !== 'all') query = query.eq('lead_type', filters.leadType);
  if (filters.course !== 'all') query = query.eq('course_slug', filters.course);
  if (filters.assigned === 'unassigned') query = query.is('assigned_counsellor', null);
  else if (filters.assigned !== 'all') query = query.eq('assigned_counsellor', filters.assigned);
  if (filters.createdFrom) query = query.gte('created_at', `${filters.createdFrom}T00:00:00Z`);
  if (filters.createdTo) query = query.lte('created_at', `${filters.createdTo}T23:59:59Z`);

  const { data, error, count } = await query;
  if (error) throw error;
  return { leads: ((data ?? []) as unknown[]).map(normalizeLead), total: count ?? 0 };
}

// The PostgREST embed for assigned counsellor can come back as an object or a
// one-element array depending on how the FK relationship is resolved; accept
// both shapes so the UI always gets a plain MarketingLead.
function normalizeLead(raw: unknown): MarketingLead {
  const row = raw as Omit<MarketingLead, 'assigned'> & { assigned?: MarketingLead['assigned'] | MarketingLead['assigned'][] };
  const a = row.assigned;
  const assigned = Array.isArray(a) ? (a[0] ?? null) : (a ?? null);
  return { ...(row as MarketingLead), assigned };
}

export async function getLeadStatusCounts(): Promise<Record<string, number>> {
  const counts: Record<string, number> = { total: 0 };
  await Promise.all(
    LEAD_STATUSES.map(async (status) => {
      const { count } = await supabase.from('marketing_leads').select('id', { count: 'exact', head: true }).eq('status', status);
      counts[status] = count ?? 0;
    }),
  );
  const { count: total } = await supabase.from('marketing_leads').select('id', { count: 'exact', head: true });
  counts.total = total ?? 0;
  return counts;
}

export async function getLeadCourseOptions(): Promise<{ slug: string; title: string | null }[]> {
  const { data, error } = await supabase.from('marketing_leads').select('course_slug, course_title').not('course_slug', 'is', null).order('course_slug');
  if (error) throw error;
  const seen = new Map<string, string | null>();
  for (const row of (data ?? []) as { course_slug: string; course_title: string | null }[]) {
    if (!seen.has(row.course_slug)) seen.set(row.course_slug, row.course_title);
  }
  return [...seen.entries()].map(([slug, title]) => ({ slug, title }));
}

export async function getStaffOptions(): Promise<{ id: string; full_name: string | null; email: string }[]> {
  const { data, error } = await supabase.from('profiles').select('id, full_name, email').in('role', ['faculty', 'super_admin']).eq('is_active', true).order('full_name');
  if (error) throw error;
  return (data ?? []) as { id: string; full_name: string | null; email: string }[];
}

export async function getLead(leadId: string): Promise<MarketingLead | null> {
  const { data, error } = await supabase.from('marketing_leads').select(LEAD_EMBED).eq('id', leadId).maybeSingle();
  if (error) throw error;
  return data ? normalizeLead(data) : null;
}

export async function getLeadActivities(leadId: string): Promise<LeadActivity[]> {
  const { data, error } = await supabase.from('marketing_lead_activities')
    .select('*, performed:profiles!marketing_lead_activities_performed_by_fkey(id,full_name)')
    .eq('lead_id', leadId).order('created_at', { ascending: true }).order('id', { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as LeadActivity[];
}

export async function getLeadStatusHistory(leadId: string): Promise<LeadStatusHistoryRow[]> {
  const { data, error } = await supabase.from('marketing_lead_status_history')
    .select('*, changer:profiles!marketing_lead_status_history_changed_by_fkey(id,full_name)')
    .eq('lead_id', leadId).order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as LeadStatusHistoryRow[];
}

export async function getLeadAssignments(leadId: string): Promise<LeadAssignmentRow[]> {
  const { data, error } = await supabase.from('marketing_lead_assignments')
    .select('*, counsellor:profiles!marketing_lead_assignments_counsellor_id_fkey(id,full_name,email)')
    .eq('lead_id', leadId).order('assigned_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as LeadAssignmentRow[];
}
// ============================================================
// Follow-up model (append-only activities)
// ============================================================

export interface FollowUpItem {
  activityId: string; leadId: string; dueAt: string; note: string | null; createdAt: string;
}

export function computeOpenFollowUps(activities: LeadActivity[]): Map<string, FollowUpItem> {
  const scheduled = new Map<string, LeadActivity>();
  const closed = new Set<string>();
  for (const a of activities) {
    if (a.activity_type === 'follow_up') {
      const prev = scheduled.get(a.lead_id);
      if (!prev || a.created_at > prev.created_at) scheduled.set(a.lead_id, a);
    } else if (a.activity_type === 'follow_up_completed') {
      const id = a.detail?.follow_up_id;
      if (typeof id === 'string') closed.add(id);
    }
  }
  const open = new Map<string, FollowUpItem>();
  for (const [leadId, a] of scheduled) {
    if (closed.has(a.id)) continue;
    open.set(leadId, { activityId: a.id, leadId, dueAt: String(a.detail?.due_at ?? ''), note: a.detail?.note != null ? String(a.detail.note) : null, createdAt: a.created_at });
  }
  return open;
}

export async function getOpenFollowUps(leadIds: string[]): Promise<Map<string, FollowUpItem>> {
  if (!leadIds.length) return new Map();
  const { data, error } = await supabase.from('marketing_lead_activities').select('*').in('lead_id', leadIds).in('activity_type', ['follow_up', 'follow_up_completed']);
  if (error) throw error;
  return computeOpenFollowUps((data ?? []) as LeadActivity[]);
}

export interface FollowUpBucket {
  overdue: { lead: MarketingLead; followUp: FollowUpItem }[];
  today: { lead: MarketingLead; followUp: FollowUpItem }[];
  upcoming: { lead: MarketingLead; followUp: FollowUpItem }[];
}

export async function getFollowUpBoard(): Promise<FollowUpBucket> {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfToday = new Date(startOfToday);
  endOfToday.setDate(endOfToday.getDate() + 1);

  const { data, error } = await supabase.from('marketing_lead_activities')
    .select('*, lead:marketing_leads!marketing_lead_activities_lead_id_fkey(id, full_name, phone_e164, phone_display, status, course_title, lead_type, assigned_counsellor)')
    .in('activity_type', ['follow_up', 'follow_up_completed']).order('created_at', { ascending: true });
  if (error) throw error;

  const open = computeOpenFollowUps((data ?? []) as unknown as LeadActivity[]);
  const leadById = new Map<string, MarketingLead>();
  for (const row of (data ?? []) as unknown as { lead: MarketingLead }[]) {
    if (row.lead?.id) leadById.set(row.lead.id, row.lead);
  }

  const bucket: FollowUpBucket = { overdue: [], today: [], upcoming: [] };
  for (const [leadId, item] of open) {
    const lead = leadById.get(leadId);
    if (!lead || !item.dueAt) continue;
    const due = new Date(item.dueAt);
    const entry = { lead, followUp: item };
    if (due < startOfToday) bucket.overdue.push(entry);
    else if (due < endOfToday) bucket.today.push(entry);
    else bucket.upcoming.push(entry);
  }
  const byDue = (a: { followUp: FollowUpItem }, b: { followUp: FollowUpItem }) => a.followUp.dueAt.localeCompare(b.followUp.dueAt);
  bucket.overdue.sort(byDue); bucket.today.sort(byDue); bucket.upcoming.sort(byDue);
  return bucket;
}
// ============================================================
// Mutations (all RLS-guarded: faculty / super_admin only)
// ============================================================

export async function updateLeadStatus(leadId: string, fromStatus: LeadStatus, toStatus: LeadStatus, actorId: string, note?: string): Promise<void> {
  const { error: updErr } = await supabase.from('marketing_leads').update({ status: toStatus }).eq('id', leadId);
  if (updErr) throw updErr;
  const { error: histErr } = await supabase.from('marketing_lead_status_history').insert({ lead_id: leadId, from_status: fromStatus, to_status: toStatus, changed_by: actorId, note: note ?? null });
  if (histErr) throw histErr;
  const { error: actErr } = await supabase.from('marketing_lead_activities').insert({ lead_id: leadId, activity_type: 'status_change', performed_by: actorId, detail: { from: fromStatus, to: toStatus, note: note ?? null } });
  if (actErr) throw actErr;
}

export async function addLeadNote(leadId: string, actorId: string, note: string): Promise<void> {
  const { error } = await supabase.from('marketing_lead_activities').insert({ lead_id: leadId, activity_type: 'note', performed_by: actorId, detail: { note } });
  if (error) throw error;
}

export async function scheduleFollowUp(leadId: string, actorId: string, dueAt: string, note?: string, rescheduledFrom?: string): Promise<void> {
  const detail: Record<string, unknown> = { due_at: dueAt, note: note ?? null };
  if (rescheduledFrom) detail.rescheduled_from = rescheduledFrom;
  const { error } = await supabase.from('marketing_lead_activities').insert({ lead_id: leadId, activity_type: 'follow_up', performed_by: actorId, detail });
  if (error) throw error;
}

export async function completeFollowUp(leadId: string, actorId: string, followUpActivityId: string, note?: string): Promise<void> {
  const { error } = await supabase.from('marketing_lead_activities').insert({ lead_id: leadId, activity_type: 'follow_up_completed', performed_by: actorId, detail: { follow_up_id: followUpActivityId, note: note ?? null } });
  if (error) throw error;
}

export async function rescheduleFollowUp(leadId: string, actorId: string, followUpActivityId: string, newDueAt: string, note?: string): Promise<void> {
  await completeFollowUp(leadId, actorId, followUpActivityId, note);
  await scheduleFollowUp(leadId, actorId, newDueAt, note, followUpActivityId);
}

export async function assignLead(leadId: string, counsellorId: string | null, actorId: string): Promise<void> {
  const { error: updErr } = await supabase.from('marketing_leads').update({ assigned_counsellor: counsellorId }).eq('id', leadId);
  if (updErr) throw updErr;
  if (counsellorId) {
    const { error } = await supabase.from('marketing_lead_assignments').insert({ lead_id: leadId, counsellor_id: counsellorId, assigned_by: actorId });
    if (error) throw error;
  }
}