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
  avatar_url: string | null;
  attendance_status: string | null; // null = not marked yet
};

export async function getRosterWithAttendance(sessionId: string, batchId: string): Promise<RosterEntry[]> {
  const [rosterRes, attendanceRes] = await Promise.all([
    supabase
      .from('batch_students')
      .select('student_id, status, student:profiles!inner(id, full_name, email, avatar_url)')
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
    student: { full_name: string | null; email: string; avatar_url: string | null } | null;
  }>).map(r => ({
    student_id: r.student_id,
    full_name: r.student?.full_name ?? null,
    email: r.student?.email ?? '',
    avatar_url: r.student?.avatar_url ?? null,
    attendance_status: attended.get(r.student_id) ?? null,
  }));
}

export type AttendanceStatus = 'attended' | 'absent' | 'excused' | 'registered';

/**
 * Upsert one student's attendance. Staff-only (RLS enforces it).
 * IMPORTANT: never set joined_at here — it marks a REAL student join
 * (written only by join_live_session) and gates the lesson
 * auto-release trigger. Manual marking intentionally leaves it alone;
 * use releaseToAbsentees() to grant the lesson to non-joiners.
 */
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

/**
 * Bulk "mark all present" for a batch roster — one round trip.
 * Does NOT set joined_at, so it does not trigger lesson release
 * (only real student joins do; absentees get the lesson via
 * releaseToAbsentees()).
 */
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

// ------------------------------------------------------------------
// Attendance history (per-batch trends across sessions)
// ------------------------------------------------------------------

export type BatchHistorySession = {
  session_id: string;
  title: string;
  session_date: string;
  duration_minutes: number;
  status: string;
  unlocks_lesson: boolean;
  attended_count: number;
  absent_count: number;
  excused_count: number;
  unmarked_count: number;
};

export type BatchAttendanceHistory = {
  batch_id: string;
  batch_name: string;
  course_id: string | null;
  course_title: string | null;
  active_students: number;
  sessions: BatchHistorySession[];
  studentTrends: StudentTrend[];
  cohortRate: number | null;
};

export type StudentTrend = {
  student_id: string;
  full_name: string | null;
  email: string;
  avatar_url: string | null;
  attended: number;
  absent: number;
  excused: number;
  unmarked: number;
};

/**
 * Full attendance history for ONE batch: every live session of that batch
 * (plus course-wide sessions the batch's course owns if the batch belongs
 * to that course) with per-session counts, plus per-student totals for
 * trend analysis. Reads denormalized counts directly from live_sessions
 * counters when available, else from session_attendance rows.
 *
 * RLS allows faculty of the batch's course to read both live_sessions and
 * session_attendance rows, so no extra RPC is needed.
 */
export async function getBatchAttendanceHistory(batchId: string): Promise<BatchAttendanceHistory & { studentTrends: StudentTrend[] }> {
  // 1. Batch record + course title + active-student count.
  const { data: batchRow, error: batchError } = await supabase
    .from('batches')
    .select('id, name, course_id, course:courses(title)')
    .eq('id', batchId)
    .maybeSingle();
  if (batchError) throw batchError;
  if (!batchRow) throw new Error('Batch not found.');

  const batchRowUntyped = batchRow as unknown as {
    id: string; name: string; course_id: string | null; course: { title: string } | { title: string }[] | null;
  };
  const courseId = batchRowUntyped.course_id;
  const courseTitle = (Array.isArray(batchRowUntyped.course) ? batchRowUntyped.course[0]?.title : batchRowUntyped.course?.title) ?? null;

  // 2. Sessions for this batch (batch-scoped ones, or course-wide when the
  //    batch belongs to the same course, since batch students attend those too).
  let query = supabase
    .from('live_sessions')
    .select('id, title, session_date, duration_minutes, status, unlocks_lesson, batch_id, course_id')
    .neq('status', 'cancelled')
    .order('session_date', { ascending: false });
  if (courseId) {
    query = query.or(`batch_id.eq.${batchId},and(batch_id.is.null,course_id.eq.${courseId})`);
  } else {
    query = query.eq('batch_id', batchId);
  }
  const { data: sessions, error: sessionsError } = await query;
  if (sessionsError) throw sessionsError;

  const sessionRows = ((sessions ?? []) as unknown as Array<{
    id: string; title: string; session_date: string; duration_minutes: number;
    status: string; unlocks_lesson: boolean; batch_id: string | null; course_id: string;
  }>);

  // 3. Active batch members — the roster these sessions apply to.
  const { data: roster, error: rosterError } = await supabase
    .from('batch_students')
    .select('student_id')
    .eq('batch_id', batchId)
    .eq('status', 'active');
  if (rosterError) throw rosterError;
  const rosterIds = new Set((roster ?? []).map(r => r.student_id));
  const activeStudents = rosterIds.size;

  // 4. Attendance rows for all fetched sessions, filtered to batch members.
  const sessionIds = sessionRows.map(s => s.id);
  const attendanceByKey = new Map<string, { attended: number; absent: number; excused: number; unmarked: number }>();
  const studentByKey = new Map<string, { attended: number; absent: number; excused: number; unmarked: number }>();

  if (sessionIds.length > 0) {
    const { data: attRows, error: attError } = await supabase
      .from('session_attendance')
      .select('session_id, student_id, attendance_status')
      .in('session_id', sessionIds);
    if (attError) throw attError;
    for (const row of attRows ?? []) {
      if (!rosterIds.has(row.student_id)) continue; // ignore non-batch rows
      const perSession = attendanceByKey.get(row.session_id) ?? { attended: 0, absent: 0, excused: 0, unmarked: 0 };
      const perStudent = studentByKey.get(row.student_id) ?? { attended: 0, absent: 0, excused: 0, unmarked: 0 };
      const status = row.attendance_status as AttendanceStatus | null;
      if (status === 'attended') { perSession.attended++; perStudent.attended++; }
      else if (status === 'absent') { perSession.absent++; perStudent.absent++; }
      else if (status === 'excused') { perSession.excused++; perStudent.excused++; }
      else { perSession.unmarked++; perStudent.unmarked++; }
      attendanceByKey.set(row.session_id, perSession);
      studentByKey.set(row.student_id, perStudent);
    }
  }

  // 5. Names/avatars for the per-student trend table.
  let profiles: Array<{ id: string; full_name: string | null; email: string | null; avatar_url: string | null }> = [];
  if (studentByKey.size > 0) {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, email, avatar_url')
      .in('id', [...studentByKey.keys()]);
    if (error) throw error;
    profiles = data ?? [];
  }
  const profileById = new Map(profiles.map(p => [p.id, p]));

  // Ensure every session shows up even with zero attendance rows.
  const sessionItems: BatchHistorySession[] = sessionRows.map(s => {
    const counts = attendanceByKey.get(s.id) ?? { attended: 0, absent: 0, excused: 0, unmarked: 0 };
    return {
      session_id: s.id,
      title: s.title,
      session_date: s.session_date,
      duration_minutes: s.duration_minutes,
      status: s.status,
      unlocks_lesson: s.unlocks_lesson,
      attended_count: counts.attended,
      absent_count: counts.absent,
      excused_count: counts.excused,
      unmarked_count: counts.unmarked,
    };
  });

  // Cohort-level attendance rate across ALL batch sessions. Denominator is
  // every student registered for those sessions (attended + absent + excused
  // + unmarked) — matching the admin session page's attended ÷ registered.
  // Excluding unmarked rows here inflated the rate: 10 attended among
  // 67 registered showed "100%" because the 57 unmarked weren't counted.
  const totalMarked = sessionItems.reduce(
    (sum, s) => sum + s.attended_count + s.absent_count + s.excused_count + s.unmarked_count,
    0,
  );
  const totalAttended = sessionItems.reduce((sum, s) => sum + s.attended_count, 0);
  const cohortRate = totalMarked > 0 ? Math.round((totalAttended / totalMarked) * 100) : null;

  const studentTrends: StudentTrend[] = (roster ?? []).map(r => {
    const counts = studentByKey.get(r.student_id) ?? { attended: 0, absent: 0, excused: 0, unmarked: 0 };
    const profile = profileById.get(r.student_id);
    return {
      student_id: r.student_id,
      full_name: profile?.full_name ?? null,
      email: profile?.email ?? '',
      avatar_url: profile?.avatar_url ?? null,
      attended: counts.attended,
      absent: counts.absent,
      excused: counts.excused,
      unmarked: counts.unmarked,
    };
  });

  return {
    batch_id: batchRowUntyped.id,
    batch_name: batchRowUntyped.name,
    course_id: courseId,
    course_title: courseTitle,
    active_students: activeStudents,
    sessions: sessionItems,
    cohortRate,
    studentTrends,
  };
}

// NOTE: getFacultyBatches is defined below in this file — the history page
// imports it directly; no re-export needed here.

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
