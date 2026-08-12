import { supabase } from '../lib/supabase';
import type {
  Batch,
  BatchFaculty,
  BatchSchedule,
  Course,
  FacultyBatchAssignment,
  FacultyTeachingWork,
  FacultyWorkPreference,
  FacultyWorkRequest,
  FacultyWorkRequestType,
  TeachingWorkMode,
  TeachingWorkStatus,
} from '../types/database';

type TeachingWorkInput = {
  faculty_id: string;
  batch_id: string | null;
  course_id: string | null;
  lesson_id?: string | null;
  title: string;
  description?: string | null;
  scheduled_date: string;
  start_time: string;
  end_time: string;
  delivery_mode: TeachingWorkMode;
  notes?: string | null;
  created_by: string;
};

export async function getFacultyBatchAssignments(facultyId: string): Promise<FacultyBatchAssignment[]> {
  const { data, error } = await supabase
    .from('batch_faculty')
    .select('*, batch:batches(*, course:courses(*))')
    .eq('faculty_id', facultyId)
    .order('assigned_at', { ascending: false });
  if (error) throw error;

  const assignments = (data ?? []) as (BatchFaculty & { batch: Batch & { course?: Course } })[];
  const batchIds = assignments.map(item => item.batch_id);
  if (!batchIds.length) return [];

  const [studentsResult, facultyResult, schedulesResult] = await Promise.all([
    supabase.from('batch_students').select('batch_id').in('batch_id', batchIds).eq('status', 'active'),
    supabase.from('batch_faculty').select('batch_id').in('batch_id', batchIds),
    supabase.from('batch_schedules').select('*').in('batch_id', batchIds).eq('is_active', true).order('day_of_week'),
  ]);

  if (studentsResult.error) throw studentsResult.error;
  if (facultyResult.error) throw facultyResult.error;
  if (schedulesResult.error) throw schedulesResult.error;

  const studentCounts: Record<string, number> = {};
  const facultyCounts: Record<string, number> = {};
  const schedules: Record<string, BatchSchedule[]> = {};
  for (const row of studentsResult.data ?? []) studentCounts[row.batch_id] = (studentCounts[row.batch_id] ?? 0) + 1;
  for (const row of facultyResult.data ?? []) facultyCounts[row.batch_id] = (facultyCounts[row.batch_id] ?? 0) + 1;
  for (const row of (schedulesResult.data ?? []) as BatchSchedule[]) {
    schedules[row.batch_id] = [...(schedules[row.batch_id] ?? []), row];
  }

  return assignments.map(item => ({
    ...item,
    student_count: studentCounts[item.batch_id] ?? 0,
    faculty_count: facultyCounts[item.batch_id] ?? 0,
    schedules: schedules[item.batch_id] ?? [],
  }));
}

export async function getFacultyTeachingWork(facultyId: string): Promise<FacultyTeachingWork[]> {
  const { data, error } = await supabase
    .from('faculty_teaching_work')
    .select('*, batch:batches(*), course:courses(*), lesson:lessons(*)')
    .eq('faculty_id', facultyId)
    .order('scheduled_date')
    .order('start_time');
  if (error) throw error;
  return (data ?? []) as FacultyTeachingWork[];
}

export async function getFacultyWorkRequests(facultyId: string): Promise<FacultyWorkRequest[]> {
  const { data, error } = await supabase
    .from('faculty_work_requests')
    .select('*, batch:batches(*), course:courses(*)')
    .eq('faculty_id', facultyId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as FacultyWorkRequest[];
}

export async function getFacultyWorkPreference(facultyId: string): Promise<FacultyWorkPreference> {
  const { data, error } = await supabase
    .from('faculty_work_preferences')
    .select('*')
    .eq('faculty_id', facultyId)
    .maybeSingle();
  if (error) throw error;
  return (data as FacultyWorkPreference | null) ?? {
    faculty_id: facultyId,
    daily_workload_limit_minutes: 480,
    created_at: '',
    updated_at: '',
  };
}

export async function createFacultyTeachingWork(input: TeachingWorkInput): Promise<FacultyTeachingWork> {
  const { data, error } = await supabase
    .from('faculty_teaching_work')
    .insert({ ...input, source: 'faculty', status: 'scheduled', updated_by: input.created_by })
    .select('*, batch:batches(*), course:courses(*), lesson:lessons(*)')
    .single();
  if (error) throw error;
  return data as FacultyTeachingWork;
}

export async function updateFacultyTeachingWork(
  id: string,
  facultyId: string,
  updates: Partial<Pick<FacultyTeachingWork, 'delivery_mode' | 'status' | 'recording_url' | 'notes' | 'title'>>,
): Promise<void> {
  const payload: Record<string, unknown> = { ...updates, updated_by: facultyId };
  if (updates.status === 'completed') payload.completed_at = new Date().toISOString();
  const { error } = await supabase.from('faculty_teaching_work').update(payload).eq('id', id).eq('faculty_id', facultyId);
  if (error) throw error;
}

export async function deleteFacultyTeachingWork(id: string, facultyId: string): Promise<void> {
  const { error } = await supabase.from('faculty_teaching_work').delete().eq('id', id).eq('faculty_id', facultyId);
  if (error) throw error;
}

export async function createFacultyWorkRequest(input: {
  faculty_id: string;
  batch_id: string | null;
  course_id: string | null;
  request_type: FacultyWorkRequestType;
  details: string;
  requested_date: string | null;
}): Promise<void> {
  const { error } = await supabase.from('faculty_work_requests').insert(input);
  if (error) throw error;
}

export function workDurationMinutes(work: Pick<FacultyTeachingWork, 'start_time' | 'end_time'>): number {
  const [startHour, startMinute] = work.start_time.split(':').map(Number);
  const [endHour, endMinute] = work.end_time.split(':').map(Number);
  return Math.max(0, endHour * 60 + endMinute - startHour * 60 - startMinute);
}

export const TEACHING_MODE_LABELS: Record<TeachingWorkMode, string> = {
  live_class: 'Live class',
  recorded_video: 'Recorded class',
  hybrid: 'Hybrid',
};

export const TEACHING_STATUS_LABELS: Record<TeachingWorkStatus, string> = {
  scheduled: 'Scheduled',
  in_progress: 'In progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
};
