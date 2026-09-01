import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

type TestCase = {
  id: string;
  input_data: string | null;
  expected_output: string;
  is_hidden: boolean;
  weight: number;
};

type JudgeResult = {
  passed: boolean;
  status: string;
  timeMs: number | null;
  memoryKb: number | null;
};

const MAX_CODE_BYTES = 20_000;
const MAX_TESTS = 30;
const MAX_REQUESTS_PER_FIVE_MINUTES = 10;

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

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

async function judgePython(code: string, test: TestCase): Promise<JudgeResult> {
  const endpoint = Deno.env.get('GO_JUDGE_URL');
  const token = Deno.env.get('GO_JUDGE_TOKEN');

  if (!endpoint || !token) throw new Error('RUNNER_NOT_CONFIGURED');

  const baseUrl = endpoint.endsWith('/') ? endpoint : `${endpoint}/`;
  const url = new URL('run', baseUrl);

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    signal: AbortSignal.timeout(8_000),
    body: JSON.stringify({
      cmd: [{
        args: ['/usr/bin/python3', '-I', 'solution.py'],
        env: [
          'PATH=/usr/bin:/bin',
          'PYTHONIOENCODING=utf-8',
        ],
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

  if (!response.ok) throw new Error(`RUNNER_HTTP_${response.status}`);

  const payload = await response.json();
  const result = Array.isArray(payload) ? payload[0] : null;

  if (!result || typeof result.status !== 'string') {
    throw new Error('RUNNER_INVALID_RESPONSE');
  }

  const runnerStatus = String(result.status);
  const stdout = normalizeOutput(result.files?.stdout);
  const expected = normalizeOutput(test.expected_output);
  const passed = runnerStatus === 'Accepted' && stdout === expected;

  let status = 'execution_error';

  if (passed) {
    status = 'accepted';
  } else if (runnerStatus === 'Accepted') {
    status = 'wrong_answer';
  } else if (runnerStatus === 'Time Limit Exceeded') {
    status = 'time_limit';
  } else if (runnerStatus === 'Memory Limit Exceeded') {
    status = 'memory_limit';
  } else if (runnerStatus === 'Output Limit Exceeded') {
    status = 'output_limit';
  }

  return {
    passed,
    status,
    timeMs: result.time == null
      ? null
      : Math.round(Number(result.time) / 1_000_000),
    memoryKb: result.memory == null
      ? null
      : Math.round(Number(result.memory) / 1_024),
  };
}
async function runTests(code: string, tests: TestCase[]) {
  if (tests.length === 0) throw new Error('NO_TESTS');
  if (tests.length > MAX_TESTS) throw new Error('TOO_MANY_TESTS');

  const results: JudgeResult[] = [];
  for (let index = 0; index < tests.length; index += 2) {
    results.push(...await Promise.all(tests.slice(index, index + 2).map(test => judgePython(code, test))));
  }

  const passed = results.filter(result => result.passed).length;
  return {
    passed,
    total: results.length,
    allPassed: passed === results.length,
    maxTimeMs: Math.max(0, ...results.map(result => result.timeMs ?? 0)),
    maxMemoryKb: Math.max(0, ...results.map(result => result.memoryKb ?? 0)),
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

  const since = new Date(Date.now() - 5 * 60_000).toISOString();
  const { count: recentRuns } = await admin.from('secure_grading_runs')
    .select('id', { count: 'exact', head: true })
    .eq('student_id', user.id)
    .gte('created_at', since);
  if ((recentRuns ?? 0) >= MAX_REQUESTS_PER_FIVE_MINUTES) {
    return json({ error: 'Too many grading requests. Please wait a few minutes.' }, 429, responseOrigin);
  }

  let payload: { kind?: string; questionId?: string; submissionId?: string; code?: string };
  try {
    payload = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400, responseOrigin);
  }

  try {
    if (payload.kind === 'practice') {
      const code = String(payload.code ?? '');
      if (!payload.questionId || !code.trim()) return json({ error: 'Question and code are required' }, 400, responseOrigin);
      if (new TextEncoder().encode(code).byteLength > MAX_CODE_BYTES) return json({ error: 'Code is too large' }, 413, responseOrigin);

      const [{ data: question }, { data: tests, error: testsError }] = await Promise.all([
        admin.from('coding_questions').select('id, default_marks, is_published').eq('id', payload.questionId).maybeSingle(),
        admin.from('coding_question_test_cases').select('id,input_data,expected_output,is_hidden,weight').eq('question_id', payload.questionId).order('order_index'),
      ]);
      if (!question?.is_published) return json({ error: 'Question is unavailable' }, 404, responseOrigin);
      if (testsError) throw testsError;

      const codeHash = await sha256(code);
      const { data: run, error: runError } = await admin.from('secure_grading_runs').insert({
        source_kind: 'practice', student_id: user.id, coding_question_id: question.id,
        language: 'python', code_hash: codeHash, status: 'running', max_score: question.default_marks,
      }).select('id').single();
      if (runError) throw runError;

      try {
        const { data: previousAttempt } = await admin.from('coding_question_attempts')
          .select('attempts_count,first_solved_at')
          .eq('question_id', question.id).eq('student_id', user.id).maybeSingle();
        const outcome = await runTests(code, (tests ?? []) as TestCase[]);
        const solvedBefore = Boolean(previousAttempt?.first_solved_at);
        const score = outcome.allPassed ? Number(question.default_marks ?? 0) : 0;
        await Promise.all([
          admin.from('secure_grading_runs').update({
            status: outcome.allPassed ? 'passed' : 'failed', passed_test_cases: outcome.passed,
            total_test_cases: outcome.total, score, public_result: outcome, completed_at: new Date().toISOString(),
          }).eq('id', run.id),
          admin.from('coding_question_attempts').upsert({
            question_id: question.id, student_id: user.id, submitted_code: code,
            status: (solvedBefore || outcome.allPassed) ? 'solved' : 'attempted',
            attempts_count: Number(previousAttempt?.attempts_count ?? 0) + 1,
            passed_test_cases: outcome.passed, total_test_cases: outcome.total,
            first_solved_at: previousAttempt?.first_solved_at ?? (outcome.allPassed ? new Date().toISOString() : null),
            last_attempted_at: new Date().toISOString(),
            last_execution_output: JSON.stringify({ verified: true, ...outcome }),
          }, { onConflict: 'question_id,student_id' }),
        ]);
        return json({ verified: true, runId: run.id, ...outcome, score }, 200, responseOrigin);
      } catch (error) {
        await admin.from('secure_grading_runs').update({
          status: 'error', error_code: error instanceof Error ? error.message : 'RUNNER_ERROR',
          completed_at: new Date().toISOString(),
        }).eq('id', run.id);
        throw error;
      }
    }

    if (payload.kind === 'assignment') {
      if (!payload.submissionId) return json({ error: 'Submission is required' }, 400, responseOrigin);
      const { data: submission } = await admin.from('assignment_submissions')
        .select('id,assignment_id,student_id,status').eq('id', payload.submissionId).maybeSingle();
      if (!submission || submission.student_id !== user.id) return json({ error: 'Submission not found' }, 404, responseOrigin);
      if (!['draft', 'submitted'].includes(submission.status)) return json({ error: 'Submission cannot be graded' }, 409, responseOrigin);

      const [{ data: questions, error: questionsError }, { data: answers, error: answersError }] = await Promise.all([
        admin.from('assignment_questions').select('id,question_type,marks').eq('assignment_id', submission.assignment_id).order('order_index'),
        admin.from('assignment_question_submissions').select('id,question_id,submitted_code').eq('submission_id', submission.id),
      ]);
      if (questionsError) throw questionsError;
      if (answersError) throw answersError;
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
        if (testsError) throw testsError;

        const codeHash = await sha256(code);
        const { data: run, error: runError } = await admin.from('secure_grading_runs').insert({
          source_kind: 'assignment', student_id: user.id, assignment_submission_id: submission.id,
          assignment_question_submission_id: answer.id, language: 'python', code_hash: codeHash,
          status: 'running', max_score: question.marks,
        }).select('id').single();
        if (runError) throw runError;

        try {
          const typedTests = (tests ?? []) as TestCase[];
          const outcome = await runTests(code, typedTests);
          const score = outcome.allPassed ? Number(question.marks ?? 0) : Math.round(Number(question.marks ?? 0) * outcome.passed / outcome.total);
          totalScore += score;
          totalPassed += outcome.passed;
          totalTests += outcome.total;
          questionResults.push({ questionId: question.id, passed: outcome.passed, total: outcome.total, score, maxScore: Number(question.marks ?? 0) });

          await Promise.all([
            admin.from('secure_grading_runs').update({
              status: outcome.allPassed ? 'passed' : 'failed', passed_test_cases: outcome.passed,
              total_test_cases: outcome.total, score, public_result: outcome, completed_at: new Date().toISOString(),
            }).eq('id', run.id),
            admin.from('assignment_question_submissions').update({
              passed_test_cases: outcome.passed, total_test_cases: outcome.total,
              marks_awarded: score, execution_output: JSON.stringify({ verified: true, ...outcome }),
            }).eq('id', answer.id),
          ]);
        } catch (error) {
          await admin.from('secure_grading_runs').update({
            status: 'error', error_code: error instanceof Error ? error.message : 'RUNNER_ERROR',
            completed_at: new Date().toISOString(),
          }).eq('id', run.id);
          throw error;
        }
      }

      await admin.from('assignment_submissions').update({
        status: 'graded', score: totalScore,
        feedback: 'Automatically graded by the isolated Kaveri coding runner. Faculty may review and override this result.',
        graded_by: null, graded_at: new Date().toISOString(), submitted_at: new Date().toISOString(),
      }).eq('id', submission.id);

      return json({ verified: true, submissionId: submission.id, passed: totalPassed, total: totalTests, score: totalScore, questions: questionResults }, 200, responseOrigin);
    }

    return json({ error: 'Unknown grading request' }, 400, responseOrigin);
  } catch (error) {
    const code = error instanceof Error ? error.message : 'GRADING_ERROR';
    const publicMessage = code === 'RUNNER_NOT_CONFIGURED'
      ? 'Secure grading is not configured yet. Your work remains available for faculty review.'
      : 'Secure grading could not finish. Please try again or ask faculty to review your submission.';
    return json({ error: publicMessage, code }, code === 'RUNNER_NOT_CONFIGURED' ? 503 : 502, responseOrigin);
  }
});
