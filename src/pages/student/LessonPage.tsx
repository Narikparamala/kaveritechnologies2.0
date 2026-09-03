import { useEffect, useState, lazy, Suspense, useRef, useCallback } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import {
  ChevronLeft, ChevronRight, CheckCircle, Bookmark, BookmarkCheck, ArrowLeft,
  Download, ListTree, HelpCircle, ExternalLink, Lock, Play, FileText, Video,
  Film, Code2, BookOpen, ClipboardList, RotateCcw, Terminal,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ProgressBar } from '../../components/ui/ProgressBar';
import { PageLoader } from '../../components/ui/LoadingSpinner';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../components/ui/Toast';
import { supabase } from '../../lib/supabase';
import {
  getLessonById, getLessonProgress, markLessonComplete,
  getLessonNotes, saveNote, getBookmark, toggleBookmark, getLessonResources
} from '../../services/lessons';
import { runPython, onRuntimeStatus, type RuntimeStatus } from '../../services/pythonExecution';
import type {
  Lesson, Chapter, Course, LessonProgress, LessonNote, LessonResource,
  LessonTopic, LessonPracticeQuestion, Quiz, Assignment, LiveSession
} from '../../types/database';

const MonacoEditor = lazy(() => import('@monaco-editor/react').then(m => ({ default: m.default })));

export default function LessonPage() {
  const { lessonId } = useParams<{ lessonId: string }>();
  const { profile, refreshProfile } = useAuth();
  const { success, error: toastError } = useToast();
  const navigate = useNavigate();

  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [chapter, setChapter] = useState<Chapter | null>(null);
  const [course, setCourse] = useState<Course | null>(null);
  const [allLessons, setAllLessons] = useState<Lesson[]>([]);
  const [progress, setProgress] = useState<LessonProgress | null>(null);
  const [noteContent, setNoteContent] = useState('');
  const [savedNote, setSavedNote] = useState<LessonNote | null>(null);
  const [isBookmarked, setIsBookmarked] = useState(false);
  const [resources, setResources] = useState<LessonResource[]>([]);
  const [topics, setTopics] = useState<(LessonTopic & { subtopics: any[] })[]>([]);
  const [practiceQuestions, setPracticeQuestions] = useState<LessonPracticeQuestion[]>([]);
  const [lessonQuizzes, setLessonQuizzes] = useState<Quiz[]>([]);
  const [lessonAssignments, setLessonAssignments] = useState<Assignment[]>([]);
  const [lessonSessions, setLessonSessions] = useState<LiveSession[]>([]);
  const [expandedTopics, setExpandedTopics] = useState<Set<string>>(new Set());
  const [expandedHints, setExpandedHints] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [markingComplete, setMarkingComplete] = useState(false);

  // Playground state
  const [playgroundCode, setPlaygroundCode] = useState('# Write your Python code here\n');
  const [playgroundOutput, setPlaygroundOutput] = useState('');
  const [playgroundRunning, setPlaygroundRunning] = useState(false);
  const [runtimeStatus, setRuntimeStatus] = useState<RuntimeStatus>('idle');
  const [mobileTab, setMobileTab] = useState<'lesson' | 'code' | 'output'>('lesson');
  const [isDesktop, setIsDesktop] = useState(() => window.innerWidth >= 1024);

  useEffect(() => {
    const unsub = onRuntimeStatus(setRuntimeStatus);
    return unsub;
  }, []);

  useEffect(() => {
    const check = () => setIsDesktop(window.innerWidth >= 1024);
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  useEffect(() => {
    if (!lessonId || !profile) return;
    const load = async () => {
      setLoading(true);
      const l = await getLessonById(lessonId);
      if (!l) { setLoading(false); return; }
      setLesson(l);
      if (l.code_example) setPlaygroundCode(l.code_example);

      const [ch, co, allL, prog, note, bm, res, topicsData, practiceData, quizzesData, assignmentsData, sessionsData] = await Promise.all([
        supabase.from('chapters').select('*').eq('id', l.chapter_id).maybeSingle().then(r => r.data as Chapter | null),
        supabase.from('courses').select('*').eq('id', l.course_id).maybeSingle().then(r => r.data as Course | null),
        supabase.from('lessons').select('*').eq('course_id', l.course_id).eq('is_published', true).order('order_index').then(r => (r.data ?? []) as Lesson[]),
        getLessonProgress(lessonId, profile.id),
        getLessonNotes(lessonId, profile.id),
        getBookmark(lessonId, profile.id),
        getLessonResources(lessonId),
        supabase.from('lesson_topics').select('*, subtopics:lesson_subtopics(*)').eq('lesson_id', lessonId).order('order_index').then(r => r.data ?? []),
        supabase.from('lesson_practice_questions').select('*').eq('lesson_id', lessonId).eq('is_published', true).order('order_index').then(r => r.data ?? []),
        supabase.from('quizzes').select('*').eq('lesson_id', lessonId).eq('is_published', true).then(r => r.data ?? []),
        supabase.from('assignments').select('*').eq('lesson_id', lessonId).eq('is_published', true).then(r => r.data ?? []),
        supabase.from('live_sessions').select('*').eq('lesson_id', lessonId).order('session_date', { ascending: false }).then(r => r.data ?? []),
      ]);

      setChapter(ch);
      setCourse(co);
      setAllLessons(allL);
      setProgress(prog);
      setSavedNote(note);
      setNoteContent(note?.content ?? '');
      setIsBookmarked(!!bm);
      setResources(res as LessonResource[]);
      setTopics(topicsData as any);
      setExpandedTopics(new Set(topicsData.length > 0 ? [topicsData[0].id] : []));
      setPracticeQuestions(practiceData as any);
      setLessonQuizzes(quizzesData as any);
      setLessonAssignments(assignmentsData as any);
      setLessonSessions(sessionsData as any);
      setLoading(false);
    };
    load();
  }, [lessonId, profile]);

  const handleMarkComplete = async () => {
    if (!lesson || !profile || progress?.completed) return;
    setMarkingComplete(true);
    try {
      const result = await markLessonComplete(lesson.id);
      setProgress(result.progress);
      await refreshProfile();
      success(
        'Lesson complete!',
        result.xpAwarded > 0 ? `+${result.xpAwarded} XP earned` : 'Progress saved',
      );
    } catch {
      toastError('Error', 'Could not mark lesson complete. Please try again.');
    }
    setMarkingComplete(false);
  };

  const handleSaveNote = async () => {
    if (!lesson || !profile) return;
    try {
      const saved = await saveNote(lesson.id, profile.id, noteContent, savedNote?.id);
      setSavedNote(saved);
      success('Note saved!');
    } catch {
      toastError('Error', 'Could not save note.');
    }
  };

  const handleToggleBookmark = async () => {
    if (!lesson || !profile) return;
    const newState = await toggleBookmark(lesson.id, profile.id, isBookmarked);
    setIsBookmarked(newState);
    if (newState) success('Bookmarked!');
  };

  const runPlaygroundCode = async () => {
    if (!playgroundCode.trim()) return;
    setPlaygroundRunning(true);
    setPlaygroundOutput('Running...');
    try {
      const result = await runPython(playgroundCode);
      setPlaygroundOutput(result.output || result.error || '(no output)');
    } catch (e: any) {
      setPlaygroundOutput(`Error: ${e.message}`);
    }
    setPlaygroundRunning(false);
  };

  if (loading) return <PageLoader />;

  if (!lesson) {
    return (
      <div className="p-8 text-center">
        <p className="text-slate-500 dark:text-slate-400 mb-4">Lesson not found or you don't have access.</p>
        <Link to="/student/courses" className="btn-primary">Back to My Courses</Link>
      </div>
    );
  }

  const currentIdx = allLessons.findIndex(l => l.id === lesson.id);
  const prevLesson = currentIdx > 0 ? allLessons[currentIdx - 1] : null;
  const nextLesson = currentIdx < allLessons.length - 1 ? allLessons[currentIdx + 1] : null;
  const progressPct = allLessons.length > 0 ? ((currentIdx + 1) / allLessons.length) * 100 : 0;
  const showPlayground = lesson.enable_coding_playground;

  const lessonContent = (
    <div className="space-y-6">
      {/* Lesson header */}
      <div>
        {chapter && <p className="text-xs font-medium text-primary-600 dark:text-primary-400 mb-2">{chapter.title}</p>}
        <div className="flex items-start justify-between gap-4">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{lesson.title}</h1>
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="text-xs text-slate-400 whitespace-nowrap">{lesson.duration_minutes}min</span>
            <span className="text-xs bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 px-2 py-0.5 rounded-full font-medium whitespace-nowrap">
              +{lesson.xp_reward} XP
            </span>
            <span className={`badge text-xs ${lesson.teaching_mode === 'live_class' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' : 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400'}`}>
              {lesson.teaching_mode === 'live_class' ? 'Live Class' : 'Recorded'}
            </span>
          </div>
        </div>
        {lesson.explanation && (
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-2">{lesson.explanation}</p>
        )}
      </div>

      {/* Live sessions for this lesson */}
      {lessonSessions.length > 0 && (
        <div className="card p-5">
          <h2 className="font-bold text-slate-900 dark:text-white mb-3 flex items-center gap-2">
            <Video size={16} className="text-primary-600" /> Live Classes
          </h2>
          <div className="space-y-2">
            {lessonSessions.map(s => (
              <div key={s.id} className="p-3 rounded-xl border border-slate-100 dark:border-slate-700">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-slate-900 dark:text-white text-sm">{s.title}</p>
                    <p className="text-xs text-slate-400">{new Date(s.session_date).toLocaleString()} · {s.duration_minutes}min</p>
                  </div>
                  <span className={`badge text-xs capitalize ${s.status === 'scheduled' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' : s.status === 'live' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-slate-100 text-slate-500'}`}>{s.status}</span>
                </div>
                {s.google_meet_url && (s.status === 'live' || s.status === 'scheduled') && (
                  <a href={s.google_meet_url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1.5 text-xs bg-emerald-600 text-white rounded-lg px-3 py-1.5 hover:bg-emerald-700">
                    <Video size={11} /> Join Google Meet
                  </a>
                )}
                {s.status === 'completed' && (
                  <p className="text-xs text-slate-400 mt-1 flex items-center gap-1">
                    <CheckCircle size={10} className="text-emerald-500" /> Class completed. {s.materials_unlocked ? 'Materials are now available below.' : 'Materials will be unlocked by faculty.'}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Slides */}
      {resources.filter(r => r.resource_type === 'slides').length > 0 && (
        <div className="card p-5">
          <h2 className="font-bold text-slate-900 dark:text-white mb-3 flex items-center gap-2">
            <FileText size={16} className="text-primary-600" /> Slides
          </h2>
          <div className="space-y-2">
            {resources.filter(r => r.resource_type === 'slides').map(r => (
              <div key={r.id} className="flex items-center gap-3 p-3 rounded-xl border border-slate-100 dark:border-slate-700">
                <FileText size={16} className="text-primary-600 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-900 dark:text-white">{r.title}</p>
                  {r.description && <p className="text-xs text-slate-400">{r.description}</p>}
                </div>
                {r.is_locked ? (
                  <span className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400"><Lock size={11} /> Locked</span>
                ) : r.external_url ? (
                  <a href={r.external_url} target="_blank" rel="noopener noreferrer" className="btn-secondary text-xs py-1.5 flex items-center gap-1"><ExternalLink size={11} /> Open</a>
                ) : r.file_url ? (
                  <a href={r.file_url} target="_blank" rel="noopener noreferrer" className="btn-secondary text-xs py-1.5 flex items-center gap-1"><Download size={11} /> Download</a>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Notes */}
      {lesson.notes_markdown && (
        <div className="card p-6">
          <h2 className="font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
            <BookOpen size={16} className="text-primary-600" /> Lesson Notes
          </h2>
          <div className="prose prose-slate dark:prose-invert max-w-none prose-code:font-mono prose-code:text-sm prose-pre:bg-slate-900 prose-pre:rounded-xl">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{lesson.notes_markdown}</ReactMarkdown>
          </div>
        </div>
      )}

      {/* Notes resource files */}
      {resources.filter(r => r.resource_type === 'notes').length > 0 && (
        <div className="card p-5">
          <h2 className="font-bold text-slate-900 dark:text-white mb-3 flex items-center gap-2">
            <FileText size={16} className="text-primary-600" /> Notes Files
          </h2>
          <div className="space-y-2">
            {resources.filter(r => r.resource_type === 'notes').map(r => (
              <div key={r.id} className="flex items-center gap-3 p-3 rounded-xl border border-slate-100 dark:border-slate-700">
                <FileText size={14} className="text-primary-600 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-900 dark:text-white">{r.title}</p>
                  {r.content_text && <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 whitespace-pre-wrap line-clamp-3">{r.content_text}</p>}
                </div>
                {r.is_locked ? (
                  <span className="flex items-center gap-1 text-xs text-amber-600"><Lock size={11} /> Locked</span>
                ) : r.external_url ? (
                  <a href={r.external_url} target="_blank" rel="noopener noreferrer" className="btn-secondary text-xs py-1.5 flex items-center gap-1"><ExternalLink size={11} /> Open</a>
                ) : r.file_url ? (
                  <a href={r.file_url} target="_blank" rel="noopener noreferrer" className="btn-secondary text-xs py-1.5 flex items-center gap-1"><Download size={11} /> Download</a>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Code example (read-only) */}
      {lesson.code_example && !showPlayground && (
        <div className="card overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
            <h2 className="font-bold text-slate-900 dark:text-white">Code Example</h2>
            <span className="text-xs text-slate-400 font-mono bg-slate-100 dark:bg-slate-700 px-2 py-0.5 rounded">Python</span>
          </div>
          <Suspense fallback={<div className="h-48 bg-slate-900 flex items-center justify-center text-slate-500 text-sm">Loading editor...</div>}>
            <MonacoEditor
              height="220px"
              language="python"
              value={lesson.code_example}
              options={{ readOnly: true, minimap: { enabled: false }, lineNumbers: 'on', scrollBeyondLastLine: false, fontSize: 13 }}
              theme="vs-dark"
            />
          </Suspense>
        </div>
      )}

      {/* Recorded video */}
      {lesson.teaching_mode === 'recorded_video' && resources.filter(r => r.resource_type === 'recorded_video' && !r.is_locked).length > 0 && (
        <div className="card p-5">
          <h2 className="font-bold text-slate-900 dark:text-white mb-3 flex items-center gap-2">
            <Film size={16} className="text-primary-600" /> Video Recording
          </h2>
          {resources.filter(r => r.resource_type === 'recorded_video' && !r.is_locked).map(r => (
            <div key={r.id} className="flex items-center gap-3 p-3 rounded-xl border border-slate-100 dark:border-slate-700">
              <Film size={16} className="text-primary-600" />
              <div className="flex-1">
                <p className="text-sm font-medium text-slate-900 dark:text-white">{r.title}</p>
                {r.description && <p className="text-xs text-slate-400">{r.description}</p>}
              </div>
              {r.external_url && (
                <a href={r.external_url} target="_blank" rel="noopener noreferrer" className="btn-primary text-xs flex items-center gap-1">
                  <Play size={11} /> Watch
                </a>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Topics */}
      {topics.length > 0 && (
        <div className="card p-5">
          <h2 className="font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
            <ListTree size={16} className="text-primary-600" /> Topics Covered
          </h2>
          <div className="space-y-2">
            {topics.map((t, idx) => (
              <div key={t.id} className="rounded-xl border border-slate-100 dark:border-slate-700 overflow-hidden">
                <button
                  onClick={() => setExpandedTopics(prev => { const n = new Set(prev); if (n.has(t.id)) n.delete(t.id); else n.add(t.id); return n; })}
                  className="w-full flex items-center gap-2 p-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50"
                >
                  <span className="text-xs text-slate-400 font-mono">{idx + 1}.</span>
                  <span className="font-medium text-sm text-slate-900 dark:text-white flex-1">{t.title}</span>
                  {t.subtopics?.length > 0 && <span className="text-xs text-slate-400">{t.subtopics.length} subtopics</span>}
                </button>
                {expandedTopics.has(t.id) && (
                  <div className="ml-8 pb-2 space-y-1">
                    {t.description && <p className="text-xs text-slate-500 px-2 pt-1">{t.description}</p>}
                    {(t.subtopics ?? []).map((st: any, sidx: number) => (
                      <div key={st.id} className="flex items-center gap-2 p-2 text-sm text-slate-600 dark:text-slate-400">
                        <span className="text-xs text-slate-400 font-mono">{idx + 1}.{sidx + 1}</span>
                        <div><p className="font-medium">{st.title}</p>{st.description && <p className="text-xs text-slate-400">{st.description}</p>}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Other resources */}
      {resources.filter(r => !['slides', 'notes', 'recorded_video'].includes(r.resource_type)).length > 0 && (
        <div className="card p-5">
          <h2 className="font-bold text-slate-900 dark:text-white mb-3 flex items-center gap-2">
            <BookOpen size={16} className="text-primary-600" /> Resources
          </h2>
          <div className="space-y-2">
            {resources.filter(r => !['slides', 'notes', 'recorded_video'].includes(r.resource_type)).map(r => (
              <div key={r.id} className="flex items-center gap-3 p-3 rounded-xl border border-slate-100 dark:border-slate-700">
                <div className="w-8 h-8 rounded-lg bg-primary-50 dark:bg-primary-900/20 flex items-center justify-center flex-shrink-0">
                  {r.resource_type === 'code_example' ? <Code2 size={14} className="text-primary-600" /> : <FileText size={14} className="text-primary-600" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-900 dark:text-white">{r.title}</p>
                  {r.description && <p className="text-xs text-slate-400">{r.description}</p>}
                  <p className="text-xs text-slate-400 capitalize">{r.resource_type.replace('_', ' ')}</p>
                </div>
                {r.is_locked ? (
                  <span className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400"><Lock size={11} /> Locked</span>
                ) : r.external_url ? (
                  <a href={r.external_url} target="_blank" rel="noopener noreferrer" className="btn-secondary text-xs py-1.5 flex items-center gap-1"><ExternalLink size={11} /> Open</a>
                ) : r.file_url ? (
                  <a href={r.file_url} target="_blank" rel="noopener noreferrer" className="btn-secondary text-xs py-1.5 flex items-center gap-1"><Download size={11} /> Download</a>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Practice Questions */}
      {practiceQuestions.length > 0 && (
        <div className="card p-5">
          <h2 className="font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
            <HelpCircle size={16} className="text-primary-600" /> Practice Questions
          </h2>
          <div className="space-y-4">
            {practiceQuestions.map((q, idx) => (
              <div key={q.id} className="p-4 rounded-xl border border-slate-100 dark:border-slate-700">
                <p className="text-sm font-medium text-slate-900 dark:text-white mb-3">Q{idx + 1}. {q.question_text}</p>
                {q.expected_output && <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">Expected output: <code className="bg-slate-100 dark:bg-slate-700 px-1 rounded">{q.expected_output}</code></p>}
                {q.hint && (
                  <div>
                    <button onClick={() => setExpandedHints(prev => { const n = new Set(prev); if (n.has(q.id)) n.delete(q.id); else n.add(q.id); return n; })} className="text-xs text-amber-600 hover:underline mb-1">
                      {expandedHints.has(q.id) ? 'Hide Hint' : 'Show Hint'}
                    </button>
                    {expandedHints.has(q.id) && <p className="text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 rounded-lg p-2">{q.hint}</p>}
                  </div>
                )}
                {q.show_solution && q.sample_solution && (
                  <details className="mt-2">
                    <summary className="text-xs text-emerald-600 cursor-pointer">Show Solution</summary>
                    <pre className="text-xs bg-slate-900 text-slate-100 rounded-lg p-3 mt-2 font-mono overflow-x-auto">{q.sample_solution}</pre>
                  </details>
                )}
                {showPlayground && (
                  <button
                    onClick={() => { setPlaygroundCode(q.sample_solution ?? `# Practice: ${q.question_text}\n`); if (!isDesktop) setMobileTab('code'); }}
                    className="text-xs text-primary-600 hover:underline mt-2 flex items-center gap-1 w-fit"
                  >
                    <Play size={10} /> Try in Playground
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quiz links */}
      {lessonQuizzes.length > 0 && (
        <div className="card p-5">
          <h2 className="font-bold text-slate-900 dark:text-white mb-3 flex items-center gap-2">
            <HelpCircle size={16} className="text-primary-600" /> Lesson Quiz
          </h2>
          <div className="space-y-2">
            {lessonQuizzes.map(q => (
              <Link key={q.id} to={`/student/quizzes`} className="flex items-center justify-between p-3 rounded-xl border border-slate-100 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                <div>
                  <p className="text-sm font-medium text-slate-900 dark:text-white">{q.title}</p>
                  <p className="text-xs text-slate-400">Pass: {q.pass_percentage}%{q.time_limit_minutes ? ` · ${q.time_limit_minutes}min` : ''}</p>
                </div>
                <ChevronRight size={14} className="text-slate-400" />
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Assignment links */}
      {lessonAssignments.length > 0 && (
        <div className="card p-5">
          <h2 className="font-bold text-slate-900 dark:text-white mb-3 flex items-center gap-2">
            <ClipboardList size={16} className="text-primary-600" /> Lesson Assignment
          </h2>
          <div className="space-y-2">
            {lessonAssignments.map(a => (
              <Link key={a.id} to={`/student/assignments/${a.id}`} className="flex items-center justify-between p-3 rounded-xl border border-slate-100 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                <div>
                  <p className="text-sm font-medium text-slate-900 dark:text-white">{a.title}</p>
                  <p className="text-xs text-slate-400">Max: {a.max_marks} marks{a.due_date ? ` · Due ${new Date(a.due_date).toLocaleDateString()}` : ''}</p>
                </div>
                <ChevronRight size={14} className="text-slate-400" />
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Personal notes */}
      <div className="card p-6">
        <h2 className="font-bold text-slate-900 dark:text-white mb-3">My Notes</h2>
        <textarea
          className="input min-h-[100px] resize-none text-sm"
          placeholder="Add your personal notes for this lesson..."
          value={noteContent}
          onChange={e => setNoteContent(e.target.value)}
        />
        <button onClick={handleSaveNote} disabled={!noteContent.trim()} className="btn-secondary text-sm mt-3 disabled:opacity-40">
          Save Note
        </button>
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between gap-4 pb-8">
        {prevLesson ? (
          <Link to={`/student/lesson/${prevLesson.id}`} className="btn-secondary flex items-center gap-2 text-sm">
            <ChevronLeft size={16} /> Previous
          </Link>
        ) : <div />}
        <button
          onClick={handleMarkComplete}
          disabled={progress?.completed || markingComplete}
          className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-medium text-sm transition-all ${progress?.completed ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 cursor-default' : 'btn-primary'}`}
        >
          {markingComplete ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <CheckCircle size={16} />}
          {progress?.completed ? 'Completed!' : 'Mark Complete'}
        </button>
        {nextLesson ? (
          <Link to={`/student/lesson/${nextLesson.id}`} className="btn-primary flex items-center gap-2 text-sm">
            Next <ChevronRight size={16} />
          </Link>
        ) : <div />}
      </div>
    </div>
  );

  const playgroundPanel = (
    <div className="flex flex-col h-full bg-slate-900">
      <div className="px-4 py-2.5 border-b border-slate-700 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2">
          <Code2 size={14} className="text-slate-400" />
          <span className="text-sm font-medium text-slate-200">Python Playground</span>
          <span className={`w-2 h-2 rounded-full ${runtimeStatus === 'ready' ? 'bg-emerald-400' : runtimeStatus === 'loading' ? 'bg-amber-400 animate-pulse' : runtimeStatus === 'running' ? 'bg-blue-400 animate-pulse' : 'bg-slate-500'}`} />
        </div>
        <button onClick={() => setPlaygroundCode(lesson.code_example ?? '# Write your Python code here\n')} className="text-xs text-slate-400 hover:text-slate-200 flex items-center gap-1">
          <RotateCcw size={10} /> Reset
        </button>
      </div>
      <div className="flex-1 min-h-0">
        <Suspense fallback={<div className="flex items-center justify-center h-full text-slate-400 text-sm">Loading editor...</div>}>
          <MonacoEditor
            height="100%"
            language="python"
            theme="vs-dark"
            value={playgroundCode}
            onChange={v => setPlaygroundCode(v ?? '')}
            options={{
              fontSize: 13, fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
              minimap: { enabled: false }, scrollBeyondLastLine: false,
              lineNumbers: 'on', wordWrap: 'on', automaticLayout: true,
            }}
          />
        </Suspense>
      </div>
      <div className="bg-slate-800 border-t border-slate-700 px-3 py-2 flex items-center gap-2 flex-shrink-0">
        <button
          onClick={runPlaygroundCode}
          disabled={playgroundRunning || runtimeStatus === 'loading'}
          className="btn-primary text-sm flex items-center gap-1.5 py-1.5 disabled:opacity-50"
        >
          {playgroundRunning || runtimeStatus === 'loading'
            ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            : <Play size={13} />}
          {runtimeStatus === 'loading' ? 'Loading...' : playgroundRunning ? 'Running...' : 'Run'}
        </button>
      </div>
      <div className="h-40 bg-slate-950 border-t border-slate-700 overflow-auto flex-shrink-0">
        <div className="px-4 py-1.5 text-xs text-slate-500 font-medium border-b border-slate-800 flex items-center gap-1.5">
          <Terminal size={11} /> Output
        </div>
        <pre className="px-4 py-3 text-sm text-slate-300 font-mono whitespace-pre-wrap" style={{ wordBreak: 'break-word' }}>
          {playgroundOutput || 'Click "Run" to execute your code.'}
        </pre>
      </div>
    </div>
  );

  const topBar = (
    <div className="flex items-center gap-4 px-4 sm:px-6 py-3 bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 flex-shrink-0">
      <button onClick={() => navigate(-1)} className="btn-ghost py-1.5 px-3 text-sm flex items-center gap-1.5 flex-shrink-0">
        <ArrowLeft size={14} /> {course?.title ?? 'Back'}
      </button>
      <div className="flex-1 min-w-0">
        <ProgressBar value={progressPct} size="sm" />
        <p className="text-xs text-slate-400 mt-1 hidden sm:block truncate">{lesson.title}</p>
      </div>
      <span className="text-xs text-slate-400 flex-shrink-0">{currentIdx + 1}/{allLessons.length}</span>
      <button
        onClick={handleToggleBookmark}
        className={`btn-ghost py-1.5 px-2 flex-shrink-0 ${isBookmarked ? 'text-primary-600 dark:text-primary-400' : ''}`}
      >
        {isBookmarked ? <BookmarkCheck size={17} /> : <Bookmark size={17} />}
      </button>
    </div>
  );

  // Desktop with playground: split view
  if (showPlayground && isDesktop) {
    return (
      <div className="flex flex-col h-full overflow-hidden">
        {topBar}
        <div className="flex flex-1 overflow-hidden">
          <div className="w-1/2 overflow-y-auto border-r border-slate-100 dark:border-slate-800">
            <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8">{lessonContent}</div>
          </div>
          <div className="w-1/2 flex flex-col overflow-hidden">{playgroundPanel}</div>
        </div>
      </div>
    );
  }

  // Mobile with playground: tab view
  if (showPlayground && !isDesktop) {
    return (
      <div className="flex flex-col h-full overflow-hidden">
        {topBar}
        <div className="flex border-b border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 flex-shrink-0">
          {(['lesson', 'code', 'output'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setMobileTab(tab)}
              className={`flex-1 py-3 text-sm font-medium border-b-2 transition-colors capitalize ${mobileTab === tab ? 'border-primary-600 text-primary-600' : 'border-transparent text-slate-500'}`}
            >
              {tab === 'code' ? 'Code' : tab === 'output' ? 'Output' : 'Lesson'}
            </button>
          ))}
        </div>
        <div className="flex-1 overflow-hidden">
          {mobileTab === 'lesson' && (
            <div className="h-full overflow-y-auto">
              <div className="px-4 py-6">{lessonContent}</div>
            </div>
          )}
          {mobileTab === 'code' && (
            <div className="h-full flex flex-col bg-slate-900">
              <div className="flex-1 min-h-0">
                <Suspense fallback={<div className="flex items-center justify-center h-full text-slate-400 text-sm">Loading editor...</div>}>
                  <MonacoEditor
                    height="100%"
                    language="python"
                    theme="vs-dark"
                    value={playgroundCode}
                    onChange={v => setPlaygroundCode(v ?? '')}
                    options={{ fontSize: 13, minimap: { enabled: false }, lineNumbers: 'on', wordWrap: 'on', automaticLayout: true }}
                  />
                </Suspense>
              </div>
              <div className="bg-slate-800 border-t border-slate-700 px-3 py-2 flex items-center gap-2 flex-shrink-0">
                <button onClick={runPlaygroundCode} disabled={playgroundRunning || runtimeStatus === 'loading'} className="btn-primary flex-1 text-sm flex items-center justify-center gap-1.5 py-2 disabled:opacity-50">
                  {playgroundRunning || runtimeStatus === 'loading' ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Play size={13} />}
                  {runtimeStatus === 'loading' ? 'Loading...' : playgroundRunning ? 'Running...' : 'Run Code'}
                </button>
                <button onClick={() => { runPlaygroundCode(); setMobileTab('output'); }} disabled={playgroundRunning} className="btn-ghost text-slate-300 text-sm py-2 px-3">
                  Run & View Output
                </button>
              </div>
            </div>
          )}
          {mobileTab === 'output' && (
            <div className="h-full bg-slate-950 overflow-auto">
              <div className="px-4 py-2 text-xs text-slate-500 font-medium border-b border-slate-800 flex items-center gap-1.5">
                <Terminal size={11} /> Output
              </div>
              <pre className="px-4 py-4 text-sm text-slate-300 font-mono whitespace-pre-wrap" style={{ wordBreak: 'break-word' }}>
                {playgroundOutput || 'Run your code to see output here.'}
              </pre>
            </div>
          )}
        </div>
      </div>
    );
  }

  // No playground: standard single-column view
  return (
    <div className="flex flex-col h-full overflow-hidden">
      {topBar}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">{lessonContent}</div>
      </div>
    </div>
  );
}
