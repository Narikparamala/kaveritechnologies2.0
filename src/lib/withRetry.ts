/**
 * Small shared retry helper for transient failures (cold starts, blips).
 *
 * Pure and dependency-free so it can be unit-tested standalone. The caller
 * decides WHICH errors are retryable via `shouldRetry` — this helper never
 * swallows non-retryable errors (they rethrow immediately).
 */
export type RetryOptions = {
  /** Total attempts including the first (default 3). */
  attempts?: number;
  /** Delay before retry n (1-based), ms: baseDelayMs * 2^(n-1), capped. */
  baseDelayMs?: number;
  maxDelayMs?: number;
  shouldRetry?: (error: unknown) => boolean;
  /** Called before each retry with (attemptBeingStarted, delayMs). */
  onRetry?: (attempt: number, delayMs: number) => void;
  /** Injectable sleeper for tests. */
  delay?: (ms: number) => Promise<void>;
};

const defaultDelay = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const attempts = Math.max(1, options.attempts ?? 3);
  const baseDelayMs = options.baseDelayMs ?? 500;
  const maxDelayMs = options.maxDelayMs ?? 4_000;
  const shouldRetry = options.shouldRetry ?? (() => true);
  const delay = options.delay ?? defaultDelay;

  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    if (attempt > 1) {
      const delayMs = Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 2));
      options.onRetry?.(attempt, delayMs);
      await delay(delayMs);
    }
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (!shouldRetry(error) || attempt === attempts) throw error;
    }
  }
  throw lastError;
}
