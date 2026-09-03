/**
 * Pyodide Web Worker
 * Runs Python code in an isolated thread to keep the UI responsive.
 * Loaded from CDN — never bundled by Vite.
 */

const PYODIDE_INDEX_URL = 'https://cdn.jsdelivr.net/pyodide/v0.27.7/full/';

let pyodide = null;
let loading = false;

// ─── Security: restricted patterns ───────────────────────────────────────────
const RESTRICTED_PATTERNS = [
  /\bimport\s+os\b/,
  /\bfrom\s+os\b/,
  /\bimport\s+sys\b/,
  /\bfrom\s+sys\b/,
  /\bimport\s+subprocess\b/,
  /\bfrom\s+subprocess\b/,
  /\bimport\s+socket\b/,
  /\bfrom\s+socket\b/,
  /\bimport\s+requests\b/,
  /\bfrom\s+requests\b/,
  /\bimport\s+urllib\b/,
  /\bfrom\s+urllib\b/,
  /\bimport\s+http\b/,
  /\bfrom\s+http\b/,
  /\bimport\s+pathlib\b/,
  /\bfrom\s+pathlib\b/,
  /\bimport\s+shutil\b/,
  /\bfrom\s+shutil\b/,
  /\bimport\s+ctypes\b/,
  /\bfrom\s+ctypes\b/,
  /\bimport\s+multiprocessing\b/,
  /\bfrom\s+multiprocessing\b/,
  /\bimport\s+threading\b/,
  /\bfrom\s+threading\b/,
  /\bimport\s+asyncio\b/,
  /\bfrom\s+asyncio\b/,
  /\bopen\s*\(/,
  /\beval\s*\(/,
  /\bexec\s*\(/,
  /\bcompile\s*\(/,
  /\b__import__\s*\(/,
  /\bglobals\s*\(/,
  /\blocals\s*\(/,
  /\bvars\s*\(/,
  /\bgetattr\s*\(/,
  /\bsetattr\s*\(/,
  /\bdelattr\s*\(/,
  /\bbreakpoint\s*\(/,
  /\bhelp\s*\(/,
  /\binput\s*\(/,
];

const MAX_CODE_LENGTH = 20000;
const RESTRICTED_MSG =
  'This code uses a restricted operation and cannot run in the Kaveri Technologies Academy browser playground.';

function checkSecurity(code) {
  if (code.length > MAX_CODE_LENGTH) {
    return `Code exceeds the maximum allowed size of ${MAX_CODE_LENGTH} characters (your code: ${code.length} characters).`;
  }
  for (const pattern of RESTRICTED_PATTERNS) {
    if (pattern.test(code)) {
      return RESTRICTED_MSG;
    }
  }
  return null;
}

async function ensurePyodide() {
  if (pyodide) return pyodide;
  if (loading) {
    // Wait until loaded
    await new Promise(resolve => {
      const check = setInterval(() => {
        if (pyodide || !loading) { clearInterval(check); resolve(); }
      }, 100);
    });
    return pyodide;
  }

  loading = true;
  self.postMessage({ type: 'status', status: 'loading' });

  try {
    importScripts(`${PYODIDE_INDEX_URL}pyodide.js`);
    pyodide = await self.loadPyodide({ indexURL: PYODIDE_INDEX_URL });
    loading = false;
    self.postMessage({ type: 'status', status: 'ready' });
    return pyodide;
  } catch (err) {
    loading = false;
    self.postMessage({ type: 'status', status: 'error', message: err.message });
    throw err;
  }
}

self.onmessage = async function (event) {
  const { id, code } = event.data;

  // Security check before anything
  const secErr = checkSecurity(code);
  if (secErr) {
    self.postMessage({
      type: 'result',
      id,
      success: false,
      output: '',
      error: secErr,
      executionTime: 0,
    });
    return;
  }

  try {
    const py = await ensurePyodide();

    let stdoutBuf = '';
    let stderrBuf = '';

    py.setStdout({ batched: (s) => { stdoutBuf += s + '\n'; } });
    py.setStderr({ batched: (s) => { stderrBuf += s + '\n'; } });

    const start = performance.now();

    try {
      await py.runPythonAsync(code);
    } catch (pyErr) {
      const elapsed = performance.now() - start;
      // Python errors: extract readable traceback
      const errMsg = pyErr.message || String(pyErr);
      self.postMessage({
        type: 'result',
        id,
        success: false,
        output: stdoutBuf,
        error: stderrBuf || errMsg,
        executionTime: Math.round(elapsed),
      });
      return;
    }

    const elapsed = performance.now() - start;
    self.postMessage({
      type: 'result',
      id,
      success: true,
      output: stdoutBuf,
      error: stderrBuf || null,
      executionTime: Math.round(elapsed),
    });
  } catch (err) {
    const isOffline = !navigator.onLine;
    self.postMessage({
      type: 'result',
      id,
      success: false,
      output: '',
      error: isOffline
        ? 'Python runtime could not load — you appear to be offline. Please check your connection and try again.'
        : `Failed to run code: ${err.message}`,
      executionTime: 0,
    });
  }
};
