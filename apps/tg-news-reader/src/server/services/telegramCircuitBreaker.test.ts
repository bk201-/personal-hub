import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock dependencies before importing the module
vi.mock('../logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('./alertBot.js', () => ({
  sendAlert: vi.fn(),
}));
vi.mock('../utils/retry.js', () => ({
  withRetry: vi.fn(async (fn: () => Promise<unknown>) => fn()),
  isTransientTelegramError: (err: unknown) => err instanceof Error && err.message.includes('transient'),
  TELEGRAM_POLICY: {},
}));

import { sendAlert } from './alertBot.js';
import { TelegramCircuitBreaker, setReconnectCallback } from './telegramCircuitBreaker.js';

describe('TelegramCircuitBreaker', () => {
  let cb: TelegramCircuitBreaker;

  beforeEach(() => {
    vi.useFakeTimers();
    cb = new TelegramCircuitBreaker(3, 1_000); // open after 3 failures, half-open after 1s
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts in closed state', () => {
    expect(cb.getState()).toBe('closed');
  });

  it('stays closed on successful executions', async () => {
    await cb.execute(() => Promise.resolve('ok'), 'test');
    expect(cb.getState()).toBe('closed');
  });

  it('opens after threshold transient failures', async () => {
    const { withRetry } = await import('../utils/retry.js');
    const mockRetry = vi.mocked(withRetry);

    // Make withRetry throw transient errors
    const transientErr = new Error('transient failure');
    mockRetry.mockRejectedValue(transientErr);

    for (let i = 0; i < 3; i++) {
      await cb.execute(() => Promise.reject(transientErr), 'test').catch(() => {});
    }

    expect(cb.getState()).toBe('open');
  });

  it('rejects immediately when open', async () => {
    const { withRetry } = await import('../utils/retry.js');
    const mockRetry = vi.mocked(withRetry);
    const transientErr = new Error('transient failure');
    mockRetry.mockRejectedValue(transientErr);

    // Open the circuit
    for (let i = 0; i < 3; i++) {
      await cb.execute(() => Promise.reject(transientErr), 'test').catch(() => {});
    }

    // Now it should reject immediately without calling fn
    const fn = vi.fn();
    await expect(cb.execute(fn, 'test')).rejects.toThrow('circuit breaker OPEN');
    expect(fn).not.toHaveBeenCalled();
  });

  it('transitions to half-open after timeout', async () => {
    const { withRetry } = await import('../utils/retry.js');
    const mockRetry = vi.mocked(withRetry);
    const transientErr = new Error('transient failure');
    mockRetry.mockRejectedValue(transientErr);

    // Open the circuit
    for (let i = 0; i < 3; i++) {
      await cb.execute(() => Promise.reject(transientErr), 'test').catch(() => {});
    }
    expect(cb.getState()).toBe('open');

    // Advance time past half-open threshold
    vi.advanceTimersByTime(1_100);
    expect(cb.getState()).toBe('half-open');
  });

  it('closes again on success after half-open', async () => {
    const { withRetry } = await import('../utils/retry.js');
    const mockRetry = vi.mocked(withRetry);
    const transientErr = new Error('transient failure');
    mockRetry.mockRejectedValue(transientErr);

    // Open
    for (let i = 0; i < 3; i++) {
      await cb.execute(() => Promise.reject(transientErr), 'test').catch(() => {});
    }

    // Advance to half-open
    vi.advanceTimersByTime(1_100);

    // Success in half-open → closed
    mockRetry.mockImplementation(async (fn) => fn());
    await cb.execute(() => Promise.resolve('ok'), 'test');
    expect(cb.getState()).toBe('closed');
  });

  it('does not open on permanent (non-transient) errors', async () => {
    const { withRetry } = await import('../utils/retry.js');
    const mockRetry = vi.mocked(withRetry);
    const permErr = new Error('permanent failure');
    mockRetry.mockRejectedValue(permErr);

    for (let i = 0; i < 5; i++) {
      await cb.execute(() => Promise.reject(permErr), 'test').catch(() => {});
    }

    expect(cb.getState()).toBe('closed');
  });

  it('reports sessionExpired=false initially', () => {
    expect(cb.isSessionExpired()).toBe(false);
  });

  it('sets sessionExpired=true on AUTH_KEY_UNREGISTERED and calls sendAlert', async () => {
    const { withRetry } = await import('../utils/retry.js');
    vi.mocked(withRetry).mockRejectedValueOnce(new Error('AUTH_KEY_UNREGISTERED'));

    await cb.execute(() => Promise.reject(new Error('AUTH_KEY_UNREGISTERED')), 'test').catch(() => {});

    expect(cb.isSessionExpired()).toBe(true);
    expect(sendAlert).toHaveBeenCalledWith(expect.stringContaining('AUTH_KEY_UNREGISTERED'), 'auth-key-invalid');
  });

  it('sets sessionExpired=true on AUTH_KEY_DUPLICATED', async () => {
    const { withRetry } = await import('../utils/retry.js');
    vi.mocked(withRetry).mockRejectedValueOnce(new Error('AUTH_KEY_DUPLICATED'));

    await cb.execute(() => Promise.reject(new Error('AUTH_KEY_DUPLICATED')), 'test').catch(() => {});

    expect(cb.isSessionExpired()).toBe(true);
  });

  it('calls reconnect callback on AUTH_KEY_UNREGISTERED and stays not expired on success', async () => {
    const reconnectFn = vi.fn().mockResolvedValue(undefined);
    setReconnectCallback(reconnectFn);

    const { withRetry } = await import('../utils/retry.js');
    vi.mocked(withRetry).mockRejectedValueOnce(new Error('AUTH_KEY_UNREGISTERED'));

    await cb.execute(() => Promise.reject(new Error('AUTH_KEY_UNREGISTERED')), 'test').catch(() => {});

    expect(reconnectFn).toHaveBeenCalled();
    expect(cb.isSessionExpired()).toBe(false);

    // Cleanup
    setReconnectCallback(null as never);
  });

  it('sets sessionExpired=true when reconnect callback fails', async () => {
    const reconnectFn = vi.fn().mockRejectedValue(new Error('reconnect failed'));
    setReconnectCallback(reconnectFn);

    const { withRetry } = await import('../utils/retry.js');
    vi.mocked(withRetry).mockRejectedValueOnce(new Error('AUTH_KEY_UNREGISTERED'));

    await cb.execute(() => Promise.reject(new Error('AUTH_KEY_UNREGISTERED')), 'test').catch(() => {});

    expect(reconnectFn).toHaveBeenCalled();
    expect(cb.isSessionExpired()).toBe(true);

    // Cleanup
    setReconnectCallback(null as never);
  });
});
