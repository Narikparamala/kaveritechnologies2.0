export type UserRole = 'student' | 'faculty' | 'super_admin';

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  phone: string | null;
  bio: string | null;
  role: UserRole;
  xp_points: number;
  level: number;
  streak_days: number;
  last_active_date: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type CourseEnrollmentMode = 'open' | 'approval_required' | 'closed';

export interface Course {
  id: string;
  title: string;
  slug: string;
  short_description: string | null;
  description: string | null;
  thumbnail_url: string | null;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  duration_hours: number;
  category: string;
  is_published: boolean;
  is_featured: boolean;
  enrollment_count: number;
  price: number;
  certificate_eligible: boolean;
  language: string;
  enrollment_mode: CourseEnrollmentMode;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CourseFaculty {
  id: string;
  course_id: string;
  faculty_id: string;
  assigned_at: string;
}

export interface CourseEnrollment {
  id: string;
  course_id: string;
  student_id: string;
  enrolled_at: string;
  completed_at: string | null;
  progress_percentage: number;
  enrollment_source: 'purchase' | 'admin_grant' | 'free_enrollment' | 'manual' | 'approved_request';
  access_status: 'active' | 'revoked' | 'pending';
  granted_by: string | null;
  granted_at: string | null;
  revoked_by: string | null;
  revoked_at: string | null;
  notes: string | null;
}

export type EnrollmentRequestStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

export interface EnrollmentRequest {
  id: string;
  student_id: string;
  course_id: string;
  status: EnrollmentRequestStatus;
  message: string | null;
  requested_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
  review_note: string | null;
  created_at: string;
  updated_at: string;
  course?: Pick<Course, 'id' | 'title' | 'slug'> | null;
}

export interface Chapter {
  id: string;
  course_id: string;
  title: string;
  description: string | null;
  order_index: number;
  is_published: boolean;
  created_at: string;
  updated_at: string;
}

export type TeachingMode = 'live_class' | 'recorded_video';

export interface Lesson {
  id: string;
  chapter_id: string;
  course_id: string;
  title: string;
  slug: string;
  video_url: string | null;
  notes_markdown: string | null;
  code_example: string | null;
  explanation: string | null;
  teaching_mode: TeachingMode;
  enable_coding_playground: boolean;
  slides_url: string | null;
  notes_url: string | null;
  order_index: number;
  duration_minutes: number;
  is_published: boolean;
  is_free_preview: boolean;
  requires_previous_lesson_completion: boolean;
  unlock_rule: 'open' | 'sequential' | 'gated';
  requires_activity_type: 'assignment' | 'quiz' | 'coding' | null;
  requires_activity_id: string | null;
  xp_reward: number;
  created_at: string;
  updated_at: string;
}

export type LessonAccessState = 'available' | 'completed' | 'locked';

export interface LessonAccessInfo {
  access: LessonAccessState;
  reason: string;
  isReleased: boolean;
}

export interface LessonActivity {
  kind: string;
  title: string;
  state: string;
  count?: number;
  session_id?: string;
  quiz_id?: string;
  assignment_id?: string;
  recording?: string;
  date?: string;
}

export interface LessonPlanItem {
  lesson_id: string;
  chapter_id: string;
  course_id: string;
  title: string;
  slug: string;
  teaching_mode: TeachingMode;
  enable_coding_playground: boolean;
  duration_minutes: number;
  xp_reward: number;
  order_index: number;
  is_free_preview: boolean;
  chapter_title: string;
  chapter_order_index: number;
  access: LessonAccessState;
  reason: string;
  is_released: boolean;
  requires_activity_type: 'assignment' | 'quiz' | 'coding' | null;
  requires_activity_id: string | null;
  requires_activity_title: string | null;
  activities: LessonActivity[];
}

export type LessonResourceType = 'slides' | 'notes' | 'code_example' | 'practice_sheet' | 'external_resource' | 'recorded_video';

export interface LessonResource {
  id: string;
  lesson_id: string;
  title: string;
  file_url: string | null;
  file_type: string | null;
  description: string | null;
  content_text: string | null;
  external_url: string | null;
  resource_type: LessonResourceType;
  is_published: boolean;
  is_locked: boolean;
  unlock_after_session: boolean;
  order_index: number;
  created_at: string;
  updated_at: string;
}

export interface LessonTopic {
  id: string;
  lesson_id: string;
  title: string;
  description: string | null;
  order_index: number;
  created_at: string;
  updated_at: string;
  subtopics?: LessonSubtopic[];
}

export interface LessonSubtopic {
  id: string;
  topic_id: string;
  title: string;
  description: string | null;
  order_index: number;
  created_at: string;
  updated_at: string;
}

export interface LessonPracticeQuestion {
  id: string;
  lesson_id: string;
  question_text: string;
  hint: string | null;
  expected_output: string | null;
  sample_solution: string | null;
  show_solution: boolean;
  order_index: number;
  is_published: boolean;
  created_at: string;
  updated_at: string;
}

export interface LessonProgress {
  id: string;
  student_id: string;
  lesson_id: string;
  course_id: string;
  completed: boolean;
  completed_at: string | null;
  watch_time_seconds: number;
  created_at: string;
  updated_at: string;
}

export interface LessonNote {
  id: string;
  student_id: string;
  lesson_id: string;
  content: string;
  created_at: string;
  updated_at: string;
}

export interface LessonBookmark {
  id: string;
  student_id: string;
  lesson_id: string;
  created_at: string;
}

export interface Assignment {
  id: string;
  course_id: string;
  chapter_id: string | null;
  lesson_id: string | null;
  title: string;
  description: string | null;
  instructions: string | null;
  assignment_type: 'coding' | 'written' | 'mixed';
  status: 'draft' | 'published' | 'closed';
  start_date: string | null;
  due_date: string | null;
  allow_late_submission: boolean;
  max_submissions: number | null;
  passing_score: number | null;
  order_index: number;
  max_marks: number;
  difficulty: string;
  allow_resubmit: boolean;
  is_published: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface AssignmentQuestion {
  id: string;
  assignment_id: string;
  title: string;
  problem_statement: string | null;
  instructions: string | null;
  input_format: string | null;
  output_format: string | null;
  constraints_text: string | null;
  starter_code: string | null;
  hints: string[];
  question_type: 'coding' | 'short_answer' | 'long_answer';
  difficulty: string;
  marks: number;
  order_index: number;
  created_at: string;
  updated_at: string;
}

export interface AssignmentTestCase {
  id: string;
  assignment_id: string;
  question_id: string | null;
  input_data: string | null;
  expected_output: string;
  is_hidden: boolean;
  weight: number;
  order_index: number;
  created_at: string;
  updated_at: string;
}

export interface AssignmentSubmission {
  id: string;
  assignment_id: string;
  student_id: string;
  status: 'draft' | 'submitted' | 'graded' | 'returned';
  score: number | null;
  feedback: string | null;
  graded_by: string | null;
  graded_at: string | null;
  submitted_at: string;
  updated_at: string;
  submission_number: number;
}

export interface AssignmentQuestionSubmission {
  id: string;
  submission_id: string;
  question_id: string;
  submitted_code: string | null;
  submitted_text: string | null;
  execution_output: string | null;
  passed_test_cases: number;
  total_test_cases: number;
  marks_awarded: number | null;
  feedback: string | null;
  created_at: string;
  updated_at: string;
}

export interface Quiz {
  id: string;
  course_id: string;
  lesson_id: string | null;
  title: string;
  description: string | null;
  pass_percentage: number;
  time_limit_minutes: number | null;
  xp_reward: number;
  is_published: boolean;
  show_answers: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface QuizQuestion {
  id: string;
  quiz_id: string;
  question_text: string;
  question_type: 'mcq' | 'multiple_select' | 'true_false' | 'fill_in_blank' | 'code_output' | 'coding';
  explanation: string | null;
  order_index: number;
  points: number;
  difficulty: string;
  code_snippet: string | null;
  image_url: string | null;
  enable_playground: boolean;
  correct_answer_text: string | null;
  time_limit_seconds: number | null;
  created_at: string;
}

export interface QuizOption {
  id: string;
  question_id: string;
  option_text: string;
  is_correct: boolean;
  order_index: number;
}

export interface QuizAttempt {
  id: string;
  quiz_id: string;
  student_id: string;
  score: number | null;
  max_score: number | null;
  passed: boolean | null;
  time_taken_seconds: number | null;
  completed_at: string | null;
  started_at: string;
}

export interface Project {
  id: string;
  title: string;
  description: string | null;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  category: string;
  estimated_hours: number;
  tech_tags: string[];
  requirements: string | null;
  starter_code: string | null;
  project_type: ProjectType;
  objectives: string | null;
  instructions: string | null;
  submission_mode: ProjectSubmissionMode;
  max_marks: number;
  due_at: string | null;
  allow_late_submissions: boolean;
  repository_required: boolean;
  live_demo_required: boolean;
  course_id: string | null;
  is_published: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type ProjectType =
  | 'python'
  | 'html_css_js'
  | 'selenium_python'
  | 'selenium_java'
  | 'python_fullstack'
  | 'java_fullstack'
  | 'mern'
  | 'csharp_fullstack'
  | 'genai'
  | 'n8n'
  | 'custom';

export type ProjectSubmissionMode = 'github' | 'github_and_live' | 'file_upload' | 'external_url';

export interface ProjectMilestone {
  id: string;
  project_id: string;
  title: string;
  description: string | null;
  order_index: number;
  max_marks: number;
  created_at: string;
  updated_at: string;
}

export interface ProjectRubricItem {
  id: string;
  project_id: string;
  title: string;
  description: string | null;
  order_index: number;
  max_marks: number;
  created_at: string;
  updated_at: string;
}

export interface ProjectStarterFile {
  id: string;
  project_id: string;
  file_path: string;
  content: string;
  language: string;
  order_index: number;
  created_at: string;
  updated_at: string;
}

export interface ProjectWorkspaceFile {
  id: string;
  project_id: string;
  student_id: string;
  file_path: string;
  content: string;
  language: string;
  order_index: number;
  created_at: string;
  updated_at: string;
}

export interface ProjectSubmission {
  id: string;
  project_id: string;
  student_id: string;
  github_url: string | null;
  live_url: string | null;
  external_url: string | null;
  description: string | null;
  status: 'draft' | 'submitted' | 'reviewed' | 'approved' | 'rejected';
  feedback: string | null;
  score: number | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  submitted_at: string | null;
  updated_at: string;
  files?: ProjectSubmissionFile[];
}

export interface ProjectSubmissionFile {
  id: string;
  submission_id: string;
  student_id: string;
  storage_path: string;
  file_name: string;
  mime_type: string | null;
  file_size: number;
  created_at: string;
}

export interface Certificate {
  id: string;
  student_id: string;
  course_id: string;
  certificate_uid: string;
  issued_at: string;
}

export interface Achievement {
  id: string;
  title: string;
  description: string | null;
  icon: string;
  badge_color: string;
  xp_reward: number;
  condition_type: string | null;
  condition_value: number | null;
  created_at: string;
}

export interface UserAchievement {
  id: string;
  student_id: string;
  achievement_id: string;
  earned_at: string;
}

export interface XPTransaction {
  id: string;
  student_id: string;
  amount: number;
  reason: string;
  reference_id: string | null;
  reference_type: string | null;
  created_at: string;
}

export interface Notification {
  id: string;
  user_id: string;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error' | 'assignment' | 'announcement' | 'grade' | 'submission' | 'quiz' | 'project' | 'live_class' | 'student' | 'support' | 'enrollment' | 'workshop' | 'exam' | 'ecosystem' | 'system';
  is_read: boolean;
  read_at: string | null;
  reference_id: string | null;
  reference_type: string | null;
  action_url: string | null;
  archived_at: string | null;
  aggregation_key: string | null;
  event_count: number;
  last_event_at: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface NotificationPreferences {
  user_id: string;
  assignment_submission_notifications_enabled: boolean;
  assignment_submission_threshold: number;
  created_at: string;
  updated_at: string;
}
export interface Announcement {
  id: string;
  course_id: string | null;
  batch_id: string | null;
  title: string;
  content: string;
  author_id: string | null;
  is_global: boolean;
  audience_type: 'platform' | 'all_students' | 'course' | 'batch';
  status: 'draft' | 'published' | 'scheduled' | 'archived';
  priority: 'normal' | 'important' | 'urgent';
  publish_at: string | null;
  published_at: string | null;
  expires_at: string | null;
  is_pinned: boolean;
  created_at: string;
  updated_at: string;
}

export interface SavedCodeSnippet {
  id: string;
  user_id: string;
  title: string;
  code: string;
  language: string;
  created_at: string;
  updated_at: string;
}

export interface PlatformSetting {
  id: string;
  key: string;
  value: string | null;
  description: string | null;
  updated_at: string;
}

// Live Session types
export type SessionStatus = 'scheduled' | 'live' | 'completed' | 'cancelled';
export type AttendanceStatus = 'registered' | 'attended' | 'absent' | 'excused';
export type SessionResourceType = 'slides' | 'notes' | 'practice_questions' | 'code_example' | 'quiz' | 'assignment' | 'downloadable' | 'recording';

export interface LiveSession {
  id: string;
  course_id: string;
  chapter_id: string | null;
  lesson_id: string | null;
  title: string;
  description: string | null;
  session_date: string;
  duration_minutes: number;
  google_meet_url: string | null;
  status: SessionStatus;
  slides_unlocked: boolean;
  materials_unlocked: boolean;
  attendance_required: boolean;
  preparation_notes: string | null;
  calendar_event_id: string | null;
  organizer_email: string | null;
  meeting_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // Joined fields
  course?: Course;
  faculty?: Profile;
}

export interface FacultyGoogleConnection {
  id: string;
  faculty_id: string;
  google_email: string;
  access_token: string;
  refresh_token: string;
  token_expiry: string | null;
  created_at: string;
  updated_at: string;
}

export interface SessionAttendance {
  id: string;
  session_id: string;
  student_id: string;
  attendance_status: AttendanceStatus;
  joined_at: string | null;
  marked_by: string | null;
  created_at: string;
  updated_at: string;
  // Joined fields
  student?: Profile;
  session?: LiveSession;
}

export interface SessionResource {
  id: string;
  session_id: string;
  title: string;
  resource_type: SessionResourceType;
  file_url: string | null;
  external_url: string | null;
  content: string | null;
  is_locked: boolean;
  order_index: number;
  created_at: string;
}

// Company Management types
export type EmploymentStatus = 'active' | 'probation' | 'on_leave' | 'inactive' | 'terminated';
export type CompensationChangeType = 'salary' | 'incentive' | 'hike' | 'bonus' | 'deduction' | 'benefit';
export type SupportCategory = 'academic' | 'attendance' | 'behavior' | 'payment' | 'general';
export type SupportStatus = 'open' | 'in_progress' | 'resolved';
export type SupportPriority = 'low' | 'medium' | 'high';

export interface FacultyEmployment {
  id: string;
  faculty_id: string;
  employee_code: string | null;
  employment_status: EmploymentStatus;
  joining_date: string | null;
  department: string | null;
  designation: string | null;
  manager_id: string | null;
  base_salary: number | null;
  salary_currency: string;
  payment_frequency: 'monthly' | 'bi_weekly' | 'weekly';
  bank_details_masked: string | null;
  benefits: Record<string, any>[];
  notes: string | null;
  created_at: string;
  updated_at: string;
  // Joined fields
  faculty?: Profile;
  manager?: Profile;
}

export interface FacultyCompensationHistory {
  id: string;
  faculty_id: string;
  change_type: CompensationChangeType;
  amount: number | null;
  percentage: number | null;
  effective_date: string;
  reason: string | null;
  created_by: string | null;
  created_at: string;
  // Joined fields
  faculty?: Profile;
  created_by_profile?: Profile;
}

export interface FacultyPerformanceReview {
  id: string;
  faculty_id: string;
  reviewer_id: string;
  review_period: string;
  rating: number | null;
  strengths: string | null;
  improvements: string | null;
  goals: string | null;
  review_date: string;
  created_at: string;
  updated_at: string;
  // Joined fields
  faculty?: Profile;
  reviewer?: Profile;
}

export interface StudentSupportRecord {
  id: string;
  student_id: string;
  faculty_id: string | null;
  category: SupportCategory;
  status: SupportStatus;
  priority: SupportPriority;
  notes: string;
  created_at: string;
  updated_at: string;
  // Joined fields
  student?: Profile;
  faculty?: Profile;
}

// Batch Management types
export type BatchStatus = 'upcoming' | 'active' | 'completed' | 'archived';
export type BatchFacultyRole = 'lead' | 'assistant' | 'guest';
export type BatchStudentStatus = 'active' | 'removed' | 'completed' | 'transferred';

export interface Batch {
  id: string;
  name: string;
  description: string | null;
  course_id: string | null;
  start_date: string | null;
  end_date: string | null;
  max_students: number;
  status: BatchStatus;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  course?: Course;
}

export interface BatchFaculty {
  id: string;
  batch_id: string;
  faculty_id: string;
  role: BatchFacultyRole;
  assigned_at: string;
  faculty?: Profile;
}

export interface BatchStudent {
  id: string;
  batch_id: string;
  student_id: string;
  enrolled_at: string;
  status: BatchStudentStatus;
  student?: Profile;
}

export interface BatchSchedule {
  id: string;
  batch_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  topic: string | null;
  is_active: boolean;
  created_at: string;
}

export interface BatchAnnouncement {
  id: string;
  batch_id: string;
  title: string;
  content: string | null;
  author_id: string | null;
  is_pinned: boolean;
  created_at: string;
  author?: Profile;
}

// Faculty teaching work types. Delivery mode is intentionally independent from
// Lesson.teaching_mode so faculty can switch between live, recorded, and hybrid.
export type TeachingWorkMode = 'live_class' | 'recorded_video' | 'hybrid';
export type TeachingWorkStatus = 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
export type TeachingWorkSource = 'faculty' | 'admin';
export type FacultyWorkRequestType = 'new_assignment' | 'schedule_swap' | 'availability' | 'assistant' | 'capacity';
export type FacultyWorkRequestStatus = 'pending' | 'approved' | 'rejected' | 'completed';

export interface FacultyTeachingWork {
  id: string;
  faculty_id: string;
  batch_id: string | null;
  course_id: string | null;
  chapter_id: string | null;
  lesson_id: string | null;
  live_session_id: string | null;
  title: string;
  description: string | null;
  scheduled_date: string;
  start_time: string;
  end_time: string;
  delivery_mode: TeachingWorkMode;
  status: TeachingWorkStatus;
  source: TeachingWorkSource;
  recording_url: string | null;
  notes: string | null;
  created_by: string | null;
  updated_by: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  batch?: Batch;
  course?: Course;
  lesson?: Lesson;
}

export interface FacultyWorkPreference {
  faculty_id: string;
  daily_workload_limit_minutes: number;
  created_at: string;
  updated_at: string;
}

export interface FacultyWorkRequest {
  id: string;
  faculty_id: string;
  batch_id: string | null;
  course_id: string | null;
  request_type: FacultyWorkRequestType;
  details: string;
  requested_date: string | null;
  status: FacultyWorkRequestStatus;
  reviewed_by: string | null;
  response_notes: string | null;
  created_at: string;
  updated_at: string;
  batch?: Batch;
  course?: Course;
}

export interface FacultyBatchAssignment extends BatchFaculty {
  batch: Batch & { course?: Course };
  student_count: number;
  faculty_count: number;
  schedules: BatchSchedule[];
}

// Placement & Jobs types
export type JobType = 'full_time' | 'internship' | 'contract' | 'part_time';
export type JobStatus = 'open' | 'closed' | 'on_hold' | 'filled';
export type ApplicationStatus = 'applied' | 'shortlisted' | 'interview' | 'selected' | 'rejected' | 'withdrawn';

export interface HiringCompany {
  id: string;
  name: string;
  logo_url: string | null;
  website: string | null;
  industry: string | null;
  description: string | null;
  location: string | null;
  is_active: boolean;
  created_at: string;
}

export interface JobPosting {
  id: string;
  company_id: string;
  title: string;
  description: string | null;
  location: string | null;
  job_type: JobType;
  ctc_min: number | null;
  ctc_max: number | null;
  openings: number;
  eligibility_criteria: string | null;
  required_skills: string[];
  apply_by: string | null;
  status: JobStatus;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  company?: HiringCompany;
}

export interface JobApplication {
  id: string;
  job_id: string;
  student_id: string;
  status: ApplicationStatus;
  resume_url: string | null;
  cover_letter: string | null;
  faculty_recommendation: string | null;
  recommended_by: string | null;
  interview_date: string | null;
  interview_notes: string | null;
  offer_ctc: number | null;
  applied_at: string;
  updated_at: string;
  job?: JobPosting;
  student?: Profile;
}

// Offline Exam types
export type OfflineExamStatus = 'scheduled' | 'ongoing' | 'completed' | 'cancelled';
export type OfflineExamAttendance = 'registered' | 'present' | 'absent';

export interface OfflineExam {
  id: string;
  course_id: string;
  title: string;
  description: string | null;
  exam_date: string;
  duration_minutes: number;
  max_marks: number;
  venue: string | null;
  status: OfflineExamStatus;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // Joined fields
  course?: Course;
}

export interface OfflineExamStudent {
  id: string;
  exam_id: string;
  student_id: string;
  marks_obtained: number | null;
  scanned_sheet_url: string | null;
  attendance_status: OfflineExamAttendance;
  graded_by: string | null;
  graded_at: string | null;
  created_at: string;
  updated_at: string;
  // Joined fields
  student?: Profile;
  exam?: OfflineExam;
}
