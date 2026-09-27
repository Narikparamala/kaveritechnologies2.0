import { supabase } from '../lib/supabase';
import { withRetry } from '../lib/withRetry';

export type SecurePracticeResult = {
  verified: true;
  runId: string;
  passed: number;
  total: number;
  allPassed: boolean;
  score: number;
  visiblePassed: number;
  visibleTotal: number;
  hiddenPassed: number;
  hiddenTotal: number;
  maxTimeMs: number;
  maxMemoryKb: number;
  tests: SecureTestResult[];
  language: JudgeLanguage;
};

export type JudgeLanguage = {
  id: number;
  name: string;
};

export type SecureTestStatus =
  | 'accepted'
  | 'wrong_answer'
  | 'time_limit'
  | 'memory_limit'
  | 'output_limit'
  | 'compile_error'
  | 'runtime_error'
  | 'internal_error'
  | 'execution_error';

export type SecureTestResult = {
  id: string;
  index: number;
  hidden: boolean;
  passed: boolean;
  status: SecureTestStatus;
  timeMs: number | null;
  memoryKb: number | null;
  input?: string;
  expected?: string;
  actual?: string;
  stderr?: string;
};

export type SecureSampleResult = Omit<SecurePracticeResult, 'verified' | 'runId' | 'score'> & {
  executed: true;
};

export type SecureCustomResult = {
  executed: true;
  language: JudgeLanguage;
  result: SecureTestResult;
};

export type SecureAssignmentResult = {
  verified: true;
  submissionId: string;
  passed: number;
  total: number;
  score: number;
  questions: Array<{
    questionId: string;
    passed: number;
    total: number;
    score: number;
    maxScore: number;
  }>;
};

/**
 * UI events emitted while a grading request is being retried automatically
 * (cold runner, transient 5xx, network blip). The toast listener turns these
 * into friendly "retrying, your work is safe" messages — students never see
 * a raw failure for a transient hiccup.
 */
export type SecureGradeEvent =
  | { type: 'retrying'; kind: string; attempt: number };

type SecureGradeListener = (event: SecureGradeEvent) => void;

const secureGradeListeners = new Set<SecureGradeListener>();

export const secureGradeEvents = {
  subscribe(listener: SecureGradeListener) {
    secureGradeListeners.add(listener);
    return () => {
      secureGradeListeners.delete(listener);
    };
  },
};

function emitRetrying(kind: string, attempt: number) {
  for (const listener of secureGradeListeners) listener({ type: 'retrying', kind, attempt });
}

const RETRYABLE_HTTP_STATUS = new Set([500, 502, 503, 504]);

/** Status carried on our own errors (0 = network-level, no HTTP response). */
function statusOf(error: unknown): number | null {
  if (error && typeof error === 'object' && 'status' in error) {
    const status = (error as { status?: unknown }).status;
    if (typeof status === 'number') return status;
  }
  const context = (error as { context?: Response } | null)?.context;
  if (context && typeof context.status === 'number') return context.status;
  return null;
}

async function extractServerMessage(error: unknown): Promise<string | null> {
  const context = (error as { context?: Response } | null)?.context;
  if (!context) return null;
  try {
    const payload = await context.clone().json();
    if (payload?.error) return String(payload.error);
  } catch {
    // Response had no JSON body — fall through.
  }
  return null;
}

const STATUS_FALLBACK_MESSAGE: Record<number, string> = {
  500: 'The grading service hit a temporary problem. Your work is safe — please try again in a moment.',
  502: 'The grading runner is waking up. Please try again in a few seconds.',
  503: 'The grading runner is waking up or busy. Please try again in a few seconds — nothing is lost.',
  504: 'Grading took too long this time. Please try again.',
};

async function invokeSecureGrader<T>(body: Record<string, unknown>): Promise<T> {
  const kind = String(body.kind ?? 'request');
  try {
    return await withRetry(async () => {
      const { data, error } = await supabase.functions.invoke('secure-grade', { body });
      if (error) {
        const serverMessage = await extractServerMessage(error);
        const status = statusOf(error);
        if (serverMessage) {
          const wrapped = new Error(serverMessage) as Error & { status?: number };
          wrapped.status = status ?? 0;
          throw wrapped;
        }
        if (status === null) {
          const wrapped = new Error('NETWORK_ERROR') as Error & { status?: number };
          wrapped.status = 0;
          throw wrapped;
        }
        const wrapped = new Error(STATUS_FALLBACK_MESSAGE[status] ?? 'The grading request failed.') as Error & { status?: number };
        wrapped.status = status;
        throw wrapped;
      }
      return data as T;
    }, {
      attempts: 3,
      baseDelayMs: 600,
      maxDelayMs: 4_000,
      // 429 rate limits are enforced server-side with honest messages —
      // retrying immediately would only burn more quota.
      shouldRetry: error => {
        const status = statusOf(error);
        return status === 0 || RETRYABLE_HTTP_STATUS.has(status ?? 0);
      },
      onRetry: attempt => emitRetrying(kind, attempt),
    });
  } catch (error) {
    const status = statusOf(error);
    const message = error instanceof Error ? error.message : '';
    if (status === 0 || message === 'NETWORK_ERROR' || /failed to send|network|fetch/i.test(message)) {
      throw new Error('Could not reach the grading service. Check your connection and try again — your work is saved.');
    }
    throw error instanceof Error ? error : new Error('The grading request failed.');
  }
}

export async function getSecureJudgeLanguages() {
  const result = await invokeSecureGrader<{ languages: JudgeLanguage[] }>({ kind: 'languages' });
  return result.languages;
}

export function securelyRunSamples(questionId: string, code: string, languageId: number) {
  return invokeSecureGrader<SecureSampleResult>({ kind: 'sample', questionId, code, languageId });
}

export function securelyRunCustom(code: string, input: string, languageId: number) {
  return invokeSecureGrader<SecureCustomResult>({ kind: 'custom', code, input, languageId });
}

export function securelyGradePractice(questionId: string, code: string, languageId: number) {
  return invokeSecureGrader<SecurePracticeResult>({ kind: 'practice', questionId, code, languageId });
}

export function securelyGradeAssignment(submissionId: string) {
  return invokeSecureGrader<SecureAssignmentResult>({ kind: 'assignment', submissionId });
}

export { invokeSecureGrader };
