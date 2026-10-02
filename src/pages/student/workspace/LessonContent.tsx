import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ChevronRight, ChevronLeft, CheckCircle, BookOpen, Video, FileText, Code,
  ExternalLink, ChevronDown, Lightbulb, Play, Clock, Zap,
  Bookmark, BookmarkCheck, Loader2, Award, ClipboardList,
  PanelLeftOpen, PanelRightOpen, Copy, Terminal, Lock,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { chapterStepCounts, useWorkspace } from './WorkspaceContext';
import { AnimatedCheck, CelebrationBurst } from '../../../components/motion';
import { EmptyState } from '../../../components/ui/EmptyState';
import { VideoEmbed } from './VideoEmbed';
import { DeliveryBanner } from './DeliveryBanner';
import { SecureResourceCard } from './SecureResourceCard';
// Practice/quizzes render as dedicated flow steps between lessons — the
// LessonPracticePage and the quiz runner handle them, not this page.

export function LessonContent() {
  const navigate = useNavigate();
  const ws = useWorkspace();
  const {
    currentLesson, currentChapter, course, resources, topics,
    lessonAssignments, lessonSessions, lessonLoading,
    goToNextLesson, goToPrevLesson, markComplete, toggleStudentBookmark,
    currentLessonIndex, totalLessons, sidebarCollapsed, rightPanelCollapsed,
    toggleSidebar, toggleRightPanel, progress, isBookmarked, accessMap,
    lessonQuizzes, lessonCodingSteps,
  } = ws;

  const [expandedTopics, setExpandedTopics] = useState<Set<string>>(new Set());
  const [markingComplete, setMarkingComplete] = useState(false);
  const [celebrate, setCelebrate] = useState<{ title: string; message: string } | null>(null);
  const celebrateTimer = useRef<number | null>(null);

  useEffect(() => () => {
    if (celebrateTimer.current) window.clearTimeout(celebrateTimer.current);
  }, []);

  useEffect(() => {
    if (currentLesson) {
      setExpandedTopics(new Set());
    }
  }, [currentLesson?.id]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) return;
      if (e.altKey && e.key === 'ArrowRight') { e.preventDefault(); goToNextLesson(); }
      if (e.altKey && e.key === 'ArrowLeft') { e.preventDefault(); goToPrevLesson(); }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [goToNextLesson, goToPrevLesson]);

  if (!course) return null;
  if (!currentLesson) {
    return (
      <div className="flex items-center justify-center h-full px-6">
        <EmptyState
          icon={Terminal}
          mascot
          title="Choose your next challenge"
          description="Your learning journey continues here — pick a lesson from the sidebar and keep going."
        />
      </div>
    );
  }

  const accessInfo = accessMap.get(currentLesson.id);
  const isLocked = accessInfo?.access === 'locked';

  if (isLocked) {
    return (
      <div className="flex items-center justify-center h-full px-6">
        <div className="max-w-md w-full text-center">
          <div className="w-16 h-16 rounded-2xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center mx-auto mb-5">
            <Lock size={28} className="text-amber-600 dark:text-amber-400" />
          </div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-1">{currentLesson.title}</h2>
          <p className="text-sm font-medium text-amber-600 dark:text-amber-400 mb-2">This lesson is locked</p>
          <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
            {accessInfo?.reason || 'Complete the required previous work to unlock this lesson.'}
          </p>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-4">
            Locked lessons become available once the required work is completed or your faculty releases them.
          </p>
        </div>
      </div>
    );
  }

  const isCompleted = progress.has(currentLesson.id);
  const slides = resources.filter(r => r.resource_type === 'slides');
  const notes = resources.filter(r => r.resource_type === 'notes');
  const codeExamples = resources.filter(r => r.resource_type === 'code_example');
  const recordings = resources.filter(r => r.resource_type === 'recorded_video');
  const videoUrl = currentLesson.video_url || recordings[0]?.external_url || recordings[0]?.file_url;

  async function handleMarkComplete() {
    setMarkingComplete(true);
    try {
      // "Was this lesson the last unfinished item in its chapter?" — computed
      // from the pre-mark counts, because marking completes exactly one item.
      const lesson = currentLesson;
      if (!lesson) return;
      const chapter = ws.chapters.find(c => c.id === lesson.chapter_id);
      const countsBefore = chapter
        ? chapterStepCounts(chapter, ws.lessonQuizSteps, ws.lessonCodingSteps, ws.lessonAssignmentSteps, ws.chapterQuizSteps, ws.chapterCodingSteps, ws.progress)
        : null;
      const finishesChapter = countsBefore !== null && countsBefore.total > 0 && countsBefore.done + 1 === countsBefore.total;

      await markComplete();

      // Short celebratory confirmation (~1.5s, decorative, never blocks clicks).
      setCelebrate(finishesChapter
        ? { title: 'Chapter complete!', message: `Every item in "${currentChapter?.title ?? 'this chapter'}" is done. Your next chapter is ready.` }
        : { title: 'Lesson complete!', message: 'Nice work — your next step is ready in the sidebar.' });
      if (celebrateTimer.current) window.clearTimeout(celebrateTimer.current);
      celebrateTimer.current = window.setTimeout(() => setCelebrate(null), 1600);
    } finally {
      setMarkingComplete(false);
    }
  }

  const sections = [
    videoUrl && 'video',
    lessonSessions.length > 0 && 'live',
    slides.length > 0 && 'slides',
    currentLesson.notes_markdown && 'notes',
    notes.length > 0 && 'materials',
    (currentLesson.code_example || codeExamples.length > 0) && 'code',
    topics.length > 0 && 'topics',
    // Practice and quizzes deliberately NOT on the lesson page: they are
    // separate flow steps (lesson -> quiz -> coding practice -> next lesson).
    lessonAssignments.length > 0 && 'assignments',
  ].filter(Boolean) as string[];

  if (lessonLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <Loader2 className="animate-spin text-primary-500 mx-auto mb-3" size={28} />
          <p className="text-sm text-slate-400">Loading lesson...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Sticky lesson header */}
      <div className="flex-shrink-0 bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm border-b border-slate-100 dark:border-slate-800 z-10 sticky top-0">
        <div className="px-4 lg:px-6 py-3">
          <div className="flex items-center justify-between gap-3 mb-2">
            <div className="flex items-center gap-2 min-w-0">
              {sidebarCollapsed && (
                <button onClick={toggleSidebar} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 flex-shrink-0">
                  <PanelLeftOpen size={16} />
                </button>
              )}
              <nav className="flex items-center gap-1 text-xs text-slate-400 min-w-0 truncate">
                <span className="truncate max-w-[120px]">{course.title}</span>
                <ChevronRight size={10} className="flex-shrink-0" />
                <span className="truncate max-w-[120px]">{currentChapter?.title}</span>
                <ChevronRight size={10} className="flex-shrink-0" />
                <span className="text-slate-700 dark:text-slate-200 font-medium truncate">{currentLesson.title}</span>
              </nav>
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <button onClick={toggleStudentBookmark} className={`p-1.5 rounded-lg transition-colors ${isBookmarked ? 'text-amber-500 bg-amber-50 dark:bg-amber-900/20' : 'text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'}`}>
                {isBookmarked ? <BookmarkCheck size={16} /> : <Bookmark size={16} />}
              </button>
              {rightPanelCollapsed && (
                <button onClick={toggleRightPanel} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hidden lg:flex">
                  <PanelRightOpen size={16} />
                </button>
              )}
            </div>
          </div>

          <div className="flex items-center gap-4 text-xs text-slate-400">
            <span className="flex items-center gap-1"><Clock size={11} /> {currentLesson.duration_minutes} min</span>
            {currentLesson.xp_reward > 0 && <span className="flex items-center gap-1 text-amber-500"><Zap size={11} /> +{currentLesson.xp_reward} XP</span>}
            <span className="flex items-center gap-1">
              {currentLesson.teaching_mode === 'live_class' ? <Video size={11} /> : <FileText size={11} />}
              {currentLesson.teaching_mode === 'live_class' ? 'Live Class' : 'Recorded'}
            </span>
            {currentLesson.enable_coding_playground && (
              <span className="flex items-center gap-1 text-teal-500"><Code size={11} /> Playground</span>
            )}
            {isCompleted && <span className="flex items-center gap-1 text-emerald-500"><CheckCircle size={11} /> Completed</span>}
            <span className="ml-auto text-[10px]">{currentLessonIndex + 1} of {totalLessons}</span>
          </div>

          <div className="mt-2 h-0.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
            <div className="h-full bg-primary-500 rounded-full transition-all duration-300" style={{ width: `${((currentLessonIndex + 1) / totalLessons) * 100}%` }} />
          </div>
        </div>

        {sections.length > 1 && (
          <div className="px-4 lg:px-6 pb-2 flex gap-1.5 overflow-x-auto scrollbar-none">
            {sections.map(s => (
              <button
                key={s}
                onClick={() => document.getElementById(`section-${s}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                className="px-3 py-1 rounded-full text-[10px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-primary-50 hover:text-primary-600 dark:hover:bg-primary-900/20 whitespace-nowrap transition-colors capitalize"
              >
                {s.replace('-', ' ')}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-4 lg:px-6 py-6 space-y-8">
          {/* Delivery mode banner — recorded / live / ended states */}
          <DeliveryBanner lesson={currentLesson} sessions={lessonSessions} />

          {/* Video player */}
          {videoUrl && (
            <section id="section-video" className="scroll-mt-40">
              <VideoEmbed videoUrl={videoUrl} title={currentLesson.title} />
            </section>
          )}

          {/* Lesson overview */}
          {currentLesson.explanation && (
            <div className="card p-5 bg-gradient-to-br from-primary-50 to-teal-50/50 dark:from-primary-900/10 dark:to-teal-900/10 border-primary-100 dark:border-primary-800/30">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-primary-700 dark:text-primary-400 mb-2">
                <Lightbulb size={14} /> Lesson Overview
              </h3>
              <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">{currentLesson.explanation}</p>
            </div>
          )}

          {/* Live Sessions */}
          {lessonSessions.length > 0 && (
            <Section id="live" title="Live Classes" icon={Video}>
              {lessonSessions.map(s => (
                <div key={s.id} className="card p-4 flex items-center gap-4">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${s.status === 'live' ? 'bg-red-100 dark:bg-red-900/30' : s.status === 'completed' ? 'bg-emerald-100 dark:bg-emerald-900/30' : 'bg-primary-50 dark:bg-primary-900/20'}`}>
                    {s.status === 'live' ? (
                      <div className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
                    ) : s.status === 'completed' ? (
                      <CheckCircle size={16} className="text-emerald-600 dark:text-emerald-400" />
                    ) : (
                      <Video size={16} className="text-primary-600 dark:text-primary-400" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900 dark:text-white">{s.title}</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {s.status === 'live' ? 'Live now' : s.status === 'completed' ? 'Completed' : 'Upcoming'}
                      {' · '}{new Date(s.session_date).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
                    </p>
                  </div>
                  {s.status === 'completed' ? (
                    <Link
                      to={`/student/live-classes/${s.id}`}
                      className="btn-secondary text-xs py-1.5 px-3 flex items-center gap-1"
                    >
                      <Play size={11} /> View Session
                    </Link>
                  ) : s.google_meet_url ? (
                    <a href={s.google_meet_url} target="_blank" rel="noopener noreferrer" className="btn-primary text-xs py-1.5 px-3 flex items-center gap-1">
                      <Play size={11} /> {s.status === 'live' ? 'Join Now' : 'Open Meet'}
                    </a>
                  ) : null}
                </div>
              ))}
            </Section>
          )}

          {/* Slides — inline secure viewer, raw links are never exposed */}
          {slides.length > 0 && (
            <Section id="slides" title="Slides" icon={BookOpen}>
              {slides.map(r => <SecureResourceCard key={r.id} resource={r} />)}
            </Section>
          )}

          {/* Lesson notes (markdown) */}
          {currentLesson.notes_markdown && (
            <Section id="notes" title="Lesson Notes" icon={FileText}>
              <div className="prose-lesson text-sm leading-relaxed text-slate-700 dark:text-slate-300">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{currentLesson.notes_markdown}</ReactMarkdown>
              </div>
            </Section>
          )}

          {/* Study materials — inline secure viewer, raw links are never exposed */}
          {notes.length > 0 && (
            <Section id="materials" title="Study Materials" icon={FileText}>
              {notes.map(r => <SecureResourceCard key={r.id} resource={r} />)}
            </Section>
          )}

          {/* Code example (read-only preview) */}
          {(currentLesson.code_example || codeExamples.length > 0) && (
            <Section id="code" title="Code Examples" icon={Code}>
              {currentLesson.code_example && (
                <div className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700">
                  <div className="bg-slate-800 px-4 py-2 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="flex gap-1.5">
                        <div className="w-2.5 h-2.5 rounded-full bg-red-400" />
                        <div className="w-2.5 h-2.5 rounded-full bg-yellow-400" />
                        <div className="w-2.5 h-2.5 rounded-full bg-green-400" />
                      </div>
                      <span className="text-xs text-slate-400 ml-2">main.py</span>
                    </div>
                    <button onClick={() => navigator.clipboard.writeText(currentLesson.code_example ?? '')} className="text-slate-400 hover:text-white p-1">
                      <Copy size={12} />
                    </button>
                  </div>
                  <pre className="bg-slate-900 p-4 text-sm font-mono text-slate-100 overflow-x-auto max-h-[400px] overflow-y-auto leading-relaxed">
                    {currentLesson.code_example}
                  </pre>
                </div>
              )}
              {codeExamples.map(r => <SecureResourceCard key={r.id} resource={r} />)}
            </Section>
          )}

          {/* Topics */}
          {topics.length > 0 && (
            <Section id="topics" title="Topics Covered" icon={BookOpen}>
              <div className="space-y-2">
                {topics.map((topic, i) => (
                  <div key={topic.id} className="card overflow-hidden">
                    <button
                      onClick={() => setExpandedTopics(prev => {
                        const n = new Set(prev);
                        if (n.has(topic.id)) n.delete(topic.id);
                        else n.add(topic.id);
                        return n;
                      })}
                      className="w-full p-4 flex items-center gap-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                    >
                      <span className="w-6 h-6 rounded-full bg-primary-50 dark:bg-primary-900/20 text-primary-600 text-xs font-bold flex items-center justify-center flex-shrink-0">{i + 1}</span>
                      <span className="flex-1 text-sm font-medium text-slate-900 dark:text-white">{topic.title}</span>
                      {expandedTopics.has(topic.id) ? <ChevronDown size={14} className="text-slate-400" /> : <ChevronRight size={14} className="text-slate-400" />}
                    </button>
                    {expandedTopics.has(topic.id) && (
                      <div className="px-4 pb-4 pl-12 space-y-2">
                        {topic.description && <p className="text-sm text-slate-500 dark:text-slate-400">{topic.description}</p>}
                        {topic.subtopics?.map((sub: any) => (
                          <div key={sub.id} className="flex items-start gap-2 py-1">
                            <div className="w-1.5 h-1.5 rounded-full bg-teal-500 mt-1.5 flex-shrink-0" />
                            <div>
                              <p className="text-sm text-slate-700 dark:text-slate-300">{sub.title}</p>
                              {sub.description && <p className="text-xs text-slate-400 mt-0.5">{sub.description}</p>}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* Per-lesson coding practice + quiz steps: NOT rendered inline on
              the lesson page. They are separate flow steps between lessons —
              see the sidebar (Lesson -> Quiz -> Coding Practice -> next lesson)
              and the dedicated practice pages. */}
          {(lessonQuizzes.length > 0 || (lessonCodingSteps.get(currentLesson.id) ?? []).length > 0) && (
            <div className="flex flex-wrap items-center gap-3">
              {lessonQuizzes.length > 0 && (
                <Link
                  to={`/student/quizzes?quizId=${lessonQuizzes[0].id}&returnTo=${encodeURIComponent(`/student/course/${course.id}`)}`}
                  className="btn-secondary flex items-center gap-2 text-sm"
                >
                  <Award size={14} /> Take the quiz for this lesson
                </Link>
              )}
              {(lessonCodingSteps.get(currentLesson.id) ?? []).length > 0 && (
                <Link
                  to={`/student/course/${course.id}/lesson-practice/${currentLesson.id}`}
                  className="btn-primary flex items-center gap-2 text-sm"
                >
                  <Terminal size={14} /> Practice coding →
                </Link>
              )}
            </div>
          )}

          {/* Assignments */}
          {lessonAssignments.length > 0 && (
            <Section id="assignments" title="Assignments" icon={ClipboardList}>
              {lessonAssignments.map(a => (
                <div key={a.id} className="card p-4 flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-primary-50 dark:bg-primary-900/20 flex items-center justify-center flex-shrink-0">
                    <ClipboardList size={18} className="text-primary-600" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-slate-900 dark:text-white">{a.title}</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {a.due_date ? `Due: ${new Date(a.due_date).toLocaleDateString('en-IN', { dateStyle: 'medium' })}` : 'No deadline'}
                      {' | '}{a.max_marks} marks
                    </p>
                  </div>
                  <button onClick={() => navigate(`/student/assignments/${a.id}?returnTo=/student/course/${course.id}`)} className="btn-secondary text-xs py-1.5 px-3">Start</button>
                </div>
              ))}
            </Section>
          )}
        </div>

        {/* Bottom navigation */}
        <div className="border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 lg:px-6 py-4 flex items-center justify-between gap-3 sticky bottom-0">
          <button
            onClick={goToPrevLesson}
            disabled={currentLessonIndex <= 0}
            className="btn-secondary text-sm py-2 px-4 flex items-center gap-1.5 disabled:opacity-40"
          >
            <ChevronLeft size={14} /> Previous
          </button>

          {!isCompleted ? (
            <button
              onClick={handleMarkComplete}
              disabled={markingComplete}
              className="btn-primary text-sm py-2 px-5 flex items-center gap-2"
            >
              {markingComplete ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
              {markingComplete ? 'Completing...' : 'Mark Complete'}
            </button>
          ) : (
            <span className="flex items-center gap-1.5 text-sm text-emerald-600 font-medium">
              <CheckCircle size={14} /> Completed
            </span>
          )}

          <button
            onClick={goToNextLesson}
            disabled={currentLessonIndex >= totalLessons - 1}
            className="btn-primary text-sm py-2 px-4 flex items-center gap-1.5 disabled:opacity-40 group"
          >
            Next <ChevronRight size={14} className="transition-transform duration-200 group-hover:translate-x-0.5" />
          </button>
        </div>
      </div>

      {/* Completion celebration — decorative overlay, clicks pass through. */}
      {celebrate && (
        <div className="pointer-events-none fixed inset-x-0 bottom-24 z-40 flex justify-center px-4" role="status" aria-live="polite">
          <div className="relative flex items-center gap-3 rounded-2xl border border-emerald-200 bg-white/95 px-5 py-3 shadow-xl dark:border-emerald-800 dark:bg-slate-900/95">
            <CelebrationBurst show />
            <AnimatedCheck size={22} className="text-emerald-500" />
            <div>
              <p className="text-sm font-semibold text-slate-900 dark:text-white">{celebrate.title}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">{celebrate.message}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Section({ id, title, icon: Icon, children }: { id: string; title: string; icon: any; children: React.ReactNode }) {
  return (
    <section id={`section-${id}`} className="scroll-mt-40">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
          <Icon size={14} className="text-slate-500" />
        </div>
        <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{title}</h3>
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function ResourceCard({ resource }: { resource: any }) {
  const url = resource.file_url;
  // Only non-embeddable files land here — download only, raw links never shown.
  if (!url) return null;
  return (
    <div className="card p-4 flex items-center gap-3">
      <div className="w-9 h-9 rounded-lg bg-primary-50 dark:bg-primary-900/20 flex items-center justify-center flex-shrink-0">
        <FileText size={15} className="text-primary-600" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-900 dark:text-white truncate">{resource.title}</p>
        {resource.description && <p className="text-xs text-slate-400 mt-0.5 truncate">{resource.description}</p>}
      </div>
      <a href={url} target="_blank" rel="noopener noreferrer" className="btn-secondary text-xs py-1.5 flex items-center gap-1 flex-shrink-0">
        Download
      </a>
    </div>
  );
}
