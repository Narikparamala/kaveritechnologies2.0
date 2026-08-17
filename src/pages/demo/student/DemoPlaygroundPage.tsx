import { useState, lazy, Suspense, useEffect, useRef } from 'react';
import { Terminal, Play, Square, RotateCcw, Copy, Save, Loader2, CheckCircle, AlertCircle, Trash2 } from 'lucide-react';
import { useDemo } from '../../../contexts/DemoContext';
import { useToast } from '../../../components/ui/Toast';
import {
  preloadPyodide, runPython, stopExecution,
  onRuntimeStatus, type RuntimeStatus
} from '../../../services/pythonExecution';

const MonacoEditor = lazy(() => import('@monaco-editor/react').then(m => ({ default: m.default })));

const STARTER = `# Welcome to the Python Playground Demo!\n# Write and run real Python code — powered by Pyodide.\n# Sign in to save your snippets.\n\nstudent_name = "Kiran Kumar"\nxp_points = 1250\nstreak_days = 6\n\nprint(f"Welcome, {student_name}!")\nprint(f"Your XP: {xp_points}")\nprint(f"Current Streak: {streak_days} days")\n\n# Try changing this code!\nnumbers = [1, 2, 3, 4, 5]\nfor num in numbers:\n    print(f"Number: {num}, Square: {num**2}")\n`;

function StatusIndicator({ status }: { status: RuntimeStatus }) {
  if (status === 'ready') return <div className="flex items-center gap-1.5 text-xs text-emerald-400"><CheckCircle size={11} />Python Ready</div>;
  if (status === 'loading') return <div className="flex items-center gap-1.5 text-xs text-amber-400"><Loader2 size={11} className="animate-spin" />Loading Python…</div>;
  if (status === 'running') return <div className="flex items-center gap-1.5 text-xs text-teal-400"><Loader2 size={11} className="animate-spin" />Running…</div>;
  if (status === 'error') return <div className="flex items-center gap-1.5 text-xs text-red-400"><AlertCircle size={11} />Runtime Error</div>;
  return <div className="flex items-center gap-1.5 text-xs text-slate-500"><div className="w-1.5 h-1.5 rounded-full bg-slate-500" />Click Run to load Python</div>;
}

interface OutputLine { text: string; kind: 'stdout' | 'stderr' | 'meta'; }

export default function DemoPlaygroundPage() {
  const demo = useDemo()!;
  const { success } = useToast();
  const [code, setCode] = useState(STARTER);
  const [output, setOutput] = useState<OutputLine[]>([]);
  const [runtimeStatus, setRuntimeStatus] = useState<RuntimeStatus>('idle');
  const [showTimeout, setShowTimeout] = useState(false);
  const [isDark, setIsDark] = useState(true);
  const outputEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const unsub = onRuntimeStatus(setRuntimeStatus);
    return unsub;
  }, []);

  useEffect(() => {
    preloadPyodide();
  }, []);

  useEffect(() => {
    outputEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [output]);

  const handleRun = async () => {
    if (runtimeStatus === 'running') return;
    setShowTimeout(false);
    setOutput(prev => [...prev, { text: '$ python main.py', kind: 'meta' }]);

    const result = await runPython(code, () => setShowTimeout(true));
    setShowTimeout(false);

    const newLines: OutputLine[] = [];
    if (result.output) {
      result.output.split('\n').forEach((line, i, arr) => {
        if (i < arr.length - 1 || line.length > 0) newLines.push({ text: line, kind: 'stdout' });
      });
    }
    if (result.error) {
      result.error.trim().split('\n').forEach(line => newLines.push({ text: line, kind: 'stderr' }));
    }
    const meta = result.success ? `[Done in ${result.executionTime}ms]`
      : (result.error?.includes('restricted') || result.error?.includes('stopped')) ? '' : `[Error in ${result.executionTime}ms]`;
    if (meta) newLines.push({ text: meta, kind: 'meta' });
    setOutput(prev => [...prev, ...newLines.filter(l => l.text !== '')]);
  };

  const handleStop = () => {
    stopExecution();
    setShowTimeout(false);
    setOutput(prev => [...prev, { text: '[Execution stopped by user]', kind: 'meta' }]);
  };

  const handleCopy = () => { navigator.clipboard.writeText(code); success('Code copied!'); };
  const handleReset = () => { setCode(STARTER); setOutput([]); };
  const isRunDisabled = runtimeStatus === 'running' || runtimeStatus === 'loading';
  const runLabel = runtimeStatus === 'loading' ? 'Loading Python…' : runtimeStatus === 'running' ? 'Running…' : 'Run Code';

  return (
    <div className="flex flex-col h-full overflow-hidden animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 sm:px-6 py-3 bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 flex-shrink-0">
        <Terminal size={18} className="text-teal-600 dark:text-teal-400" />
        <h1 className="font-bold text-slate-900 dark:text-white">Python Playground</h1>
        <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-lg font-bold">DEMO</span>
        <div className="flex-1" />
        <button onClick={() => setIsDark(d => !d)} className="btn-ghost py-1.5 px-3 text-xs hidden sm:block">
          {isDark ? '☀️ Light' : '🌙 Dark'}
        </button>
      </div>

      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* Editor */}
        <div className="flex-1 flex flex-col min-h-0 border-b lg:border-b-0 lg:border-r border-slate-200 dark:border-slate-700">
          <div className="flex items-center gap-2 px-4 py-2 bg-slate-800 text-slate-300 text-xs flex-shrink-0">
            <div className="flex gap-1.5">
              <div className="w-3 h-3 rounded-full bg-red-400" />
              <div className="w-3 h-3 rounded-full bg-amber-400" />
              <div className="w-3 h-3 rounded-full bg-emerald-400" />
            </div>
            <span className="font-mono ml-2 flex-1">main.py</span>
            <button onClick={handleCopy} className="hover:text-white p-1"><Copy size={13} /></button>
            <button onClick={handleReset} className="hover:text-white p-1"><RotateCcw size={13} /></button>
          </div>
          <Suspense fallback={<div className="flex-1 bg-slate-900" />}>
            <MonacoEditor
              height="100%"
              language="python"
              value={code}
              onChange={v => setCode(v ?? '')}
              theme={isDark ? 'vs-dark' : 'light'}
              options={{ minimap: { enabled: false }, lineNumbers: 'on', scrollBeyondLastLine: false, fontSize: 14, tabSize: 4, wordWrap: 'on', fontFamily: 'JetBrains Mono, Fira Code, monospace' }}
            />
          </Suspense>
        </div>

        {/* Output */}
        <div className="w-full lg:w-96 flex flex-col bg-slate-900 flex-shrink-0">
          <div className="flex items-center gap-2 px-4 py-2.5 border-b border-slate-700 flex-shrink-0">
            <span className="text-xs font-mono text-slate-400 flex-1">Output</span>
            {output.length > 0 && (
              <button onClick={() => setOutput([])} className="text-slate-500 hover:text-slate-300 p-1"><Trash2 size={13} /></button>
            )}
          </div>

          <div className="px-4 py-3 border-b border-slate-700 flex gap-2 flex-shrink-0">
            <button
              onClick={handleRun}
              disabled={isRunDisabled}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium text-sm transition-colors"
            >
              {isRunDisabled ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
              {runLabel}
            </button>
            {runtimeStatus === 'running' && (
              <button
                onClick={handleStop}
                className="px-3 py-2.5 rounded-xl bg-red-700 hover:bg-red-600 text-white text-sm font-medium flex items-center gap-1.5"
              >
                <Square size={13} /> Stop
              </button>
            )}
          </div>

          {showTimeout && (
            <div className="mx-4 mt-3 p-3 rounded-xl bg-amber-900/40 border border-amber-700/50 text-amber-300 text-xs flex items-start gap-2 flex-shrink-0">
              <AlertCircle size={13} className="flex-shrink-0 mt-0.5" />
              <p>This code is taking longer than expected. Stop execution or reset the playground.</p>
            </div>
          )}

          <div className="flex-1 p-4 font-mono text-xs overflow-y-auto">
            {output.length === 0
              ? <span className="text-slate-500">Click "Run Code" to execute Python…</span>
              : output.map((line, i) => (
                <div key={i} className={line.kind === 'stderr' ? 'text-red-400 whitespace-pre-wrap' : line.kind === 'meta' ? 'text-slate-500 whitespace-pre-wrap mt-1' : 'text-emerald-300 whitespace-pre-wrap'}>
                  {line.text}
                </div>
              ))
            }
            <div ref={outputEndRef} />
          </div>

          <div className="px-4 py-2.5 border-t border-slate-700 flex-shrink-0">
            <StatusIndicator status={runtimeStatus} />
          </div>

          {/* Save — demo requires auth */}
          <div className="px-4 pb-4 border-t border-slate-700 pt-3 flex-shrink-0">
            <button
              onClick={() => demo.requireAuth()}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-slate-700 hover:bg-slate-600 text-slate-400 text-xs font-medium transition-colors"
            >
              <Save size={12} /> Sign in to Save Snippet
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
