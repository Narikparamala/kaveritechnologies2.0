import { supabase } from '../lib/supabase';
import type {
  Course, Chapter, Lesson, Assignment, Quiz, QuizQuestion, QuizOption, Project,
  AssignmentSubmission, ProjectSubmission, QuizAttempt, Profile, CourseEnrollment, LessonProgress,
  LessonTopic, LessonSubtopic, LessonPracticeQuestion, LessonResource, LessonResourceType, LiveSession, AssignmentTestCase,
} from '../types/database';

// ============================================================
// Faculty course helpers
// ============================================================

export async function getFacultyCourses(facultyId: string): Promise<Course[]> {
  const { data: cf } = await supabase.from('course_faculty').select('course_id').eq('faculty_id', facultyId);
  const ids = (cf ?? []).map((c: any) => c.course_id);
  if (!ids.length) return [];
  const { data, error } = await supabase.from('courses').select('*').in('id', ids).order('title');
  if (error) throw error;
  return (data ?? []) as Course[];
}

export async function getFacultyCourseIds(facultyId: string): Promise<string[]> {
  const { data } = await supabase.from('course_faculty').select('course_id').eq('faculty_id', facultyId);
  return (data ?? []).map((c: any) => c.course_id);
}

// ============================================================
// Chapter CRUD
// ============================================================

export async function getCourseChapters(courseId: string): Promise<Chapter[]> {
  const { data, error } = await supabase
    .from('chapters').select('*').eq('course_id', courseId).order('order_index');
  if (error) throw error;
  return (data ?? []) as Chapter[];
}

export async function createChapter(courseId: string, title: string, description?: string, orderIndex?: number): Promise<Chapter> {
  const { data: existing } = await supabase.from('chapters').select('order_index', { count: 'exact' }).eq('course_id', courseId);
  const nextOrder = orderIndex ?? (existing?.length ?? 0);
  const { data, error } = await supabase
    .from('chapters').insert({ course_id: courseId, title, description, order_index: nextOrder }).select().single();
  if (error) throw error;
  return data as Chapter;
}

export async function updateChapter(chapterId: string, updates: Partial<Pick<Chapter, 'title' | 'description' | 'order_index' | 'is_published'>>): Promise<void> {
  const { error } = await supabase.from('chapters').update(updates).eq('id', chapterId);
  if (error) throw error;
}

export async function deleteChapter(chapterId: string): Promise<void> {
  const { error } = await supabase.from('chapters').delete().eq('id', chapterId);
  if (error) throw error;
}

// ============================================================
// Lesson CRUD
// ============================================================

export async function getChapterLessonsAll(chapterId: string): Promise<Lesson[]> {
  const { data, error } = await supabase
    .from('lessons').select('*').eq('chapter_id', chapterId).order('order_index');
  if (error) throw error;
  return (data ?? []) as Lesson[];
}

export async function getCourseLessonsAll(courseId: string): Promise<Lesson[]> {
  const { data, error } = await supabase
    .from('lessons').select('*').eq('course_id', courseId).order('order_index');
  if (error) throw error;
  return (data ?? []) as Lesson[];
}

export async function createLesson(input: {
  chapter_id: string;
  course_id: string;
  title: string;
  slug: string;
  notes_markdown?: string;
  code_example?: string;
  explanation?: string;
  teaching_mode?: 'live_class' | 'recorded_video';
  enable_coding_playground?: boolean;
  duration_minutes?: number;
  order_index?: number;
  is_published?: boolean;
}): Promise<Lesson> {
  const { data: existing } = await supabase.from('lessons').select('order_index', { count: 'exact' }).eq('chapter_id', input.chapter_id);
  const nextOrder = input.order_index ?? (existing?.length ?? 0);
  const { data, error } = await supabase.from('lessons').insert({
    ...input,
    order_index: nextOrder,
    is_published: input.is_published ?? false,
    teaching_mode: input.teaching_mode ?? 'live_class',
    enable_coding_playground: input.enable_coding_playground ?? false,
    duration_minutes: input.duration_minutes ?? 10,
    xp_reward: 10,
    slug: input.slug,
    video_url: null,
    is_free_preview: false,
  }).select().single();
  if (error) throw error;
  return data as Lesson;
}

export async function updateLesson(lessonId: string, updates: Partial<Lesson>): Promise<void> {
  const { error } = await supabase.from('lessons').update(updates).eq('id', lessonId);
  if (error) throw error;
}

export async function deleteLesson(lessonId: string): Promise<void> {
  const { error } = await supabase.from('lessons').delete().eq('id', lessonId);
  if (error) throw error;
}

// ============================================================
// Assignment CRUD
// ============================================================

export async function getCourseAssignments(courseId: string): Promise<Assignment[]> {
  const { data, error } = await supabase
    .from('assignments').select('*').eq('course_id', courseId).order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as Assignment[];
}

export async function getFacultyAssignments(facultyId: string): Promise<(Assignment & { course: Course })[]> {
  const courseIds = await getFacultyCourseIds(facultyId);
  if (!courseIds.length) return [];
  const { data, error } = await supabase
    .from('assignments').select('*, course:courses(*)').in('course_id', courseIds).order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as any;
}

export async function createAssignment(input: {
  course_id: string;
  chapter_id?: string | null;
  lesson_id?: string | null;
  title: string;
  description?: string;
  instructions?: string;
  problem_statement?: string | null;
  input_format?: string | null;
  output_format?: string | null;
  constraints_text?: string | null;
  starter_code?: string | null;
  hints?: string[];
  sample_solution?: string | null;
  sample_solution_visibility?: string;
  due_date?: string | null;
  max_marks?: number;
  passing_score?: number | null;
  max_submissions?: number | null;
  allow_resubmit?: boolean;
  is_published?: boolean;
  created_by: string;
}): Promise<Assignment> {
  const { data, error } = await supabase.from('assignments').insert({
    ...input,
    chapter_id: input.chapter_id ?? null,
    lesson_id: input.lesson_id ?? null,
    due_date: input.due_date ?? null,
    max_marks: input.max_marks ?? 100,
    is_published: input.is_published ?? false,
    difficulty: 'beginner',
    allow_resubmit: input.allow_resubmit ?? true,
  }).select().single();
  if (error) throw error;
  return data as Assignment;
}

export async function updateAssignment(assignmentId: string, updates: Partial<Assignment>): Promise<void> {
  const { error } = await supabase.from('assignments').update(updates).eq('id', assignmentId);
  if (error) throw error;
}

export async function deleteAssignment(assignmentId: string): Promise<void> {
  const { error } = await supabase.from('assignments').delete().eq('id', assignmentId);
  if (error) throw error;
}

export async function getAssignmentSubmissions(assignmentId: string): Promise<(AssignmentSubmission & { student_profile: Profile })[]> {
  const { data, error } = await supabase
    .from('assignment_submissions')
    .select('*, student_profile:profiles!assignment_submissions_student_id_fkey(*)')
    .eq('assignment_id', assignmentId)
    .order('submitted_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as any;
}

export async function gradeSubmission(submissionId: string, score: number, feedback: string, gradedBy: string): Promise<void> {
  const { error } = await supabase.from('assignment_submissions').update({
    score, feedback, status: 'graded', graded_by: gradedBy, graded_at: new Date().toISOString(),
  }).eq('id', submissionId);
  if (error) throw error;
}

// ============================================================
// Quiz CRUD
// ============================================================

export async function getCourseQuizzes(courseId: string): Promise<Quiz[]> {
  const { data, error } = await supabase
    .from('quizzes').select('*').eq('course_id', courseId).order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as Quiz[];
}

export async function getFacultyQuizzes(facultyId: string): Promise<(Quiz & { course: Course })[]> {
  const courseIds = await getFacultyCourseIds(facultyId);
  if (!courseIds.length) return [];
  const { data, error } = await supabase
    .from('quizzes').select('*, course:courses(*)').in('course_id', courseIds).order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as any;
}

export async function createQuiz(input: {
  course_id: string;
  lesson_id?: string | null;
  title: string;
  description?: string;
  pass_percentage?: number;
  time_limit_minutes?: number | null;
  is_published?: boolean;
  created_by: string;
}): Promise<Quiz> {
  const { data, error } = await supabase.from('quizzes').insert({
    ...input,
    lesson_id: input.lesson_id ?? null,
    pass_percentage: input.pass_percentage ?? 70,
    time_limit_minutes: input.time_limit_minutes ?? null,
    is_published: input.is_published ?? false,
    show_answers: true,
    xp_reward: 50,
  }).select().single();
  if (error) throw error;
  return data as Quiz;
}

export async function updateQuiz(quizId: string, updates: Partial<Quiz>): Promise<void> {
  const { error } = await supabase.from('quizzes').update(updates).eq('id', quizId);
  if (error) throw error;
}

export async function deleteQuiz(quizId: string): Promise<void> {
  const { error } = await supabase.from('quizzes').delete().eq('id', quizId);
  if (error) throw error;
}

export async function getQuizQuestions(quizId: string): Promise<(QuizQuestion & { options: QuizOption[] })[]> {
  const { data, error } = await supabase
    .from('quiz_questions').select('*, options:quiz_options(*)').eq('quiz_id', quizId).order('order_index');
  if (error) throw error;
  return (data ?? []) as any;
}

export async function createQuestion(input: {
  quiz_id: string;
  question_text: string;
  question_type: string;
  explanation?: string;
  order_index?: number;
  points?: number;
}): Promise<QuizQuestion> {
  const { data: existing } = await supabase.from('quiz_questions').select('order_index', { count: 'exact' }).eq('quiz_id', input.quiz_id);
  const nextOrder = input.order_index ?? (existing?.length ?? 0);
  const { data, error } = await supabase.from('quiz_questions').insert({
    quiz_id: input.quiz_id,
    question_text: input.question_text,
    question_type: input.question_type,
    explanation: input.explanation ?? null,
    order_index: nextOrder,
    points: input.points ?? 1,
  }).select().single();
  if (error) throw error;
  return data as QuizQuestion;
}

export async function updateQuestion(questionId: string, updates: Partial<QuizQuestion>): Promise<void> {
  const { error } = await supabase.from('quiz_questions').update(updates).eq('id', questionId);
  if (error) throw error;
}

export async function deleteQuestion(questionId: string): Promise<void> {
  const { error } = await supabase.from('quiz_questions').delete().eq('id', questionId);
  if (error) throw error;
}

export async function createOption(input: {
  question_id: string;
  option_text: string;
  is_correct: boolean;
  order_index?: number;
}): Promise<QuizOption> {
  const { data: existing } = await supabase.from('quiz_options').select('order_index', { count: 'exact' }).eq('question_id', input.question_id);
  const nextOrder = input.order_index ?? (existing?.length ?? 0);
  const { data, error } = await supabase.from('quiz_options').insert({
    question_id: input.question_id,
    option_text: input.option_text,
    is_correct: input.is_correct,
    order_index: nextOrder,
  }).select().single();
  if (error) throw error;
  return data as QuizOption;
}

export async function updateOption(optionId: string, updates: Partial<QuizOption>): Promise<void> {
  const { error } = await supabase.from('quiz_options').update(updates).eq('id', optionId);
  if (error) throw error;
}

export async function deleteOption(optionId: string): Promise<void> {
  const { error } = await supabase.from('quiz_options').delete().eq('id', optionId);
  if (error) throw error;
}

export async function getQuizAttempts(quizId: string): Promise<(QuizAttempt & { student: Profile })[]> {
  const { data, error } = await supabase
    .from('quiz_attempts').select('*, student:profiles!quiz_attempts_student_id_fkey(full_name, email)').eq('quiz_id', quizId).order('started_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as any;
}

// ============================================================
// Project CRUD
// ============================================================

export async function getFacultyProjects(facultyId: string): Promise<(Project & { course: Course | null })[]> {
  const courseIds = await getFacultyCourseIds(facultyId);
  if (!courseIds.length) return [];
  const { data, error } = await supabase
    .from('projects').select('*, course:courses(*)').in('course_id', courseIds).order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as any;
}

export async function createProject(input: {
  title: string;
  description?: string;
  difficulty?: string;
  category?: string;
  estimated_hours?: number;
  tech_tags?: string[];
  requirements?: string;
  starter_code?: string;
  course_id?: string | null;
  is_published?: boolean;
  created_by: string;
}): Promise<Project> {
  const { data, error } = await supabase.from('projects').insert({
    title: input.title,
    description: input.description ?? null,
    difficulty: (input.difficulty as any) ?? 'beginner',
    category: input.category ?? 'python',
    estimated_hours: input.estimated_hours ?? 5,
    tech_tags: input.tech_tags ?? [],
    requirements: input.requirements ?? null,
    starter_code: input.starter_code ?? null,
    course_id: input.course_id ?? null,
    is_published: input.is_published ?? false,
    created_by: input.created_by,
  }).select().single();
  if (error) throw error;
  return data as Project;
}

export async function updateProject(projectId: string, updates: Partial<Project>): Promise<void> {
  const { error } = await supabase.from('projects').update(updates).eq('id', projectId);
  if (error) throw error;
}

export async function deleteProject(projectId: string): Promise<void> {
  const { error } = await supabase.from('projects').delete().eq('id', projectId);
  if (error) throw error;
}

export async function getProjectSubmissions(projectId: string): Promise<(ProjectSubmission & { student: Profile })[]> {
  const { data, error } = await supabase
    .from('project_submissions')
    .select('*, student:profiles!project_submissions_student_id_fkey(full_name, email)')
    .eq('project_id', projectId)
    .order('submitted_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as any;
}

export async function gradeProjectSubmission(submissionId: string, status: 'approved' | 'rejected' | 'reviewed', feedback: string): Promise<void> {
  const { error } = await supabase.from('project_submissions').update({ status, feedback }).eq('id', submissionId);
  if (error) throw error;
}

// ============================================================
// Faculty students
// ============================================================

export async function getFacultyStudents(facultyId: string): Promise<Profile[]> {
  const courseIds = await getFacultyCourseIds(facultyId);
  if (!courseIds.length) return [];
  const { data } = await supabase
    .from('course_enrollments')
    .select('student:profiles(*)')
    .in('course_id', courseIds);
  const map = new Map<string, Profile>();
  for (const e of (data ?? [])) {
    const s = (e as any).student;
    if (s && !map.has(s.id)) map.set(s.id, s);
  }
  return Array.from(map.values());
}

export async function getStudentEnrollmentsForFaculty(studentId: string, courseIds: string[]): Promise<(CourseEnrollment & { course: Course })[]> {
  const { data, error } = await supabase
    .from('course_enrollments').select('*, course:courses(*)').eq('student_id', studentId).in('course_id', courseIds);
  if (error) throw error;
  return (data ?? []) as any;
}

export async function getStudentProgressForCourses(studentId: string, courseIds: string[]): Promise<LessonProgress[]> {
  const { data, error } = await supabase
    .from('lesson_progress').select('*').eq('student_id', studentId).in('course_id', courseIds);
  if (error) throw error;
  return (data ?? []) as LessonProgress[];
}

// ============================================================
// Topics & Subtopics CRUD
// ============================================================

export async function getLessonTopics(lessonId: string): Promise<(LessonTopic & { subtopics: LessonSubtopic[] })[]> {
  const { data, error } = await supabase
    .from('lesson_topics')
    .select('*, subtopics:lesson_subtopics(*)')
    .eq('lesson_id', lessonId)
    .order('order_index');
  if (error) throw error;
  return (data ?? []) as any;
}

export async function createTopic(lessonId: string, title: string, description?: string): Promise<LessonTopic> {
  const { data: existing } = await supabase.from('lesson_topics').select('order_index', { count: 'exact' }).eq('lesson_id', lessonId);
  const nextOrder = existing?.length ?? 0;
  const { data, error } = await supabase
    .from('lesson_topics').insert({ lesson_id: lessonId, title, description, order_index: nextOrder }).select().single();
  if (error) throw error;
  return data as LessonTopic;
}

export async function updateTopic(topicId: string, updates: Partial<Pick<LessonTopic, 'title' | 'description' | 'order_index'>>): Promise<void> {
  const { error } = await supabase.from('lesson_topics').update(updates).eq('id', topicId);
  if (error) throw error;
}

export async function deleteTopic(topicId: string): Promise<void> {
  const { error } = await supabase.from('lesson_topics').delete().eq('id', topicId);
  if (error) throw error;
}

export async function createSubtopic(topicId: string, title: string, description?: string): Promise<LessonSubtopic> {
  const { data: existing } = await supabase.from('lesson_subtopics').select('order_index', { count: 'exact' }).eq('topic_id', topicId);
  const nextOrder = existing?.length ?? 0;
  const { data, error } = await supabase
    .from('lesson_subtopics').insert({ topic_id: topicId, title, description, order_index: nextOrder }).select().single();
  if (error) throw error;
  return data as LessonSubtopic;
}

export async function updateSubtopic(subtopicId: string, updates: Partial<Pick<LessonSubtopic, 'title' | 'description' | 'order_index'>>): Promise<void> {
  const { error } = await supabase.from('lesson_subtopics').update(updates).eq('id', subtopicId);
  if (error) throw error;
}

export async function deleteSubtopic(subtopicId: string): Promise<void> {
  const { error } = await supabase.from('lesson_subtopics').delete().eq('id', subtopicId);
  if (error) throw error;
}

// ============================================================
// Practice Questions CRUD
// ============================================================

export async function getPracticeQuestions(lessonId: string): Promise<LessonPracticeQuestion[]> {
  const { data, error } = await supabase
    .from('lesson_practice_questions').select('*').eq('lesson_id', lessonId).order('order_index');
  if (error) throw error;
  return (data ?? []) as LessonPracticeQuestion[];
}

export async function createPracticeQuestion(input: {
  lesson_id: string;
  question_text: string;
  hint?: string;
  expected_output?: string;
  sample_solution?: string;
  show_solution?: boolean;
  is_published?: boolean;
}): Promise<LessonPracticeQuestion> {
  const { data: existing } = await supabase.from('lesson_practice_questions').select('order_index', { count: 'exact' }).eq('lesson_id', input.lesson_id);
  const nextOrder = existing?.length ?? 0;
  const { data, error } = await supabase.from('lesson_practice_questions').insert({
    lesson_id: input.lesson_id,
    question_text: input.question_text,
    hint: input.hint ?? null,
    expected_output: input.expected_output ?? null,
    sample_solution: input.sample_solution ?? null,
    show_solution: input.show_solution ?? false,
    is_published: input.is_published ?? false,
    order_index: nextOrder,
  }).select().single();
  if (error) throw error;
  return data as LessonPracticeQuestion;
}

export async function updatePracticeQuestion(id: string, updates: Partial<LessonPracticeQuestion>): Promise<void> {
  const { error } = await supabase.from('lesson_practice_questions').update(updates).eq('id', id);
  if (error) throw error;
}

export async function deletePracticeQuestion(id: string): Promise<void> {
  const { error } = await supabase.from('lesson_practice_questions').delete().eq('id', id);
  if (error) throw error;
}

// ============================================================
// Lesson Materials (extended lesson_resources)
// ============================================================

export async function getLessonMaterials(lessonId: string): Promise<LessonResource[]> {
  const { data, error } = await supabase
    .from('lesson_resources').select('*').eq('lesson_id', lessonId).order('order_index');
  if (error) throw error;
  return (data ?? []) as LessonResource[];
}

export async function createMaterial(input: {
  lesson_id: string;
  title: string;
  resource_type: LessonResourceType;
  description?: string;
  content_text?: string;
  external_url?: string;
  file_url?: string;
  file_type?: string;
  is_published?: boolean;
  is_locked?: boolean;
  unlock_after_session?: boolean;
}): Promise<LessonResource> {
  const { data: existing } = await supabase.from('lesson_resources').select('order_index', { count: 'exact' }).eq('lesson_id', input.lesson_id);
  const nextOrder = existing?.length ?? 0;
  const { data, error } = await supabase.from('lesson_resources').insert({
    lesson_id: input.lesson_id,
    title: input.title,
    resource_type: input.resource_type,
    description: input.description ?? null,
    content_text: input.content_text ?? null,
    external_url: input.external_url ?? null,
    file_url: input.file_url ?? null,
    file_type: input.file_type ?? null,
    is_published: input.is_published ?? true,
    is_locked: input.is_locked ?? false,
    unlock_after_session: input.unlock_after_session ?? false,
    order_index: nextOrder,
  }).select().single();
  if (error) throw error;
  return data as LessonResource;
}

export async function updateMaterial(id: string, updates: Partial<LessonResource>): Promise<void> {
  const { error } = await supabase.from('lesson_resources').update(updates).eq('id', id);
  if (error) throw error;
}

export async function deleteMaterial(id: string): Promise<void> {
  const { error } = await supabase.from('lesson_resources').delete().eq('id', id);
  if (error) throw error;
}

// ============================================================
// Course update (for faculty editing course card)
// ============================================================

export async function updateCourse(courseId: string, updates: Partial<Course>): Promise<void> {
  const { error } = await supabase.from('courses').update(updates).eq('id', courseId);
  if (error) throw error;
}

export async function getCourseById(courseId: string): Promise<Course | null> {
  const { data, error } = await supabase.from('courses').select('*').eq('id', courseId).maybeSingle();
  if (error) throw error;
  return data as Course | null;
}

export async function getCourseEnrollmentCount(courseId: string): Promise<number> {
  const { count } = await supabase.from('course_enrollments').select('id', { count: 'exact' }).eq('course_id', courseId);
  return count ?? 0;
}

// ============================================================
// Lesson quizzes (lesson-scoped)
// ============================================================

export async function getLessonQuizzes(lessonId: string): Promise<Quiz[]> {
  const { data, error } = await supabase
    .from('quizzes').select('*').eq('lesson_id', lessonId).order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as Quiz[];
}

export async function getLessonAssignments(lessonId: string): Promise<Assignment[]> {
  const { data, error } = await supabase
    .from('assignments').select('*').eq('lesson_id', lessonId).order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as Assignment[];
}

export async function getLessonLiveSessions(lessonId: string): Promise<LiveSession[]> {
  const { data, error } = await supabase
    .from('live_sessions').select('*').eq('lesson_id', lessonId).order('session_date', { ascending: false });
  if (error) throw error;
  return (data ?? []) as LiveSession[];
}

// ============================================================
// Activity logging
// ============================================================

export async function logActivity(userId: string, action: string, entityType: string, entityId?: string, metadata?: Record<string, any>): Promise<void> {
  await supabase.from('activity_logs').insert({
    user_id: userId,
    action,
    entity_type: entityType,
    entity_id: entityId ?? null,
    metadata: metadata ?? {},
  });
}

// ============================================================
// Announcements
// ============================================================

export async function getCourseAnnouncements(courseId: string) {
  const { data, error } = await supabase
    .from('announcements').select('*, author:profiles!announcements_author_id_fkey(full_name, email)')
    .eq('course_id', courseId).order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function createAnnouncement(input: {
  course_id: string;
  title: string;
  content: string;
  author_id: string;
}): Promise<void> {
  const { error } = await supabase.from('announcements').insert({
    course_id: input.course_id,
    title: input.title,
    content: input.content,
    author_id: input.author_id,
    is_global: false,
  });
  if (error) throw error;
}

export async function notifyEnrolledStudents(courseId: string, title: string, message: string, type: string = 'announcement'): Promise<void> {
  const { data: enrollments } = await supabase.from('course_enrollments').select('student_id').eq('course_id', courseId);
  const studentIds = (enrollments ?? []).map((e: any) => e.student_id);
  if (!studentIds.length) return;
  const notifications = studentIds.map(sid => ({ user_id: sid, title, message, type }));
  await supabase.from('notifications').insert(notifications);
}


// ============================================================
// Assignment Test Cases CRUD
// ============================================================

export async function getTestCases(assignmentId: string, includeHidden: boolean = true): Promise<AssignmentTestCase[]> {
  let query = supabase.from('assignment_test_cases').select('*').eq('assignment_id', assignmentId).order('order_index');
  if (!includeHidden) query = query.eq('is_hidden', false);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as AssignmentTestCase[];
}

export async function createTestCase(input: {
  assignment_id: string;
  input_data?: string;
  expected_output: string;
  is_hidden?: boolean;
  weight?: number;
}): Promise<AssignmentTestCase> {
  const { data: existing } = await supabase.from('assignment_test_cases').select('order_index', { count: 'exact' }).eq('assignment_id', input.assignment_id);
  const nextOrder = existing?.length ?? 0;
  const { data, error } = await supabase.from('assignment_test_cases').insert({
    assignment_id: input.assignment_id,
    input_data: input.input_data ?? null,
    expected_output: input.expected_output,
    is_hidden: input.is_hidden ?? false,
    weight: input.weight ?? 1,
    order_index: nextOrder,
  }).select().single();
  if (error) throw error;
  return data as AssignmentTestCase;
}

export async function updateTestCase(id: string, updates: Partial<AssignmentTestCase>): Promise<void> {
  const { error } = await supabase.from('assignment_test_cases').update(updates).eq('id', id);
  if (error) throw error;
}

export async function deleteTestCase(id: string): Promise<void> {
  const { error } = await supabase.from('assignment_test_cases').delete().eq('id', id);
  if (error) throw error;
}

// ============================================================
// Course Creation
// ============================================================

export async function createCourse(input: {
  title: string;
  slug: string;
  short_description?: string;
  description?: string;
  thumbnail_url?: string;
  difficulty?: string;
  category?: string;
  language?: string;
  duration_hours?: number;
  created_by: string;
}): Promise<Course> {
  const { data, error } = await supabase.rpc('create_faculty_course', {
    p_payload: {
      title: input.title,
      slug: input.slug,
      short_description: input.short_description ?? null,
      description: input.description ?? null,
      thumbnail_url: input.thumbnail_url ?? null,
      difficulty: input.difficulty ?? 'beginner',
      category: input.category ?? 'python',
      language: input.language ?? 'English',
      duration_hours: input.duration_hours ?? 0,
      is_published: false,
    },
  });
  if (error) throw error;
  const courseId = (data as any)?.id;
  if (!courseId) throw new Error('Failed to create course');
  const { data: fullCourse, error: fetchErr } = await supabase.from('courses').select('*').eq('id', courseId).single();
  if (fetchErr) throw fetchErr;
  return fullCourse as Course;
}

export async function deleteCourseWithContent(courseId: string): Promise<void> {
  const { error } = await supabase.rpc('delete_course_with_content', { p_course_id: courseId });
  if (error) throw error;
}

// ============================================================
// Enrollment Management (admin)
// ============================================================

export async function grantEnrollment(input: {
  course_id: string;
  student_id: string;
  granted_by: string;
  notes?: string;
}): Promise<void> {
  const { data: existing } = await supabase.from('course_enrollments')
    .select('id, access_status').eq('course_id', input.course_id).eq('student_id', input.student_id).maybeSingle();
  if (existing && (existing as any).access_status === 'active') {
    throw new Error('Student already has active enrollment in this course');
  }
  if (existing) {
    const { error } = await supabase.from('course_enrollments').update({
      access_status: 'active', enrollment_source: 'admin_grant',
      granted_by: input.granted_by, granted_at: new Date().toISOString(),
      revoked_by: null, revoked_at: null, notes: input.notes ?? null,
    }).eq('id', (existing as any).id);
    if (error) throw error;
  } else {
    const { error } = await supabase.from('course_enrollments').insert({
      course_id: input.course_id, student_id: input.student_id,
      enrollment_source: 'admin_grant', access_status: 'active',
      granted_by: input.granted_by, granted_at: new Date().toISOString(),
      notes: input.notes ?? null, progress_percentage: 0,
    });
    if (error) throw error;
  }
  await logActivity(input.granted_by, 'grant_enrollment', 'course_enrollments', input.course_id, {
    student_id: input.student_id, course_id: input.course_id,
  });
}

export async function revokeEnrollment(input: { enrollment_id: string; revoked_by: string }): Promise<void> {
  const { error } = await supabase.from('course_enrollments').update({
    access_status: 'revoked', revoked_by: input.revoked_by, revoked_at: new Date().toISOString(),
  }).eq('id', input.enrollment_id);
  if (error) throw error;
  await logActivity(input.revoked_by, 'revoke_enrollment', 'course_enrollments', input.enrollment_id);
}

export async function getStudentEnrollmentsAdmin(studentId: string) {
  const { data, error } = await supabase.from('course_enrollments')
    .select('*, course:courses(*)').eq('student_id', studentId).order('enrolled_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function getCourseEnrollmentsList(courseId: string) {
  const { data, error } = await supabase.from('course_enrollments')
    .select('*, student:profiles!course_enrollments_student_id_fkey(full_name, email)')
    .eq('course_id', courseId).order('enrolled_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}
