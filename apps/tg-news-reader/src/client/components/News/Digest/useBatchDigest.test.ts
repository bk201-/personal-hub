import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DigestEvent } from '../../../api/digest';
import { useBatchDigest } from './useBatchDigest';
import type { StreamDigestFn } from './useBatchDigest';

// Helper: build an async generator that yields a scripted sequence of events.
// If `hold` is true, the generator suspends after yielding all events until the
// signal is aborted — useful for testing abort behaviour mid-stream.
function makeStream(events: DigestEvent[], opts?: { hold?: boolean; throwAfter?: Error }): StreamDigestFn {
  return async function* (_params, signal) {
    for (const ev of events) {
      if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
      yield ev;
    }
    if (opts?.throwAfter) throw opts.throwAfter;
    if (opts?.hold) {
      // Wait until aborted
      await new Promise<void>((resolve, reject) => {
        if (signal.aborted) {
          reject(new DOMException('Aborted', 'AbortError'));
          return;
        }
        signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
      });
    }
  };
}

describe('useBatchDigest', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('stays in idle when not enabled', () => {
    const streamDigestFn = vi.fn(makeStream([]));
    const { result } = renderHook(() => useBatchDigest([1, 2], {}, false, { streamDigestFn }));
    expect(result.current.status).toBe('idle');
    expect(streamDigestFn).not.toHaveBeenCalled();
  });

  it('transitions idle → prefetching → generating → done on happy path', async () => {
    const streamDigestFn = makeStream([
      { type: 'prefetch_progress', done: 0, total: 2, errors: 0 },
      { type: 'prefetch_progress', done: 2, total: 2, errors: 0 },
      { type: 'ref_map', map: { 1: 100, 2: 200 } },
      { type: 'chunk', content: 'Hello' },
      { type: 'chunk', content: ' world' },
    ]);

    vi.useRealTimers();
    const { result } = renderHook(() => useBatchDigest([100, 200], {}, true, { streamDigestFn }));

    await waitFor(() => expect(result.current.status).toBe('done'));
    expect(result.current.result).toBe('Hello world');
    expect(result.current.refMap).toEqual({ 1: 100, 2: 200 });
    expect(result.current.progress).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('progress state is populated during prefetch phase', async () => {
    vi.useRealTimers();
    const streamDigestFn = makeStream([{ type: 'prefetch_progress', done: 3, total: 10, errors: 1 }], { hold: true });
    const { result } = renderHook(() => useBatchDigest([1], {}, true, { streamDigestFn }));

    await waitFor(() => expect(result.current.progress).toEqual({ done: 3, total: 10, errors: 1 }));
    expect(result.current.status).toBe('prefetching');
  });

  it('transitions to error on stream throw', async () => {
    vi.useRealTimers();
    const streamDigestFn = makeStream([], { throwAfter: new Error('boom') });
    const { result } = renderHook(() => useBatchDigest([1], {}, true, { streamDigestFn }));

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error).toBe('boom');
  });

  it('abort() resets state to idle', async () => {
    vi.useRealTimers();
    const streamDigestFn = makeStream([{ type: 'chunk', content: 'partial' }], { hold: true });
    const { result } = renderHook(() => useBatchDigest([1], {}, true, { streamDigestFn }));

    await waitFor(() => expect(result.current.result).toBe('partial'));

    await act(async () => {
      result.current.abort();
    });

    expect(result.current.status).toBe('idle');
    expect(result.current.result).toBe('');
  });

  it('retry() resets state and re-streams', async () => {
    vi.useRealTimers();
    let callCount = 0;
    const streamDigestFn: StreamDigestFn = async function* () {
      callCount++;
      yield { type: 'chunk', content: `run-${callCount}` };
    };

    const { result } = renderHook(() => useBatchDigest([1], {}, true, { streamDigestFn }));

    await waitFor(() => expect(result.current.status).toBe('done'));
    expect(result.current.result).toBe('run-1');

    await act(async () => {
      result.current.retry();
    });
    await waitFor(() => expect(result.current.status).toBe('done'));
    expect(result.current.result).toBe('run-2');
  });

  it('does not re-run when `enabled` stays true across renders', async () => {
    vi.useRealTimers();
    const streamDigestFn = vi.fn(makeStream([{ type: 'chunk', content: 'once' }]));

    const { result, rerender } = renderHook(({ enabled }) => useBatchDigest([1], {}, enabled, { streamDigestFn }), {
      initialProps: { enabled: true },
    });

    await waitFor(() => expect(result.current.status).toBe('done'));
    expect(streamDigestFn).toHaveBeenCalledTimes(1);

    rerender({ enabled: true });
    expect(streamDigestFn).toHaveBeenCalledTimes(1);
  });
});
