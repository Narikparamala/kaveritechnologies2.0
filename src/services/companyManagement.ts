import { supabase } from '../lib/supabase';
import { setPlatformUserRole } from './userAdministration';
import type {
  FacultyEmployment, FacultyCompensationHistory, FacultyPerformanceReview,
  StudentSupportRecord, Profile, Course, CourseEnrollment, CourseFaculty,
  AssignmentSubmission, LessonProgress, LiveSession, SessionAttendance
} from '../types/database';

// ============================================================
// FACULTY EMPLOYMENT SERVICES
// ============================================================

export async function getFacultyEmployment(facultyId: string): Promise<FacultyEmployment | null> {
  const { data, error } = await supabase
    .from('faculty_employment')
    .select('*, faculty:profiles!faculty_employment_faculty_id_fkey(*), manager:profiles!faculty_employment_manager_id_fkey(*)')
    .eq('faculty_id', facultyId)
    .maybeSingle();
  if (error) throw error;
  return data as FacultyEmployment | null;
}

export async function getAllFacultyEmployment(): Promise<FacultyEmployment[]> {
  const { data, error } = await supabase
    .from('faculty_employment')
    .select('*, faculty:profiles!faculty_employment_faculty_id_fkey(*), manager:profiles!faculty_employment_manager_id_fkey(*)')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as FacultyEmployment[];
}

export async function createFacultyEmployment(input: {
  faculty_id: string;
  employee_code?: string;
  employment_status?: 'active' | 'probation' | 'on_leave' | 'inactive' | 'terminated';
  joining_date?: string;
  department?: string;
  designation?: string;
  manager_id?: string;
  base_salary?: number;
  salary_currency?: string;
  payment_frequency?: 'monthly' | 'bi_weekly' | 'weekly';
  bank_details_masked?: string;
  benefits?: Record<string, any>[];
  notes?: string;
}): Promise<FacultyEmployment> {
  const { data, error } = await supabase
    .from('faculty_employment')
    .insert(input)
    .select('*, faculty:profiles!faculty_employment_faculty_id_fkey(*)')
    .single();
  if (error) throw error;
  return data as FacultyEmployment;
}

type FacultyEmploymentUpdate = Partial<Pick<
  FacultyEmployment,
  | 'employee_code'
  | 'employment_status'
  | 'joining_date'
  | 'department'
  | 'designation'
  | 'manager_id'
  | 'base_salary'
  | 'salary_currency'
  | 'payment_frequency'
  | 'bank_details_masked'
  | 'benefits'
  | 'notes'
>>;

export async function updateFacultyEmployment(
  facultyId: string,
  input: FacultyEmploymentUpdate,
): Promise<FacultyEmployment> {
  const { data, error } = await supabase
    .from('faculty_employment')
    .update(input)
    .eq('faculty_id', facultyId)
    .select('*, faculty:profiles!faculty_employment_faculty_id_fkey(*)')
    .single();
  if (error) throw error;
  return data as FacultyEmployment;
}

// ============================================================
// COMPENSATION HISTORY SERVICES
// ============================================================

export async function getFacultyCompensationHistory(facultyId: string): Promise<FacultyCompensationHistory[]> {
  const { data, error } = await supabase
    .from('faculty_compensation_history')
    .select('*, faculty:profiles!faculty_compensation_history_faculty_id_fkey(*), created_by_profile:profiles!faculty_compensation_history_created_by_fkey(*)')
    .eq('faculty_id', facultyId)
    .order('effective_date', { ascending: false });
  if (error) throw error;
  return (data ?? []) as FacultyCompensationHistory[];
}

export async function addCompensationRecord(input: {
  faculty_id: string;
  change_type: 'salary' | 'incentive' | 'hike' | 'bonus' | 'deduction' | 'benefit';
  amount?: number;
  percentage?: number;
  effective_date: string;
  reason?: string;
}): Promise<FacultyCompensationHistory> {
  const { data, error } = await supabase
    .from('faculty_compensation_history')
    .insert(input)
    .select('*')
    .single();
  if (error) throw error;
  return data as FacultyCompensationHistory;
}

// ============================================================
// PERFORMANCE REVIEW SERVICES
// ============================================================

export async function getFacultyPerformanceReviews(facultyId: string): Promise<FacultyPerformanceReview[]> {
  const { data, error } = await supabase
    .from('faculty_performance_reviews')
    .select('*, faculty:profiles!faculty_performance_reviews_faculty_id_fkey(*), reviewer:profiles!faculty_performance_reviews_reviewer_id_fkey(*)')
    .eq('faculty_id', facultyId)
    .order('review_date', { ascending: false });
  if (error) throw error;
  return (data ?? []) as FacultyPerformanceReview[];
}

export async function addPerformanceReview(input: {
  faculty_id: string;
  reviewer_id: string;
  review_period: string;
  rating?: number;
  strengths?: string;
  improvements?: string;
  goals?: string;
  review_date: string;
}): Promise<FacultyPerformanceReview> {
  const { data, error } = await supabase
    .from('faculty_performance_reviews')
    .insert(input)
    .select('*')
    .single();
  if (error) throw error;
  return data as FacultyPerformanceReview;
}

// ============================================================
// STUDENT SUPPORT RECORDS SERVICES
// ============================================================

export async function getStudentSupportRecords(studentId: string): Promise<StudentSupportRecord[]> {
  const { data, error } = await supabase
    .from('student_support_records')
    .select('*, student:profiles!student_support_records_student_id_fkey(*), faculty:profiles!student_support_records_faculty_id_fkey(*)')
    .eq('student_id', studentId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as StudentSupportRecord[];
}

export async function getAllSupportRecords(filters?: {
  status?: 'open' | 'in_progress' | 'resolved';
  category?: 'academic' | 'attendance' | 'behavior' | 'payment' | 'general';
}): Promise<StudentSupportRecord[]> {
  let query = supabase
    .from('student_support_records')
    .select('*, student:profiles!student_support_records_student_id_fkey(*), faculty:profiles!student_support_records_faculty_id_fkey(*)')
    .order('created_at', { ascending: false });

  if (filters?.status) query = query.eq('status', filters.status);
  if (filters?.category) query = query.eq('category', filters.category);

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as StudentSupportRecord[];
}

export async function createSupportRecord(input: {
  student_id: string;
  faculty_id?: string;
  category: 'academic' | 'attendance' | 'behavior' | 'payment' | 'general';
  status?: 'open' | 'in_progress' | 'resolved';
  priority?: 'low' | 'medium' | 'high';
  notes: string;
}): Promise<StudentSupportRecord> {
  const { data, error } = await supabase
    .from('student_support_records')
    .insert(input)
    .select('*, student:profiles!student_support_records_student_id_fkey(*), faculty:profiles!student_support_records_faculty_id_fkey(*)')
    .single();
  if (error) throw error;
  return data as StudentSupportRecord;
}

export async function updateSupportRecord(id: string, input: Partial<{
  faculty_id: string;
  status: 'open' | 'in_progress' | 'resolved';
  priority: 'low' | 'medium' | 'high';
  notes: string;
}>): Promise<StudentSupportRecord> {
  const { data, error } = await supabase
    .from('student_support_records')
    .update(input)
    .eq('id', id)
    .select('*, student:profiles!student_support_records_student_id_fkey(*), faculty:profiles!student_support_records_faculty_id_fkey(*)')
    .single();
  if (error) throw error;
  return data as StudentSupportRecord;
}

// ============================================================
// FACULTY MANAGEMENT UTILITIES
// ============================================================

export async function getFacultyWithDetails(facultyId: string): Promise<{
  profile: Profile;
  employment: FacultyEmployment | null;
  courses: (CourseFaculty & { course: Course })[];
  recentReviews: FacultyPerformanceReview[];
}> {
  const [profileRes, employmentRes, coursesRes, reviewsRes] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', facultyId).single(),
    getFacultyEmployment(facultyId),
    supabase.from('course_faculty').select('*, course:courses(*)').eq('faculty_id', facultyId),
    getFacultyPerformanceReviews(facultyId).then(r => r.slice(0, 3)),
  ]);

  if (profileRes.error) throw profileRes.error;

  return {
    profile: profileRes.data as Profile,
    employment: employmentRes,
    courses: (coursesRes.data ?? []) as any,
    recentReviews: reviewsRes,
  };
}

export async function getFacultyStats(facultyId: string): Promise<{
  studentCount: number;
  pendingSubmissions: number;
  attendanceRate: number;
  upcomingSessions: number;
}> {
  // Get courses for this faculty
  const { data: coursesData } = await supabase
    .from('course_faculty')
    .select('course_id')
    .eq('faculty_id', facultyId);

  const courseIds = (coursesData ?? []).map(c => c.course_id);

  if (courseIds.length === 0) {
    return { studentCount: 0, pendingSubmissions: 0, attendanceRate: 0, upcomingSessions: 0 };
  }

  // Count students enrolled in faculty's courses
  const { count: studentCount } = await supabase
    .from('course_enrollments')
    .select('*', { count: 'exact', head: true })
    .in('course_id', courseIds);

  // Supabase's .in() accepts values, not a nested query builder.
  const { data: assignmentRows, error: assignmentError } = await supabase
    .from('assignments')
    .select('id')
    .in('course_id', courseIds);

  if (assignmentError) throw assignmentError;
  const assignmentIds = (assignmentRows ?? []).map(assignment => assignment.id);

  // Count pending submissions for faculty's courses.
  // Avoid an empty .in(), which PostgREST cannot represent consistently.
  const { count: pendingSubmissions } = await supabase
    .from('assignment_submissions')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'submitted')
    .in('assignment_id', assignmentIds.length ? assignmentIds : ['00000000-0000-0000-0000-000000000000']);

  // Count upcoming live sessions
  const { count: upcomingSessions } = await supabase
    .from('live_sessions')
    .select('*', { count: 'exact', head: true })
    .in('course_id', courseIds)
    .eq('status', 'scheduled');

  return {
    studentCount: studentCount ?? 0,
    pendingSubmissions: pendingSubmissions ?? 0,
    attendanceRate: 0, // Would need complex query
    upcomingSessions: upcomingSessions ?? 0,
  };
}

// ============================================================
// STUDENT MANAGEMENT UTILITIES
// ============================================================

export async function getStudentWithDetails(studentId: string): Promise<{
  profile: Profile;
  enrollments: (CourseEnrollment & { course: Course })[];
  progress: LessonProgress[];
  supportRecords: StudentSupportRecord[];
}> {
  const [profileRes, enrollmentsRes, progressRes, supportRes] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', studentId).single(),
    supabase.from('course_enrollments').select('*, course:courses(*)').eq('student_id', studentId),
    supabase.from('lesson_progress').select('*').eq('student_id', studentId).limit(100),
    getStudentSupportRecords(studentId),
  ]);

  if (profileRes.error) throw profileRes.error;

  return {
    profile: profileRes.data as Profile,
    enrollments: (enrollmentsRes.data ?? []) as any,
    progress: (progressRes.data ?? []) as LessonProgress[],
    supportRecords: supportRes,
  };
}

export async function getAllStudents(filters?: {
  courseId?: string;
  facultyId?: string;
  status?: 'active' | 'inactive';
}): Promise<(Profile & { enrollments?: CourseEnrollment[] })[]> {
  let query = supabase
    .from('profiles')
    .select('*, enrollments:course_enrollments(*)')
    .eq('role', 'student')
    .order('created_at', { ascending: false });

  if (filters?.courseId) {
    // Filter by course enrollment
    const { data: enrollments } = await supabase
      .from('course_enrollments')
      .select('student_id')
      .eq('course_id', filters.courseId);
    const studentIds = (enrollments ?? []).map(e => e.student_id);
    if (studentIds.length === 0) return [];
    query = query.in('id', studentIds);
  }

  if (filters?.facultyId) {
    // Get students enrolled in faculty's courses
    const { data: coursesData } = await supabase
      .from('course_faculty')
      .select('course_id')
      .eq('faculty_id', filters.facultyId);
    const courseIds = (coursesData ?? []).map(c => c.course_id);

    if (courseIds.length === 0) return [];

    const { data: enrollments } = await supabase
      .from('course_enrollments')
      .select('student_id')
      .in('course_id', courseIds);
    const studentIds = [...new Set((enrollments ?? []).map(e => e.student_id))];
    if (studentIds.length === 0) return [];
    query = query.in('id', studentIds);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as any;
}

// ============================================================
// PAYROLL UTILITIES
// ============================================================

export async function getMonthlyPayrollPreview(): Promise<{
  faculty: Profile;
  employment: FacultyEmployment;
  baseSalary: number;
  incentives: number;
  deductions: number;
  totalPayable: number;
}[]> {
  const employmentData = await getAllFacultyEmployment();

  return employmentData
    .filter(e => e.employment_status === 'active' && e.base_salary)
    .map(e => ({
      faculty: e.faculty!,
      employment: e,
      baseSalary: e.base_salary ?? 0,
      incentives: 0, // Would query compensation history for current month
      deductions: 0,
      totalPayable: e.base_salary ?? 0,
    }));
}

// ============================================================
// FACULTY COURSE ASSIGNMENT
// ============================================================

export async function assignFacultyToCourse(courseId: string, facultyId: string): Promise<CourseFaculty> {
  const { data, error } = await supabase
    .from('course_faculty')
    .insert({ course_id: courseId, faculty_id: facultyId })
    .select('*')
    .single();
  if (error) throw error;
  return data as CourseFaculty;
}

export async function removeFacultyFromCourse(courseId: string, facultyId: string): Promise<void> {
  const { error } = await supabase
    .from('course_faculty')
    .delete()
    .eq('course_id', courseId)
    .eq('faculty_id', facultyId);
  if (error) throw error;
}

// ============================================================
// PROMOTE USER TO FACULTY
// ============================================================

export async function promoteUserToFaculty(userId: string): Promise<Profile> {
  return setPlatformUserRole(userId, 'faculty');
}

export async function demoteFacultyToStudent(facultyId: string): Promise<Profile> {
  return setPlatformUserRole(facultyId, 'student');
}
