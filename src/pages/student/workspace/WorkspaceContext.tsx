import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from 'react';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../contexts/AuthContext';
import { markLessonComplete, getLessonProgress, getLessonNotes, getBookmark, getLessonResources, getStudentCoursePlan, saveNote, toggleBookmark } from '../../../services/lessons';
import type { Course, Chapter, Lesson, LessonProgress, LessonNote, LessonResource, LessonTopic, LessonPracticeQuestion, Quiz, Assignment, LiveSession, LessonAccessInfo, LessonPlanItem, CourseProjectStep } from '../../../types/database';

export interface ChapterWithLessons extends Chapter {
  lessons: Lesson[];
}

/** Chapter-level quiz step (CCBP-style MCQ Practice). */
export interface ChapterQuizStep {
  id: string;
  title: string;
  description: string | null;
  pass_percentage: number;
  xp_reward: number;
  time_limit_minutes: number | null;
  passed: boolean;
}

/** Chapter-level coding practice step. */
export interface ChapterCodingStep {
  id: string;
  title: string;
  difficulty: string;
  default_marks: number;
  solved: boolean;
}

/** Per-lesson quiz step (sits BETWEEN lessons in the sidebar flow). */
export interface LessonQuizStep {
  id: string;
  title: string;
  state: string;
}

/** Per-lesson coding practice step (opens the Monaco solve/submit page). */
export interface LessonCodingStep {
  id: string;
  title: string;
  difficulty: string;
  default_marks: number;
  solved: boolean;
  attempts_count: number;
  passed_test_cases: number;
  total_test_cases: number;
}

/** Per-lesson assignment step (sits after quiz/practice in the sidebar flow). */
export interface LessonAssignmentStep {
  id: string;
  title: string;
  /** Latest submission status: available | draft | submitted | graded | returned | resubmitted. */
  state: string;
}

/**
 * Chapter completion counts lessons AND every attached step (lesson quizzes,
 * lesson coding practice, lesson assignments, chapter quizzes, chapter coding
 * practice). Shared by the sidebar counts and the lesson-complete celebration.
 */
export function chapterStepCounts(
  chapter: { id: string; lessons: { id: string }[] },
  lessonQuizSteps: Map<string, LessonQuizStep[]>,
  lessonCodingSteps: Map<string, LessonCodingStep[]>,
  lessonAssignmentSteps: Map<string, LessonAssignmentStep[]>,
  chapterQuizSteps: Map<string, ChapterQuizStep[]>,
  chapterCodingSteps: Map<string, ChapterCodingStep[]>,
  progress: Map<string, boolean>,
): { done: number; total: number } {
  let done = chapter.lessons.filter(l => progress.has(l.id)).length;
  let total = chapter.lessons.length;
  for (const lesson of chapter.lessons) {
    const lqs = lessonQuizSteps.get(lesson.id) ?? [];
    done += lqs.filter(q => q.state === 'completed').length;
    total += lqs.length;
    const lcs = lessonCodingSteps.get(lesson.id) ?? [];
    done += lcs.filter(s => s.solved).length;
    total += lcs.length;
    const las = lessonAssignmentSteps.get(lesson.id) ?? [];
    done += las.filter(a => a.state === 'submitted' || a.state === 'graded' || a.state === 'returned' || a.state === 'resubmitted').length;
    total += las.length;
  }
  const cqs = chapterQuizSteps.get(chapter.id) ?? [];
  done += cqs.filter(q => q.passed).length;
  total += cqs.length;
  const ccs = chapterCodingSteps.get(chapter.id) ?? [];
  done += ccs.filter(s => s.solved).length;
  total += ccs.length;
  return { done, total };
}

interface WorkspaceState {
  course: Course | null;
  chapters: ChapterWithLessons[];
  chapterQuizSteps: Map<string, ChapterQuizStep[]>;
  chapterCodingSteps: Map<string, ChapterCodingStep[]>;
  lessonQuizSteps: Map<string, LessonQuizStep[]>;
  lessonCodingSteps: Map<string, LessonCodingStep[]>;
  lessonAssignmentSteps: Map<string, LessonAssignmentStep[]>;
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
  /** Course sidebar project steps (mini projects + course projects) with lock state. */
  projectSteps: CourseProjectStep[];
  /** Set briefly when a gated project flips to unlocked — the sidebar shows
   *  a celebration card. Lives in the provider so it survives course refetches
   *  (markComplete -> refreshProfile -> loadCourse re-runs mid-session). */
  unlockParty: { titles: string[] } | null;
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
  const [chapterQuizSteps, setChapterQuizSteps] = useState<Map<string, ChapterQuizStep[]>>(new Map());
  const [chapterCodingSteps, setChapterCodingSteps] = useState<Map<string, ChapterCodingStep[]>>(new Map());
  const [lessonQuizSteps, setLessonQuizSteps] = useState<Map<string, LessonQuizStep[]>>(new Map());
  const [lessonAssignmentSteps, setLessonAssignmentSteps] = useState<Map<string, LessonAssignmentStep[]>>(new Map());
  const [lessonCodingSteps, setLessonCodingSteps] = useState<Map<string, LessonCodingStep[]>>(new Map());
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
  const [projectSteps, setProjectSteps] = useState<CourseProjectStep[]>([]);
  const [unlockParty, setUnlockParty] = useState<{ titles: string[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [lessonLoading, setLessonLoading] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [rightPanelCollapsed, setRightPanelCollapsed] = useState(false);

  // Celebrate the moment a gated project unlocks — the student just finished
  // the last course item standing between them and it. Detected by diffing
  // unlocked flags across projectSteps updates; first load never celebrates.
  // Timers are only cleared on unmount so the second refetch that markComplete
  // triggers (refreshProfile -> loadCourse) cannot swallow the countdown.
  const prevUnlockedRef = useRef<Map<string, boolean> | null>(null);
  const showTimerRef = useRef<number | null>(null);
  const hideTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const prev = prevUnlockedRef.current;
    prevUnlockedRef.current = new Map(projectSteps.map(s => [`${s.kind}-${s.ref_id}`, s.unlocked]));
    if (!prev) return;
    const fresh = projectSteps.filter(s => prev.get(`${s.kind}-${s.ref_id}`) === false && s.unlocked);
    if (fresh.length === 0) return;
    if (showTimerRef.current !== null) window.clearTimeout(showTimerRef.current);
    if (hideTimerRef.current !== null) window.clearTimeout(hideTimerRef.current);
    // Land just after the lesson completion overlay (~1.6s) has faded.
    showTimerRef.current = window.setTimeout(() => {
      setUnlockParty({ titles: fresh.map(s => s.title) });
      hideTimerRef.current = window.setTimeout(() => setUnlockParty(null), 4500);
    }, 1500);
  }, [projectSteps]);

  useEffect(() => () => {
    if (showTimerRef.current !== null) window.clearTimeout(showTimerRef.current);
    if (hideTimerRef.current !== null) window.clearTimeout(hideTimerRef.current);
  }, []);

  // The courseId whose data is currently loaded. Lets loadCourse tell the
  // initial mount apart from a background refetch of the same course.
  const lastLoadedCourseIdRef = useRef<string | null>(null);

  const allLessonsFlat = chapters.flatMap(ch => ch.lessons);
  const currentLessonIndex = currentLesson ? allLessonsFlat.findIndex(l => l.id === currentLesson.id) : -1;

  // Load course structure. Re-runs on profile refresh (XP updates after
  // markComplete) — as a background refetch, without unmounting the shell.
  useEffect(() => {
    if (!profile) return;
    loadCourse();
  }, [courseId, profile]);

  async function loadCourse() {
    if (!profile) return;
    // Only the first load of a course may show the full-page spinner.
    // Background refetches (markComplete -> refreshProfile -> loadCourse,
    // profile refreshes, etc.) keep the shell mounted so the sidebar and
    // lesson never unmount mid-session.
    const isInitialLoad = lastLoadedCourseIdRef.current !== courseId;
    lastLoadedCourseIdRef.current = courseId;
    if (isInitialLoad) {
      // Different course than what's on screen — drop stale data so the shell
      // shows its spinner instead of mixing two courses' content.
      if (course) setCourse(null);
      setLoading(true);
    }
    try {
      const [courseRes, chaptersRes, lessonsRes, enrollmentRes, planRes, projectStepsRes] = await Promise.all([
        supabase.from('courses').select('*').eq('id', courseId).maybeSingle(),
        supabase.from('chapters').select('*').eq('course_id', courseId).eq('is_published', true).order('order_index'),
        supabase.from('lessons').select('*').eq('course_id', courseId).eq('is_published', true).order('order_index'),
        supabase.from('course_enrollments').select('progress_percentage').eq('course_id', courseId).eq('student_id', profile.id).maybeSingle(),
        getStudentCoursePlan(courseId),
        supabase.rpc('get_course_project_steps', { p_course_id: courseId }),
      ]);

      setProjectSteps(((projectStepsRes.data ?? []) as CourseProjectStep[])
        .slice()
        .sort((a, b) => (a.kind === b.kind ? a.title.localeCompare(b.title) : a.kind === 'mini' ? -1 : 1)));

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

      // Per-lesson quiz steps come straight from the server plan activities
      // (kind 'quiz' with a quiz_id) — one sidebar step per published quiz.
      const lqSteps = new Map<string, LessonQuizStep[]>();
      planItems.forEach(p => {
        (p.activities ?? []).forEach(a => {
          if (a.kind !== 'quiz' || !a.quiz_id) return;
          const list = lqSteps.get(p.lesson_id) ?? [];
          list.push({ id: a.quiz_id, title: a.title, state: a.state });
          lqSteps.set(p.lesson_id, list);
        });
      });
      setLessonQuizSteps(lqSteps);

      // Per-lesson assignment steps — the plan already carries each published
      // lesson assignment with the student's latest submission status.
      const laSteps = new Map<string, LessonAssignmentStep[]>();
      planItems.forEach(p => {
        (p.activities ?? []).forEach(a => {
          if (a.kind !== 'assignment' || !a.assignment_id) return;
          const list = laSteps.get(p.lesson_id) ?? [];
          list.push({ id: a.assignment_id, title: a.title, state: a.state });
          laSteps.set(p.lesson_id, list);
        });
      });
      setLessonAssignmentSteps(laSteps);

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

      // Chapter-level practice steps (CCBP-style): published chapter quizzes
      // and coding questions with this student's completion state.
      const chapterIds = chaps.map(c => c.id);
      if (chapterIds.length > 0) {
        const [cQuizRes, cqRes, cqaRes, myQuizAttempts, lessonCodingRes] = await Promise.all([
          supabase.from('quizzes').select('id, chapter_id, title, description, pass_percentage, xp_reward, time_limit_minutes')
            .in('chapter_id', chapterIds).eq('is_published', true).is('lesson_id', null),
          supabase.from('coding_questions').select('id, chapter_id, title, difficulty, default_marks')
            .in('chapter_id', chapterIds).eq('is_published', true),
          supabase.from('coding_question_attempts').select('question_id, first_solved_at').eq('student_id', profile.id),
          supabase.from('quiz_attempts').select('quiz_id, passed').eq('student_id', profile.id),
          supabase.rpc('get_course_coding_questions', { p_course_id: courseId }),
        ]);

        const passedQuizIds = new Set(
          ((myQuizAttempts.data ?? []) as Array<{ quiz_id: string; passed: boolean | null }>)
            .filter(a => a.passed).map(a => a.quiz_id)
        );
        const solvedQuestionIds = new Set(
          ((cqaRes.data ?? []) as Array<{ question_id: string; first_solved_at: string | null }>)
            .filter(a => a.first_solved_at).map(a => a.question_id)
        );

        const qSteps = new Map<string, ChapterQuizStep[]>();
        ((cQuizRes.data ?? []) as Array<any>).forEach(q => {
          if (!q.chapter_id) return;
          const list = qSteps.get(q.chapter_id) ?? [];
          list.push({
            id: q.id, title: q.title, description: q.description,
            pass_percentage: q.pass_percentage, xp_reward: q.xp_reward,
            time_limit_minutes: q.time_limit_minutes, passed: passedQuizIds.has(q.id),
          });
          qSteps.set(q.chapter_id, list);
        });
        setChapterQuizSteps(qSteps);

        const cSteps = new Map<string, ChapterCodingStep[]>();
        ((cqRes.data ?? []) as Array<any>).forEach(q => {
          if (!q.chapter_id) return;
          const list = cSteps.get(q.chapter_id) ?? [];
          list.push({
            id: q.id, title: q.title, difficulty: q.difficulty,
            default_marks: q.default_marks, solved: solvedQuestionIds.has(q.id),
          });
          cSteps.set(q.chapter_id, list);
        });
        setChapterCodingSteps(cSteps);

        // Lesson-scoped coding practice steps (lesson_id set) — these render
        // directly under their lesson in the sidebar, before the next lesson.
        const lcSteps = new Map<string, LessonCodingStep[]>();
        ((lessonCodingRes.data ?? []) as Array<any>).forEach(q => {
          if (!q.lesson_id) return;
          const list = lcSteps.get(q.lesson_id) ?? [];
          list.push({
            id: q.id, title: q.title, difficulty: q.difficulty,
            default_marks: q.default_marks, solved: !!q.solved,
            attempts_count: q.attempts_count ?? 0,
            passed_test_cases: q.passed_test_cases ?? 0,
            total_test_cases: q.total_test_cases ?? 0,
          });
          lcSteps.set(q.lesson_id, list);
        });
        setLessonCodingSteps(lcSteps);
      } else {
        setChapterQuizSteps(new Map());
        setChapterCodingSteps(new Map());
        setLessonCodingSteps(new Map());
      }

      // Auto-select the first available incomplete lesson (skip locked ones)
      // — but only when nothing valid is selected yet. On background refetches
      // keep the lesson the student is viewing instead of yanking them to the
      // top of the course mid-session.
      const flat = chaptersWithLessons.flatMap(c => c.lessons);
      if (!currentLesson || !flat.some(l => l.id === currentLesson.id)) {
        const firstAvailableIncomplete = flat.find(l => accessMap.get(l.id)?.access === 'available' && !progressMap.has(l.id));
        const firstUnlocked = flat.find(l => accessMap.get(l.id)?.access !== 'locked');
        const target = firstAvailableIncomplete ?? firstUnlocked ?? flat[0];
        if (target) {
          setCurrentLesson(target);
          setCurrentChapter(chaps.find(c => c.id === target.chapter_id) ?? null);
          loadLessonData(target.id);
        }
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

  // Silent refresh: faculty can edit lesson materials while a student has the
  // page open. Re-fetch the current lesson's data when the tab regains focus
  // (no spinner — just swap in fresh data), so edits appear without a manual
  // reload. Throttled to once per 30s.
  const lastFocusRefresh = useRef(0);
  useEffect(() => {
    const refresh = () => {
      if (!currentLesson) return;
      const now = Date.now();
      if (now - lastFocusRefresh.current < 30_000) return;
      lastFocusRefresh.current = now;
      loadLessonData(currentLesson.id);
    };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') refresh();
    });
    return () => {
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [currentLesson, loadLessonData]);

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
      // Completing items can unlock gated project steps in the sidebar.
      try {
        const stepsRes = await supabase.rpc('get_course_project_steps', { p_course_id: currentLesson.course_id });
        setProjectSteps(((stepsRes.data ?? []) as CourseProjectStep[])
          .slice()
          .sort((a, b) => (a.kind === b.kind ? a.title.localeCompare(b.title) : a.kind === 'mini' ? -1 : 1)));
      } catch { /* keep the previous steps */ }
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
    course, chapters, chapterQuizSteps, chapterCodingSteps, lessonQuizSteps, lessonCodingSteps, lessonAssignmentSteps,
    currentLesson, currentChapter,
    accessMap, progress, courseProgress, lessonProgress, lessonNote,
    isBookmarked, resources, topics, practiceQuestions,
    lessonQuizzes, lessonAssignments, lessonSessions,
    projectSteps,
    unlockParty,
    loading, lessonLoading, sidebarCollapsed, rightPanelCollapsed,
    selectLesson, goToNextLesson, goToPrevLesson, markComplete,
    saveStudentNote, toggleStudentBookmark,
    toggleSidebar: () => setSidebarCollapsed(p => !p),
    toggleRightPanel: () => setRightPanelCollapsed(p => !p),
    allLessonsFlat, currentLessonIndex, totalLessons: allLessonsFlat.length,
  };

  return <WorkspaceCtx.Provider value={value}>{children}</WorkspaceCtx.Provider>;
}
