import { useParams, Link, useNavigate } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { ChevronLeft, ChevronRight, CheckCircle, Bookmark, ArrowLeft, Lock } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ProgressBar } from '../../../components/ui/ProgressBar';
import { useDemo } from '../../../contexts/DemoContext';
import { DEMO_LESSONS, DEMO_CHAPTERS } from '../../../data/demoData';

const MonacoEditor = lazy(() => import('@monaco-editor/react').then(m => ({ default: m.default })));

export default function DemoLessonPage() {
  const { lessonSlug } = useParams<{ lessonSlug: string }>();
  const demo = useDemo()!;
  const navigate = useNavigate();

  const lesson = lessonSlug ? DEMO_LESSONS[lessonSlug] : null;

  if (!lesson) {
    return (
      <div className="p-8 text-center">
        <p className="text-slate-500 dark:text-slate-400 mb-4">Lesson not found in demo.</p>
        <p className="text-sm text-slate-400 mb-6">Available lessons: Intro to Python, Variables, Conditionals, Loops</p>
        <Link to="/demo/student/courses" className="btn-primary">Back to Demo Courses</Link>
      </div>
    );
  }

  const allSlugs = ['intro', 'variables', 'conditionals', 'loops'];
  const currentIdx = allSlugs.indexOf(lessonSlug ?? '');
  const totalLessons = allSlugs.length;
  const progressPct = ((currentIdx + 1) / totalLessons) * 100;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Top bar */}
      <div className="flex items-center gap-4 px-4 sm:px-6 py-3 bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 flex-shrink-0">
        <button onClick={() => navigate('/demo/student/courses')} className="btn-ghost py-1.5 px-3 text-sm flex items-center gap-1.5 flex-shrink-0">
          <ArrowLeft size={14} /> Python Full Stack
        </button>
        <div className="flex-1 min-w-0">
          <ProgressBar value={progressPct} size="sm" />
        </div>
        <span className="text-xs text-slate-400 flex-shrink-0">{currentIdx + 1}/{totalLessons}</span>
        <button
          onClick={() => demo.requireAuth()}
          className="btn-ghost py-1.5 px-2 flex-shrink-0 text-slate-300 dark:text-slate-600"
          title="Sign in to bookmark"
        >
          <Bookmark size={17} />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
          {/* Header */}
          <div className="mb-8">
            <p className="text-xs font-medium text-primary-600 dark:text-primary-400 mb-2">{lesson.chapter}</p>
            <div className="flex items-start justify-between gap-4">
              <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{lesson.title}</h1>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className="text-xs text-slate-400">{lesson.duration_minutes}min</span>
                <span className="text-xs bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 px-2 py-0.5 rounded-full font-medium">+{lesson.xp_reward} XP</span>
              </div>
            </div>
          </div>

          {/* Notes */}
          <div className="card p-6 mb-6">
            <h2 className="font-bold text-slate-900 dark:text-white mb-4">Lesson Notes</h2>
            <div className="prose prose-slate dark:prose-invert max-w-none prose-code:font-mono prose-code:text-sm prose-pre:bg-slate-900 prose-pre:rounded-xl">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{lesson.notes_markdown}</ReactMarkdown>
            </div>
          </div>

          {/* Code example */}
          <div className="card overflow-hidden mb-6">
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

          {/* Key takeaway */}
          <div className="card p-6 mb-6 bg-primary-50 dark:bg-primary-900/20 border border-primary-100 dark:border-primary-800">
            <h2 className="font-bold text-primary-800 dark:text-primary-200 mb-2">Key Takeaway</h2>
            <p className="text-primary-700 dark:text-primary-300 text-sm leading-relaxed">{lesson.explanation}</p>
          </div>

          {/* Personal notes — locked */}
          <div className="card p-6 mb-8 border-dashed border-slate-200 dark:border-slate-700">
            <div className="flex items-center gap-3 mb-3">
              <h2 className="font-bold text-slate-900 dark:text-white">My Notes</h2>
              <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-lg font-medium flex items-center gap-1">
                <Lock size={10} /> Sign in to save
              </span>
            </div>
            <div
              onClick={() => demo.requireAuth()}
              className="input min-h-[80px] cursor-pointer bg-slate-50 dark:bg-slate-800/50 flex items-center justify-center text-slate-400 text-sm"
            >
              Sign in to add personal notes for this lesson...
            </div>
          </div>

          {/* Navigation */}
          <div className="flex items-center justify-between gap-4 pb-8">
            {lesson.prevId ? (
              <Link to={`/demo/student/lesson/${lesson.prevId}`} className="btn-secondary flex items-center gap-2 text-sm">
                <ChevronLeft size={16} /> Previous
              </Link>
            ) : <div />}

            <button
              onClick={() => demo.requireAuth()}
              className="btn-primary flex items-center gap-2 px-6 py-2.5 text-sm"
            >
              <CheckCircle size={16} /> Mark Complete
            </button>

            {lesson.nextId ? (
              <Link to={`/demo/student/lesson/${lesson.nextId}`} className="btn-primary flex items-center gap-2 text-sm">
                Next <ChevronRight size={16} />
              </Link>
            ) : <div />}
          </div>
        </div>
      </div>
    </div>
  );
}
