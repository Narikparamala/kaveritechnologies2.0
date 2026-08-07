import { useState, lazy, Suspense, useEffect, useRef } from 'react';
import {
  Code, Play, Square, FolderOpen, Terminal, Plus, X,
  Trash2, Loader2, CheckCircle, AlertCircle
} from 'lucide-react';
import {
  preloadPyodide, runPython, stopExecution,
  onRuntimeStatus, type RuntimeStatus
} from '../../services/pythonExecution';

const MonacoEditor = lazy(() => import('@monaco-editor/react').then(m => ({ default: m.default })));

const SAMPLE_FILES: Record<string, string> = {
  'main.py': '# Main entry point\n\ndef greet(name: str) -> str:\n    """Return a friendly greeting."""\n    return f"Hello, {name}! Welcome to the Code Sandbox."\n\ndef add(a: int, b: int) -> int:\n    """Add two numbers."""\n    return a + b\n\nif __name__ == "__main__":\n    message = greet("Python Developer")\n    print(message)\n    \n    result = add(10, 20)\n    print(f"10 + 20 = {result}")\n',
  'data_structures.py': '# Data structure examples\n\n# Stack using a list\nclass Stack:\n    def __init__(self):\n        self._items = []\n    \n    def push(self, item):\n        self._items.append(item)\n    \n    def pop(self):\n        return self._items.pop() if self._items else None\n    \n    def peek(self):\n        return self._items[-1] if self._items else None\n    \n    def is_empty(self):\n        return len(self._items) == 0\n    \n    def size(self):\n        return len(self._items)\n\n# Demo\ns = Stack()\nfor i in [1, 2, 3, 4, 5]:\n    s.push(i)\n\nprint("Stack size:", s.size())\nprint("Peek:", s.peek())\nprint("Popping:", s.pop(), s.pop())\nprint("Size after pops:", s.size())\n',
  'algorithms.py': '# Classic algorithms\n\ndef bubble_sort(arr):\n    """Bubble sort — O(n^2)"""\n    n = len(arr)\n    for i in range(n):\n        for j in range(0, n - i - 1):\n            if arr[j] > arr[j + 1]:\n                arr[j], arr[j + 1] = arr[j + 1], arr[j]\n    return arr\n\ndef binary_search(arr, target):\n    """Binary search — O(log n)"""\n    lo, hi = 0, len(arr) - 1\n    while lo <= hi:\n        mid = (lo + hi) // 2\n        if arr[mid] == target:\n            return mid\n        elif arr[mid] < target:\n            lo = mid + 1\n        else:\n            hi = mid - 1\n    return -1\n\n# Test sorting\nnumbers = [64, 34, 25, 12, 22, 11, 90]\nprint("Before:", numbers[:])\nbubble_sort(numbers)\nprint("After sort:", numbers)\n\n# Test search\nidx = binary_search(numbers, 25)\nprint(f"Found 25 at index: {idx}")\n',
  'classes.py': '# OOP examples\n\nclass Student:\n    """Represents a student at Kaveri Academy."""\n    \n    all_students = []\n    \n    def __init__(self, name: str, age: int, gpa: float):\n        self.name = name\n        self.age = age\n        self.gpa = gpa\n        Student.all_students.append(self)\n    \n    def is_passing(self) -> bool:\n        return self.gpa >= 3.0\n    \n    def __str__(self) -> str:\n        status = "Passing" if self.is_passing() else "Needs improvement"\n        return f"{self.name} (Age: {self.age}, GPA: {self.gpa}) — {status}"\n    \n    @classmethod\n    def class_average_gpa(cls):\n        if not cls.all_students:\n            return 0\n        return sum(s.gpa for s in cls.all_students) / len(cls.all_students)\n\n# Create students\nstudents = [\n    Student("Priya Sharma", 22, 3.9),\n    Student("Kiran Kumar", 21, 3.2),\n    Student("Arjun Nair", 23, 2.8),\n    Student("Meera Iyer", 20, 3.7),\n]\n\nfor s in students:\n    print(s)\n\nprint(f"\\nClass average GPA: {Student.class_average_gpa():.2f}")\n',
};

interface OutputLine {
  text: string;
  kind: 'stdout' | 'stderr' | 'info' | 'meta';
}

function StatusDot({ status }: { status: RuntimeStatus }) {
  const cfg: Record<RuntimeStatus, { color: string; label: string }> = {
    idle: { color: 'bg-slate-500', label: 'Not loaded' },
    loading: { color: 'bg-amber-500 animate-pulse', label: 'Loading Python…' },
    ready: { color: 'bg-emerald-500', label: 'Ready' },
    running: { color: 'bg-teal-400 animate-pulse', label: 'Running…' },
    error: { color: 'bg-red-500', label: 'Error' },
  };
  const { color, label } = cfg[status];
  return (
    <div className="flex items-center gap-1.5 text-xs text-slate-400">
      <div className={`w-2 h-2 rounded-full flex-shrink-0 ${color}`} />
      {label}
    </div>
  );
}

export default function SandboxPage() {
  const [files, setFiles] = useState<Record<string, string>>(SAMPLE_FILES);
  const [openTabs, setOpenTabs] = useState(['main.py', 'data_structures.py']);
  const [activeTab, setActiveTab] = useState('main.py');
  const [output, setOutput] = useState<OutputLine[]>([]);
  const [runtimeStatus, setRuntimeStatus] = useState<RuntimeStatus>('idle');
  const [newFileName, setNewFileName] = useState('');
  const [showTimeout, setShowTimeout] = useState(false);
  const outputEndRef = useRef<HTMLDivElement>(null);

  // Subscribe to runtime status
  useEffect(() => {
    const unsub = onRuntimeStatus(setRuntimeStatus);
    return unsub;
  }, []);

  // Preload Pyodide on mount
  useEffect(() => {
    preloadPyodide();
  }, []);

  // Auto-scroll console
  useEffect(() => {
    outputEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [output]);

  const openFile = (name: string) => {
    if (!openTabs.includes(name)) setOpenTabs(tabs => [...tabs, name]);
    setActiveTab(name);
  };

  const closeTab = (name: string) => {
    const newTabs = openTabs.filter(t => t !== name);
    setOpenTabs(newTabs);
    if (activeTab === name) setActiveTab(newTabs[0] ?? '');
  };

  const deleteFile = (name: string) => {
    closeTab(name);
    setFiles(f => {
      const next = { ...f };
      delete next[name];
      return next;
    });
  };

  const createFile = () => {
    if (!newFileName.trim()) return;
    let fname = newFileName.trim();
    if (!fname.endsWith('.py')) fname += '.py';
    setFiles(f => ({ ...f, [fname]: `# ${fname}\n\n` }));
    openFile(fname);
    setNewFileName('');
  };

  const handleRun = async () => {
    if (runtimeStatus === 'running') return;
    if (!activeTab || !files[activeTab]) return;
    if (!activeTab.endsWith('.py')) {
      setOutput([{ text: 'Select a Python (.py) file to run.', kind: 'info' }]);
      return;
    }

    const code = files[activeTab];
    setShowTimeout(false);

    setOutput(prev => [
      ...prev,
      { text: `$ python ${activeTab}`, kind: 'meta' },
    ]);

    const result = await runPython(code, () => setShowTimeout(true));
    setShowTimeout(false);

    const newLines: OutputLine[] = [];
    if (result.output) {
      result.output.split('\n').forEach((line, i, arr) => {
        if (i < arr.length - 1 || line.length > 0) {
          newLines.push({ text: line, kind: 'stdout' });
        }
      });
    }
    if (result.error) {
      result.error.trim().split('\n').forEach(line => {
        newLines.push({ text: line, kind: 'stderr' });
      });
    }
    const meta = result.success
      ? `[Done in ${result.executionTime}ms]`
      : result.error?.includes('restricted') || result.error?.includes('stopped')
        ? ''
        : `[Exited with error in ${result.executionTime}ms]`;
    if (meta) newLines.push({ text: meta, kind: 'meta' });

    setOutput(prev => [...prev, ...newLines]);
  };

  const handleStop = () => {
    stopExecution();
    setShowTimeout(false);
    setOutput(prev => [...prev, { text: '[Execution stopped by user]', kind: 'meta' }]);
  };

  const isRunDisabled = runtimeStatus === 'running' || runtimeStatus === 'loading';
  const runLabel = runtimeStatus === 'loading'
    ? 'Loading Python…'
    : runtimeStatus === 'running'
    ? 'Running…'
    : 'Run';

  return (
    <div className="flex flex-col h-full overflow-hidden bg-slate-950">
      {/* Title bar */}
      <div className="flex items-center gap-3 px-4 py-2 bg-slate-900 border-b border-slate-700 flex-shrink-0">
        <Code size={16} className="text-teal-400" />
        <span className="text-slate-300 text-sm font-medium">Python Code Sandbox</span>
        <div className="flex-1" />
        <StatusDot status={runtimeStatus} />
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* File explorer */}
        <div className="w-48 bg-slate-900 border-r border-slate-700 flex flex-col flex-shrink-0">
          <div className="flex items-center justify-between px-3 py-2 text-xs font-bold text-slate-400 uppercase tracking-wider">
            <span className="flex items-center gap-1"><FolderOpen size={12} /> Files</span>
          </div>
          <div className="flex-1 overflow-y-auto py-1">
            {Object.keys(files).map(fname => (
              <div
                key={fname}
                className={`group flex items-center w-full px-3 py-1.5 text-xs font-mono transition-colors cursor-pointer ${activeTab === fname ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'}`}
                onClick={() => openFile(fname)}
              >
                <span className="flex-1 truncate">📄 {fname}</span>
                {Object.keys(files).length > 1 && (
                  <button
                    onClick={e => { e.stopPropagation(); deleteFile(fname); }}
                    className="opacity-0 group-hover:opacity-100 p-0.5 hover:text-red-400 transition-all"
                    title="Delete file"
                  >
                    <X size={10} />
                  </button>
                )}
              </div>
            ))}
          </div>
          <div className="px-2 py-2 border-t border-slate-700">
            <div className="flex gap-1">
              <input
                className="flex-1 px-2 py-1 bg-slate-800 border border-slate-700 rounded-lg text-xs text-slate-300 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-teal-600"
                placeholder="new_file"
                value={newFileName}
                onChange={e => setNewFileName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && createFile()}
              />
              <button
                onClick={createFile}
                className="w-7 h-7 bg-teal-700 hover:bg-teal-600 rounded-lg flex items-center justify-center text-white"
                title="Create file"
              >
                <Plus size={12} />
              </button>
            </div>
          </div>
        </div>

        {/* Editor area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Tabs */}
          <div className="flex items-center bg-slate-900 border-b border-slate-700 overflow-x-auto flex-shrink-0">
            {openTabs.map(tab => (
              <div
                key={tab}
                className={`flex items-center gap-2 px-4 py-2 text-xs font-mono border-r border-slate-700 cursor-pointer flex-shrink-0 ${activeTab === tab ? 'bg-slate-950 text-white border-t-2 border-t-teal-500' : 'text-slate-400 hover:text-slate-200'}`}
                onClick={() => setActiveTab(tab)}
              >
                {tab}
                <button
                  onClick={e => { e.stopPropagation(); closeTab(tab); }}
                  className="hover:text-red-400 p-0.5 rounded"
                >
                  <X size={11} />
                </button>
              </div>
            ))}
          </div>

          {/* Editor */}
          {activeTab && files[activeTab] !== undefined ? (
            <Suspense fallback={<div className="flex-1 bg-slate-950" />}>
              <MonacoEditor
                height="100%"
                language={activeTab.endsWith('.py') ? 'python' : 'plaintext'}
                value={files[activeTab]}
                onChange={v => setFiles(f => ({ ...f, [activeTab]: v ?? '' }))}
                theme="vs-dark"
                options={{
                  minimap: { enabled: false },
                  lineNumbers: 'on',
                  scrollBeyondLastLine: false,
                  fontSize: 13,
                  tabSize: 4,
                  fontFamily: 'JetBrains Mono, Fira Code, monospace',
                }}
              />
            </Suspense>
          ) : (
            <div className="flex-1 flex items-center justify-center text-slate-500 text-sm">
              Select a file to edit
            </div>
          )}

          {/* Bottom console */}
          <div className="h-48 border-t border-slate-700 bg-slate-950 flex flex-col flex-shrink-0">
            <div className="flex items-center gap-3 px-4 py-2 border-b border-slate-800 flex-shrink-0">
              <Terminal size={13} className="text-slate-400" />
              <span className="text-xs text-slate-400 font-mono flex-1">Console</span>
              {output.length > 0 && (
                <button
                  onClick={() => setOutput([])}
                  className="text-slate-600 hover:text-slate-400 p-1 transition-colors"
                  title="Clear console"
                >
                  <Trash2 size={12} />
                </button>
              )}
              {/* Stop button */}
              {runtimeStatus === 'running' && (
                <button
                  onClick={handleStop}
                  className="flex items-center gap-1 px-2 py-1 bg-red-800 hover:bg-red-700 text-white rounded-lg text-xs font-medium transition-colors"
                >
                  <Square size={10} /> Stop
                </button>
              )}
              {/* Run button */}
              <button
                onClick={handleRun}
                disabled={isRunDisabled}
                className="flex items-center gap-1.5 px-3 py-1 bg-teal-700 hover:bg-teal-600 text-white rounded-lg text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isRunDisabled
                  ? <Loader2 size={11} className="animate-spin" />
                  : <Play size={11} />
                }
                {runLabel}
              </button>
            </div>

            {/* Timeout warning */}
            {showTimeout && (
              <div className="mx-3 mt-2 p-2 rounded-lg bg-amber-900/40 border border-amber-700/50 text-amber-300 text-xs flex items-center gap-2 flex-shrink-0">
                <AlertCircle size={11} className="flex-shrink-0" />
                This code is taking longer than expected. Stop execution or reset the playground.
              </div>
            )}

            <div className="flex-1 p-3 font-mono text-xs overflow-y-auto">
              {output.length === 0 ? (
                <span className="text-slate-600">$ python {activeTab || '...'}</span>
              ) : (
                output.map((line, i) => (
                  <div
                    key={i}
                    className={
                      line.kind === 'stderr'
                        ? 'text-red-400 whitespace-pre-wrap'
                        : line.kind === 'meta'
                        ? 'text-slate-500 whitespace-pre-wrap'
                        : line.kind === 'info'
                        ? 'text-amber-400 whitespace-pre-wrap'
                        : 'text-emerald-400 whitespace-pre-wrap'
                    }
                  >
                    {line.text}
                  </div>
                ))
              )}
              <div ref={outputEndRef} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
