import { Fragment, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ChevronRight, CheckCircle, Circle, Clock, Zap, PanelLeftClose, Lock, HelpCircle,
  TerminalSquare, ClipboardList, Puzzle,
} from 'lucide-react';
import { chapterStepCounts, useWorkspace } from './WorkspaceContext';
import { Collapsible, PopIn, PulseDot, LessonTypeIcon } from '../../../components/motion';

export function CourseSidebar() {
  const {
    course, chapters, chapterQuizSteps, chapterCodingSteps, lessonQuizSteps, lessonCodingSteps,
    lessonAssignmentSteps, lessonMiniSteps, currentLesson, accessMap, progress, courseProgress,
    selectLesson, toggleSidebar, sidebarCollapsed,
  } = useWorkspace();
  const [expandedChapters, setExpandedChapters] = useState<Set<string>>(() => {
    if (!currentLesson) return new Set();
    return new Set([currentLesson.chapter_id]);
  });

  if (!course) return null;

  const toggleChapter = (chapterId: string) => {
    setExpandedChapters(prev => {
      const next = new Set(prev);
      if (next.has(chapterId)) next.delete(chapterId);
      else next.add(chapterId);
      return next;
    });
  };

  const chapterCounts = chapters.map(ch => chapterStepCounts(ch, lessonQuizSteps, lessonCodingSteps, lessonAssignmentSteps, lessonMiniSteps, chapterQuizSteps, chapterCodingSteps, progress));
  const completedCount = chapterCounts.reduce((sum, c) => sum + c.done, 0);
  const totalCount = chapterCounts.reduce((sum, c) => sum + c.total, 0);

  // The next lesson the student should pick up — gently highlighted, never
  // bouncing. Locked lessons stay muted.
  const nextUpId = (() => {
    for (const chapter of chapters) {
      for (const lesson of chapter.lessons) {
        const access = accessMap.get(lesson.id);
        if (access && access.access !== 'locked' && !progress.has(lesson.id)) return lesson.id;
      }
    }
    return null;
  })();

  return (
    <div className="h-full flex flex-col bg-white dark:bg-slate-900 border-r border-slate-100 dark:border-slate-800">
      {/* Course header */}
      <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex-shrink-0">
        <div className="flex items-center justify-between gap-2 mb-3">
          <h2 className="font-bold text-slate-900 dark:text-white text-sm leading-tight line-clamp-2">{course.title}</h2>
          <button onClick={toggleSidebar} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 flex-shrink-0 hidden lg:flex" title="Collapse sidebar">
            <PanelLeftClose size={16} />
          </button>
        </div>
        {course.short_description && (
          <p className="text-[11px] text-slate-400 mb-2 line-clamp-2">{course.short_description}</p>
        )}
        <div className="flex items-center gap-2 text-xs text-slate-400 mb-2">
          <span>{completedCount}/{totalCount} items</span>
          <span className="text-slate-300">|</span>
          <span>{Math.round(courseProgress)}% complete</span>
        </div>
        <div className="h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-primary-500 to-teal-500 rounded-full transition-all duration-700"
            style={{ width: `${Math.min(courseProgress, 100)}%` }}
          />
        </div>
      </div>

      {/* Chapters & Lessons */}
      <div className="flex-1 overflow-y-auto py-2 scrollbar-thin">
        {chapters.map(chapter => {
          const isExpanded = expandedChapters.has(chapter.id);
          const { done: chCompleted, total: chTotal } = chapterStepCounts(chapter, lessonQuizSteps, lessonCodingSteps, lessonAssignmentSteps, lessonMiniSteps, chapterQuizSteps, chapterCodingSteps, progress);
          const isCurrentChapter = currentLesson?.chapter_id === chapter.id;

          return (
            <div key={chapter.id}>
              <button
                onClick={() => toggleChapter(chapter.id)}
                className={`w-full text-left px-4 py-2.5 flex items-center gap-2 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors ${isCurrentChapter ? 'bg-primary-50/50 dark:bg-primary-900/10' : ''}`}
              >
                <ChevronRight
                  size={14}
                  className={`text-slate-400 flex-shrink-0 transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 truncate">{chapter.title}</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">{chCompleted}/{chTotal} items</p>
                </div>
                {chTotal > 0 && chCompleted === chTotal && (
                  <PopIn className="flex-shrink-0">
                    <CheckCircle size={14} className="text-emerald-500" />
                  </PopIn>
                )}
              </button>

              <Collapsible open={isExpanded}>
                <div className="pb-1">
                  {chapter.lessons.map(lesson => {
                    const isActive = currentLesson?.id === lesson.id;
                    const isCompleted = progress.has(lesson.id);
                    const access = accessMap.get(lesson.id);
                    const isLocked = access?.access === 'locked';

                    return (
                      <Fragment key={lesson.id}>
                      <button
                        onClick={() => selectLesson(lesson.id)}
                        title={isLocked ? (access?.reason || 'Locked') : undefined}
                        className={`w-full text-left pl-9 pr-3 py-2 flex items-center gap-2.5 transition-all group ${
                          isActive
                            ? 'bg-primary-50 dark:bg-primary-900/20 border-l-2 border-primary-500'
                            : 'hover:bg-slate-50 dark:hover:bg-slate-800/50 border-l-2 border-transparent'
                        } ${isLocked ? 'opacity-75' : ''}`}
                      >
                        <div className="flex-shrink-0">
                          {isCompleted ? (
                            <PopIn><CheckCircle size={14} className="text-emerald-500" /></PopIn>
                          ) : isLocked ? (
                            <Lock size={13} className="text-amber-500" />
                          ) : isActive ? (
                            <div className="w-3.5 h-3.5 rounded-full border-2 border-primary-500 bg-primary-500/20" />
                          ) : lesson.id === nextUpId ? (
                            <PulseDot><Circle size={14} className="text-primary-400 dark:text-primary-500" /></PulseDot>
                          ) : (
                            <Circle size={14} className="text-slate-300 dark:text-slate-600" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <p className={`text-xs leading-relaxed truncate ${
                              isActive ? 'font-semibold text-primary-700 dark:text-primary-400' :
                              isCompleted ? 'text-slate-500 dark:text-slate-400' :
                              isLocked ? 'text-slate-400 dark:text-slate-500' :
                              'text-slate-600 dark:text-slate-400 group-hover:text-slate-900 dark:group-hover:text-white'
                            }`}>{lesson.title}</p>
                            {lesson.teaching_mode === 'live_class' && (
                              <LessonTypeIcon kind="live" size={10} className="text-blue-500" />
                            )}
                            {lesson.teaching_mode === 'recorded_video' && (
                              <LessonTypeIcon kind="video" size={10} className="text-sky-500" />
                            )}
                            {lesson.enable_coding_playground && (
                              <LessonTypeIcon kind="code" size={10} className="text-teal-500" />
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="flex items-center gap-0.5 text-[10px] text-slate-400">
                              <Clock size={8} /> {lesson.duration_minutes}m
                            </span>
                            {lesson.xp_reward > 0 && (
                              <span className="flex items-center gap-0.5 text-[10px] text-amber-500">
                                <Zap size={8} /> {lesson.xp_reward}
                              </span>
                            )}
                          </div>
                        </div>
                      </button>

                      {/* Per-lesson steps: quiz, then coding practice, then
                          assignment — they sit BETWEEN lessons in the flow
                          (lesson -> quiz -> practice -> assignment -> next
                          lesson), CCBP-style. */}
                      {(lessonQuizSteps.get(lesson.id) ?? []).map(q => (
                        <Link
                          key={`lq-${q.id}`}
                          to={`/student/quizzes?quizId=${q.id}&returnTo=${encodeURIComponent(`/student/course/${course.id}`)}`}
                          className={`w-full text-left pl-14 pr-3 py-1.5 flex items-center gap-2.5 border-l-2 border-transparent transition-all group ${
                            isActive ? 'bg-primary-50/60 dark:bg-primary-900/10' : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                          }`}
                        >
                          <div className="flex-shrink-0">
                            {q.state === 'completed' ? <CheckCircle size={12} className="text-emerald-500" /> : progress.get(lesson.id) ? <HelpCircle size={12} className="text-amber-500" /> : <Lock size={12} className="text-slate-400" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[11px] leading-relaxed truncate text-slate-600 dark:text-slate-400 group-hover:text-slate-900 dark:group-hover:text-white">{q.title}</p>
                            <span className="text-[9px] uppercase tracking-wide text-amber-600 dark:text-amber-400">{progress.get(lesson.id) || q.state === 'completed' ? 'Quiz' : 'Quiz · locked'}</span>
                          </div>
                        </Link>
                      ))}
                      {(lessonCodingSteps.get(lesson.id) ?? []).length > 0 && (() => {
                        // One "Coding Practice" step per lesson opens the question
                        // list (this lesson + previous lessons); each question
                        // there opens the Monaco editor to solve/submit.
                        const steps = lessonCodingSteps.get(lesson.id) ?? [];
                        const solvedCount = steps.filter(s => s.solved).length;
                        return (
                          <Link
                            to={`/student/course/${course.id}/lesson-practice/${lesson.id}`}
                            className={`w-full text-left pl-14 pr-3 py-1.5 flex items-center gap-2.5 border-l-2 border-transparent transition-all group ${
                              isActive ? 'bg-primary-50/60 dark:bg-primary-900/10' : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                            }`}
                          >
                            <div className="flex-shrink-0">
                              {solvedCount === steps.length ? <CheckCircle size={12} className="text-emerald-500" /> : <TerminalSquare size={12} className="text-teal-500" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-[11px] leading-relaxed truncate text-slate-600 dark:text-slate-400 group-hover:text-slate-900 dark:group-hover:text-white">Coding Practice</p>
                              <span className="text-[9px] uppercase tracking-wide text-teal-600 dark:text-teal-400">
                                {solvedCount}/{steps.length} solved
                              </span>
                            </div>
                          </Link>
                        );
                      })()}
                      {(lessonAssignmentSteps.get(lesson.id) ?? []).map(a => {
                        const submitted = a.state === 'submitted' || a.state === 'graded' || a.state === 'returned' || a.state === 'resubmitted';
                        const assignmentLocked = isLocked || a.state === 'locked';
                        return (
                          <Link
                            key={`la-${a.id}`}
                            to={`/student/assignments/${a.id}?returnTo=${encodeURIComponent(`/student/course/${course.id}`)}`}
                            title={assignmentLocked ? 'Complete this lesson first' : undefined}
                            className={`w-full text-left pl-14 pr-3 py-1.5 flex items-center gap-2.5 border-l-2 border-transparent transition-all group ${
                              isActive ? 'bg-primary-50/60 dark:bg-primary-900/10' : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                            } ${assignmentLocked ? 'opacity-75' : ''}`}
                          >
                            <div className="flex-shrink-0">
                              {submitted ? (
                                <CheckCircle size={12} className="text-emerald-500" />
                              ) : assignmentLocked ? (
                                <Lock size={12} className="text-slate-400" />
                              ) : (
                                <ClipboardList size={12} className="text-primary-500" />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-[11px] leading-relaxed truncate text-slate-600 dark:text-slate-400 group-hover:text-slate-900 dark:group-hover:text-white">{a.title}</p>
                              <span className="text-[9px] uppercase tracking-wide text-primary-600 dark:text-primary-400">
                                {submitted ? 'Assignment · submitted' : assignmentLocked ? 'Assignment · locked' : 'Assignment'}
                              </span>
                            </div>
                          </Link>
                        );
                      })}
                      {/* Per-lesson mini project steps — the last step of the
                          lesson flow (lesson -> quiz -> practice -> assignment
                          -> mini project). */}
                      {(lessonMiniSteps.get(lesson.id) ?? []).map(m => {
                        const miniCompleted = m.state === 'completed';
                        return (
                          <Link
                            key={`lm-${m.id}`}
                            to={`/student/mini-projects/${m.id}`}
                            className={`w-full text-left pl-14 pr-3 py-1.5 flex items-center gap-2.5 border-l-2 border-transparent transition-all group ${
                              isActive ? 'bg-primary-50/60 dark:bg-primary-900/10' : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                            }`}
                          >
                            <div className="flex-shrink-0">
                              {miniCompleted ? <CheckCircle size={12} className="text-emerald-500" /> : <Puzzle size={12} className="text-amber-500" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-[11px] leading-relaxed truncate text-slate-600 dark:text-slate-400 group-hover:text-slate-900 dark:group-hover:text-white">{m.title}</p>
                              <span className="text-[9px] uppercase tracking-wide text-amber-600 dark:text-amber-400">
                                {miniCompleted ? 'Mini Project · completed' : `Mini Project · ${m.marks} marks`}
                              </span>
                            </div>
                          </Link>
                        );
                      })}
                      </Fragment>
                    );
                  })}

                  {/* Chapter-level steps: quizzes (MCQ practice) then coding practice — CCBP order */}
                  {(chapterQuizSteps.get(chapter.id) ?? []).map(q => (
                    <Link
                      key={q.id}
                      to={`/student/quizzes?quizId=${q.id}&returnTo=${encodeURIComponent(`/student/course/${course.id}`)}`}
                      className="w-full text-left pl-9 pr-3 py-2 flex items-center gap-2.5 hover:bg-slate-50 dark:hover:bg-slate-800/50 border-l-2 border-transparent transition-all group"
                    >
                      <div className="flex-shrink-0">
                        {q.passed ? <CheckCircle size={14} className="text-emerald-500" /> : <HelpCircle size={14} className="text-amber-500" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs leading-relaxed truncate text-slate-600 dark:text-slate-400 group-hover:text-slate-900 dark:group-hover:text-white">{q.title}</p>
                        <span className="text-[10px] text-amber-600 dark:text-amber-400">MCQ Practice · Pass {q.pass_percentage}%</span>
                      </div>
                    </Link>
                  ))}                  {/* CCBP-style: one "Coding Practice" step per chapter opens the question list */}
                  {(chapterCodingSteps.get(chapter.id) ?? []).length > 0 && (() => {
                    const steps = chapterCodingSteps.get(chapter.id) ?? [];
                    const allSolved = steps.every(s => s.solved);
                    return (
                      <Link
                        to={`/student/course/${course.id}/practice/${chapter.id}`}
                        className="w-full text-left pl-9 pr-3 py-2 flex items-center gap-2.5 hover:bg-slate-50 dark:hover:bg-slate-800/50 border-l-2 border-transparent transition-all group"
                      >
                        <div className="flex-shrink-0">
                          {allSolved ? <CheckCircle size={14} className="text-emerald-500" /> : <TerminalSquare size={14} className="text-teal-500" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs leading-relaxed truncate text-slate-600 dark:text-slate-400 group-hover:text-slate-900 dark:group-hover:text-white">Coding Practice — {chapter.title}</p>
                          <span className="text-[10px] text-teal-600 dark:text-teal-400">Coding Practice · {steps.filter(s => s.solved).length}/{steps.length} solved</span>
                        </div>
                      </Link>
                    );
                  })()}
                </div>
              </Collapsible>
            </div>
          );
        })}

      </div>
    </div>
  );
}
