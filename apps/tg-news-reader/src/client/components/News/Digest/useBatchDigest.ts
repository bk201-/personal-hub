import { useCallback, useEffect, useRef, useState } from 'react';
import { streamDigest as defaultStreamDigest } from '../../../api/digest';
import type { DigestEvent, DigestParams } from '../../../api/digest';

export type BatchDigestStatus = 'idle' | 'prefetching' | 'generating' | 'done' | 'error';

export interface BatchDigestProgress {
  done: number;
  total: number;
  errors: number;
}

export interface BatchDigestState {
  status: BatchDigestStatus;
  progress: BatchDigestProgress | null;
  result: string;
  refMap: Record<number, number>;
  error: string | null;
}

export interface BatchDigestControls {
  abort: () => void;
  retry: () => void;
}

export type BatchDigestHookResult = BatchDigestState & BatchDigestControls;

/**
 * Stream function signature — pulled out as a type so tests can inject a mock
 * without having to mock the network layer directly.
 */
export type StreamDigestFn = (params: DigestParams, signal: AbortSignal) => AsyncGenerator<DigestEvent, void, unknown>;

export interface UseBatchDigestOptions {
  /** Injected for tests. Defaults to the real streamDigest. */
  streamDigestFn?: StreamDigestFn;
  /** Skip auto-run on enabled; caller triggers via retry() manually. Default false. */
  manual?: boolean;
}

const INITIAL_STATE: BatchDigestState = {
  status: 'idle',
  progress: null,
  result: '',
  refMap: {},
  error: null,
};

/**
 * Runs a single digest batch as an SSE stream.
 *
 * Life-cycle:
 *   - `enabled=false` → stays in 'idle' indefinitely (used by useBatchQueue to gate concurrency)
 *   - `enabled=true` → transitions 'prefetching' → 'generating' → 'done'
 *   - Any error during streaming → 'error'
 *   - abort() cancels the in-flight request and resets to 'idle'
 *   - retry() resets state and re-runs (only valid after 'done' | 'error' | 'idle')
 */
export function useBatchDigest(
  newsIds: readonly number[],
  baseParams: Omit<DigestParams, 'newsIds'>,
  enabled: boolean,
  options: UseBatchDigestOptions = {},
): BatchDigestHookResult {
  const { streamDigestFn = defaultStreamDigest, manual = false } = options;
  const [state, setState] = useState<BatchDigestState>(INITIAL_STATE);
  const abortRef = useRef<AbortController | null>(null);
  // Track mount status so async stream loops never setState on unmounted hook
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Hold the latest inputs in refs so `run` can read them without being
  // reallocated on every render. Keeping `run`, `retry`, and `abort` stable
  // lets consumers (e.g. memoized rows) avoid avoidable re-renders.
  const newsIdsRef = useRef(newsIds);
  newsIdsRef.current = newsIds;
  const baseParamsRef = useRef(baseParams);
  baseParamsRef.current = baseParams;
  const streamDigestFnRef = useRef(streamDigestFn);
  streamDigestFnRef.current = streamDigestFn;

  const run = useCallback(async () => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    if (mountedRef.current) {
      setState({ ...INITIAL_STATE, status: 'prefetching' });
    }

    try {
      const params: DigestParams = { ...baseParamsRef.current, newsIds: [...newsIdsRef.current] };
      for await (const event of streamDigestFnRef.current(params, ctrl.signal)) {
        if (!mountedRef.current) return;
        if (event.type === 'prefetch_progress') {
          setState((s) => ({
            ...s,
            status: 'prefetching',
            progress: { done: event.done, total: event.total, errors: event.errors },
          }));
        } else if (event.type === 'ref_map') {
          setState((s) => ({ ...s, refMap: event.map }));
        } else if (event.type === 'chunk') {
          setState((s) => ({
            ...s,
            // First chunk marks the transition from prefetch → generation
            status: 'generating',
            progress: null,
            result: s.result + event.content,
          }));
        }
      }
      if (!mountedRef.current) return;
      setState((s) => ({ ...s, status: 'done', progress: null }));
    } catch (err) {
      if (!mountedRef.current) return;
      if ((err as Error).name === 'AbortError') {
        // Caller aborted — reset cleanly, don't surface as an error
        setState(INITIAL_STATE);
        return;
      }
      setState((s) => ({
        ...s,
        status: 'error',
        progress: null,
        error: (err as Error).message ?? 'Unknown error',
      }));
    } finally {
      if (abortRef.current === ctrl) abortRef.current = null;
    }
  }, []);

  const abort = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    if (mountedRef.current) setState(INITIAL_STATE);
  }, []);

  const retry = useCallback(() => {
    void run();
  }, [run]);

  // Auto-run on enabled flip (unless manual)
  const lastRunRef = useRef(false);
  useEffect(() => {
    if (manual) return;
    if (enabled && !lastRunRef.current) {
      lastRunRef.current = true;
      void run();
    }
    if (!enabled) {
      lastRunRef.current = false;
    }
  }, [enabled, manual, run]);

  // Abort on unmount
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  return { ...state, abort, retry };
}
