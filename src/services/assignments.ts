import { supabase } from '../lib/supabase';
import type {
  Assignment, AssignmentQuestion, AssignmentTestCase,
  AssignmentSubmission, AssignmentQuestionSubmission,
  Course, Profile
} from '../types/database';

// ============================================================
// Assignment CRUD
// ============================================================

export async function getFacultyAssignments(facultyId: string): Promise<(Assignment & { course: Course })[]> {
  const { data: cf } = await supabase.from('course_faculty').select('course_id').eq('faculty_id', facultyId);
  const courseIds = (cf ?? []).map((c: any) => c.course_id);
  if (!courseIds.length) return [];

  const { data, error } = await supabase
    .from('assignments')
    .select('*, course:courses(*)')
    .in('course_id', courseIds)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as any;
}

export async function getStudentAssignments(studentId: string): Promise<(Assignment & { course: Course; submission: AssignmentSubmission | null })[]> {
  const { data: enrData } = await supabase.from('course_enrollments')
    .select('course_id').eq('student_id', studentId).eq('access_status', 'active');
  const courseIds = (enrData ?? []).map((e: any) => e.course_id);
  if (!courseIds.length) return [];

  const [{ data: asgData }, { data: subData }] = await Promise.all([
    supabase.from('assignments').select('*, course:courses(*)').in('course_id', courseIds).eq('is_published', true).order('due_date', { ascending: true }),
    supabase.from('assignment_submissions').select('*').eq('student_id', studentId),
  ]);

  const subMap = new Map((subData ?? []).map((s: any) => [s.assignment_id, s]));
  return (asgData ?? []).map((a: any) => ({ ...a, submission: subMap.get(a.id) ?? null })) as any;
}

export async function getAssignmentById(id: string): Promise<Assignment & { course: Course } | null> {
  const { data, error } = await supabase
    .from('assignments')
    .select('*, course:courses(*)')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data as any;
}

export async function createAssignment(input: Partial<Assignment>): Promise<Assignment> {
  const { data, error } = await supabase
    .from('assignments')
    .insert(input)
    .select()
    .single();
  if (error) throw error;
  return data as Assignment;
}

export async function updateAssignment(id: string, updates: Partial<Assignment>): Promise<void> {
  const { error } = await supabase
    .from('assignments')
    .update(updates)
    .eq('id', id);
  if (error) throw error;
}

export async function deleteAssignment(id: string): Promise<void> {
  const { error } = await supabase
    .from('assignments')
    .delete()
    .eq('id', id);
  if (error) throw error;
}

// ============================================================
// Question CRUD
// ============================================================

export async function getAssignmentQuestions(assignmentId: string): Promise<AssignmentQuestion[]> {
  const { data, error } = await supabase
    .from('assignment_questions')
    .select('*')
    .eq('assignment_id', assignmentId)
    .order('order_index');
  if (error) throw error;
  return (data ?? []) as AssignmentQuestion[];
}

export async function createAssignmentQuestion(input: Partial<AssignmentQuestion>): Promise<AssignmentQuestion> {
  const { data, error } = await supabase
    .from('assignment_questions')
    .insert(input)
    .select()
    .single();
  if (error) throw error;
  return data as AssignmentQuestion;
}

export async function updateAssignmentQuestion(id: string, updates: Partial<AssignmentQuestion>): Promise<void> {
  const { error } = await supabase
    .from('assignment_questions')
    .update(updates)
    .eq('id', id);
  if (error) throw error;
}

export async function deleteAssignmentQuestion(id: string): Promise<void> {
  const { error } = await supabase
    .from('assignment_questions')
    .delete()
    .eq('id', id);
  if (error) throw error;
}

// ============================================================
// Test Case CRUD
// ============================================================

export async function getTestCases(assignmentId: string, questionId?: string, includeHidden: boolean = true): Promise<AssignmentTestCase[]> {
  let query = supabase.from('assignment_test_cases').select('*').eq('assignment_id', assignmentId);
  if (questionId) query = query.eq('question_id', questionId);
  if (!includeHidden) query = query.eq('is_hidden', false);
  
  const { data, error } = await query.order('order_index');
  if (error) throw error;
  return (data ?? []) as AssignmentTestCase[];
}

export async function createTestCase(input: Partial<AssignmentTestCase>): Promise<AssignmentTestCase> {
  const { data, error } = await supabase
    .from('assignment_test_cases')
    .insert(input)
    .select()
    .single();
  if (error) throw error;
  return data as AssignmentTestCase;
}

export async function updateTestCase(id: string, updates: Partial<AssignmentTestCase>): Promise<void> {
  const { error } = await supabase
    .from('assignment_test_cases')
    .update(updates)
    .eq('id', id);
  if (error) throw error;
}

export async function deleteTestCase(id: string): Promise<void> {
  const { error } = await supabase
    .from('assignment_test_cases')
    .delete()
    .eq('id', id);
  if (error) throw error;
}

// ============================================================
// Submission CRUD
// ============================================================

export async function getAssignmentSubmissions(assignmentId: string): Promise<(AssignmentSubmission & { student_profile: Profile })[]> {
  const { data, error } = await supabase
    .from('assignment_submissions')
    .select('*, student_profile:profiles!assignment_submissions_student_id_fkey(*)')
    .eq('assignment_id', assignmentId)
    .order('submitted_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as any;
}

export async function getStudentSubmission(assignmentId: string, studentId: string): Promise<AssignmentSubmission | null> {
  const { data, error } = await supabase
    .from('assignment_submissions')
    .select('*')
    .eq('assignment_id', assignmentId)
    .eq('student_id', studentId)
    .maybeSingle();
  if (error) throw error;
  return data as AssignmentSubmission | null;
}

export async function getQuestionSubmissions(submissionId: string): Promise<AssignmentQuestionSubmission[]> {
  const { data, error } = await supabase
    .from('assignment_question_submissions')
    .select('*')
    .eq('submission_id', submissionId);
  if (error) throw error;
  return (data ?? []) as AssignmentQuestionSubmission[];
}

export async function saveQuestionSubmission(input: Partial<AssignmentQuestionSubmission>): Promise<void> {
  const { error } = await supabase
    .from('assignment_question_submissions')
    .upsert(input, { onConflict: 'submission_id,question_id' });
  if (error) throw error;
}

export async function createSubmission(assignmentId: string, studentId: string): Promise<AssignmentSubmission> {
  const { data, error } = await supabase
    .from('assignment_submissions')
    .insert({
      assignment_id: assignmentId,
      student_id: studentId,
      status: 'draft',
      submission_number: 1
    })
    .select()
    .single();
  if (error) throw error;
  return data as AssignmentSubmission;
}

export async function submitAssignment(submissionId: string): Promise<void> {
  const { error } = await supabase
    .from('assignment_submissions')
    .update({
      status: 'submitted',
      submitted_at: new Date().toISOString()
    })
    .eq('id', submissionId);
  if (error) throw error;
}

export async function gradeSubmission(submissionId: string, score: number, feedback: string, gradedBy: string): Promise<void> {
  const { error } = await supabase
    .from('assignment_submissions')
    .update({
      score,
      feedback,
      status: 'graded',
      graded_by: gradedBy,
      graded_at: new Date().toISOString()
    })
    .eq('id', submissionId);
  if (error) throw error;
}

export async function gradeQuestionSubmission(id: string, marks: number, feedback: string): Promise<void> {
  const { error } = await supabase
    .from('assignment_question_submissions')
    .update({
      marks_awarded: marks,
      feedback
    })
    .eq('id', id);
  if (error) throw error;
}
