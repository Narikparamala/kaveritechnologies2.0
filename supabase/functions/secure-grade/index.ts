import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

type TestCase = {
  id: string;
  input_data: string | null;
  expected_output: string;
  is_hidden: boolean;
  weight: number;
};

type JudgeLanguage = {
  id: number;
  name: string;
};

type JudgeStatus =
  | 'accepted'
  | 'wrong_answer'
  | 'time_limit'
  | 'memory_limit'
  | 'output_limit'
  | 'compile_error'
  | 'runtime_error'
  | 'internal_error'
  | 'execution_error';

type JudgeResult = {
  id: string;
  index: number;
  hidden: boolean;
  passed: boolean;
  status: JudgeStatus;
  timeMs: number | null;
  memoryKb: number | null;
  input: string;
  expected: string;
  actual: string;
  stderr: string;
};

type PublicJudgeResult =
  | (Omit<JudgeResult, 'hidden'> & { hidden: false })
  | (Omit<JudgeResult, 'hidden' | 'input' | 'expected' | 'actual' | 'stderr'> & { hidden: true });

const MAX_CODE_BYTES = 20_000;
const MAX_TESTS = 30;
const MAX_REQUESTS_PER_FIVE_MINUTES = 10;
const MAX_RUN_REQUESTS_PER_FIVE_MINUTES = 30;
const MAX_CUSTOM_INPUT_BYTES = 20_000;
const LANGUAGE_CACHE_MS = 5 * 60_000;

let languageCache: { expiresAt: number; languages: JudgeLanguage[] } | null = null;

const GO_JUDGE_LANGUAGE: JudgeLanguage = { id: 71, name: 'Python (3.x)' };

function getRunnerBackend(): 'go-judge' | 'judge0' {
  const url = Deno.env.get('GO_JUDGE_URL');
  const token = Deno.env.get('GO_JUDGE_TOKEN');
  if (url && token) return 'go-judge';
  if (url || token) throw new Error('RUNNER_NOT_CONFIGURED');
  return 'judge0';
}

function json(body: unknown, status: number, origin: string) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'access-control-allow-origin': origin,
      'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info',
      'access-control-allow-methods': 'POST, OPTIONS',
      'vary': 'Origin',
    },
  });
}

function normalizeOutput(value: string | null | undefined) {
  return String(value ?? '').replace(/\r\n/g, '\n').trim();
}

type SupabaseOperationResult = {
  error: { code?: string; message?: string } | null;
};

function assertDatabaseSuccess(result: SupabaseOperationResult, operation: string) {
  if (!result.error) return;
  console.error(`secure-grade database operation failed: ${operation}`, result.error);
  throw new Error('GRADING_STORAGE_ERROR');
}

function publicFailure(error: unknown) {
  const internalCode = error instanceof Error ? error.message : 'GRADING_ERROR';

  switch (internalCode) {
    case 'RUNNER_NOT_CONFIGURED':
      return {
        code: internalCode,
        status: 503,
        message: 'Secure grading is not configured yet. Your work remains available for faculty review.',
      };
    case 'NO_TESTS':
      return {
        code: internalCode,
        status: 409,
        message: 'This question does not have final test cases yet. Ask faculty to review it.',
      };
    case 'VSCODE_NO_HIDDEN_TESTS':
      return {
        code: internalCode,
        status: 409,
        message: 'This assignment has no hidden server tests yet. Your submission is saved and available for faculty review.',
      };
    case 'TOO_MANY_TESTS':
      return {
        code: internalCode,
        status: 422,
        message: 'This question has too many final test cases. Ask faculty to correct it.',
      };
    case 'INVALID_LANGUAGE':
      return {
        code: internalCode,
        status: 422,
        message: 'Select a supported Judge0 language and try again.',
      };
    case 'PYTHON_RUNTIME_UNAVAILABLE':
      return {
        code: internalCode,
        status: 503,
        message: 'The required Python runtime is not installed in Judge0.',
      };
    case 'RUNNER_TIMEOUT':
      return {
        code: internalCode,
        status: 504,
        message: 'Secure grading timed out. Please try again.',
      };
    case 'FINAL_RATE_LIMIT':
      return {
        code: internalCode,
        status: 429,
        message: 'Too many final submissions. Please wait a few minutes.',
      };
    case 'RUN_RATE_LIMIT':
      return {
        code: internalCode,
        status: 429,
        message: 'Too many code runs. Please wait a few minutes.',
      };
    case 'RUNNER_UNAVAILABLE':
    case 'RUNNER_INVALID_RESPONSE':
      return {
        code: internalCode,
        status: 502,
        message: 'The secure runner is temporarily unavailable. Please try again.',
      };
    case 'GRADING_STORAGE_ERROR':
      return {
        code: internalCode,
        status: 500,
        message: 'The verified result could not be saved. Please try again.',
      };
    default:
      return {
        code: 'GRADING_ERROR',
        status: 500,
        message: 'Secure grading could not finish. Please try again or ask faculty to review your submission.',
      };
  }
}

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

function encodeBase64(value: string) {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function decodeBase64(value: unknown) {
  if (typeof value !== 'string' || !value) return '';
  try {
    const binary = atob(value);
    const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    throw new Error('RUNNER_INVALID_RESPONSE');
  }
}

function judge0Url(path: string) {
  const endpoint = Deno.env.get('JUDGE0_URL');
  if (!endpoint) throw new Error('RUNNER_NOT_CONFIGURED');
  const baseUrl = endpoint.endsWith('/') ? endpoint : `${endpoint}/`;
  return new URL(path.replace(/^\//, ''), baseUrl);
}

function judge0Headers() {
  const headers: Record<string, string> = {};
  const pairs = [
    [Deno.env.get('JUDGE0_AUTHN_HEADER') || 'X-Auth-Token', Deno.env.get('JUDGE0_AUTHN_TOKEN')],
    [Deno.env.get('JUDGE0_AUTHZ_HEADER') || 'X-Auth-User', Deno.env.get('JUDGE0_AUTHZ_TOKEN')],
  ];

  for (const [name, token] of pairs) {
    if (!token) continue;
    if (!name || !/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(name)) {
      throw new Error('RUNNER_NOT_CONFIGURED');
    }
    headers[name] = token;
  }

  return headers;
}

async function getJudgeLanguages(): Promise<JudgeLanguage[]> {
  if (getRunnerBackend() === 'go-judge') return [GO_JUDGE_LANGUAGE];
  if (languageCache && languageCache.expiresAt > Date.now()) return languageCache.languages;

  let response: Response;
  try {
    response = await fetch(judge0Url('languages/'), {
      headers: judge0Headers(),
      signal: AbortSignal.timeout(8_000),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'TimeoutError') throw new Error('RUNNER_TIMEOUT');
    console.error('secure-grade Judge0 language request failed', error);
    throw new Error('RUNNER_UNAVAILABLE');
  }

  if (!response.ok) throw new Error('RUNNER_UNAVAILABLE');
  const payload: unknown = await response.json();
  if (!Array.isArray(payload)) throw new Error('RUNNER_INVALID_RESPONSE');

  const languages = payload
    .filter(item => item && Number.isInteger(Number(item.id)) && typeof item.name === 'string')
    .map(item => ({ id: Number(item.id), name: String(item.name) }))
    .sort((left, right) => left.name.localeCompare(right.name));

  if (!languages.length) throw new Error('RUNNER_INVALID_RESPONSE');
  languageCache = { expiresAt: Date.now() + LANGUAGE_CACHE_MS, languages };
  return languages;
}

async function requireJudgeLanguage(languageId: unknown) {
  const parsedId = Number(languageId);
  if (!Number.isInteger(parsedId) || parsedId <= 0) throw new Error('INVALID_LANGUAGE');
  if (getRunnerBackend() === 'go-judge') {
    if (parsedId !== GO_JUDGE_LANGUAGE.id) throw new Error('INVALID_LANGUAGE');
    return GO_JUDGE_LANGUAGE;
  }
  const language = (await getJudgeLanguages()).find(item => item.id === parsedId);
  if (!language) throw new Error('INVALID_LANGUAGE');
  return language;
}

async function defaultPythonLanguage() {
  if (getRunnerBackend() === 'go-judge') return GO_JUDGE_LANGUAGE;
  const languages = await getJudgeLanguages();
  const python = languages.find(language => /^Python \(3\./i.test(language.name));
  if (!python) throw new Error('PYTHON_RUNTIME_UNAVAILABLE');
  return python;
}

function mapJudge0Status(description: string, passed: boolean): JudgeStatus {
  if (passed) return 'accepted';
  if (description === 'Accepted') return 'wrong_answer';
  if (/Compilation Error/i.test(description)) return 'compile_error';
  if (/Time Limit/i.test(description)) return 'time_limit';
  if (/Memory Limit/i.test(description)) return 'memory_limit';
  if (/Output Limit/i.test(description)) return 'output_limit';
  if (/Runtime Error/i.test(description)) return 'runtime_error';
  if (/Internal Error/i.test(description)) return 'internal_error';
  return 'execution_error';
}

function mapGoJudgeStatus(status: string, passed: boolean): JudgeStatus {
  if (passed) return 'accepted';
  if (status === 'Accepted') return 'wrong_answer';
  if (status === 'Time Limit Exceeded') return 'time_limit';
  if (status === 'Memory Limit Exceeded') return 'memory_limit';
  if (status === 'Output Limit Exceeded') return 'output_limit';
  if (status === 'Nonzero Exit Status' || status === 'Signalled') return 'runtime_error';
  if (status === 'Internal Error') return 'internal_error';
  return 'execution_error';
}

async function judgeCodeGoJudge(
  code: string,
  test: TestCase,
  index: number,
  _language: JudgeLanguage,
): Promise<JudgeResult> {
  const url = Deno.env.get('GO_JUDGE_URL');
  const token = Deno.env.get('GO_JUDGE_TOKEN');
  if (!url || !token) throw new Error('RUNNER_NOT_CONFIGURED');

  const runUrl = new URL('run', url.endsWith('/') ? url : `${url}/`);
  let response: Response;
  try {
    response = await fetch(runUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'authorization': `Bearer ${token}`,
      },
      signal: AbortSignal.timeout(12_000),
      body: JSON.stringify({
        cmd: [{
          args: ['/usr/bin/python3', '-I', 'solution.py'],
          env: ['PATH=/usr/bin:/bin', 'PYTHONIOENCODING=utf-8'],
          files: [
            { content: test.input_data ?? '' },
            { name: 'stdout', max: 65_536 },
            { name: 'stderr', max: 65_536 },
          ],
          cpuLimit: 2_000_000_000,
          clockLimit: 5_000_000_000,
          memoryLimit: 134_217_728,
          procLimit: 30,
          copyIn: {
            'solution.py': { content: code },
          },
          copyOut: ['stdout', 'stderr'],
        }],
      }),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'TimeoutError') throw new Error('RUNNER_TIMEOUT');
    console.error('secure-grade go-judge request failed', error);
    throw new Error('RUNNER_UNAVAILABLE');
  }

  if (!response.ok) {
    console.error('secure-grade go-judge returned an error status', response.status);
    throw new Error('RUNNER_UNAVAILABLE');
  }

  const payload: unknown = await response.json();
  const resultCandidate = Array.isArray(payload) ? payload[0] : payload;
  if (!resultCandidate || typeof resultCandidate !== 'object') {
    throw new Error('RUNNER_INVALID_RESPONSE');
  }
  const result = resultCandidate as Record<string, unknown>;
  const files = result.files as { stdout?: unknown; stderr?: unknown } | undefined;
  const status = String(result.status ?? '');
  const stdout = normalizeOutput(typeof files?.stdout === 'string' ? files.stdout : '');
  const stderr = normalizeOutput(typeof files?.stderr === 'string' ? files.stderr : '');
  const expected = normalizeOutput(test.expected_output);
  const executionAccepted = status === 'Accepted';
  const passed = executionAccepted && (test.expected_output === '' || stdout === expected);

  return {
    id: test.id,
    index,
    hidden: test.is_hidden,
    passed,
    status: mapGoJudgeStatus(status, passed),
    timeMs: result.time == null ? null : Math.round(Number(result.time) / 1_000_000),
    memoryKb: result.memory == null ? null : Math.round(Number(result.memory) / 1024),
    input: test.input_data ?? '',
    expected,
    actual: stdout,
    stderr,
  };
}

async function judgeCode(
  code: string,
  test: TestCase,
  index: number,
  language: JudgeLanguage,
): Promise<JudgeResult> {
  if (getRunnerBackend() === 'go-judge') return judgeCodeGoJudge(code, test, index, language);
  const url = judge0Url('submissions/');
  url.searchParams.set('base64_encoded', 'true');
  url.searchParams.set('wait', 'true');
  url.searchParams.set('fields', 'token,stdout,time,memory,stderr,compile_output,message,status');

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...judge0Headers() },
      signal: AbortSignal.timeout(12_000),
      body: JSON.stringify({
        source_code: encodeBase64(code),
        language_id: language.id,
        stdin: encodeBase64(test.input_data ?? ''),
        cpu_time_limit: 2,
        wall_time_limit: 5,
        memory_limit: 128_000,
        max_file_size: 1_024,
        max_processes_and_or_threads: 30,
        enable_network: false,
      }),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'TimeoutError') throw new Error('RUNNER_TIMEOUT');
    console.error('secure-grade Judge0 request failed', error);
    throw new Error('RUNNER_UNAVAILABLE');
  }

  if (!response.ok) {
    console.error('secure-grade Judge0 returned an error status', response.status);
    throw new Error('RUNNER_UNAVAILABLE');
  }

  const payload: unknown = await response.json();
  if (!payload || typeof payload !== 'object') throw new Error('RUNNER_INVALID_RESPONSE');
  const result = payload as Record<string, unknown>;
  const judgeStatus = result.status as { description?: unknown } | undefined;
  const description = String(judgeStatus?.description ?? '');
  if (!description) throw new Error('RUNNER_INVALID_RESPONSE');

  const stdout = normalizeOutput(decodeBase64(result.stdout));
  const compileOutput = normalizeOutput(decodeBase64(result.compile_output));
  const runtimeError = normalizeOutput(decodeBase64(result.stderr));
  const message = normalizeOutput(decodeBase64(result.message));
  const stderr = [compileOutput, runtimeError, message].filter(Boolean).join('\n');
  const expected = normalizeOutput(test.expected_output);
  const executionAccepted = description === 'Accepted';
  const passed = executionAccepted && (test.expected_output === '' || stdout === expected);

  return {
    id: test.id,
    index,
    hidden: test.is_hidden,
    passed,
    status: mapJudge0Status(description, passed),
    timeMs: result.time == null ? null : Math.round(Number(result.time) * 1_000),
    memoryKb: result.memory == null ? null : Math.round(Number(result.memory)),
    input: test.input_data ?? '',
    expected,
    actual: stdout,
    stderr,
  };
}

async function runTests(code: string, tests: TestCase[], language: JudgeLanguage) {
  if (tests.length === 0) throw new Error('NO_TESTS');
  if (tests.length > MAX_TESTS) throw new Error('TOO_MANY_TESTS');

  const results: JudgeResult[] = [];
  for (let index = 0; index < tests.length; index += 2) {
    results.push(...await Promise.all(
      tests.slice(index, index + 2).map((test, offset) => judgeCode(code, test, index + offset, language)),
    ));
  }

  const passed = results.filter(result => result.passed).length;
  const visibleResults = results.filter(result => !result.hidden);
  const hiddenResults = results.filter(result => result.hidden);
  const publicResults: PublicJudgeResult[] = results.map(result => {
    if (result.hidden) {
      return {
        id: result.id,
        index: result.index,
        hidden: true,
        passed: result.passed,
        status: result.status,
        timeMs: result.timeMs,
        memoryKb: result.memoryKb,
      };
    }

    return {
      id: result.id,
      index: result.index,
      hidden: false,
      passed: result.passed,
      status: result.status,
      timeMs: result.timeMs,
      memoryKb: result.memoryKb,
      input: result.input,
      expected: result.expected,
      actual: result.actual,
      stderr: result.stderr,
    };
  });

  return {
    passed,
    total: results.length,
    allPassed: passed === results.length,
    visiblePassed: visibleResults.filter(result => result.passed).length,
    visibleTotal: visibleResults.length,
    hiddenPassed: hiddenResults.filter(result => result.passed).length,
    hiddenTotal: hiddenResults.length,
    maxTimeMs: Math.max(0, ...results.map(result => result.timeMs ?? 0)),
    maxMemoryKb: Math.max(0, ...results.map(result => result.memoryKb ?? 0)),
    tests: publicResults,
    language,
  };
}

Deno.serve(async req => {
  const requestOrigin = req.headers.get('origin') ?? '';
  const allowedOrigins = (Deno.env.get('LMS_ALLOWED_ORIGINS') ?? 'http://localhost:5173')
    .split(',').map(value => value.trim()).filter(Boolean);
  const responseOrigin = allowedOrigins.includes(requestOrigin) ? requestOrigin : allowedOrigins[0];

  if (req.method === 'OPTIONS') {
    if (requestOrigin && !allowedOrigins.includes(requestOrigin)) return json({ error: 'Origin not allowed' }, 403, responseOrigin);
    return json({}, 200, responseOrigin);
  }
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405, responseOrigin);
  if (requestOrigin && !allowedOrigins.includes(requestOrigin)) return json({ error: 'Origin not allowed' }, 403, responseOrigin);

  const authorization = req.headers.get('authorization');
  if (!authorization?.startsWith('Bearer ')) return json({ error: 'Authentication required' }, 401, responseOrigin);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !anonKey || !serviceKey) return json({ error: 'Server configuration error' }, 500, responseOrigin);

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: { user }, error: userError } = await userClient.auth.getUser(authorization.slice(7));
  if (userError || !user) return json({ error: 'Invalid or expired session' }, 401, responseOrigin);

  const profileResult = await admin.from('profiles')
    .select('id,role,is_active')
    .eq('id', user.id)
    .maybeSingle();
  if (profileResult.error) {
    console.error('secure-grade could not load caller profile', profileResult.error);
    return json({ error: 'Secure grading is temporarily unavailable', code: 'GRADING_STORAGE_ERROR' }, 500, responseOrigin);
  }
  if (!profileResult.data?.is_active) return json({ error: 'Account is inactive' }, 403, responseOrigin);
  if (profileResult.data.role !== 'student') return json({ error: 'Student access required' }, 403, responseOrigin);

  let payload: {
    kind?: string;
    questionId?: string;
    submissionId?: string;
    code?: string;
    input?: string;
    languageId?: number;
  };
  try {
    payload = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400, responseOrigin);
  }

  try {
    if (payload.kind === 'languages') {
      return json({ languages: await getJudgeLanguages() }, 200, responseOrigin);
    }

    const since = new Date(Date.now() - 5 * 60_000).toISOString();
    const enforceFinalRateLimit = async () => {
      const recentRunsResult = await admin.from('secure_grading_runs')
        .select('id', { count: 'exact', head: true })
        .eq('student_id', user.id)
        .gte('created_at', since);
      assertDatabaseSuccess(recentRunsResult, 'check final grading rate limit');
      if ((recentRunsResult.count ?? 0) >= MAX_REQUESTS_PER_FIVE_MINUTES) {
        throw new Error('FINAL_RATE_LIMIT');
      }
    };

    const beginExecutionRequest = async (mode: 'sample' | 'custom', languageId: number, inputCount: number) => {
      const recentRequestsResult = await admin.from('coding_execution_requests')
        .select('id', { count: 'exact', head: true })
        .eq('student_id', user.id)
        .gte('created_at', since);
      assertDatabaseSuccess(recentRequestsResult, 'check code execution rate limit');
      if ((recentRequestsResult.count ?? 0) >= MAX_RUN_REQUESTS_PER_FIVE_MINUTES) {
        throw new Error('RUN_RATE_LIMIT');
      }

      const requestResult = await admin.from('coding_execution_requests').insert({
        student_id: user.id,
        mode,
        language_id: languageId,
        input_count: inputCount,
        status: 'running',
      }).select('id').single();
      assertDatabaseSuccess(requestResult, 'create code execution audit');
      if (!requestResult.data) throw new Error('GRADING_STORAGE_ERROR');
      return requestResult.data.id;
    };

    const finishExecutionRequest = async (requestId: string, status: 'completed' | 'error') => {
      const updateResult = await admin.from('coding_execution_requests').update({
        status,
        completed_at: new Date().toISOString(),
      }).eq('id', requestId);
      assertDatabaseSuccess(updateResult, 'finish code execution audit');
    };

    if (payload.kind === 'sample') {
      const code = String(payload.code ?? '');
      if (!payload.questionId || !code.trim()) return json({ error: 'Question and code are required' }, 400, responseOrigin);
      if (new TextEncoder().encode(code).byteLength > MAX_CODE_BYTES) return json({ error: 'Code is too large' }, 413, responseOrigin);

      const language = await requireJudgeLanguage(payload.languageId);
      const [questionResult, testsResult] = await Promise.all([
        admin.from('coding_questions').select('id,is_published').eq('id', payload.questionId).maybeSingle(),
        admin.from('coding_question_test_cases')
          .select('id,input_data,expected_output,is_hidden,weight')
          .eq('question_id', payload.questionId)
          .eq('is_hidden', false)
          .order('order_index'),
      ]);
      assertDatabaseSuccess(questionResult, 'load sample question');
      assertDatabaseSuccess(testsResult, 'load sample tests');
      if (!questionResult.data?.is_published) return json({ error: 'Question is unavailable' }, 404, responseOrigin);

      const tests = (testsResult.data ?? []) as TestCase[];
      if (!tests.length) throw new Error('NO_TESTS');
      const executionRequestId = await beginExecutionRequest('sample', language.id, tests.length);
      try {
        const outcome = await runTests(code, tests, language);
        await finishExecutionRequest(executionRequestId, 'completed');
        return json({ executed: true, ...outcome }, 200, responseOrigin);
      } catch (error) {
        await finishExecutionRequest(executionRequestId, 'error');
        throw error;
      }
    }

    if (payload.kind === 'custom') {
      const code = String(payload.code ?? '');
      const input = String(payload.input ?? '');
      if (!code.trim()) return json({ error: 'Code is required' }, 400, responseOrigin);
      if (new TextEncoder().encode(code).byteLength > MAX_CODE_BYTES) return json({ error: 'Code is too large' }, 413, responseOrigin);
      if (new TextEncoder().encode(input).byteLength > MAX_CUSTOM_INPUT_BYTES) return json({ error: 'Custom input is too large' }, 413, responseOrigin);

      const language = await requireJudgeLanguage(payload.languageId);
      const executionRequestId = await beginExecutionRequest('custom', language.id, 1);
      const customTest: TestCase = {
        id: 'custom',
        input_data: input,
        expected_output: '',
        is_hidden: false,
        weight: 1,
      };
      try {
        const result = await judgeCode(code, customTest, 0, language);
        await finishExecutionRequest(executionRequestId, 'completed');
        return json({ executed: true, language, result }, 200, responseOrigin);
      } catch (error) {
        await finishExecutionRequest(executionRequestId, 'error');
        throw error;
      }
    }

    if (payload.kind === 'practice') {
      const code = String(payload.code ?? '');
      if (!payload.questionId || !code.trim()) return json({ error: 'Question and code are required' }, 400, responseOrigin);
      if (new TextEncoder().encode(code).byteLength > MAX_CODE_BYTES) return json({ error: 'Code is too large' }, 413, responseOrigin);

      await enforceFinalRateLimit();
      const language = await requireJudgeLanguage(payload.languageId);

      const [questionResult, testsResult] = await Promise.all([
        admin.from('coding_questions').select('id, default_marks, is_published').eq('id', payload.questionId).maybeSingle(),
        admin.from('coding_question_test_cases').select('id,input_data,expected_output,is_hidden,weight').eq('question_id', payload.questionId).order('order_index'),
      ]);
      assertDatabaseSuccess(questionResult, 'load practice question');
      assertDatabaseSuccess(testsResult, 'load practice tests');
      const question = questionResult.data;
      const tests = testsResult.data;
      if (!question?.is_published) return json({ error: 'Question is unavailable' }, 404, responseOrigin);

      const codeHash = await sha256(code);
      const { data: run, error: runError } = await admin.from('secure_grading_runs').insert({
        source_kind: 'practice', student_id: user.id, coding_question_id: question.id,
        language: language.name, code_hash: codeHash, status: 'running', max_score: question.default_marks,
      }).select('id').single();
      if (runError) {
        console.error('secure-grade could not create practice audit row', runError);
        throw new Error('GRADING_STORAGE_ERROR');
      }

      try {
        const previousAttemptResult = await admin.from('coding_question_attempts')
          .select('attempts_count,first_solved_at')
          .eq('question_id', question.id).eq('student_id', user.id).maybeSingle();
        assertDatabaseSuccess(previousAttemptResult, 'load previous practice attempt');
        const previousAttempt = previousAttemptResult.data;
        const outcome = await runTests(code, (tests ?? []) as TestCase[], language);
        const solvedBefore = Boolean(previousAttempt?.first_solved_at);
        const score = outcome.allPassed ? Number(question.default_marks ?? 0) : 0;
        const [runUpdateResult, attemptResult] = await Promise.all([
          admin.from('secure_grading_runs').update({
            status: outcome.allPassed ? 'passed' : 'failed', passed_test_cases: outcome.passed,
            total_test_cases: outcome.total, score, public_result: outcome, completed_at: new Date().toISOString(),
          }).eq('id', run.id),
          admin.from('coding_question_attempts').upsert({
            question_id: question.id, student_id: user.id, submitted_code: code,
            language_id: language.id, language_name: language.name,
            status: (solvedBefore || outcome.allPassed) ? 'solved' : 'attempted',
            attempts_count: Number(previousAttempt?.attempts_count ?? 0) + 1,
            passed_test_cases: outcome.passed, total_test_cases: outcome.total,
            first_solved_at: previousAttempt?.first_solved_at ?? (outcome.allPassed ? new Date().toISOString() : null),
            last_attempted_at: new Date().toISOString(),
            last_execution_output: JSON.stringify({ verified: true, ...outcome }),
          }, { onConflict: 'question_id,student_id' }),
        ]);
        assertDatabaseSuccess(runUpdateResult, 'save practice grading run');
        assertDatabaseSuccess(attemptResult, 'save verified practice attempt');
        return json({ verified: true, runId: run.id, ...outcome, score }, 200, responseOrigin);
      } catch (error) {
        const failure = publicFailure(error);
        const failedRunResult = await admin.from('secure_grading_runs').update({
          status: 'error', error_code: failure.code,
          completed_at: new Date().toISOString(),
        }).eq('id', run.id);
        if (failedRunResult.error) console.error('secure-grade could not mark practice run as failed', failedRunResult.error);
        throw error;
      }
    }

    if (payload.kind === 'assignment') {
      if (!payload.submissionId) return json({ error: 'Submission is required' }, 400, responseOrigin);
      await enforceFinalRateLimit();
      const language = await defaultPythonLanguage();
      const submissionResult = await admin.from('assignment_submissions')
        .select('id,assignment_id,student_id,status').eq('id', payload.submissionId).maybeSingle();
      assertDatabaseSuccess(submissionResult, 'load assignment submission');
      const submission = submissionResult.data;
      if (!submission || submission.student_id !== user.id) return json({ error: 'Submission not found' }, 404, responseOrigin);
      if (!['draft', 'submitted'].includes(submission.status)) return json({ error: 'Submission cannot be graded' }, 409, responseOrigin);

      const assignmentResult = await admin.from('assignments')
        .select('id,course_id,is_published,status,start_date,due_date,allow_late_submission')
        .eq('id', submission.assignment_id)
        .maybeSingle();
      assertDatabaseSuccess(assignmentResult, 'load assignment');
      const assignment = assignmentResult.data;
      if (!assignment?.is_published || assignment.status !== 'published') {
        return json({ error: 'Assignment is unavailable' }, 404, responseOrigin);
      }

      const enrollmentResult = await admin.from('course_enrollments')
        .select('id')
        .eq('student_id', user.id)
        .eq('course_id', assignment.course_id)
        .eq('access_status', 'active')
        .maybeSingle();
      assertDatabaseSuccess(enrollmentResult, 'load enrollment');
      if (!enrollmentResult.data) return json({ error: 'Assignment is unavailable' }, 404, responseOrigin);
      if (assignment.start_date && new Date(assignment.start_date).getTime() > Date.now()) {
        return json({ error: 'Assignment is not open yet' }, 409, responseOrigin);
      }
      if (assignment.due_date && !assignment.allow_late_submission && new Date(assignment.due_date).getTime() < Date.now()) {
        return json({ error: 'The assignment deadline has passed' }, 409, responseOrigin);
      }

      const [questionsResult, answersResult] = await Promise.all([
        admin.from('assignment_questions').select('id,question_type,marks').eq('assignment_id', submission.assignment_id).order('order_index'),
        admin.from('assignment_question_submissions').select('id,question_id,submitted_code').eq('submission_id', submission.id),
      ]);
      assertDatabaseSuccess(questionsResult, 'load assignment questions');
      assertDatabaseSuccess(answersResult, 'load assignment answers');
      const questions = questionsResult.data;
      const answers = answersResult.data;
      if (!(questions ?? []).length || (questions ?? []).some(question => question.question_type !== 'coding')) {
        return json({ error: 'This assignment requires faculty review' }, 409, responseOrigin);
      }

      const answerMap = new Map((answers ?? []).map(answer => [answer.question_id, answer]));
      let totalScore = 0;
      let totalPassed = 0;
      let totalTests = 0;
      const questionResults: Array<{ questionId: string; passed: number; total: number; score: number; maxScore: number }> = [];

      for (const question of questions ?? []) {
        const answer = answerMap.get(question.id);
        const code = String(answer?.submitted_code ?? '');
        if (!answer || !code.trim()) return json({ error: 'Every coding question needs an answer' }, 400, responseOrigin);
        if (new TextEncoder().encode(code).byteLength > MAX_CODE_BYTES) return json({ error: 'Code is too large' }, 413, responseOrigin);

        const { data: tests, error: testsError } = await admin.from('assignment_test_cases')
          .select('id,input_data,expected_output,is_hidden,weight')
          .eq('assignment_id', submission.assignment_id).eq('question_id', question.id).order('order_index');
        assertDatabaseSuccess({ error: testsError }, 'load assignment tests');

        const codeHash = await sha256(code);
        const { data: run, error: runError } = await admin.from('secure_grading_runs').insert({
          source_kind: 'assignment', student_id: user.id, assignment_submission_id: submission.id,
          assignment_question_submission_id: answer.id, language: language.name, code_hash: codeHash,
          status: 'running', max_score: question.marks,
        }).select('id').single();
        if (runError) {
          console.error('secure-grade could not create assignment audit row', runError);
          throw new Error('GRADING_STORAGE_ERROR');
        }

        try {
          const typedTests = (tests ?? []) as TestCase[];
          const outcome = await runTests(code, typedTests, language);
          const score = outcome.allPassed ? Number(question.marks ?? 0) : Math.round(Number(question.marks ?? 0) * outcome.passed / outcome.total);
          totalScore += score;
          totalPassed += outcome.passed;
          totalTests += outcome.total;
          questionResults.push({ questionId: question.id, passed: outcome.passed, total: outcome.total, score, maxScore: Number(question.marks ?? 0) });

          const [runUpdateResult, answerUpdateResult] = await Promise.all([
            admin.from('secure_grading_runs').update({
              status: outcome.allPassed ? 'passed' : 'failed', passed_test_cases: outcome.passed,
              total_test_cases: outcome.total, score, public_result: outcome, completed_at: new Date().toISOString(),
            }).eq('id', run.id),
            admin.from('assignment_question_submissions').update({
              passed_test_cases: outcome.passed, total_test_cases: outcome.total,
              language_id: language.id, language_name: language.name,
              marks_awarded: score, execution_output: JSON.stringify({ verified: true, ...outcome }),
            }).eq('id', answer.id),
          ]);
          assertDatabaseSuccess(runUpdateResult, 'save assignment grading run');
          assertDatabaseSuccess(answerUpdateResult, 'save verified assignment answer');
        } catch (error) {
          const failure = publicFailure(error);
          const failedRunResult = await admin.from('secure_grading_runs').update({
            status: 'error', error_code: failure.code,
            completed_at: new Date().toISOString(),
          }).eq('id', run.id);
          if (failedRunResult.error) console.error('secure-grade could not mark assignment run as failed', failedRunResult.error);
          throw error;
        }
      }

      const submissionUpdateResult = await admin.from('assignment_submissions').update({
        status: 'graded', score: totalScore,
        feedback: 'Automatically graded by the isolated Kaveri coding runner. Faculty may review and override this result.',
        graded_by: null, graded_at: new Date().toISOString(), submitted_at: new Date().toISOString(),
      }).eq('id', submission.id);
      assertDatabaseSuccess(submissionUpdateResult, 'save final assignment grade');

      return json({ verified: true, submissionId: submission.id, passed: totalPassed, total: totalTests, score: totalScore, questions: questionResults }, 200, responseOrigin);
    }

    if (payload.kind === 'vscode') {
      if (!payload.submissionId) return json({ error: 'Submission is required' }, 400, responseOrigin);
      const language = await defaultPythonLanguage();

      const submissionResult = await admin.from('coding_vscode_submissions')
        .select('id,student_id,assignment_key,language,file_name,code,status,max_marks,verification_status,verified_passed,verified_total,verified_score,verified_summary')
        .eq('id', payload.submissionId)
        .maybeSingle();
      assertDatabaseSuccess(submissionResult, 'load vscode submission');
      const submission = submissionResult.data;
      if (!submission || submission.student_id !== user.id) {
        return json({ error: 'Submission not found' }, 404, responseOrigin);
      }
      if (submission.verification_status === 'verified') {
        // Idempotent replay first (never rate-limited): the stored server
        // outcome is authoritative even after a teacher has reviewed the row.
        return json({
          verified: true,
          submissionId: submission.id,
          duplicate: true,
          hiddenPassed: submission.verified_passed,
          hiddenTotal: submission.verified_total,
          allPassed: submission.verified_passed === submission.verified_total,
          verifiedScore: submission.verified_score,
          verifiedSummary: submission.verified_summary,
        }, 200, responseOrigin);
      }
      if (submission.status !== 'submitted') {
        return json({ error: 'Submission cannot be graded' }, 409, responseOrigin);
      }
      if (submission.language !== 'python') {
        return json({ error: 'This assignment is not available in a supported runner language' }, 422, responseOrigin);
      }

      const code = String(submission.code ?? '');
      if (!code.trim()) return json({ error: 'Code is required' }, 400, responseOrigin);
      if (new TextEncoder().encode(code).byteLength > MAX_CODE_BYTES) {
        return json({ error: 'Code is too large' }, 413, responseOrigin);
      }

      const assignmentResult = await admin.from('coding_vscode_assignments')
        .select('id,assignment_key,title,file_name,is_published,language,marks')
        .eq('assignment_key', submission.assignment_key)
        .maybeSingle();
      assertDatabaseSuccess(assignmentResult, 'load vscode assignment');
      const assignment = assignmentResult.data;
      if (!assignment?.is_published || assignment.language !== 'python') {
        return json({ error: 'Assignment is unavailable' }, 404, responseOrigin);
      }

      // Mirror the REST access contract server-side (admin client bypasses RLS):
      // student must be an active member of an active batch linked to the
      // assignment, with either a permanent release or a per-student release.
      const [linksResult, memberBatchesResult, activeBatchesResult] = await Promise.all([
        admin.from('coding_vscode_assignment_batches')
          .select('batch_id,is_permanently_released')
          .eq('assignment_id', assignment.id),
        admin.from('batch_students')
          .select('batch_id')
          .eq('student_id', user.id)
          .eq('status', 'active'),
        admin.from('batches')
          .select('id')
          .eq('status', 'active'),
      ]);
      assertDatabaseSuccess(linksResult, 'load vscode batch links');
      assertDatabaseSuccess(memberBatchesResult, 'load student batch membership');
      assertDatabaseSuccess(activeBatchesResult, 'load active batches');
      const activeBatchIds = new Set((activeBatchesResult.data ?? []).map((row: { id: string }) => row.id));
      const memberActiveBatchIds = new Set(
        (memberBatchesResult.data ?? [])
          .map((row: { batch_id: string }) => row.batch_id)
          .filter((batchId: string) => activeBatchIds.has(batchId)),
      );
      const links = (linksResult.data ?? []) as Array<{ batch_id: string; is_permanently_released: boolean }>;
      const releasableBatchIds = links
        .filter(link => memberActiveBatchIds.has(link.batch_id))
        .map(link => link.batch_id);
      const permanentlyReleased = links.some(link =>
        link.is_permanently_released && memberActiveBatchIds.has(link.batch_id),
      );
      let hasPerStudentRelease = false;
      if (!permanentlyReleased && releasableBatchIds.length) {
        const releasedResult = await admin.from('coding_vscode_student_assignment_access')
          .select('id', { count: 'exact', head: true })
          .eq('assignment_id', assignment.id)
          .eq('student_id', user.id)
          .in('batch_id', releasableBatchIds);
        assertDatabaseSuccess(releasedResult, 'load vscode per-student release');
        hasPerStudentRelease = (releasedResult.count ?? 0) > 0;
      }
      if (!permanentlyReleased && !hasPerStudentRelease) {
        return json({ error: 'This assignment is not unlocked for you yet' }, 403, responseOrigin);
      }

      const hiddenTestsResult = await admin.from('coding_vscode_test_cases')
        .select('id,input_text,expected_output')
        .eq('assignment_id', assignment.id)
        .eq('is_hidden', true)
        .order('position');
      assertDatabaseSuccess(hiddenTestsResult, 'load vscode hidden tests');
      const hiddenTests: TestCase[] = (hiddenTestsResult.data ?? []).map((test: { id: string; input_text: string; expected_output: string }) => ({
        id: test.id,
        input_data: test.input_text,
        expected_output: test.expected_output,
        is_hidden: true,
        weight: 1,
      }));
      if (!hiddenTests.length) throw new Error('VSCODE_NO_HIDDEN_TESTS');

      // New runner work is rate limited; an already-verified replay above never
      // reaches this point, so a student at the limit can still fetch an
      // existing verified result.
      await enforceFinalRateLimit();

      // Atomic claim: exactly one invocation may grade this submission. The
      // loser of a concurrent pair gets a safe in-progress response and never
      // starts a second runner job.
      const claimResult = await admin.rpc('claim_vscode_submission_verification', {
        p_submission_id: submission.id,
        p_student_id: user.id,
      });
      assertDatabaseSuccess(claimResult, 'claim vscode submission verification');
      const claim = (claimResult.data ?? {}) as Record<string, unknown>;
      if (claim.result === 'verified') {
        // Another invocation finished between our read and the claim.
        return json({
          verified: true,
          submissionId: submission.id,
          duplicate: true,
          hiddenPassed: claim.verified_passed ?? 0,
          hiddenTotal: claim.verified_total ?? 0,
          allPassed: claim.verified_passed === claim.verified_total,
          verifiedScore: claim.verified_score,
          verifiedSummary: claim.verified_summary ?? '',
        }, 200, responseOrigin);
      }
      if (claim.result === 'in_progress') {
        return json({
          verification_in_progress: true,
          submissionId: submission.id,
        }, 200, responseOrigin);
      }
      if (claim.result !== 'claimed') {
        if (claim.result === 'forbidden' || claim.result === 'not_found') {
          return json({ error: 'Submission not found' }, 404, responseOrigin);
        }
        return json({ error: 'Submission cannot be graded' }, 409, responseOrigin);
      }

      const codeHash = await sha256(code);
      const { data: run, error: runError } = await admin.from('secure_grading_runs').insert({
        source_kind: 'vscode',
        student_id: user.id,
        coding_vscode_submission_id: submission.id,
        language: language.name,
        code_hash: codeHash,
        status: 'running',
        max_score: Math.round(Number(assignment.marks ?? 0)),
      }).select('id').single();
      if (runError) {
        console.error('secure-grade could not create vscode audit row', runError);
        throw new Error('GRADING_STORAGE_ERROR');
      }

      try {
        const outcome = await runTests(code, hiddenTests, language);
        // The authoritative score always uses the SERVER assignment marks;
        // client-supplied max_marks can never inflate a verified score.
        const marks = Number(assignment.marks ?? 0);
        const verifiedScore = Math.round(marks * outcome.passed / outcome.total * 100) / 100;
        const verifiedSummary = outcome.allPassed
          ? `All ${outcome.total} hidden server test${outcome.total === 1 ? '' : 's'} passed`
          : `${outcome.passed} of ${outcome.total} hidden server test${outcome.total === 1 ? '' : 's'} passed`;

        const [runUpdateResult, submissionUpdateResult] = await Promise.all([
          admin.from('secure_grading_runs').update({
            status: outcome.allPassed ? 'passed' : 'failed',
            passed_test_cases: outcome.passed,
            total_test_cases: outcome.total,
            score: Math.round(verifiedScore),
            public_result: outcome,
            completed_at: new Date().toISOString(),
          }).eq('id', run.id),
          admin.from('coding_vscode_submissions').update({
            verification_status: 'verified',
            verified_passed: outcome.passed,
            verified_total: outcome.total,
            verified_score: verifiedScore,
            verified_at: new Date().toISOString(),
            verified_summary: verifiedSummary,
            verified_result: outcome,
            verification_error: null,
            verification_started_at: null,
            // Canonicalize the student-facing snapshot from the real assignment.
            assignment_title: assignment.title,
            language: assignment.language,
            file_name: assignment.file_name ?? submission.file_name,
            max_marks: assignment.marks,
          }).eq('id', submission.id),
        ]);
        assertDatabaseSuccess(runUpdateResult, 'save vscode grading run');
        assertDatabaseSuccess(submissionUpdateResult, 'save verified vscode result');

        return json({
          verified: true,
          submissionId: submission.id,
          hiddenPassed: outcome.passed,
          hiddenTotal: outcome.total,
          allPassed: outcome.allPassed,
          verifiedScore,
          verifiedSummary,
        }, 200, responseOrigin);
      } catch (error) {
        const failure = publicFailure(error);
        const [failedRunResult, failedSubmissionResult] = await Promise.all([
          admin.from('secure_grading_runs').update({
            status: 'error',
            error_code: failure.code,
            completed_at: new Date().toISOString(),
          }).eq('id', run.id),
          admin.from('coding_vscode_submissions').update({
            verification_status: 'error',
            verification_error: failure.code,
            verified_at: new Date().toISOString(),
            verification_started_at: null,
          }).eq('id', submission.id),
        ]);
        if (failedRunResult.error) console.error('secure-grade could not mark vscode run as failed', failedRunResult.error);
        if (failedSubmissionResult.error) console.error('secure-grade could not mark vscode submission as failed', failedSubmissionResult.error);
        throw error;
      }
    }

    return json({ error: 'Unknown grading request' }, 400, responseOrigin);
  } catch (error) {
    const failure = publicFailure(error);
    if (failure.code === 'GRADING_ERROR') console.error('secure-grade failed unexpectedly', error);
    return json({ error: failure.message, code: failure.code }, failure.status, responseOrigin);
  }
});
