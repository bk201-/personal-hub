/**
 * Debounced batcher for "mark as read/unread" toggles.
 *
 * Instead of firing one PATCH per news item, callers enqueue an intent here.
 * The UI is updated optimistically by the caller (React Query cache), while the
 * network write is coalesced: intents accumulate for a short debounce window,
 * then flush as a single `POST /api/news/read-batch`. This keeps the server's
 * mutating-request rate limit from being tripped when the user speeds through
 * items with the keyboard.
 *
 * Last-write-wins per id: toggling an item read→unread→read within one window
 * collapses to a single final state.
 */

import { logger } from '../logger';
import { useAuthStore } from '../store/authStore';
import { api } from './client';

/**
 * Feature flag: coalesce single-item mark-read toggles into a batched
 * `POST /news/read-batch`. Temporarily disabled — since the GET rate limit was
 * relaxed, per-item `PATCH /news/:id/read` requests are fine and simpler.
 * Flip back to `true` to re-enable batching. Note: "mark all" always stays a
 * single `POST /news/read-all` request regardless of this flag.
 */
export const MARK_READ_BATCHING_ENABLED = false;

/** Wait this long after the last enqueue before flushing. */
export const BATCH_DEBOUNCE_MS = 700;
/** Never wait longer than this from the first pending item before flushing. */
export const BATCH_MAX_WAIT_MS = 3_000;

export interface ReadBatchPayload {
  readIds: number[];
  unreadIds: number[];
}

/** Called after a failed flush so the app can resync from the server. */
type Reconciler = (payload: ReadBatchPayload, error: unknown) => void;

class MarkReadBatcher {
  /** id → target read state (1 = read, 0 = unread). Last write wins. */
  private pending = new Map<number, 0 | 1>();
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private maxWaitTimer: ReturnType<typeof setTimeout> | null = null;
  private reconciler: Reconciler | null = null;
  private unloadInstalled = false;

  setReconciler(fn: Reconciler | null): void {
    this.reconciler = fn;
  }

  enqueue(id: number, isRead: 0 | 1): void {
    this.installUnloadFlush();
    this.pending.set(id, isRead);

    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => void this.flush(), BATCH_DEBOUNCE_MS);

    // Cap the total latency so a steady stream of toggles still commits.
    if (!this.maxWaitTimer) {
      this.maxWaitTimer = setTimeout(() => void this.flush(), BATCH_MAX_WAIT_MS);
    }
  }

  private drain(): ReadBatchPayload | null {
    if (this.pending.size === 0) return null;
    const readIds: number[] = [];
    const unreadIds: number[] = [];
    for (const [id, isRead] of this.pending) {
      if (isRead === 1) readIds.push(id);
      else unreadIds.push(id);
    }
    this.pending.clear();
    return { readIds, unreadIds };
  }

  private clearTimers(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    if (this.maxWaitTimer) {
      clearTimeout(this.maxWaitTimer);
      this.maxWaitTimer = null;
    }
  }

  /** Flush pending intents via the normal (retryable) API client. */
  async flush(): Promise<void> {
    this.clearTimers();
    const payload = this.drain();
    if (!payload) return;

    try {
      await api.post<{ success: boolean }>('/news/read-batch', payload);
    } catch (err) {
      logger.warn({ module: 'markReadBatcher', err }, 'mark-read batch flush failed');
      this.reconciler?.(payload, err);
    }
  }

  /**
   * Best-effort flush during page unload — a normal fetch may be cancelled, so
   * use `keepalive` and skip the retry wrapper.
   */
  private flushOnUnload(): void {
    this.clearTimers();
    const payload = this.drain();
    if (!payload) return;

    const token = useAuthStore.getState().accessToken;
    void fetch('/api/news/read-batch', {
      method: 'POST',
      keepalive: true,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(payload),
    }).catch(() => {
      // Nothing we can do during unload — the server recount on next fetch heals it.
    });
  }

  private installUnloadFlush(): void {
    if (this.unloadInstalled || typeof window === 'undefined') return;
    this.unloadInstalled = true;
    // `pagehide` fires on tab close / navigation; `visibilitychange→hidden`
    // covers mobile app-switch where `pagehide` may not fire reliably.
    window.addEventListener('pagehide', () => this.flushOnUnload());
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') this.flushOnUnload();
    });
  }
}

export const markReadBatcher = new MarkReadBatcher();
