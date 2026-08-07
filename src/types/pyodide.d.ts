// Minimal type declarations for Pyodide loaded via CDN script tag
// Full types from @pyodide/pyodide package are not required since we load via CDN in a worker

export interface PyodideInterface {
  runPython(code: string): unknown;
  runPythonAsync(code: string): Promise<unknown>;
  loadPackage(packages: string | string[]): Promise<void>;
  setStdout(opts: { batched?: (s: string) => void; write?: (s: string) => void }): void;
  setStderr(opts: { batched?: (s: string) => void; write?: (s: string) => void }): void;
  globals: { get(key: string): unknown; set(key: string, value: unknown): void };
}

export interface LoadPyodideOptions {
  indexURL: string;
  stdout?: (msg: string) => void;
  stderr?: (msg: string) => void;
}

declare global {
  interface Window {
    loadPyodide(opts: LoadPyodideOptions): Promise<PyodideInterface>;
  }
}
