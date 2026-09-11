import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ChevronRight, ChevronLeft, CheckCircle, BookOpen, Video, FileText, Code,
  ExternalLink, ChevronDown, Lightbulb, Eye, EyeOff, Play, Clock, Zap,
  Bookmark, BookmarkCheck, Loader2, Award, ClipboardList, HelpCircle,
  PanelLeftOpen, PanelRightOpen, Copy, Terminal, Lock,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useWorkspace } from './WorkspaceContext';
import { VideoEmbed } from './VideoEmbed';

export function LessonContent() {
  const navigate = useNavigate();
  const ws = useWorkspace();
  const {
    currentLesson, currentChapter, course, resources, topics, practiceQuestions,
    lessonQuizzes, lessonAssignments, lessonSessions, lessonLoading,
    goToNextLesson, goToPrevLesson, markComplete, toggleStudentBookmark,
    currentLessonIndex, totalLessons, sidebarCollapsed, rightPanelCollapsed,
    toggleSidebar, toggleRightPanel, progress, isBookmarked, accessMap,
  } = ws;

  const [expandedTopics, setExpandedTopics] = useState<Set<string>>(new Set());
  const [expandedHints, setExpandedHints] = useState<Set<string>>(new Set());
  const [showSolutions, setShowSolutions] = useState<Set<string>>(new Set());
  const [markingComplete, setMarkingComplete] = useState(false);

  useEffect(() => {
    if (currentLesson) {
      setExpandedTopics(new Set());
      setExpandedHints(new Set());
      setShowSolutions(new Set());
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

  if (!currentLesson || !course) return null;

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
    try { await markComplete(); } finally { setMarkingComplete(false); }
  }

  const sections = [
    videoUrl && 'video',
    lessonSessions.length > 0 && 'live',
    slides.length > 0 && 'slides',
    currentLesson.notes_markdown && 'notes',
    notes.length > 0 && 'materials',
    (currentLesson.code_example || codeExamples.length > 0) && 'code',
    topics.length > 0 && 'topics',
    practiceQuestions.length > 0 && 'practice',
    lessonQuizzes.length > 0 && 'quizzes',
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

          {/* Slides */}
          {slides.length > 0 && (
            <Section id="slides" title="Slides" icon={BookOpen}>
              {slides.map(r => <ResourceCard key={r.id} resource={r} />)}
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

          {/* Study materials */}
          {notes.length > 0 && (
            <Section id="materials" title="Study Materials" icon={FileText}>
              {notes.map(r => <ResourceCard key={r.id} resource={r} />)}
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
              {codeExamples.map(r => <ResourceCard key={r.id} resource={r} />)}
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

          {/* Practice Questions */}
          {practiceQuestions.length > 0 && (
            <Section id="practice" title="Practice Questions" icon={HelpCircle}>
              <div className="space-y-4">
                {practiceQuestions.map((q, i) => (
                  <div key={q.id} className="card p-5">
                    <div className="flex items-start gap-3 mb-3">
                      <span className="w-6 h-6 rounded-full bg-amber-100 dark:bg-amber-900/20 text-amber-600 text-xs font-bold flex items-center justify-center flex-shrink-0">Q{i + 1}</span>
                      <p className="text-sm text-slate-900 dark:text-white font-medium leading-relaxed">{q.question_text}</p>
                    </div>
                    {q.hint && (
                      <button
                        onClick={() => setExpandedHints(prev => { const n = new Set(prev); if (n.has(q.id)) n.delete(q.id); else n.add(q.id); return n; })}
                        className="text-xs text-primary-600 hover:text-primary-700 flex items-center gap-1 mb-2 ml-9"
                      >
                        <Lightbulb size={11} /> {expandedHints.has(q.id) ? 'Hide Hint' : 'Show Hint'}
                      </button>
                    )}
                    {expandedHints.has(q.id) && q.hint && (
                      <div className="ml-9 p-3 bg-amber-50 dark:bg-amber-900/10 rounded-lg text-xs text-amber-700 dark:text-amber-400 mb-2">{q.hint}</div>
                    )}
                    {q.expected_output && (
                      <div className="ml-9 mt-2">
                        <p className="text-xs text-slate-400 mb-1">Expected Output:</p>
                        <pre className="bg-slate-900 text-emerald-400 text-xs p-3 rounded-lg font-mono">{q.expected_output}</pre>
                      </div>
                    )}
                    {q.show_solution && q.sample_solution && (
                      <div className="ml-9 mt-3">
                        <button
                          onClick={() => setShowSolutions(prev => { const n = new Set(prev); if (n.has(q.id)) n.delete(q.id); else n.add(q.id); return n; })}
                          className="text-xs text-teal-600 hover:text-teal-700 flex items-center gap-1"
                        >
                          {showSolutions.has(q.id) ? <EyeOff size={11} /> : <Eye size={11} />}
                          {showSolutions.has(q.id) ? 'Hide Solution' : 'View Solution'}
                        </button>
                        {showSolutions.has(q.id) && (
                          <pre className="bg-slate-900 text-slate-100 text-xs p-3 rounded-lg font-mono mt-2 overflow-x-auto">{q.sample_solution}</pre>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* Quizzes */}
          {lessonQuizzes.length > 0 && (
            <Section id="quizzes" title="Lesson Quizzes" icon={Award}>
              {lessonQuizzes.map(q => (
                <div key={q.id} className="card p-4 flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-900/20 flex items-center justify-center flex-shrink-0">
                    <Award size={18} className="text-amber-600" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-slate-900 dark:text-white">{q.title}</p>
                    <p className="text-xs text-slate-400 mt-0.5">Pass: {q.pass_percentage}% | +{q.xp_reward} XP</p>
                  </div>
                  <button onClick={() => navigate(`/student/quizzes?returnTo=/student/course/${course.id}`)} className="btn-secondary text-xs py-1.5 px-3">Take Quiz</button>
                </div>
              ))}
            </Section>
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
            className="btn-primary text-sm py-2 px-4 flex items-center gap-1.5 disabled:opacity-40"
          >
            Next <ChevronRight size={14} />
          </button>
        </div>
      </div>
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
  const url = resource.file_url || resource.external_url;
  return (
    <div className="card p-4 flex items-center gap-3">
      <div className="w-9 h-9 rounded-lg bg-primary-50 dark:bg-primary-900/20 flex items-center justify-center flex-shrink-0">
        <FileText size={15} className="text-primary-600" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-900 dark:text-white truncate">{resource.title}</p>
        {resource.description && <p className="text-xs text-slate-400 mt-0.5 truncate">{resource.description}</p>}
      </div>
      {url && (
        <a href={url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary-600 hover:text-primary-700 flex items-center gap-1 flex-shrink-0">
          <ExternalLink size={11} /> Open
        </a>
      )}
    </div>
  );
}
