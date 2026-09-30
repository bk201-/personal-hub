import { logger } from '../logger.js';
import { isStorageCapacityError } from './storageErrors.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RetryPolicy {
  /** Total number of attempts (including the first). */
  maxAttempts: number;
  backoff: 'exponential' | 'linear' | 'fixed';
  baseDelayMs: number;
  maxDelayMs: number;
  /**
   * Full jitter: actual delay = random(0, computed).
   * Helps spread restarts when many callers hit the same transient failure.
   */
  jitter: boolean;
  /**
   * Returns true for errors that are worth retrying.
   * Permanent errors (wrong username, size limit, malformed HTML) must return false
   * so withRetry throws immediately without waiting for remaining attempts.
   */
  isTransient: (err: unknown) => boolean;
  /**
   * Optional hook that overrides the computed backoff delay for a specific error.
   * Used for FloodWaitError: Telegram mandates a specific wait time we must respect.
   */
  getOverrideDelayMs?: (err: unknown) => number | undefined;
  /**
   * Optional callback invoked before each retry sleep.
   * Use to log retry attempts with the caller's logger instance.
   */
  onRetry?: (attempt: number, maxAttempts: number, delayMs: number, err: unknown, context?: string) => void;
}

// ─── Core function ────────────────────────────────────────────────────────────

/**
 * Retry `fn` according to `policy`. Throws the last error when attempts are
 * exhausted or when `isTransient` returns false (permanent error).
 *
 * @param fn       Async function to call. May throw on failure.
 * @param policy   Retry policy (use a named constant or supply inline).
 * @param context  Optional label for log messages (e.g. 'fetchMessage').
 */
export async function withRetry<T>(fn: () => Promise<T>, policy: RetryPolicy, context?: string): Promise<T> {
  let lastErr: unknown;

  for (let attempt = 0; attempt < policy.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;

      const isLast = attempt === policy.maxAttempts - 1;
      if (isLast) break; // exhausted — throw below

      if (!policy.isTransient(err)) throw err; // permanent — fail fast

      // Compute base delay
      let delay: number;
      const override = policy.getOverrideDelayMs?.(err);

      if (override !== undefined) {
        delay = override;
      } else {
        switch (policy.backoff) {
          case 'exponential':
            delay = Math.min(policy.baseDelayMs * Math.pow(2, attempt), policy.maxDelayMs);
            break;
          case 'linear':
            delay = Math.min(policy.baseDelayMs * (attempt + 1), policy.maxDelayMs);
            break;
          case 'fixed':
            delay = policy.baseDelayMs;
            break;
        }

        if (policy.jitter) {
          delay = Math.random() * delay; // full jitter: random(0, computed)
        }
      }

      policy.onRetry?.(attempt + 1, policy.maxAttempts, delay, err, context);

      await new Promise((r) => setTimeout(r, delay));
    }
  }

  throw lastErr;
}

// ─── Transient error classifiers ──────────────────────────────────────────────

/** Transient errors from the Telegram MTProto layer / gramjs. */
export function isTransientTelegramError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  if (isStorageCapacityError(err)) return false;
  const msg = err.message.toLowerCase();
  return (
    err.constructor.name === 'FloodWaitError' ||
    msg.includes('timeout') ||
    msg.includes('flood') ||
    msg.includes('econnreset') ||
    msg.includes('etimedout') ||
    msg.includes('disconnected') ||
    msg.includes('connection') ||
    msg.includes('network error') ||
    msg.includes('socket')
  );
}

/** Extracts the mandatory wait duration from a gramjs FloodWaitError. */
export function getFloodWaitOverrideMs(err: unknown): number | undefined {
  if (!(err instanceof Error)) return undefined;
  if (err.constructor.name !== 'FloodWaitError') return undefined;
  const seconds = (err as unknown as { seconds?: number }).seconds ?? 30;
  return seconds * 1_000;
}

/** Transient errors from Turso / libsql HTTP transport. */
export function isTransientDbError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  return (
    msg.includes('server_error') ||
    msg.includes('server returned http status') ||
    msg.includes('econnreset') ||
    msg.includes('etimedout') ||
    msg.includes('socket') ||
    msg.includes('network') ||
    msg.includes('connection') ||
    msg.includes('sqlite_busy') ||
    msg.includes('database is locked') ||
    // @libsql/hrana-client bug in v0.17.x: tries to call resp.body.cancel()
    // when cleanup happens during a Turso HTTP error response
    msg.includes('resp.body') ||
    msg.includes('cancel is not a function')
  );
}

/** Transient errors during download task processing (Telegram + network + circuit breaker). */
export function isTransientDownloadError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  const code = (err as NodeJS.ErrnoException).code ?? '';
  if (isStorageCapacityError(err)) return false;
  return (
    err.constructor.name === 'FloodWaitError' ||
    err.constructor.name === 'FileReferenceExpiredError' ||
    msg.includes('timeout') ||
    msg.includes('flood') ||
    msg.includes('econnreset') ||
    msg.includes('etimedout') ||
    msg.includes('network') ||
    msg.includes('connection') ||
    msg.includes('socket') ||
    msg.includes('circuit breaker') ||
    msg.includes('file_reference') ||
    msg.includes('file reference') ||
    msg.includes('fileref') ||
    msg.includes('sqlite_busy') ||
    msg.includes('database is locked') ||
    msg.includes('resp.body') ||
    msg.includes('cancel is not a function') ||
    code === 'ECONNRESET' ||
    code === 'ETIMEDOUT' ||
    code === 'ENOTFOUND'
  );
}

/** Transient errors when fetching a URL for article extraction (HTTP 5xx, network). */
export function isTransientHttpFetchError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  // TypeError = "Failed to fetch" (network-level failure)
  if (err instanceof TypeError) return true;
  return (
    msg.includes('status 5') || // HTTP 5xx
    msg.includes('econnreset') ||
    msg.includes('etimedout') ||
    msg.includes('socket') ||
    msg.includes('network')
  );
}

// ─── Named default policies ───────────────────────────────────────────────────

function makeOnRetry(module: string) {
  return (attempt: number, maxAttempts: number, delayMs: number, err: unknown, context?: string) => {
    logger.warn(
      { module, context, attempt, maxAttempts, delayMs, err },
      `transient error — retrying in ${Math.round(delayMs)}ms`,
    );
  };
}

/**
 * For Telegram API calls via gramjs.
 * Respects FloodWaitError mandatory delay via getOverrideDelayMs.
 * Used in: telegramCircuitBreaker → withRetry, telegramBridge.
 */
export const TELEGRAM_POLICY: RetryPolicy = {
  maxAttempts: 3,
  backoff: 'exponential',
  baseDelayMs: 2_000,
  maxDelayMs: 16_000,
  jitter: true,
  isTransient: isTransientTelegramError,
  getOverrideDelayMs: getFloodWaitOverrideMs,
  onRetry: makeOnRetry('telegram'),
};

/**
 * For the coordinator DB poll loop.
 * More attempts and longer delays because Turso outages can last minutes.
 * Used in: downloadManager coordinator poll.
 */
export const DB_POLL_POLICY: RetryPolicy = {
  maxAttempts: 5,
  backoff: 'exponential',
  baseDelayMs: 5_000,
  maxDelayMs: 60_000,
  jitter: true,
  isTransient: isTransientDbError,
  onRetry: makeOnRetry('download'),
};

/**
 * For individual download task processing (Telegram calls inside workers).
 * No jitter — tasks are already spaced by the queue, not by simultaneous callers.
 * Used in: downloadWorker task retry loop.
 */
export const TASK_POLICY: RetryPolicy = {
  maxAttempts: 3,
  backoff: 'exponential',
  baseDelayMs: 30_000,
  maxDelayMs: 120_000,
  jitter: false,
  isTransient: isTransientDownloadError,
  getOverrideDelayMs: getFloodWaitOverrideMs,
  onRetry: makeOnRetry('download'),
};

/**
 * For HTTP fetches in article extraction (fetch URL → HTML).
 * Used in: downloadWorker → readability.
 */
export const HTTP_FETCH_POLICY: RetryPolicy = {
  maxAttempts: 3,
  backoff: 'exponential',
  baseDelayMs: 1_000,
  maxDelayMs: 10_000,
  jitter: true,
  isTransient: isTransientHttpFetchError,
  onRetry: makeOnRetry('readability'),
};
