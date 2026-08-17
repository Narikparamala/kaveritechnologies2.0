/**
 * Python Execution Service
 *
 * Manages a Pyodide Web Worker for browser-based Python execution.
 * - Worker is created on first use (lazy) — not at app startup.
 * - Worker is reused across runs (loaded once).
 * - A running worker can be terminated and replaced to implement Stop.
 * - All code passes through security checks inside the worker before execution.
 * - No code is ever sent to an external API.
 */

export interface ExecutionResult {
  success: boolean;
  output: string;
  error: string | null;
  executionTime: number;
}

export type RuntimeStatus = 'idle' | 'loading' | 'ready' | 'running' | 'error';

type StatusCallback = (status: RuntimeStatus) => void;

// Execution timeout in ms — after this we fire onTimeout
const EXECUTION_TIMEOUT_MS = 5000;

// Singleton worker instance
let worker: Worker | null = null;
let workerStatus: RuntimeStatus = 'idle';
let pendingResolve: ((r: ExecutionResult) => void) | null = null;
let pendingTimeout: ReturnType<typeof setTimeout> | null = null;
let requestId = 0;
const statusListeners = new Set<StatusCallback>();

function notifyStatus(status: RuntimeStatus) {
  workerStatus = status;
  statusListeners.forEach(fn => fn(status));
}

function buildWorker(): Worker {
  const w = new Worker('/pyodide.worker.js');

  w.onmessage = (event) => {
    const data = event.data;

    if (data.type === 'status') {
      notifyStatus(data.status as RuntimeStatus);
      return;
    }

    if (data.type === 'result') {
      if (pendingTimeout) { clearTimeout(pendingTimeout); pendingTimeout = null; }

      if (pendingResolve) {
        const resolve = pendingResolve;
        pendingResolve = null;
        notifyStatus('ready');
        resolve({
          success: data.success,
          output: data.output ?? '',
          error: data.error ?? null,
          executionTime: data.executionTime ?? 0,
        });
      }
    }
  };

  w.onerror = (err) => {
    if (pendingTimeout) { clearTimeout(pendingTimeout); pendingTimeout = null; }
    if (pendingResolve) {
      const resolve = pendingResolve;
      pendingResolve = null;
      notifyStatus('error');
      resolve({
        success: false,
        output: '',
        error: `Worker error: ${err.message}`,
        executionTime: 0,
      });
    } else {
      notifyStatus('error');
    }
  };

  return w;
}

/**
 * Subscribe to worker status changes. Returns an unsubscribe function.
 */
export function onRuntimeStatus(callback: StatusCallback): () => void {
  statusListeners.add(callback);
  // Fire immediately with current status
  callback(workerStatus);
  return () => statusListeners.delete(callback);
}

/**
 * Get the current runtime status without subscribing.
 */
export function getRuntimeStatus(): RuntimeStatus {
  return workerStatus;
}

/**
 * Pre-warm the Pyodide worker — starts loading in the background.
 * Call this when the Playground/Sandbox page mounts.
 */
export function preloadPyodide(): void {
  if (worker) return; // already created
  worker = buildWorker();
  // Worker auto-starts loading Pyodide on first message or on its own init
  // Send a dummy ping to trigger worker init
  worker.postMessage({ id: 0, code: '' });
}

/**
 * Run Python code. Returns a promise that resolves with the execution result.
 * - Rejects if called while another execution is in progress.
 * - Implements a 5 second timeout warning via onTimeout callback.
 */
export async function runPython(
  code: string,
  onTimeout?: () => void
): Promise<ExecutionResult> {
  if (workerStatus === 'running') {
    return {
      success: false,
      output: '',
      error: 'Another execution is already in progress.',
      executionTime: 0,
    };
  }

  // Ensure worker exists
  if (!worker) {
    worker = buildWorker();
  }

  notifyStatus('running');

  const id = ++requestId;

  return new Promise<ExecutionResult>((resolve) => {
    pendingResolve = resolve;

    // Timeout warning
    pendingTimeout = setTimeout(() => {
      if (onTimeout) onTimeout();
    }, EXECUTION_TIMEOUT_MS);

    worker!.postMessage({ id, code });
  });
}

/**
 * Stop the currently running execution by terminating and replacing the worker.
 * This is the only reliable way to interrupt Python in a browser environment.
 */
export function stopExecution(): void {
  if (!worker) return;

  // Clear pending timeout
  if (pendingTimeout) { clearTimeout(pendingTimeout); pendingTimeout = null; }

  // Resolve any pending promise as cancelled
  if (pendingResolve) {
    const resolve = pendingResolve;
    pendingResolve = null;
    resolve({
      success: false,
      output: '',
      error: 'Execution stopped by user.',
      executionTime: 0,
    });
  }

  // Terminate old worker
  worker.terminate();
  worker = null;
  notifyStatus('idle');

  // Rebuild worker immediately so it's ready for next run
  worker = buildWorker();
}

/**
 * Teardown — call when the Playground unmounts (optional, for cleanup).
 */
export function teardownWorker(): void {
  if (pendingTimeout) { clearTimeout(pendingTimeout); pendingTimeout = null; }
  if (pendingResolve) {
    const resolve = pendingResolve;
    pendingResolve = null;
    resolve({ success: false, output: '', error: 'Page navigated away.', executionTime: 0 });
  }
  if (worker) { worker.terminate(); worker = null; }
  notifyStatus('idle');
}
