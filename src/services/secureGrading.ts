import { supabase } from '../lib/supabase';

export type SecurePracticeResult = {
  verified: true;
  runId: string;
  passed: number;
  total: number;
  allPassed: boolean;
  score: number;
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
      try {
        const payload = await context.clone().json();
        if (payload?.error) throw new Error(String(payload.error));
      } catch (contextError) {
        if (contextError instanceof Error && contextError.message !== 'Unexpected end of JSON input') throw contextError;
      }
    }
    throw error;
  }
  return data as T;
}

export function securelyGradePractice(questionId: string, code: string) {
  return invokeSecureGrader<SecurePracticeResult>({ kind: 'practice', questionId, code });
}

export function securelyGradeAssignment(submissionId: string) {
  return invokeSecureGrader<SecureAssignmentResult>({ kind: 'assignment', submissionId });
}
