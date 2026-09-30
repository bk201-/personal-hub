/**
 * Persistence layer for completed digest batch results.
 * Stored in localStorage under `digest_v1_${scope}_batch_${index}`.
 *
 * Only completed batches are persisted — in-flight or errored batches are not
 * saved (the user can always retry).
 */

const KEY_PREFIX = 'digest_v1_';
const CURRENT_VERSION = 1;

export interface PersistedBatch {
  v: number; // schema version (for future migrations)
  result: string;
  refMap: Record<number, number>;
  newsIds: number[];
  savedAt: number; // epoch ms
}

export type BatchScope = { channelId: number } | { groupId: number | null } | { custom: string };

function scopeKey(scope: BatchScope): string {
  if ('channelId' in scope) return `ch_${scope.channelId}`;
  if ('groupId' in scope) return `g_${scope.groupId ?? 'null'}`;
  return `custom_${scope.custom}`;
}

export function batchKey(scope: BatchScope, index: number): string {
  return `${KEY_PREFIX}${scopeKey(scope)}_batch_${index}`;
}

export function saveBatchResult(
  scope: BatchScope,
  index: number,
  data: { result: string; refMap: Record<number, number>; newsIds: number[] },
): void {
  const payload: PersistedBatch = {
    v: CURRENT_VERSION,
    result: data.result,
    refMap: data.refMap,
    newsIds: data.newsIds,
    savedAt: Date.now(),
  };
  try {
    localStorage.setItem(batchKey(scope, index), JSON.stringify(payload));
  } catch {
    // Quota exceeded or private-mode storage — silently skip persistence.
    // The digest still works; the user just loses the ability to restore after refresh.
  }
}

/**
 * Loads a persisted batch, returning null if:
 *   - the key does not exist
 *   - the JSON is corrupt
 *   - the schema version is newer than this build understands
 *   - the stored newsIds do not match the expected list (stale — feed changed)
 */
export function loadBatchResult(
  scope: BatchScope,
  index: number,
  expectedNewsIds: readonly number[],
): PersistedBatch | null {
  let raw: string | null;
  try {
    raw = localStorage.getItem(batchKey(scope, index));
  } catch {
    return null;
  }
  if (!raw) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (!isPersistedBatch(parsed)) return null;
  if (parsed.v !== CURRENT_VERSION) return null;

  // Validate that the persisted newsIds match the current batch's newsIds.
  // If the feed has changed (new items appeared, items deleted), discard the cache.
  if (!arraysEqual(parsed.newsIds, expectedNewsIds)) return null;

  return parsed;
}

export function clearBatchResult(scope: BatchScope, index: number): void {
  try {
    localStorage.removeItem(batchKey(scope, index));
  } catch {
    /* ignore */
  }
}

/**
 * Remove ALL persisted batches for the given scope (used by the "Clear all"
 * button in the Progress Drawer and by the auto-clear when every batch has
 * been marked as read).
 *
 * Returns the number of keys that were removed.
 */
export function clearScope(scope: BatchScope): number {
  // Keys look like `digest_v1_{scopeKey}_batch_{index}` — we prefix-match.
  // scopeKey() is internal; rebuild the prefix here.
  const prefix = batchKey(scope, 0).replace(/_batch_0$/, '_batch_');
  let removed = 0;
  try {
    const toRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(prefix)) toRemove.push(key);
    }
    for (const key of toRemove) {
      localStorage.removeItem(key);
      removed++;
    }
  } catch {
    /* ignore */
  }
  return removed;
}

function isPersistedBatch(v: unknown): v is PersistedBatch {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.v === 'number' &&
    typeof o.result === 'string' &&
    typeof o.refMap === 'object' &&
    o.refMap !== null &&
    Array.isArray(o.newsIds) &&
    o.newsIds.every((x) => typeof x === 'number') &&
    typeof o.savedAt === 'number'
  );
}

function arraysEqual(a: number[], b: readonly number[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
