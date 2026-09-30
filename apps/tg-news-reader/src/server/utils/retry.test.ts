import { describe, expect, it, vi } from 'vitest';
import {
  getFloodWaitOverrideMs,
  isTransientDbError,
  isTransientDownloadError,
  isTransientHttpFetchError,
  isTransientTelegramError,
  withRetry,
} from './retry.js';
import type { RetryPolicy } from './retry.js';

// ─── Helper: minimal policy with zero delays ─────────────────────────────────

function testPolicy(overrides: Partial<RetryPolicy> = {}): RetryPolicy {
  return {
    maxAttempts: 3,
    backoff: 'fixed',
    baseDelayMs: 0,
    maxDelayMs: 0,
    jitter: false,
    isTransient: () => true,
    ...overrides,
  };
}

// ─── withRetry ────────────────────────────────────────────────────────────────

describe('storage errors', () => {
  it.each(['ENOSPC', 'EDQUOT', 'SQLITE_FULL', 'STORAGE_PAUSED'])(
    'does not retry %s even with network wording',
    (code) => {
      const error = Object.assign(new Error('network mount connection write failed'), { code });
      expect(isTransientDownloadError(error)).toBe(false);
      expect(isTransientTelegramError(error)).toBe(false);
    },
  );
});

describe('withRetry', () => {
  it('succeeds on first try', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    const result = await withRetry(fn, testPolicy());
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledOnce();
  });

  it('retries on transient error, then succeeds', async () => {
    const fn = vi.fn().mockRejectedValueOnce(new Error('timeout')).mockResolvedValue('ok');
    const result = await withRetry(fn, testPolicy());
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('throws immediately on permanent error', async () => {
    const permError = new Error('wrong username');
    const fn = vi.fn().mockRejectedValue(permError);
    await expect(withRetry(fn, testPolicy({ isTransient: () => false }))).rejects.toThrow('wrong username');
    expect(fn).toHaveBeenCalledOnce();
  });

  it('exhausts maxAttempts and throws last error', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('transient'));
    await expect(withRetry(fn, testPolicy({ maxAttempts: 2 }))).rejects.toThrow('transient');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('calls onRetry before each retry', async () => {
    const onRetry = vi.fn();
    const fn = vi.fn().mockRejectedValueOnce(new Error('err')).mockResolvedValue('ok');
    await withRetry(fn, testPolicy({ onRetry }), 'ctx');
    expect(onRetry).toHaveBeenCalledOnce();
    expect(onRetry).toHaveBeenCalledWith(1, 3, 0, expect.any(Error), 'ctx');
  });

  it('uses getOverrideDelayMs when provided', async () => {
    const fn = vi.fn().mockRejectedValueOnce(new Error('flood')).mockResolvedValue('ok');
    const policy = testPolicy({ getOverrideDelayMs: () => 0 });
    const result = await withRetry(fn, policy);
    expect(result).toBe('ok');
  });
});

// ─── Transient error classifiers ──────────────────────────────────────────────

describe('isTransientTelegramError', () => {
  it.each([
    'timeout',
    'FLOOD',
    'ECONNRESET',
    'ETIMEDOUT',
    'disconnected',
    'connection lost',
    'network error',
    'socket hang up',
  ])('returns true for "%s"', (msg) => expect(isTransientTelegramError(new Error(msg))).toBe(true));

  it('returns true for FloodWaitError constructor name', () => {
    class FloodWaitError extends Error {
      seconds = 5;
    }
    expect(isTransientTelegramError(new FloodWaitError('flood'))).toBe(true);
  });

  it('returns false for permanent errors', () => {
    expect(isTransientTelegramError(new Error('wrong username'))).toBe(false);
  });

  it('returns false for non-Error values', () => {
    expect(isTransientTelegramError('string error')).toBe(false);
    expect(isTransientTelegramError(null)).toBe(false);
  });
});

describe('isTransientDbError', () => {
  it.each(['server_error', 'ECONNRESET', 'sqlite_busy', 'database is locked', 'resp.body'])(
    'returns true for "%s"',
    (msg) => expect(isTransientDbError(new Error(msg))).toBe(true),
  );

  it('returns false for permanent DB errors', () => {
    expect(isTransientDbError(new Error('UNIQUE constraint failed'))).toBe(false);
  });
});

describe('isTransientDownloadError', () => {
  it('returns true for circuit breaker errors', () => {
    expect(isTransientDownloadError(new Error('circuit breaker OPEN'))).toBe(true);
  });

  it('returns true for file_reference errors', () => {
    expect(isTransientDownloadError(new Error('file_reference expired'))).toBe(true);
  });

  it('returns true for ECONNRESET code', () => {
    const err = new Error('something') as NodeJS.ErrnoException;
    err.code = 'ECONNRESET';
    expect(isTransientDownloadError(err)).toBe(true);
  });
});

describe('isTransientHttpFetchError', () => {
  it('returns true for TypeError (network failure)', () => {
    expect(isTransientHttpFetchError(new TypeError('Failed to fetch'))).toBe(true);
  });

  it('returns true for HTTP 5xx', () => {
    expect(isTransientHttpFetchError(new Error('HTTP status 502'))).toBe(true);
  });

  it('returns false for HTTP 4xx', () => {
    expect(isTransientHttpFetchError(new Error('HTTP status 404'))).toBe(false);
  });
});

describe('getFloodWaitOverrideMs', () => {
  it('returns seconds * 1000 for FloodWaitError', () => {
    class FloodWaitError extends Error {
      seconds = 10;
    }
    expect(getFloodWaitOverrideMs(new FloodWaitError('flood'))).toBe(10_000);
  });

  it('returns undefined for non-FloodWaitError', () => {
    expect(getFloodWaitOverrideMs(new Error('timeout'))).toBeUndefined();
  });

  it('defaults to 30s when seconds property is missing', () => {
    class FloodWaitError extends Error {}
    expect(getFloodWaitOverrideMs(new FloodWaitError('flood'))).toBe(30_000);
  });
});
