import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export interface BatchQueueApi {
  /** Set of batch indices currently allowed to run (includes already-finished batches). */
  enabled: ReadonlySet<number>;
  /**
   * Signal that a batch has finished (either done or error).
   * The queue activates the next pending index if any remain.
   */
  release: (index: number) => void;
  /** Force-enable an index (e.g. user-triggered retry of a failed batch). */
  activate: (index: number) => void;
  /** Reset the queue to its initial state. */
  reset: () => void;
}

/**
 * Pure queue controller for N batches with a concurrency cap of `maxParallel`.
 *
 * The `enabled` set only grows — it represents all indices that have been started
 * (running or finished). The concurrency cap is enforced by NOT adding a new index
 * until a running batch calls release().
 *
 * Implementation notes:
 *   - `releasedCountRef` tracks how many times release() has been called. It's a
 *     ref (not state) because we never need to render on that change — only on the
 *     `enabled` Set change. This avoids a double-render per release() call.
 *   - The hook has no knowledge of what a "batch" is — it is a pure slot manager.
 */
export function useBatchQueue(count: number, maxParallel: number): BatchQueueApi {
  const cap = Math.max(0, maxParallel);
  const initialSet = useMemo(() => {
    const s = new Set<number>();
    for (let i = 0; i < Math.min(count, cap); i++) s.add(i);
    return s;
  }, [count, cap]);

  const [enabled, setEnabled] = useState<Set<number>>(() => new Set(initialSet));
  const releasedCountRef = useRef(0);
  // Tracks which initialSet the current `enabled` state belongs to, so we can
  // detect when `count` / `maxParallel` change and reset without an extra render.
  const lastInitialRef = useRef(initialSet);

  // If `count` or `maxParallel` change (e.g. user re-opens drawer with different feed),
  // reset the queue. Runs only on actual dep change — not on mount (state already
  // initialized from the same initialSet via useState initializer).
  useEffect(() => {
    if (lastInitialRef.current === initialSet) return;
    lastInitialRef.current = initialSet;
    releasedCountRef.current = 0;
    setEnabled(new Set(initialSet));
  }, [initialSet]);

  const release = useCallback(
    (_index: number) => {
      const nextIdx = cap + releasedCountRef.current;
      releasedCountRef.current += 1;
      if (nextIdx >= count) return; // no more pending indices
      setEnabled((prev) => {
        if (prev.has(nextIdx)) return prev;
        const next = new Set(prev);
        next.add(nextIdx);
        return next;
      });
    },
    [cap, count],
  );

  const activate = useCallback(
    (index: number) => {
      if (index < 0 || index >= count) return;
      setEnabled((prev) => {
        if (prev.has(index)) return prev;
        const next = new Set(prev);
        next.add(index);
        return next;
      });
    },
    [count],
  );

  const reset = useCallback(() => {
    releasedCountRef.current = 0;
    setEnabled(new Set(initialSet));
  }, [initialSet]);

  return { enabled, release, activate, reset };
}
