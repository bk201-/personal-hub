import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./client', () => ({
  api: { post: vi.fn().mockResolvedValue({ success: true }) },
}));

vi.mock('../logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../store/authStore', () => ({
  useAuthStore: { getState: () => ({ accessToken: 'test-token' }) },
}));

import { api } from './client';
import { BATCH_DEBOUNCE_MS, BATCH_MAX_WAIT_MS, markReadBatcher } from './markReadBatcher';

const mockedPost = vi.mocked(api.post);

describe('markReadBatcher', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    markReadBatcher.setReconciler(null);
  });

  afterEach(async () => {
    // Drain anything left pending so timers don't leak between tests.
    await markReadBatcher.flush();
    vi.useRealTimers();
  });

  it('coalesces multiple enqueues into a single request after the debounce window', async () => {
    markReadBatcher.enqueue(1, 1);
    markReadBatcher.enqueue(2, 1);
    markReadBatcher.enqueue(3, 0);

    expect(mockedPost).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(BATCH_DEBOUNCE_MS);

    expect(mockedPost).toHaveBeenCalledTimes(1);
    expect(mockedPost).toHaveBeenCalledWith('/news/read-batch', { readIds: [1, 2], unreadIds: [3] });
  });

  it('applies last-write-wins per id', async () => {
    markReadBatcher.enqueue(7, 1);
    markReadBatcher.enqueue(7, 0);
    markReadBatcher.enqueue(7, 1);

    await vi.advanceTimersByTimeAsync(BATCH_DEBOUNCE_MS);

    expect(mockedPost).toHaveBeenCalledWith('/news/read-batch', { readIds: [7], unreadIds: [] });
  });

  it('debounce resets on each enqueue but flushes by the max-wait cap', async () => {
    // Keep enqueuing just under the debounce interval — normally this would
    // postpone the flush forever, but the max-wait cap forces it out.
    for (let i = 0; i < 10; i++) {
      markReadBatcher.enqueue(i, 1);
      await vi.advanceTimersByTimeAsync(BATCH_DEBOUNCE_MS - 100);
    }
    // Total elapsed already exceeds BATCH_MAX_WAIT_MS → a flush must have fired.
    expect(mockedPost).toHaveBeenCalled();
    expect(BATCH_MAX_WAIT_MS).toBeLessThan(BATCH_DEBOUNCE_MS * 10);
  });

  it('does nothing when there is nothing pending', async () => {
    await markReadBatcher.flush();
    expect(mockedPost).not.toHaveBeenCalled();
  });

  it('invokes the reconciler when the flush fails', async () => {
    const reconciler = vi.fn();
    markReadBatcher.setReconciler(reconciler);
    mockedPost.mockRejectedValueOnce(new Error('boom'));

    markReadBatcher.enqueue(42, 1);
    await vi.advanceTimersByTimeAsync(BATCH_DEBOUNCE_MS);

    expect(reconciler).toHaveBeenCalledTimes(1);
    expect(reconciler.mock.calls[0][0]).toEqual({ readIds: [42], unreadIds: [] });
  });
});
