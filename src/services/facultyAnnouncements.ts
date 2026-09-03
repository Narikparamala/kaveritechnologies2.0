import { supabase } from '../lib/supabase';
import type { Announcement, Batch, Course, Profile } from '../types/database';

export type AnnouncementAudience = 'platform' | 'all_students' | 'course' | 'batch';
export type AnnouncementStatus = 'draft' | 'published' | 'scheduled' | 'archived';
export type AnnouncementPriority = 'normal' | 'important' | 'urgent';

export interface AnnouncementRead {
  announcement_id: string;
  user_id: string;
  read_at: string;
  reader?: Pick<Profile, 'id' | 'full_name' | 'email' | 'avatar_url'>;
}

export interface FacultyAnnouncement extends Announcement {
  batch_id: string | null;
  audience_type: AnnouncementAudience;
  status: AnnouncementStatus;
  priority: AnnouncementPriority;
  publish_at: string | null;
  published_at: string | null;
  expires_at: string | null;
  is_pinned: boolean;
  course?: Pick<Course, 'id' | 'title'> | null;
  batch?: Pick<Batch, 'id' | 'name'> | null;
  reads?: AnnouncementRead[];
}

export interface FacultyAnnouncementTarget {
  id: string;
  name: string;
  course_id: string | null;
  course_title: string | null;
}

export interface AnnouncementInput {
  title: string;
  content: string;
  audience_type: AnnouncementAudience;
  course_id: string | null;
  batch_id: string | null;
  status: AnnouncementStatus;
  priority: AnnouncementPriority;
  publish_at: string | null;
  published_at: string | null;
  expires_at: string | null;
  is_pinned: boolean;
}

export async function getFacultyAnnouncementSetup(facultyId: string, isAdmin = false) {
  if (isAdmin) {
    const [courseResult, batchResult] = await Promise.all([
      supabase.from('courses').select('id, title').order('title'),
      supabase.from('batches').select('id, name, course_id, course:courses(title)').order('name'),
    ]);
    if (courseResult.error) throw courseResult.error;
    if (batchResult.error) throw batchResult.error;

    return {
      courses: (courseResult.data ?? []) as Pick<Course, 'id' | 'title'>[],
      batches: (batchResult.data ?? []).map(row => ({
        id: row.id,
        name: row.name,
        course_id: row.course_id,
        course_title: (row.course as unknown as { title?: string } | null)?.title ?? null,
      })),
    };
  }

  const [courseAssignments, batchAssignments] = await Promise.all([
    supabase
      .from('course_faculty')
      .select('course:courses(id, title)')
      .eq('faculty_id', facultyId),
    supabase
      .from('batch_faculty')
      .select('batch:batches(id, name, course_id, course:courses(title))')
      .eq('faculty_id', facultyId),
  ]);

  if (courseAssignments.error) throw courseAssignments.error;
  if (batchAssignments.error) throw batchAssignments.error;

  const courses = (courseAssignments.data ?? [])
    .map(row => row.course as unknown as Pick<Course, 'id' | 'title'> | null)
    .filter((course): course is Pick<Course, 'id' | 'title'> => Boolean(course));

  const batchRows = (batchAssignments.data ?? [])
    .map(row => row.batch as unknown as {
      id: string;
      name: string;
      course_id: string | null;
      course?: { title: string } | null;
    } | null);
  const batches = batchRows
    .filter((batch): batch is NonNullable<(typeof batchRows)[number]> => Boolean(batch))
    .map(batch => ({
      id: batch.id,
      name: batch.name,
      course_id: batch.course_id,
      course_title: batch.course?.title ?? null,
    }));

  return { courses, batches };
}

export async function getFacultyAnnouncements(facultyId: string, isAdmin = false): Promise<FacultyAnnouncement[]> {
  let query = supabase
    .from('announcements')
    .select(`
      *,
      course:courses(id, title),
      batch:batches(id, name),
      reads:announcement_reads(
        announcement_id,
        user_id,
        read_at,
        reader:profiles!announcement_reads_user_id_fkey(id, full_name, email, avatar_url)
      )
    `);
  if (!isAdmin) query = query.eq('author_id', facultyId);
  const { data, error } = await query
    .order('is_pinned', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data ?? []) as unknown as FacultyAnnouncement[];
}

export async function createFacultyAnnouncement(facultyId: string, input: AnnouncementInput) {
  const { data, error } = await supabase
    .from('announcements')
    .insert({
      ...input,
      author_id: facultyId,
      is_global: input.audience_type === 'platform',
    })
    .select('id')
    .single();
  if (error) throw error;
  return data.id as string;
}

export async function updateFacultyAnnouncement(
  id: string,
  facultyId: string,
  input: AnnouncementInput,
  isAdmin = false,
) {
  let query = supabase
    .from('announcements')
    .update({ ...input, is_global: input.audience_type === 'platform' })
    .eq('id', id);
  if (!isAdmin) query = query.eq('author_id', facultyId);
  const { error } = await query;
  if (error) throw error;
}

export async function updateFacultyAnnouncementStatus(
  id: string,
  facultyId: string,
  status: AnnouncementStatus,
  isAdmin = false,
) {
  const now = new Date().toISOString();
  const values: Record<string, string | null> = { status };
  if (status === 'published') {
    values.publish_at = now;
    values.published_at = now;
  }
  let query = supabase
    .from('announcements')
    .update(values)
    .eq('id', id);
  if (!isAdmin) query = query.eq('author_id', facultyId);
  const { error } = await query;
  if (error) throw error;
}

export async function deleteFacultyAnnouncement(id: string, facultyId: string, isAdmin = false) {
  let query = supabase
    .from('announcements')
    .delete()
    .eq('id', id);
  if (!isAdmin) query = query.eq('author_id', facultyId);
  const { error } = await query;
  if (error) throw error;
}
