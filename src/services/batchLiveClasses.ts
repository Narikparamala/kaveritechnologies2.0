import { supabase } from '../lib/supabase';

// Batch live classes: faculty timetable, scheduling, attendance, and the
// student join flow. The DB RPCs (get_faculty_timetable, join_live_session,
// release_lesson_to_absentees) own the authorization rules; this layer is a
// thin typed wrapper.

export type TimetableItem = {
  item_date: string;
  kind: 'slot' | 'session';
  batch_id: string | null;
  batch_name: string;
  starts_at: string;
  ends_at: string;
  title: string;
  session_id: string | null;
  lesson_title: string | null;
  unlocks_lesson: boolean | null;
  clash: boolean;
};

export async function getTimetable(facultyId: string, from: string, to: string): Promise<TimetableItem[]> {
  const { data, error } = await supabase.rpc('get_faculty_timetable', {
    p_faculty_id: facultyId,
    p_from: from,
    p_to: to,
  });
  if (error) throw error;
  return (data ?? []) as TimetableItem[];
}

/** Returns the Meet URL (null when the session has none); marks attendance. */
export async function joinLiveSession(sessionId: string): Promise<string | null> {
  const { data, error } = await supabase.rpc('join_live_session', { p_session_id: sessionId });
  if (error) throw error;
  return (data as string | null) ?? null;
}

export async function releaseToAbsentees(sessionId: string): Promise<number> {
  const { data, error } = await supabase.rpc('release_lesson_to_absentees', { p_session_id: sessionId });
  if (error) throw error;
  return (data as number) ?? 0;
}

export type RosterEntry = {
  student_id: string;
  full_name: string | null;
  email: string;
  attendance_status: string | null; // null = not marked yet
};

export async function getRosterWithAttendance(sessionId: string, batchId: string): Promise<RosterEntry[]> {
  const [rosterRes, attendanceRes] = await Promise.all([
    supabase
      .from('batch_students')
      .select('student_id, status, student:profiles!inner(id, full_name, email)')
      .eq('batch_id', batchId)
      .eq('status', 'active'),
    supabase.from('session_attendance').select('student_id, attendance_status').eq('session_id', sessionId),
  ]);
  if (rosterRes.error) throw rosterRes.error;
  if (attendanceRes.error) throw attendanceRes.error;

  const attended = new Map(
    (attendanceRes.data ?? []).map((a: { student_id: string; attendance_status: string }) => [a.student_id, a.attendance_status]),
  );
  // Untyped generated schema: embedded student may be typed as an array — go through unknown.
  return ((rosterRes.data ?? []) as unknown as Array<{
    student_id: string;
    status: string;
    student: { full_name: string | null; email: string } | null;
  }>).map(r => ({
    student_id: r.student_id,
    full_name: r.student?.full_name ?? null,
    email: r.student?.email ?? '',
    attendance_status: attended.get(r.student_id) ?? null,
  }));
}

export type AttendanceStatus = 'attended' | 'absent' | 'excused' | 'registered';

/** Upsert one student's attendance. Staff-only (RLS enforces it). */
export async function markAttendance(sessionId: string, studentId: string, status: AttendanceStatus, markedBy: string): Promise<void> {
  const { error } = await supabase.from('session_attendance').upsert(
    {
      session_id: sessionId,
      student_id: studentId,
      attendance_status: status,
      marked_by: markedBy,
    },
    { onConflict: 'session_id,student_id' },
  );
  if (error) throw error;
}

/** Bulk "mark all present" for a batch roster — one round trip. */
export async function markAllPresent(sessionId: string, batchId: string, markedBy: string): Promise<number> {
  const { data: roster, error: rosterError } = await supabase
    .from('batch_students')
    .select('student_id')
    .eq('batch_id', batchId)
    .eq('status', 'active');
  if (rosterError) throw rosterError;
  const rows = (roster ?? []).map(r => ({
    session_id: sessionId,
    student_id: r.student_id,
    attendance_status: 'attended' as const,
    marked_by: markedBy,
  }));
  if (rows.length === 0) return 0;
  const { error } = await supabase
    .from('session_attendance')
    .upsert(rows, { onConflict: 'session_id,student_id' });
  if (error) throw error;
  return rows.length;
}

/** Local-calendar ISO date (YYYY-MM-DD) — never use toISOString() for this: it shifts local midnights back a day on UTC+ timezones. */
export function toLocalIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** The batch's next active weekly slot at/after `fromDate` (JS dow: 0 = Sunday). */
export async function getNextSlotOccurrence(
  batchId: string,
  fromDate: string,
): Promise<{ date: string; start_time: string; end_time: string } | null> {
  const { data, error } = await supabase
    .from('batch_schedules')
    .select('day_of_week, start_time, end_time')
    .eq('batch_id', batchId)
    .eq('is_active', true)
    .order('day_of_week')
    .order('start_time');
  if (error) throw error;
  const slots = data ?? [];
  if (slots.length === 0) return null;

  const base = new Date(`${fromDate}T00:00:00`);
  const now = new Date();
  const nowIso = toLocalIso(now);
  const nowHm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  for (let offset = 0; offset <= 7; offset++) {
    const d = new Date(base);
    d.setDate(d.getDate() + offset);
    const dow = d.getDay();
    const matches = slots.filter(s => s.day_of_week === dow);
    for (const s of matches) {
      const iso = toLocalIso(d);
      const endTime = s.end_time.slice(0, 5);
      // On the same day, only suggest a slot that has not ended yet.
      if (iso === nowIso && `${nowHm}` >= endTime) continue;
      return { date: iso, start_time: s.start_time.slice(0, 5), end_time: endTime };
    }
  }
  return null;
}

/**
 * All active batches, for pickers. Staff RLS grants faculty read access to
 * every batch (same scope the My Batches & Work page and admin pickers use),
 * so we read `batches` directly — filtering through `batch_faculty` with an
 * inner join can silently drop rows and render an empty picker.
 */
export async function getFacultyBatches(): Promise<{ id: string; name: string; course_id: string | null; course_title: string | null }[]> {
  const { data, error } = await supabase
    .from('batches')
    .select('id, name, course_id, course:courses(title)')
    .eq('status', 'active')
    .order('name');
  if (error) throw error;
  // PostgREST may type the embedded course loosely — go through unknown.
  return ((data ?? []) as unknown as Array<{
    id: string; name: string; course_id: string | null; course: { title: string } | { title: string }[] | null;
  }>).map(r => ({
    id: r.id,
    name: r.name,
    course_id: r.course_id,
    course_title: (Array.isArray(r.course) ? r.course[0]?.title : r.course?.title) ?? null,
  }));
}

/** Slot length in minutes, used to prefill the session duration. */
export function slotMinutes(start: string, end: string): number {
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  return Math.max(30, (eh ?? 0) * 60 + (em ?? 0) - ((sh ?? 0) * 60 + (sm ?? 0)));
}
