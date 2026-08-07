import { useState, lazy, Suspense, useEffect, useRef, useCallback } from 'react';
import {
  Terminal, Play, Square, RotateCcw, Copy, Save, Trash2, BookOpen,
  CheckCircle, Loader2, AlertCircle, Maximize2, Minimize2, Sun, Moon,
  ChevronDown, Settings2, GripVertical,
} from 'lucide-react';
import { useToast } from '../../components/ui/Toast';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import type { SavedCodeSnippet } from '../../types/database';
import {
  preloadPyodide, runPython, stopExecution,
  onRuntimeStatus, type RuntimeStatus
} from '../../services/pythonExecution';

const MonacoEditor = lazy(() => import('@monaco-editor/react').then(m => ({ default: m.default })));

type Language = 'python' | 'javascript' | 'html' | 'sql' | 'java' | 'c' | 'cpp';

interface LanguageConfig {
  label: string;
  monaco: string;
  ext: string;
  color: string;
  template: string;
}

const LANGUAGES: Record<Language, LanguageConfig> = {
  python: {
    label: 'Python',
    monaco: 'python',
    ext: 'py',
    color: 'text-yellow-400',
    template: '# Python Playground\nprint("Hello, World!")\n\nfor i in range(1, 6):\n    print(f"  {i}. Learning Python!")\n',
  },
  javascript: {
    label: 'JavaScript',
    monaco: 'javascript',
    ext: 'js',
    color: 'text-amber-400',
    template: '// JavaScript Playground\nconsole.log("Hello, World!");\n\nconst numbers = [1, 2, 3, 4, 5];\nconst squares = numbers.map(n => n * n);\nconsole.log("Squares:", squares);\n\nfunction fibonacci(n) {\n  if (n <= 1) return n;\n  return fibonacci(n - 1) + fibonacci(n - 2);\n}\n\nfor (let i = 0; i < 10; i++) {\n  console.log(`fib(${i}) = ${fibonacci(i)}`);\n}\n',
  },
  html: {
    label: 'HTML/CSS/JS',
    monaco: 'html',
    ext: 'html',
    color: 'text-orange-400',
    template: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <style>
    body {
      font-family: system-ui, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
      background: linear-gradient(135deg, #0f172a, #1e293b);
      color: #e2e8f0;
    }
    .card {
      background: rgba(255,255,255,0.05);
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 16px;
      padding: 2rem;
      text-align: center;
      backdrop-filter: blur(10px);
    }
    h1 { margin: 0 0 0.5rem; font-size: 1.5rem; }
    p { margin: 0; opacity: 0.7; font-size: 0.875rem; }
    button {
      margin-top: 1rem;
      padding: 0.5rem 1.5rem;
      border: none;
      border-radius: 8px;
      background: #3b82f6;
      color: white;
      cursor: pointer;
      font-size: 0.875rem;
    }
    button:hover { background: #2563eb; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Hello, World!</h1>
    <p>Edit this HTML, CSS, and JavaScript</p>
    <button onclick="alert('It works!')">Click Me</button>
  </div>
</body>
</html>`,
  },
  sql: {
    label: 'SQL',
    monaco: 'sql',
    ext: 'sql',
    color: 'text-blue-400',
    template: '-- SQL Playground\n-- Note: SQL runs in a simulated in-browser SQLite environment\n\nCREATE TABLE students (\n  id INTEGER PRIMARY KEY,\n  name TEXT NOT NULL,\n  grade REAL\n);\n\nINSERT INTO students (name, grade) VALUES\n  (\'Alice\', 92.5),\n  (\'Bob\', 88.0),\n  (\'Charlie\', 95.3),\n  (\'Diana\', 91.7);\n\nSELECT name, grade\nFROM students\nWHERE grade > 90\nORDER BY grade DESC;\n',
  },
  java: {
    label: 'Java',
    monaco: 'java',
    ext: 'java',
    color: 'text-red-400',
    template: 'public class Main {\n    public static void main(String[] args) {\n        System.out.println("Hello, World!");\n        \n        int[] numbers = {1, 2, 3, 4, 5};\n        int sum = 0;\n        for (int n : numbers) {\n            sum += n;\n        }\n        System.out.println("Sum: " + sum);\n    }\n}\n',
  },
  c: {
    label: 'C',
    monaco: 'c',
    ext: 'c',
    color: 'text-sky-400',
    template: '#include <stdio.h>\n\nint factorial(int n) {\n    if (n <= 1) return 1;\n    return n * factorial(n - 1);\n}\n\nint main() {\n    printf("Hello, World!\\n");\n    \n    for (int i = 1; i <= 6; i++) {\n        printf("%d! = %d\\n", i, factorial(i));\n    }\n    \n    return 0;\n}\n',
  },
  cpp: {
    label: 'C++',
    monaco: 'cpp',
    ext: 'cpp',
    color: 'text-blue-500',
    template: '#include <iostream>\n#include <vector>\n#include <algorithm>\nusing namespace std;\n\nint main() {\n    cout << "Hello, World!" << endl;\n    \n    vector<int> nums = {5, 2, 8, 1, 9, 3};\n    sort(nums.begin(), nums.end());\n    \n    cout << "Sorted: ";\n    for (int n : nums) cout << n << " ";\n    cout << endl;\n    \n    return 0;\n}\n',
  },
};

interface OutputLine {
  text: string;
  kind: 'stdout' | 'stderr' | 'info' | 'meta';
}

export default function PlaygroundPage() {
  const { user } = useAuth();
  const { success, info } = useToast();

  const [language, setLanguage] = useState<Language>('python');
  const [code, setCode] = useState(LANGUAGES.python.template);
  const [isDark, setIsDark] = useState(true);
  const [fontSize, setFontSize] = useState(14);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showLangMenu, setShowLangMenu] = useState(false);

  const [snippetTitle, setSnippetTitle] = useState('');
  const [savedSnippets, setSavedSnippets] = useState<SavedCodeSnippet[]>([]);
  const [showSnippets, setShowSnippets] = useState(false);

  const [output, setOutput] = useState<OutputLine[]>([]);
  const [runtimeStatus, setRuntimeStatus] = useState<RuntimeStatus>('idle');
  const [running, setRunning] = useState(false);
  const [showTimeout, setShowTimeout] = useState(false);

  // HTML preview
  const [htmlPreview, setHtmlPreview] = useState('');
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Resizer
  const [outputWidth, setOutputWidth] = useState(384);
  const resizerRef = useRef<{ startX: number; startW: number } | null>(null);

  const outputEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const unsub = onRuntimeStatus(setRuntimeStatus);
    return unsub;
  }, []);

  useEffect(() => {
    if (language === 'python') preloadPyodide();
  }, [language]);

  useEffect(() => {
    if (!user) return;
    supabase
      .from('saved_code_snippets')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .then(({ data }) => setSavedSnippets((data ?? []) as SavedCodeSnippet[]));
  }, [user]);

  useEffect(() => {
    outputEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [output]);

  useEffect(() => {
    if (language === 'html') {
      const timeout = setTimeout(() => setHtmlPreview(code), 500);
      return () => clearTimeout(timeout);
    }
  }, [code, language]);

  function switchLanguage(lang: Language) {
    setLanguage(lang);
    setCode(LANGUAGES[lang].template);
    setOutput([]);
    setShowLangMenu(false);
    setRunning(false);
  }

  async function handleRun() {
    if (running) return;
    setRunning(true);
    setShowTimeout(false);
    const cfg = LANGUAGES[language];

    if (language === 'html') {
      setHtmlPreview(code);
      setOutput([{ text: '[HTML preview updated]', kind: 'meta' }]);
      setRunning(false);
      return;
    }

    setOutput(prev => [...prev, { text: `$ run ${cfg.label.toLowerCase()}`, kind: 'meta' }]);

    if (language === 'python') {
      const result = await runPython(code, () => setShowTimeout(true));
      setShowTimeout(false);
      const lines: OutputLine[] = [];
      if (result.output) {
        result.output.split('\n').filter((_, i, arr) => i < arr.length - 1 || _.length > 0).forEach(line => {
          lines.push({ text: line, kind: 'stdout' });
        });
      }
      if (result.error) {
        result.error.trim().split('\n').forEach(line => lines.push({ text: line, kind: 'stderr' }));
      }
      lines.push({ text: result.success ? `[Done in ${result.executionTime}ms]` : `[Error in ${result.executionTime}ms]`, kind: 'meta' });
      setOutput(prev => [...prev, ...lines.filter(l => l.text)]);
    } else if (language === 'javascript') {
      try {
        const logs: OutputLine[] = [];
        const origLog = console.log;
        const origError = console.error;
        const origWarn = console.warn;
        console.log = (...args) => logs.push({ text: args.map(a => typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a)).join(' '), kind: 'stdout' });
        console.error = (...args) => logs.push({ text: args.map(String).join(' '), kind: 'stderr' });
        console.warn = (...args) => logs.push({ text: args.map(String).join(' '), kind: 'stdout' });
        const start = performance.now();
        const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
        await new AsyncFunction(code)();
        const elapsed = Math.round(performance.now() - start);
        console.log = origLog;
        console.error = origError;
        console.warn = origWarn;
        logs.push({ text: `[Done in ${elapsed}ms]`, kind: 'meta' });
        setOutput(prev => [...prev, ...logs]);
      } catch (e: any) {
        setOutput(prev => [...prev, { text: e.message, kind: 'stderr' }, { text: '[Error]', kind: 'meta' }]);
      }
    } else if (language === 'sql') {
      setOutput(prev => [...prev,
        { text: 'SQL execution runs in a simulated environment.', kind: 'info' },
        { text: 'For real SQL queries, use the course assignments or connect to a database.', kind: 'info' },
        { text: '[SQL preview mode - no execution]', kind: 'meta' }
      ]);
    } else {
      setOutput(prev => [...prev,
        { text: `${cfg.label} requires a server-side compiler.`, kind: 'info' },
        { text: 'Use this editor to write and practice code. Submit via assignments for execution.', kind: 'info' },
        { text: '[Editor-only mode]', kind: 'meta' },
      ]);
    }
    setRunning(false);
  }

  function handleStop() {
    if (language === 'python') stopExecution();
    setRunning(false);
    setShowTimeout(false);
    setOutput(prev => [...prev, { text: '[Execution stopped]', kind: 'meta' }]);
  }

  function handleCopy() {
    navigator.clipboard.writeText(code);
    success('Copied to clipboard!');
  }

  function handleReset() {
    setCode(LANGUAGES[language].template);
    setOutput([]);
    setShowTimeout(false);
  }

  async function handleSave() {
    if (!user) { info('Sign in to save snippets'); return; }
    if (!code.trim()) return;
    const title = snippetTitle.trim() || `Untitled ${LANGUAGES[language].label}`;
    const { data } = await supabase
      .from('saved_code_snippets')
      .insert({ user_id: user.id, title, code, language })
      .select()
      .maybeSingle();
    if (data) {
      setSavedSnippets(prev => [data as SavedCodeSnippet, ...prev]);
      success('Snippet saved!');
      setSnippetTitle('');
    }
  }

  async function handleDeleteSnippet(id: string) {
    await supabase.from('saved_code_snippets').delete().eq('id', id);
    setSavedSnippets(prev => prev.filter(s => s.id !== id));
  }

  function handleLoadSnippet(snippet: SavedCodeSnippet) {
    const lang = (snippet.language || 'python') as Language;
    if (lang in LANGUAGES) {
      setLanguage(lang);
    }
    setCode(snippet.code);
    setShowSnippets(false);
    setOutput([]);
  }

  function toggleFullscreen() {
    if (!document.fullscreenElement && containerRef.current) {
      containerRef.current.requestFullscreen();
      setIsFullscreen(true);
    } else if (document.fullscreenElement) {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  }

  useEffect(() => {
    function onFsChange() { setIsFullscreen(!!document.fullscreenElement); }
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  const onResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    resizerRef.current = { startX: e.clientX, startW: outputWidth };
    function onMouseMove(ev: MouseEvent) {
      if (!resizerRef.current) return;
      const delta = resizerRef.current.startX - ev.clientX;
      setOutputWidth(Math.max(250, Math.min(700, resizerRef.current.startW + delta)));
    }
    function onMouseUp() {
      resizerRef.current = null;
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    }
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, [outputWidth]);

  const cfg = LANGUAGES[language];
  const isRunDisabled = running || (language === 'python' && runtimeStatus === 'loading');
  const showHtmlPreview = language === 'html';

  return (
    <div ref={containerRef} className="flex flex-col h-full overflow-hidden animate-fade-in bg-white dark:bg-slate-950">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 sm:px-5 py-2.5 bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 flex-shrink-0">
        <Terminal size={18} className="text-teal-600 dark:text-teal-400 flex-shrink-0" />
        <h1 className="font-bold text-slate-900 dark:text-white text-sm sm:text-base">Code Playground</h1>

        {/* Language selector */}
        <div className="relative ml-2">
          <button
            onClick={() => setShowLangMenu(v => !v)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
          >
            <span className={cfg.color}>{cfg.label}</span>
            <ChevronDown size={13} />
          </button>
          {showLangMenu && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowLangMenu(false)} />
              <div className="absolute top-full left-0 mt-1 w-44 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 py-1 z-50">
                {(Object.entries(LANGUAGES) as [Language, LanguageConfig][]).map(([key, val]) => (
                  <button
                    key={key}
                    onClick={() => switchLanguage(key)}
                    className={`w-full px-4 py-2 text-left text-sm flex items-center gap-2 transition-colors ${
                      language === key
                        ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-400 font-medium'
                        : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'
                    }`}
                  >
                    <span className={val.color}>{val.label}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="flex-1" />

        {/* Toolbar */}
        <div className="flex items-center gap-1">
          <button onClick={() => setIsDark(d => !d)} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 transition-colors" title="Toggle theme">
            {isDark ? <Sun size={15} /> : <Moon size={15} />}
          </button>
          <div className="relative">
            <button onClick={() => setShowSettings(v => !v)} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 transition-colors" title="Settings">
              <Settings2 size={15} />
            </button>
            {showSettings && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowSettings(false)} />
                <div className="absolute right-0 top-full mt-1 w-52 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 p-3 z-50 space-y-3">
                  <div>
                    <label className="text-[10px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Font Size</label>
                    <div className="flex items-center gap-2 mt-1">
                      <input type="range" min={10} max={20} value={fontSize} onChange={e => setFontSize(Number(e.target.value))} className="flex-1 accent-primary-500" />
                      <span className="text-xs text-slate-600 dark:text-slate-400 w-6 text-right">{fontSize}</span>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
          <button onClick={toggleFullscreen} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 transition-colors" title="Fullscreen">
            {isFullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
          </button>
          {user && (
            <button onClick={() => setShowSnippets(v => !v)} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
              <BookOpen size={13} /> Saved ({savedSnippets.length})
            </button>
          )}
        </div>
      </div>

      {/* Saved snippets */}
      {showSnippets && user && (
        <div className="bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 px-4 py-3 max-h-48 overflow-y-auto flex-shrink-0">
          {savedSnippets.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-3">No saved snippets yet.</p>
          ) : (
            <div className="space-y-1">
              {savedSnippets.map(s => (
                <div key={s.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800">
                  <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${LANGUAGES[s.language as Language]?.color || 'text-slate-400'} bg-slate-100 dark:bg-slate-800`}>
                    {LANGUAGES[s.language as Language]?.label || s.language}
                  </span>
                  <button onClick={() => handleLoadSnippet(s)} className="flex-1 text-left text-sm text-slate-700 dark:text-slate-300 truncate">{s.title}</button>
                  <button onClick={() => handleDeleteSnippet(s.id)} className="text-red-400 hover:text-red-600 p-1"><Trash2 size={12} /></button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Main area */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* Editor */}
        <div className="flex-1 flex flex-col min-h-0 min-w-0">
          <div className="flex items-center gap-2 px-4 py-2 bg-slate-800 text-slate-300 text-xs flex-shrink-0">
            <div className="flex gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-red-400" />
              <div className="w-2.5 h-2.5 rounded-full bg-amber-400" />
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
            </div>
            <span className="font-mono ml-2 flex-1">main.{cfg.ext}</span>
            <button onClick={handleCopy} title="Copy code" className="hover:text-white p-1"><Copy size={13} /></button>
            <button onClick={handleReset} title="Reset" className="hover:text-white p-1"><RotateCcw size={13} /></button>
          </div>
          <Suspense fallback={<div className="flex-1 bg-slate-900 flex items-center justify-center text-slate-500 text-sm">Loading editor...</div>}>
            <MonacoEditor
              height="100%"
              language={cfg.monaco}
              value={code}
              onChange={v => setCode(v ?? '')}
              theme={isDark ? 'vs-dark' : 'light'}
              options={{
                minimap: { enabled: false },
                lineNumbers: 'on',
                scrollBeyondLastLine: false,
                fontSize,
                tabSize: language === 'python' ? 4 : 2,
                wordWrap: 'on',
                fontFamily: 'JetBrains Mono, Fira Code, monospace',
                automaticLayout: true,
              }}
            />
          </Suspense>
        </div>

        {/* Resizer */}
        <div
          className="hidden lg:flex w-1.5 bg-slate-200 dark:bg-slate-700 hover:bg-primary-400 dark:hover:bg-primary-600 cursor-col-resize items-center justify-center transition-colors flex-shrink-0"
          onMouseDown={onResizeStart}
        >
          <GripVertical size={10} className="text-slate-400" />
        </div>

        {/* Output / Preview panel */}
        <div className="w-full lg:flex-shrink-0 flex flex-col bg-slate-900" style={{ width: undefined, ...(typeof window !== 'undefined' && window.innerWidth >= 1024 ? { width: outputWidth } : {}) }}>
          {showHtmlPreview ? (
            <>
              <div className="flex items-center gap-2 px-4 py-2.5 border-b border-slate-700 flex-shrink-0">
                <span className="text-xs font-mono text-slate-400 flex-1">Live Preview</span>
              </div>
              <div className="flex-1 bg-white">
                <iframe
                  ref={iframeRef}
                  srcDoc={htmlPreview}
                  className="w-full h-full border-0"
                  sandbox="allow-scripts allow-modals"
                  title="HTML Preview"
                />
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2 px-4 py-2.5 border-b border-slate-700 flex-shrink-0">
                <span className="text-xs font-mono text-slate-400 flex-1">Output</span>
                {output.length > 0 && (
                  <button onClick={() => { setOutput([]); setShowTimeout(false); }} className="text-slate-500 hover:text-slate-300 p-1" title="Clear">
                    <Trash2 size={13} />
                  </button>
                )}
              </div>

              {/* Run/Stop */}
              <div className="px-4 py-3 border-b border-slate-700 flex gap-2 flex-shrink-0">
                <button
                  onClick={handleRun}
                  disabled={isRunDisabled}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium text-sm transition-colors"
                >
                  {running ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
                  {running ? 'Running...' : language === 'python' && runtimeStatus === 'loading' ? 'Loading Python...' : 'Run Code'}
                </button>
                {running && (
                  <button onClick={handleStop} className="px-3 py-2.5 rounded-xl bg-red-700 hover:bg-red-600 text-white text-sm font-medium transition-colors flex items-center gap-1.5">
                    <Square size={13} /> Stop
                  </button>
                )}
              </div>

              {showTimeout && (
                <div className="mx-4 mt-3 p-3 rounded-xl bg-amber-900/40 border border-amber-700/50 text-amber-300 text-xs flex items-start gap-2 flex-shrink-0">
                  <AlertCircle size={13} className="flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold mb-0.5">Taking longer than expected</p>
                    <p>Stop execution or reset the playground.</p>
                  </div>
                </div>
              )}

              <div className="flex-1 p-4 font-mono text-xs overflow-y-auto">
                {output.length === 0 ? (
                  <span className="text-slate-500">Click "Run Code" to execute {cfg.label}...</span>
                ) : (
                  output.map((line, i) => (
                    <div
                      key={i}
                      className={
                        line.kind === 'stderr' ? 'text-red-400 whitespace-pre-wrap' :
                        line.kind === 'meta' ? 'text-slate-500 whitespace-pre-wrap mt-1' :
                        line.kind === 'info' ? 'text-blue-400 whitespace-pre-wrap' :
                        'text-emerald-300 whitespace-pre-wrap'
                      }
                    >{line.text}</div>
                  ))
                )}
                <div ref={outputEndRef} />
              </div>

              {/* Status */}
              {language === 'python' && (
                <div className="px-4 py-2 border-t border-slate-700 flex-shrink-0">
                  <div className="flex items-center gap-1.5 text-xs text-slate-500">
                    <div className={`w-1.5 h-1.5 rounded-full ${
                      runtimeStatus === 'ready' ? 'bg-emerald-400' :
                      runtimeStatus === 'loading' ? 'bg-amber-400 animate-pulse' :
                      runtimeStatus === 'running' ? 'bg-teal-400 animate-pulse' : 'bg-slate-500'
                    }`} />
                    <span>
                      {runtimeStatus === 'ready' ? 'Python Ready' :
                       runtimeStatus === 'loading' ? 'Loading Python...' :
                       runtimeStatus === 'running' ? 'Running...' : 'Python Idle'}
                    </span>
                  </div>
                </div>
              )}

              {/* Save snippet */}
              {user && (
                <div className="px-4 pb-4 border-t border-slate-700 pt-3 flex-shrink-0">
                  <div className="flex gap-2">
                    <input
                      className="flex-1 px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 text-xs placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
                      placeholder="Snippet title..."
                      value={snippetTitle}
                      onChange={e => setSnippetTitle(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleSave()}
                    />
                    <button onClick={handleSave} disabled={!code.trim()} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs font-medium transition-colors disabled:opacity-40">
                      <Save size={12} /> Save
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
