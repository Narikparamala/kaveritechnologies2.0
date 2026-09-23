/**
 * Shared code editor — the ONE Monaco component used across the app.
 *
 * Monaco is bundled locally (the `monaco-editor` npm package, MIT) instead of
 * fetched from cdn.jsdelivr.net at runtime, so the editor works even where
 * the CDN is blocked (adblockers, campus networks) and never shows the
 * blank "Loading forever" pane. Vite code-splits Monaco into a lazy chunk,
 * so the initial bundle stays small.
 */
import { lazy, Suspense, useMemo } from 'react';
import * as monaco from 'monaco-editor';
import { loader } from '@monaco-editor/react';
import { Loader2 } from 'lucide-react';

import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import JsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker';
import CssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker';
import HtmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker';
import TsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker';

// Route worker creation to the bundled workers (no CDN).
(self as unknown as { MonacoEnvironment: monaco.Environment }).MonacoEnvironment = {
  getWorker(_workerId: string, label: string): Worker {
    if (label === 'json') return new JsonWorker();
    if (label === 'css' || label === 'scss' || label === 'less') return new CssWorker();
    if (label === 'html' || label === 'handlebars' || label === 'razor') return new HtmlWorker();
    if (label === 'typescript' || label === 'javascript') return new TsWorker();
    return new EditorWorker();
  },
};

// Tell @monaco-editor/react to use the bundled monaco, never the CDN.
loader.config({ monaco });

const MonacoEditor = lazy(() => import('@monaco-editor/react').then(m => ({ default: m.default })));

export type CodeEditorProps = {
  value: string;
  onChange: (value: string) => void;
  /** Monaco language id: python, javascript, typescript, html, css, json, sql, cpp, java… */
  language?: string;
  height?: string;
  /** Legacy pass-through: 'vs-dark' | 'light'. When omitted, follows `dark`. */
  theme?: 'vs-dark' | 'light';
  dark?: boolean;
  readOnly?: boolean;
  fontSize?: number;
  /** Extra Monaco options; merged over the app defaults. */
  options?: monaco.editor.IStandaloneEditorConstructionOptions;
  className?: string;
};

export default function CodeEditor({
  value,
  onChange,
  language = 'python',
  height = '100%',
  theme,
  dark = true,
  readOnly = false,
  fontSize = 14,
  options,
  className = '',
}: CodeEditorProps) {
  const merged = useMemo<monaco.editor.IStandaloneEditorConstructionOptions>(
    () => ({
      minimap: { enabled: false },
      fontSize,
      automaticLayout: true,
      padding: { top: 12 },
      scrollBeyondLastLine: false,
      wordWrap: 'on',
      readOnly,
      tabSize: language === 'python' ? 4 : 2,
      insertSpaces: true,
      fontFamily: 'JetBrains Mono, Fira Code, Consolas, monospace',
      smoothScrolling: true,
      cursorBlinking: 'smooth',
      bracketPairColorization: { enabled: true },
      scrollbar: { verticalScrollbarSize: 10, horizontalScrollbarSize: 10 },
      ...options,
    }),
    [fontSize, readOnly, language, options],
  );

  return (
    <div className={`h-full min-h-0 ${className}`} style={{ height }}>
      <Suspense
        fallback={
          <div className="flex h-full items-center justify-center gap-2 bg-slate-950 text-sm text-slate-400">
            <Loader2 size={16} className="animate-spin" /> Loading editor…
          </div>
        }
      >
        <MonacoEditor
          height="100%"
          language={language}
          theme={theme ?? (dark ? 'vs-dark' : 'light')}
          value={value}
          onChange={v => onChange(v ?? '')}
          options={merged}
        />
      </Suspense>
    </div>
  );
}
