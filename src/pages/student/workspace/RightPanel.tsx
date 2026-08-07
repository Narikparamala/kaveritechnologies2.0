import { useState, useEffect, lazy, Suspense } from 'react';
import {
  Code, FileText, BarChart3, Play, RotateCcw, Copy, Square, Terminal,
  Zap, Trophy, Flame, BookmarkCheck, Clock, Video, Target, TrendingUp,
  PanelRightClose, Loader2, Save,
} from 'lucide-react';
import { useWorkspace } from './WorkspaceContext';
import { useAuth } from '../../../contexts/AuthContext';
import { supabase } from '../../../lib/supabase';
import { runPython, onRuntimeStatus, type RuntimeStatus } from '../../../services/pythonExecution';

const MonacoEditor = lazy(() => import('@monaco-editor/react'));

type TabKey = 'code' | 'notes' | 'progress';

const TABS: { key: TabKey; label: string; icon: typeof Code }[] = [
  { key: 'code', label: 'Code', icon: Code },
  { key: 'notes', label: 'Notes', icon: FileText },
  { key: 'progress', label: 'Progress', icon: BarChart3 },
];

export function RightPanel() {
  const { currentLesson } = useWorkspace();
  const hasPlayground = currentLesson?.enable_coding_playground;
  const [activeTab, setActiveTab] = useState<TabKey>(hasPlayground ? 'code' : 'notes');

  useEffect(() => {
    if (hasPlayground) setActiveTab('code');
    else setActiveTab('notes');
  }, [currentLesson?.id]);

  return (
    <div className="h-full flex flex-col bg-white dark:bg-slate-900 border-l border-slate-100 dark:border-slate-800">
      <TabBar activeTab={activeTab} onTabChange={setActiveTab} hasPlayground={!!hasPlayground} />
      <div className="flex-1 overflow-hidden">
        {activeTab === 'code' && <PlaygroundTab />}
        {activeTab === 'notes' && <NotesTab />}
        {activeTab === 'progress' && <ProgressTab />}
      </div>
    </div>
  );
}

function TabBar({ activeTab, onTabChange, hasPlayground }: {
  activeTab: TabKey; onTabChange: (t: TabKey) => void; hasPlayground: boolean;
}) {
  const { toggleRightPanel } = useWorkspace();
  return (
    <div className="flex items-center border-b border-slate-100 dark:border-slate-800 flex-shrink-0">
      <div className="flex flex-1">
        {TABS.map(tab => {
          const isActive = activeTab === tab.key;
          const isDisabled = tab.key === 'code' && !hasPlayground;
          return (
            <button
              key={tab.key}
              onClick={() => !isDisabled && onTabChange(tab.key)}
              disabled={isDisabled}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-[11px] font-medium border-b-2 transition-colors ${
                isActive
                  ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                  : isDisabled
                  ? 'border-transparent text-slate-300 dark:text-slate-600 cursor-not-allowed'
                  : 'border-transparent text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
              }`}
            >
              <tab.icon size={13} />
              {tab.label}
            </button>
          );
        })}
      </div>
      <button
        onClick={toggleRightPanel}
        className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors hidden lg:flex flex-shrink-0"
        title="Collapse panel"
      >
        <PanelRightClose size={14} />
      </button>
    </div>
  );
}

function PlaygroundTab() {
  const { currentLesson } = useWorkspace();
  const [code, setCode] = useState('');
  const [output, setOutput] = useState('');
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState<RuntimeStatus>('idle');

  useEffect(() => {
    const unsub = onRuntimeStatus(setStatus);
    return unsub;
  }, []);

  useEffect(() => {
    setCode(currentLesson?.code_example ?? '# Write your Python code here\n');
    setOutput('');
  }, [currentLesson?.id]);

  if (!currentLesson?.enable_coding_playground) {
    return (
      <div className="flex items-center justify-center h-full p-6">
        <div className="text-center">
          <Code size={32} className="text-slate-300 dark:text-slate-600 mx-auto mb-3" />
          <p className="text-sm text-slate-400">No coding playground for this lesson.</p>
        </div>
      </div>
    );
  }

  async function handleRun() {
    setRunning(true);
    setOutput('');
    try {
      const result = await runPython(code);
      setOutput(result.output || result.error || 'No output');
    } catch (e: any) {
      setOutput(`Error: ${e.message}`);
    }
    setRunning(false);
  }

  return (
    <div className="flex flex-col h-full bg-slate-900">
      {/* Editor toolbar */}
      <div className="px-3 py-1.5 flex items-center justify-between border-b border-slate-700 flex-shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-medium text-slate-400">Python 3.10</span>
          <span className={`w-1.5 h-1.5 rounded-full ${
            status === 'ready' ? 'bg-emerald-400' :
            status === 'loading' ? 'bg-amber-400 animate-pulse' :
            status === 'running' ? 'bg-blue-400 animate-pulse' : 'bg-slate-500'
          }`} />
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => navigator.clipboard.writeText(code)} className="p-1 text-slate-500 hover:text-slate-300" title="Copy">
            <Copy size={11} />
          </button>
          <button onClick={() => setCode(currentLesson?.code_example ?? '')} className="p-1 text-slate-500 hover:text-slate-300" title="Reset">
            <RotateCcw size={11} />
          </button>
        </div>
      </div>

      {/* Monaco editor */}
      <div className="flex-1 min-h-0">
        <Suspense fallback={
          <div className="flex items-center justify-center h-full">
            <Loader2 className="animate-spin text-slate-500" size={20} />
          </div>
        }>
          <MonacoEditor
            language="python"
            theme="vs-dark"
            value={code}
            onChange={(v) => setCode(v ?? '')}
            options={{
              minimap: { enabled: false },
              fontSize: 12,
              lineNumbers: 'on',
              padding: { top: 8 },
              scrollBeyondLastLine: false,
              wordWrap: 'on',
              automaticLayout: true,
              lineNumbersMinChars: 3,
              glyphMargin: false,
              folding: false,
            }}
          />
        </Suspense>
      </div>

      {/* Run button */}
      <div className="px-3 py-2 border-t border-slate-700 flex items-center gap-2 flex-shrink-0">
        <button
          onClick={handleRun}
          disabled={running || status === 'loading'}
          className="flex-1 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-800 disabled:opacity-60 text-white rounded-lg px-3 py-1.5 text-xs font-medium flex items-center justify-center gap-1.5 transition-colors"
        >
          {running ? <Square size={10} /> : <Play size={10} fill="white" />}
          {status === 'loading' ? 'Loading...' : running ? 'Running...' : 'Run'}
        </button>
      </div>

      {/* Output */}
      <div className="h-32 border-t border-slate-700 flex-shrink-0 flex flex-col">
        <div className="px-3 py-1 text-[10px] text-slate-500 font-medium border-b border-slate-800 flex items-center gap-1">
          <Terminal size={9} /> Output
        </div>
        <pre className="flex-1 px-3 py-2 text-xs font-mono text-slate-300 overflow-auto whitespace-pre-wrap break-words">
          {output || <span className="text-slate-600 italic">Click "Run" to execute your code.</span>}
        </pre>
      </div>
    </div>
  );
}

function NotesTab() {
  const { currentLesson, lessonNote, saveStudentNote } = useWorkspace();
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setContent(lessonNote?.content ?? '');
    setSaved(false);
  }, [currentLesson?.id, lessonNote]);

  async function handleSave() {
    setSaving(true);
    try {
      await saveStudentNote(content);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between flex-shrink-0">
        <div>
          <h4 className="text-xs font-semibold text-slate-700 dark:text-slate-300">My Notes</h4>
          <p className="text-[10px] text-slate-400 mt-0.5">{currentLesson?.title}</p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className={`text-xs px-3 py-1.5 rounded-lg font-medium flex items-center gap-1.5 transition-colors ${
            saved
              ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600'
              : 'bg-primary-50 dark:bg-primary-900/20 text-primary-600 hover:bg-primary-100 dark:hover:bg-primary-900/30'
          }`}
        >
          {saving ? <Loader2 size={11} className="animate-spin" /> : saved ? <span>Saved</span> : <><Save size={11} /> Save</>}
        </button>
      </div>
      <div className="flex-1 p-4">
        <textarea
          className="w-full h-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-sm text-slate-700 dark:text-slate-300 resize-none focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-400 placeholder-slate-400"
          placeholder="Take notes for this lesson..."
          value={content}
          onChange={e => { setContent(e.target.value); setSaved(false); }}
        />
      </div>
    </div>
  );
}

function ProgressTab() {
  const { profile } = useAuth();
  const {
    course, chapters, progress, courseProgress, currentLessonIndex, totalLessons,
    allLessonsFlat, selectLesson,
  } = useWorkspace();

  const [bookmarkedLessons, setBookmarkedLessons] = useState<{ id: string; title: string }[]>([]);
  const [upcomingSessions, setUpcomingSessions] = useState<{ id: string; title: string; session_date: string }[]>([]);

  useEffect(() => {
    if (!profile || !course) return;
    (async () => {
      const [bmRes, sessRes] = await Promise.all([
        supabase.from('lesson_bookmarks').select('lesson_id, lessons:lesson_id(id, title)').eq('student_id', profile.id),
        supabase.from('live_sessions').select('id, title, session_date').eq('course_id', course.id).in('status', ['scheduled', 'live']).order('session_date').limit(3),
      ]);
      const bms = (bmRes.data ?? [])
        .filter((b: any) => b.lessons && allLessonsFlat.some(l => l.id === b.lesson_id))
        .map((b: any) => ({ id: b.lesson_id, title: (b.lessons as any).title }));
      setBookmarkedLessons(bms);
      setUpcomingSessions((sessRes.data ?? []) as any);
    })();
  }, [profile, course]);

  if (!profile || !course) return null;

  const xp = profile.xp_points ?? 0;
  const level = profile.level ?? 1;
  const streak = profile.streak_days ?? 0;
  const xpInLevel = xp % 500;
  const completedCount = chapters.reduce((s, ch) => s + ch.lessons.filter(l => progress.has(l.id)).length, 0);

  return (
    <div className="h-full overflow-y-auto scrollbar-thin">
      {/* Progress ring + stats */}
      <div className="p-4 border-b border-slate-50 dark:border-slate-800/50">
        <div className="flex items-center gap-4">
          <div className="relative w-14 h-14 flex-shrink-0">
            <svg className="w-14 h-14 -rotate-90" viewBox="0 0 64 64">
              <circle cx="32" cy="32" r="28" fill="none" stroke="currentColor" className="text-slate-100 dark:text-slate-800" strokeWidth="5" />
              <circle
                cx="32" cy="32" r="28" fill="none" stroke="url(#progressGradRP)" strokeWidth="5"
                strokeLinecap="round"
                strokeDasharray={`${(courseProgress / 100) * 175.93} 175.93`}
              />
              <defs>
                <linearGradient id="progressGradRP" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#2563EB" />
                  <stop offset="100%" stopColor="#14B8A6" />
                </linearGradient>
              </defs>
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-xs font-bold text-slate-900 dark:text-white">{Math.round(courseProgress)}%</span>
            </div>
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-slate-900 dark:text-white">{completedCount}/{totalLessons} Lessons</p>
            <p className="text-[10px] text-slate-400 mt-0.5">
              {totalLessons - completedCount === 0 ? 'All done!' : `${totalLessons - completedCount} remaining`}
            </p>
          </div>
        </div>
      </div>

      {/* XP / Level / Streak */}
      <div className="p-3 grid grid-cols-3 gap-2 border-b border-slate-50 dark:border-slate-800/50">
        <MiniStat icon={Zap} value={xp.toLocaleString()} label="XP" color="text-amber-500" />
        <MiniStat icon={Trophy} value={String(level)} label="Level" color="text-primary-500" />
        <MiniStat icon={Flame} value={`${streak}d`} label="Streak" color="text-orange-500" />
      </div>

      {/* Level progress */}
      <div className="px-4 py-3 border-b border-slate-50 dark:border-slate-800/50">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[10px] font-medium text-slate-500">Level {level}</span>
          <span className="text-[10px] text-slate-400">{xpInLevel}/500 XP</span>
        </div>
        <div className="h-1 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
          <div className="h-full bg-gradient-to-r from-primary-500 to-teal-500 rounded-full transition-all duration-500" style={{ width: `${(xpInLevel / 500) * 100}%` }} />
        </div>
      </div>

      {/* Current position */}
      <div className="p-4 border-b border-slate-50 dark:border-slate-800/50">
        <h4 className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
          <Target size={9} /> Current Position
        </h4>
        <div className="space-y-0.5">
          {allLessonsFlat.slice(
            Math.max(0, currentLessonIndex - 1),
            Math.min(allLessonsFlat.length, currentLessonIndex + 4)
          ).map((lesson, i) => {
            const realIndex = Math.max(0, currentLessonIndex - 1) + i;
            const isCurrent = realIndex === currentLessonIndex;
            const isCompleted = progress.has(lesson.id);
            return (
              <button
                key={lesson.id}
                onClick={() => selectLesson(lesson.id)}
                className={`w-full text-left px-2 py-1.5 rounded-lg flex items-center gap-2 text-[10px] transition-colors ${
                  isCurrent
                    ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-400 font-semibold'
                    : isCompleted
                    ? 'text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                }`}
              >
                <span className={`w-3.5 h-3.5 rounded-full flex items-center justify-center text-[7px] font-bold flex-shrink-0 ${
                  isCurrent ? 'bg-primary-500 text-white' : isCompleted ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600' : 'bg-slate-100 dark:bg-slate-800 text-slate-400'
                }`}>
                  {isCompleted ? '\u2713' : realIndex + 1}
                </span>
                <span className="truncate">{lesson.title}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Upcoming Sessions */}
      {upcomingSessions.length > 0 && (
        <div className="p-4 border-b border-slate-50 dark:border-slate-800/50">
          <h4 className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <Video size={9} /> Upcoming Classes
          </h4>
          <div className="space-y-1.5">
            {upcomingSessions.map(s => (
              <div key={s.id} className="p-2 rounded-lg bg-slate-50 dark:bg-slate-800/50">
                <p className="text-[10px] font-medium text-slate-900 dark:text-white truncate">{s.title}</p>
                <p className="text-[9px] text-slate-400 mt-0.5 flex items-center gap-1">
                  <Clock size={7} />
                  {new Date(s.session_date).toLocaleString('en-IN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Bookmarks */}
      {bookmarkedLessons.length > 0 && (
        <div className="p-4 border-b border-slate-50 dark:border-slate-800/50">
          <h4 className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <BookmarkCheck size={9} /> Bookmarks
          </h4>
          <div className="space-y-0.5">
            {bookmarkedLessons.slice(0, 5).map(bm => (
              <button
                key={bm.id}
                onClick={() => selectLesson(bm.id)}
                className="w-full text-left px-2 py-1.5 rounded-lg text-[10px] text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50 flex items-center gap-2"
              >
                <BookmarkCheck size={9} className="text-amber-500 flex-shrink-0" />
                <span className="truncate">{bm.title}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Motivational tip */}
      <div className="p-4">
        <div className="p-3 rounded-xl bg-gradient-to-br from-primary-50 to-teal-50/50 dark:from-primary-900/10 dark:to-teal-900/10 border border-primary-100/50 dark:border-primary-800/20">
          <p className="text-[10px] font-semibold text-primary-700 dark:text-primary-400 flex items-center gap-1 mb-1">
            <TrendingUp size={9} /> Keep Going!
          </p>
          <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-relaxed">
            {streak > 0
              ? `${streak}-day streak! Complete today's lesson to keep it going.`
              : 'Start a learning streak by completing a lesson today!'}
          </p>
        </div>
      </div>
    </div>
  );
}

function MiniStat({ icon: Icon, value, label, color }: {
  icon: typeof Zap; value: string; label: string; color: string;
}) {
  return (
    <div className="text-center">
      <Icon size={12} className={`${color} mx-auto mb-0.5`} />
      <p className="text-[11px] font-bold text-slate-900 dark:text-white">{value}</p>
      <p className="text-[8px] text-slate-400">{label}</p>
    </div>
  );
}
