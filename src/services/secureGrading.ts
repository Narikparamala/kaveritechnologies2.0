import { supabase } from '../lib/supabase';

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

async function invokeSecureGrader<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('secure-grade', { body });
  if (error) {
    const context = error.context as Response | undefined;
    if (context) {
      let publicMessage: string | null = null;
      try {
        const payload = await context.clone().json();
        if (payload?.error) publicMessage = String(payload.error);
      } catch {
        // Preserve the original Functions error when the response has no JSON body.
      }
      if (publicMessage) throw new Error(publicMessage);
    }
    throw error;
  }
  return data as T;
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
