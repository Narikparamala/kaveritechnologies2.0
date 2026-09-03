import { supabase } from '../lib/supabase';
import type { Course, Chapter, Lesson, CourseEnrollment } from '../types/database';

export async function getPublishedCourses() {
  const { data, error } = await supabase
    .from('courses')
    .select('*')
    .eq('is_published', true)
    .order('enrollment_count', { ascending: false });
  if (error) throw error;
  return (data ?? []) as Course[];
}
export async function getCourseBySlug(slug: string) {
  const { data, error } = await supabase
    .from('courses')
    .select('*')
    .eq('slug', slug)
    .maybeSingle();
  if (error) throw error;
  return data as Course | null;
}

export async function getCourseChapters(courseId: string) {
  const { data, error } = await supabase
    .from('chapters')
    .select('*')
    .eq('course_id', courseId)
    .eq('is_published', true)
    .order('order_index');
  if (error) throw error;
  return (data ?? []) as Chapter[];
}

export async function getChapterLessons(chapterId: string) {
  const { data, error } = await supabase
    .from('lessons')
    .select('*')
    .eq('chapter_id', chapterId)
    .eq('is_published', true)
    .order('order_index');
  if (error) throw error;
  return (data ?? []) as Lesson[];
}

export async function getCourseLessons(courseId: string) {
  const { data, error } = await supabase
    .from('lessons')
    .select('*')
    .eq('course_id', courseId)
    .eq('is_published', true)
    .order('order_index');
  if (error) throw error;
  return (data ?? []) as Lesson[];
}

export async function getStudentEnrollments(studentId: string) {
  const { data, error } = await supabase
    .from('course_enrollments')
    .select('*, course:courses(*)')
    .eq('student_id', studentId)
    .order('enrolled_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as (CourseEnrollment & { course: Course })[];
}

export async function enrollStudent(courseId: string, studentId: string) {
  const { data, error } = await supabase
    .from('course_enrollments')
    .insert({
      course_id: courseId,
      student_id: studentId,
      enrollment_source: 'free_enrollment',
      access_status: 'active',
    })
    .select()
    .maybeSingle();
  if (error) {
    if (error.code === '23505') return { data: null, error: 'Already enrolled in this course.' };
    return { data: null, error: error.message };
  }
  return { data, error: null };
}

export async function getEnrollment(courseId: string, studentId: string) {
  const { data } = await supabase
    .from('course_enrollments')
    .select('*')
    .eq('course_id', courseId)
    .eq('student_id', studentId)
    .maybeSingle();
  return data as CourseEnrollment | null;
}
