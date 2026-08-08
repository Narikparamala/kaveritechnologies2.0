import { supabase } from '../lib/supabase';
import type { LiveSession, SessionAttendance, SessionResource } from '../types/database';

export interface SessionWithDetails extends LiveSession {
  course?: { id: string; title: string; slug: string };
  faculty?: { id: string; full_name: string | null; avatar_url: string | null };
  attendance?: SessionAttendance;
  resources?: SessionResource[];
}

export interface CreateSessionInput {
  course_id: string;
  chapter_id?: string;
  lesson_id?: string;
  title: string;
  description?: string;
  session_date: string;
  duration_minutes: number;
  google_meet_url?: string;
  preparation_notes?: string;
}

export interface UpdateSessionInput {
  title?: string;
  description?: string;
  session_date?: string;
  duration_minutes?: number;
  google_meet_url?: string;
  status?: 'scheduled' | 'live' | 'completed' | 'cancelled';
  slides_unlocked?: boolean;
  materials_unlocked?: boolean;
  preparation_notes?: string;
}

// Validate Google Meet URL
export function isValidGoogleMeetUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.hostname === 'meet.google.com' && parsed.pathname.length > 1;
  } catch {
    return false;
  }
}

const SUPABASE_FUNCTIONS_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;

// Check if faculty has connected their Google account
export async function getGoogleConnectionStatus(facultyId: string): Promise<{ connected: boolean; google_email: string | null }> {
  const res = await fetch(`${SUPABASE_FUNCTIONS_URL}/google-calendar-auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'status', faculty_id: facultyId }),
  });
  if (!res.ok) return { connected: false, google_email: null };
  return res.json();
}

// Get the Google OAuth URL to redirect faculty to
export async function getGoogleOAuthUrl(facultyId: string, redirectUri: string): Promise<string | null> {
  const res = await fetch(
    `${SUPABASE_FUNCTIONS_URL}/google-calendar-auth?action=url&faculty_id=${encodeURIComponent(facultyId)}&redirect_uri=${encodeURIComponent(redirectUri)}`,
  );
  if (!res.ok) return null;
  const data = await res.json();
  return data.auth_url ?? null;
}

// Disconnect Google account
export async function disconnectGoogleAccount(facultyId: string): Promise<void> {
  await fetch(`${SUPABASE_FUNCTIONS_URL}/google-calendar-auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'disconnect', faculty_id: facultyId }),
  });
}

// Create a Google Meet link for a session (calls edge function)
export async function createGoogleMeet(params: {
  faculty_id: string;
  session_id: string;
  title: string;
  description?: string;
  start_time: string;
  duration_minutes: number;
  access_token: string;
}): Promise<{ google_meet_url: string; calendar_event_id: string; meeting_id: string; organizer_email: string }> {
  const { access_token, ...body } = params;
  const res = await fetch(`${SUPABASE_FUNCTIONS_URL}/google-meet-create`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${access_token}`,
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? 'Failed to create Google Meet');
  return data;
}

// Student: Get all sessions for enrolled courses
export async function getStudentSessions(studentId: string): Promise<SessionWithDetails[]> {
  const { data, error } = await supabase
    .from('live_sessions')
    .select(`
      *,
      course:courses(id, title, slug),
      created_by,
      faculty:profiles!live_sessions_created_by_fkey(id, full_name, avatar_url)
    `)
    .in('course_id', (
      supabase.from('course_enrollments')
        .select('course_id')
        .eq('student_id', studentId)
    ))
    .order('session_date', { ascending: true });

  if (error) throw error;

  // Get attendance for this student
  const sessionIds = (data || []).map(s => s.id);
  const { data: attendance } = await supabase
    .from('session_attendance')
    .select('*')
    .eq('student_id', studentId)
    .in('session_id', sessionIds);

  const attendanceMap = new Map(attendance?.map(a => [a.session_id, a]));

  return (data || []).map(session => ({
    ...session,
    attendance: attendanceMap.get(session.id)
  })) as SessionWithDetails[];
}

// Student: Get single session with resources
export async function getStudentSession(sessionId: string, studentId: string): Promise<SessionWithDetails | null> {
  const { data: session, error } = await supabase
    .from('live_sessions')
    .select(`
      *,
      course:courses(id, title, slug),
      faculty:profiles!live_sessions_created_by_fkey(id, full_name, avatar_url)
    `)
    .eq('id', sessionId)
    .single();

  if (error || !session) return null;

  // Get attendance
  const { data: attendance } = await supabase
    .from('session_attendance')
    .select('*')
    .eq('session_id', sessionId)
    .eq('student_id', studentId)
    .maybeSingle();

  // Get resources (only unlocked ones for students)
  const { data: resources } = await supabase
    .from('session_resources')
    .select('*')
    .eq('session_id', sessionId)
    .eq('is_locked', false)
    .order('order_index', { ascending: true });

  return {
    ...session,
    attendance: attendance || undefined,
    resources: (resources || []) as SessionResource[]
  } as SessionWithDetails;
}

// Student: Register for a session
export async function registerForSession(sessionId: string, studentId: string): Promise<void> {
  const { error } = await supabase
    .from('session_attendance')
    .upsert({
      session_id: sessionId,
      student_id: studentId,
      attendance_status: 'registered'
    }, { onConflict: 'session_id,student_id' });

  if (error) throw error;
}

// Faculty: Get sessions for assigned courses
export async function getFacultySessions(facultyId: string): Promise<SessionWithDetails[]> {
  // Supabase .in() accepts an array, not another query builder.
  // Load the faculty's course IDs first, then fetch sessions for those courses.
  const { data: facultyCourses, error: facultyCoursesError } = await supabase
    .from('course_faculty')
    .select('course_id')
    .eq('faculty_id', facultyId);

  if (facultyCoursesError) throw facultyCoursesError;

  const courseIds = Array.from(
    new Set((facultyCourses || []).map(course => course.course_id).filter(Boolean)),
  );

  if (!courseIds.length) return [];

  // The course relation is backed by live_sessions.course_id.
  // Avoid requiring a created_by -> profiles relation while preview mode has no real auth.
  const { data: sessions, error: sessionsError } = await supabase
    .from('live_sessions')
    .select(`
      *,
      course:courses(id, title, slug)
    `)
    .in('course_id', courseIds)
    .order('session_date', { ascending: true });

  if (sessionsError) throw sessionsError;
  return (sessions || []) as SessionWithDetails[];
}

// Faculty: Create a new session
export async function createSession(input: CreateSessionInput, createdBy: string): Promise<LiveSession> {
  // Validate Google Meet URL if provided
  if (input.google_meet_url && !isValidGoogleMeetUrl(input.google_meet_url)) {
    throw new Error('Invalid Google Meet URL. URL must be in format: https://meet.google.com/xxx-xxxx-xxx');
  }

  const { data, error } = await supabase
    .from('live_sessions')
    .insert({
      ...input,
      created_by: createdBy,
      status: 'scheduled'
    })
    .select()
    .single();

  if (error) throw error;
  return data as LiveSession;
}

// Faculty: Update a session
export async function updateSession(sessionId: string, input: UpdateSessionInput): Promise<LiveSession> {
  // Validate Google Meet URL if provided
  if (input.google_meet_url && !isValidGoogleMeetUrl(input.google_meet_url)) {
    throw new Error('Invalid Google Meet URL. URL must be in format: https://meet.google.com/xxx-xxxx-xxx');
  }

  const { data, error } = await supabase
    .from('live_sessions')
    .update(input)
    .eq('id', sessionId)
    .select()
    .single();

  if (error) throw error;
  return data as LiveSession;
}

// Faculty: Start session (set status to live)
export async function startSession(sessionId: string): Promise<LiveSession> {
  return updateSession(sessionId, { status: 'live' });
}

// Faculty: Complete session
export async function completeSession(sessionId: string, unlockSlides = false, unlockMaterials = false): Promise<LiveSession> {
  return updateSession(sessionId, {
    status: 'completed',
    slides_unlocked: unlockSlides,
    materials_unlocked: unlockMaterials
  });
}

// Faculty: Cancel session
export async function cancelSession(sessionId: string): Promise<LiveSession> {
  return updateSession(sessionId, { status: 'cancelled' });
}

// Faculty: Get session attendance
export async function getSessionAttendance(sessionId: string): Promise<SessionAttendance[]> {
  const { data, error } = await supabase
    .from('session_attendance')
    .select(`
      *,
      student:profiles!session_attendance_student_id_fkey(id, full_name, email, avatar_url)
    `)
    .eq('session_id', sessionId);

  if (error) throw error;
  return (data || []) as SessionAttendance[];
}

// Faculty: Mark student attendance
export async function markAttendance(
  sessionId: string,
  studentId: string,
  status: 'attended' | 'absent' | 'excused',
  markedBy: string
): Promise<SessionAttendance> {
  const { data, error } = await supabase
    .from('session_attendance')
    .update({
      attendance_status: status,
      marked_by: markedBy,
      joined_at: status === 'attended' ? new Date().toISOString() : null
    })
    .eq('session_id', sessionId)
    .eq('student_id', studentId)
    .select()
    .single();

  if (error) throw error;
  return data as SessionAttendance;
}

// Faculty: Add session resource
export async function addSessionResource(
  sessionId: string,
  resource: {
    title: string;
    resource_type: SessionResource['resource_type'];
    file_url?: string;
    external_url?: string;
    content?: string;
    is_locked?: boolean;
  }
): Promise<SessionResource> {
  const { data, error } = await supabase
    .from('session_resources')
    .insert({
      session_id: sessionId,
      ...resource,
      is_locked: resource.is_locked ?? true
    })
    .select()
    .single();

  if (error) throw error;
  return data as SessionResource;
}

// Faculty: Update session resource
export async function updateSessionResource(
  resourceId: string,
  updates: Partial<SessionResource>
): Promise<SessionResource> {
  const { data, error } = await supabase
    .from('session_resources')
    .update(updates)
    .eq('id', resourceId)
    .select()
    .single();

  if (error) throw error;
  return data as SessionResource;
}

// Faculty: Delete session resource
export async function deleteSessionResource(resourceId: string): Promise<void> {
  const { error } = await supabase
    .from('session_resources')
    .delete()
    .eq('id', resourceId);

  if (error) throw error;
}

// Admin: Get all sessions
export async function getAllSessions(filters?: {
  courseId?: string;
  status?: string;
  fromDate?: string;
  toDate?: string;
}): Promise<SessionWithDetails[]> {
  let query = supabase
    .from('live_sessions')
    .select(`
      *,
      course:courses(id, title, slug),
      faculty:profiles!live_sessions_created_by_fkey(id, full_name, avatar_url)
    `);

  if (filters?.courseId) {
    query = query.eq('course_id', filters.courseId);
  }
  if (filters?.status) {
    query = query.eq('status', filters.status);
  }
  if (filters?.fromDate) {
    query = query.gte('session_date', filters.fromDate);
  }
  if (filters?.toDate) {
    query = query.lte('session_date', filters.toDate);
  }

  const { data, error } = await query.order('session_date', { ascending: false });

  if (error) throw error;
  return (data || []) as SessionWithDetails[];
}

// Admin: Delete session
export async function deleteSession(sessionId: string): Promise<void> {
  const { error } = await supabase
    .from('live_sessions')
    .delete()
    .eq('id', sessionId);

  if (error) throw error;
}

// Get session statistics
export async function getSessionStats(): Promise<{
  scheduled: number;
  live: number;
  completed: number;
  cancelled: number;
  totalAttendance: number;
  attendedCount: number;
}> {
  const { data: sessions } = await supabase
    .from('live_sessions')
    .select('status');

  const { data: attendance } = await supabase
    .from('session_attendance')
    .select('attendance_status');

  const sessionStats = (sessions || []).reduce((acc, s) => {
    acc[s.status as keyof typeof acc] = (acc[s.status as keyof typeof acc] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const attendedCount = (attendance || []).filter(a => a.attendance_status === 'attended').length;

  return {
    scheduled: sessionStats.scheduled || 0,
    live: sessionStats.live || 0,
    completed: sessionStats.completed || 0,
    cancelled: sessionStats.cancelled || 0,
    totalAttendance: attendance?.length || 0,
    attendedCount
  };
}

// Check if session is joinable (live or within 15 minutes of start)
export function isSessionJoinable(session: LiveSession): boolean {
  const now = new Date();
  const sessionStart = new Date(session.session_date);
  const sessionEnd = new Date(sessionStart.getTime() + session.duration_minutes * 60000);

  if (session.status === 'live') return true;
  if (session.status !== 'scheduled') return false;

  // Can join 15 minutes before scheduled time
  const joinWindowStart = new Date(sessionStart.getTime() - 15 * 60000);
  return now >= joinWindowStart && now <= sessionEnd;
}

// Get relative time until session
export function getTimeUntilSession(session: LiveSession): string {
  const now = new Date();
  const sessionDate = new Date(session.session_date);
  const diff = sessionDate.getTime() - now.getTime();

  if (diff < 0) return 'Past';

  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `In ${days} day${days > 1 ? 's' : ''}`;
  if (hours > 0) return `In ${hours} hour${hours > 1 ? 's' : ''}`;
  if (minutes > 0) return `In ${minutes} minute${minutes > 1 ? 's' : ''}`;
  return 'Starting soon';
}
