import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../contexts/AuthContext';
import { markLessonComplete, getLessonProgress, getLessonNotes, getBookmark, getLessonResources, getStudentCoursePlan, saveNote, toggleBookmark } from '../../../services/lessons';
import type { Course, Chapter, Lesson, LessonProgress, LessonNote, LessonResource, LessonTopic, LessonPracticeQuestion, Quiz, Assignment, LiveSession, LessonAccessInfo, LessonPlanItem } from '../../../types/database';

export interface ChapterWithLessons extends Chapter {
  lessons: Lesson[];
}

interface WorkspaceState {
  course: Course | null;
  chapters: ChapterWithLessons[];
  currentLesson: Lesson | null;
  currentChapter: Chapter | null;
  accessMap: Map<string, LessonAccessInfo>;
  progress: Map<string, boolean>;
  courseProgress: number;
  lessonProgress: LessonProgress | null;
  lessonNote: LessonNote | null;
  isBookmarked: boolean;
  resources: LessonResource[];
  topics: (LessonTopic & { subtopics: any[] })[];
  practiceQuestions: LessonPracticeQuestion[];
  lessonQuizzes: Quiz[];
  lessonAssignments: Assignment[];
  lessonSessions: LiveSession[];
  loading: boolean;
  lessonLoading: boolean;
  sidebarCollapsed: boolean;
  rightPanelCollapsed: boolean;
}

interface WorkspaceActions {
  selectLesson: (lessonId: string) => void;
  goToNextLesson: () => void;
  goToPrevLesson: () => void;
  markComplete: () => Promise<void>;
  saveStudentNote: (content: string) => Promise<void>;
  toggleStudentBookmark: () => Promise<void>;
  toggleSidebar: () => void;
  toggleRightPanel: () => void;
  allLessonsFlat: Lesson[];
  currentLessonIndex: number;
  totalLessons: number;
}

type WorkspaceContextType = WorkspaceState & WorkspaceActions;

const WorkspaceCtx = createContext<WorkspaceContextType | null>(null);

export function useWorkspace() {
  const ctx = useContext(WorkspaceCtx);
  if (!ctx) throw new Error('useWorkspace must be used within WorkspaceProvider');
  return ctx;
}

export function WorkspaceProvider({ courseId, children }: { courseId: string; children: ReactNode }) {
  const { profile, refreshProfile } = useAuth();

  const [course, setCourse] = useState<Course | null>(null);
  const [chapters, setChapters] = useState<ChapterWithLessons[]>([]);
  const [currentLesson, setCurrentLesson] = useState<Lesson | null>(null);
  const [currentChapter, setCurrentChapter] = useState<Chapter | null>(null);
  const [accessMap, setAccessMap] = useState<Map<string, LessonAccessInfo>>(new Map());
  const [progress, setProgress] = useState<Map<string, boolean>>(new Map());
  const [courseProgress, setCourseProgress] = useState(0);
  const [lessonProgress, setLessonProgress] = useState<LessonProgress | null>(null);
  const [lessonNote, setLessonNote] = useState<LessonNote | null>(null);
  const [isBookmarked, setIsBookmarked] = useState(false);
  const [resources, setResources] = useState<LessonResource[]>([]);
  const [topics, setTopics] = useState<(LessonTopic & { subtopics: any[] })[]>([]);
  const [practiceQuestions, setPracticeQuestions] = useState<LessonPracticeQuestion[]>([]);
  const [lessonQuizzes, setLessonQuizzes] = useState<Quiz[]>([]);
  const [lessonAssignments, setLessonAssignments] = useState<Assignment[]>([]);
  const [lessonSessions, setLessonSessions] = useState<LiveSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [lessonLoading, setLessonLoading] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [rightPanelCollapsed, setRightPanelCollapsed] = useState(false);

  const allLessonsFlat = chapters.flatMap(ch => ch.lessons);
  const currentLessonIndex = currentLesson ? allLessonsFlat.findIndex(l => l.id === currentLesson.id) : -1;

  // Load course structure
  useEffect(() => {
    if (!profile) return;
    loadCourse();
  }, [courseId, profile]);

  async function loadCourse() {
    if (!profile) return;
    setLoading(true);
    try {
      const [courseRes, chaptersRes, lessonsRes, enrollmentRes, planRes] = await Promise.all([
        supabase.from('courses').select('*').eq('id', courseId).maybeSingle(),
        supabase.from('chapters').select('*').eq('course_id', courseId).eq('is_published', true).order('order_index'),
        supabase.from('lessons').select('*').eq('course_id', courseId).eq('is_published', true).order('order_index'),
        supabase.from('course_enrollments').select('progress_percentage').eq('course_id', courseId).eq('student_id', profile.id).maybeSingle(),
        getStudentCoursePlan(courseId),
      ]);

      setCourse(courseRes.data as Course | null);
      setCourseProgress(enrollmentRes.data?.progress_percentage ?? 0);

      // Authoritative access states come from the server plan RPC
      const planItems = (planRes ?? []) as LessonPlanItem[];
      const accessMap = new Map<string, LessonAccessInfo>();
      planItems.forEach(p => accessMap.set(p.lesson_id, { access: p.access, reason: p.reason, isReleased: p.is_released }));
      setAccessMap(accessMap);

      const progressMap = new Map<string, boolean>();
      planItems.forEach(p => { if (p.access === 'completed') progressMap.set(p.lesson_id, true); });
      setProgress(progressMap);

      const fullLessons = new Map((lessonsRes.data ?? [] as Lesson[]).map(l => [l.id, l]));
      const lessons: Lesson[] = planItems.map(p => fullLessons.get(p.lesson_id) ?? ({
        id: p.lesson_id,
        chapter_id: p.chapter_id,
        course_id: p.course_id,
        title: p.title,
        slug: p.slug,
        teaching_mode: p.teaching_mode,
        enable_coding_playground: p.enable_coding_playground,
        duration_minutes: p.duration_minutes,
        xp_reward: p.xp_reward,
        order_index: p.order_index,
        is_free_preview: p.is_free_preview,
        video_url: null,
        notes_markdown: null,
        code_example: null,
        explanation: null,
        slides_url: null,
        notes_url: null,
        is_published: true,
        requires_previous_lesson_completion: false,
        unlock_rule: 'open',
        requires_activity_type: null,
        requires_activity_id: null,
        created_at: '',
        updated_at: '',
      } as Lesson));

      const chaps = (chaptersRes.data ?? []) as Chapter[];
      const chaptersWithLessons: ChapterWithLessons[] = chaps.map(ch => ({
        ...ch,
        lessons: lessons.filter(l => l.chapter_id === ch.id),
      }));
      setChapters(chaptersWithLessons);

      // Auto-select first available incomplete lesson (skip locked ones)
      const flat = chaptersWithLessons.flatMap(c => c.lessons);
      const firstAvailableIncomplete = flat.find(l => accessMap.get(l.id)?.access === 'available' && !progressMap.has(l.id));
      const firstUnlocked = flat.find(l => accessMap.get(l.id)?.access !== 'locked');
      const target = firstAvailableIncomplete ?? firstUnlocked ?? flat[0];
      if (target) {
        setCurrentLesson(target);
        setCurrentChapter(chaps.find(c => c.id === target.chapter_id) ?? null);
        loadLessonData(target.id);
      }
    } catch (err) {
      console.error('Failed to load course:', err);
    } finally {
      setLoading(false);
    }
  }

  const loadLessonData = useCallback(async (lessonId: string) => {
    if (!profile) return;
    setLessonLoading(true);
    try {
      const [prog, note, bm, res, topicsRes, pqRes, quizRes, assignRes, sessionRes] = await Promise.all([
        getLessonProgress(lessonId, profile.id),
        getLessonNotes(lessonId, profile.id),
        getBookmark(lessonId, profile.id),
        getLessonResources(lessonId),
        supabase.from('lesson_topics').select('*, subtopics:lesson_subtopics(*)').eq('lesson_id', lessonId).order('order_index'),
        supabase.from('lesson_practice_questions').select('*').eq('lesson_id', lessonId).eq('is_published', true).order('order_index'),
        supabase.from('quizzes').select('*').eq('lesson_id', lessonId).eq('is_published', true),
        supabase.from('assignments').select('*').eq('lesson_id', lessonId).eq('is_published', true),
        supabase.from('live_sessions').select('*').eq('lesson_id', lessonId).in('status', ['scheduled', 'live', 'completed']).order('session_date'),
      ]);

      setLessonProgress(prog);
      setLessonNote(note);
      setIsBookmarked(!!bm);
      setResources(res);
      setTopics((topicsRes.data ?? []) as any);
      setPracticeQuestions((pqRes.data ?? []) as any);
      setLessonQuizzes((quizRes.data ?? []) as any);
      setLessonAssignments((assignRes.data ?? []) as any);
      setLessonSessions((sessionRes.data ?? []) as any);
    } catch (err) {
      console.error('Failed to load lesson data:', err);
    } finally {
      setLessonLoading(false);
    }
  }, [profile]);

  const selectLesson = useCallback((lessonId: string) => {
    const lesson = allLessonsFlat.find(l => l.id === lessonId);
    if (!lesson) return;
    setCurrentLesson(lesson);
    setCurrentChapter(chapters.find(c => c.id === lesson.chapter_id) ?? null);
    loadLessonData(lessonId);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [allLessonsFlat, chapters, loadLessonData]);

  const goToNextLesson = useCallback(() => {
    for (let i = currentLessonIndex + 1; i < allLessonsFlat.length; i++) {
      const next = allLessonsFlat[i];
      if (accessMap.get(next.id)?.access !== 'locked') { selectLesson(next.id); return; }
    }
  }, [currentLessonIndex, allLessonsFlat, accessMap, selectLesson]);

  const goToPrevLesson = useCallback(() => {
    for (let i = currentLessonIndex - 1; i >= 0; i--) {
      const prev = allLessonsFlat[i];
      if (accessMap.get(prev.id)?.access !== 'locked') { selectLesson(prev.id); return; }
    }
  }, [currentLessonIndex, allLessonsFlat, accessMap, selectLesson]);

  const markComplete = useCallback(async () => {
    if (!currentLesson || !profile) return;
    const result = await markLessonComplete(currentLesson.id);
    setProgress(prev => {
      const next = new Map(prev);
      next.set(currentLesson.id, true);
      return next;
    });
    setAccessMap(prev => {
      const next = new Map(prev);
      next.set(currentLesson.id, { access: 'completed', reason: 'Completed', isReleased: false });
      return next;
    });
    setLessonProgress(result.progress);
    setCourseProgress(result.courseProgress);
    // Refetch authoritative access: completing this lesson may unlock the next one
    try {
      const planItems = await getStudentCoursePlan(currentLesson.course_id);
      const nextAccess = new Map<string, LessonAccessInfo>();
      planItems.forEach(p => nextAccess.set(p.lesson_id, { access: p.access, reason: p.reason, isReleased: p.is_released }));
      setAccessMap(nextAccess);
      const nextProgress = new Map<string, boolean>();
      planItems.forEach(p => { if (p.access === 'completed') nextProgress.set(p.lesson_id, true); });
      setProgress(nextProgress);
    } catch { /* keep optimistic local state */ }
    await refreshProfile();
  }, [currentLesson, profile, refreshProfile]);

  const saveStudentNote = useCallback(async (content: string) => {
    if (!currentLesson || !profile) return;
    const result = await saveNote(currentLesson.id, profile.id, content, lessonNote?.id);
    if (result) setLessonNote(result);
  }, [currentLesson, profile, lessonNote]);

  const toggleStudentBookmark = useCallback(async () => {
    if (!currentLesson || !profile) return;
    const newState = await toggleBookmark(currentLesson.id, profile.id, isBookmarked);
    setIsBookmarked(newState);
  }, [currentLesson, profile, isBookmarked]);

  const value: WorkspaceContextType = {
    course, chapters, currentLesson, currentChapter,
    accessMap, progress, courseProgress, lessonProgress, lessonNote,
    isBookmarked, resources, topics, practiceQuestions,
    lessonQuizzes, lessonAssignments, lessonSessions,
    loading, lessonLoading, sidebarCollapsed, rightPanelCollapsed,
    selectLesson, goToNextLesson, goToPrevLesson, markComplete,
    saveStudentNote, toggleStudentBookmark,
    toggleSidebar: () => setSidebarCollapsed(p => !p),
    toggleRightPanel: () => setRightPanelCollapsed(p => !p),
    allLessonsFlat, currentLessonIndex, totalLessons: allLessonsFlat.length,
  };

  return <WorkspaceCtx.Provider value={value}>{children}</WorkspaceCtx.Provider>;
}
