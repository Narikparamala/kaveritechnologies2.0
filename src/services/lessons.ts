import { supabase } from '../lib/supabase';
import type { Lesson, LessonProgress, LessonNote, LessonBookmark, LessonResource } from '../types/database';

export interface LessonCompletionResult {
  progress: LessonProgress;
  courseProgress: number;
  xpAwarded: number;
  totalXp: number;
  level: number;
  certificateIssued: boolean;
}

export async function getLessonById(lessonId: string) {
  const { data, error } = await supabase
    .from('lessons')
    .select('*')
    .eq('id', lessonId)
    .maybeSingle();
  if (error) throw error;
  return data as Lesson | null;
}

export async function getLessonProgress(lessonId: string, studentId: string) {
  const { data } = await supabase
    .from('lesson_progress')
    .select('*')
    .eq('lesson_id', lessonId)
    .eq('student_id', studentId)
    .maybeSingle();
  return data as LessonProgress | null;
}

export async function markLessonComplete(lessonId: string): Promise<LessonCompletionResult> {
  const { data, error } = await supabase.rpc('complete_lesson', { p_lesson_id: lessonId });
  if (error) throw error;
  if (!data || typeof data !== 'object') throw new Error('Lesson completion did not return a result.');

  const result = data as {
    progress: LessonProgress;
    course_progress: number | string;
    xp_awarded: number;
    total_xp: number;
    level: number;
    certificate_issued: boolean;
  };
  return {
    progress: result.progress,
    courseProgress: Number(result.course_progress),
    xpAwarded: result.xp_awarded,
    totalXp: result.total_xp,
    level: result.level,
    certificateIssued: result.certificate_issued,
  };
}

export async function getLessonNotes(lessonId: string, studentId: string) {
  const { data } = await supabase
    .from('lesson_notes')
    .select('*')
    .eq('lesson_id', lessonId)
    .eq('student_id', studentId)
    .maybeSingle();
  return data as LessonNote | null;
}

export async function saveNote(lessonId: string, studentId: string, content: string, existingId?: string) {
  if (existingId) {
    const { data, error } = await supabase
      .from('lesson_notes')
      .update({ content })
      .eq('id', existingId)
      .select()
      .maybeSingle();
    if (error) throw error;
    return data as LessonNote | null;
  } else {
    const { data, error } = await supabase
      .from('lesson_notes')
      .insert({ lesson_id: lessonId, student_id: studentId, content })
      .select()
      .maybeSingle();
    if (error) throw error;
    return data as LessonNote | null;
  }
}

export async function getBookmark(lessonId: string, studentId: string) {
  const { data } = await supabase
    .from('lesson_bookmarks')
    .select('*')
    .eq('lesson_id', lessonId)
    .eq('student_id', studentId)
    .maybeSingle();
  return data as LessonBookmark | null;
}

export async function toggleBookmark(lessonId: string, studentId: string, isBookmarked: boolean) {
  if (isBookmarked) {
    await supabase.from('lesson_bookmarks').delete().eq('lesson_id', lessonId).eq('student_id', studentId);
    return false;
  } else {
    await supabase.from('lesson_bookmarks').insert({ lesson_id: lessonId, student_id: studentId });
    return true;
  }
}

export async function getLessonResources(lessonId: string) {
  const { data } = await supabase
    .from('lesson_resources')
    .select('*')
    .eq('lesson_id', lessonId);
  return (data ?? []) as LessonResource[];
}

export async function getAllNotes(studentId: string) {
  const { data, error } = await supabase
    .from('lesson_notes')
    .select('*, lesson:lessons(title, id)')
    .eq('student_id', studentId)
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function getAllBookmarks(studentId: string) {
  const { data, error } = await supabase
    .from('lesson_bookmarks')
    .select('*, lesson:lessons(title, id, course_id)')
    .eq('student_id', studentId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function getStudentCompletedCount(studentId: string) {
  const { data } = await supabase
    .from('lesson_progress')
    .select('id')
    .eq('student_id', studentId)
    .eq('completed', true);
  return data?.length ?? 0;
}
