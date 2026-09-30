import { beforeEach, describe, expect, it } from 'vitest';
import { batchKey, clearBatchResult, loadBatchResult, saveBatchResult } from './batchPersistence';

describe('batchPersistence', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('round-trips a saved batch result', () => {
    const scope = { channelId: 42 };
    saveBatchResult(scope, 0, {
      result: '# Digest\nHello',
      refMap: { 1: 100, 2: 200 },
      newsIds: [100, 200],
    });

    const loaded = loadBatchResult(scope, 0, [100, 200]);
    expect(loaded).not.toBeNull();
    expect(loaded!.result).toBe('# Digest\nHello');
    expect(loaded!.refMap).toEqual({ 1: 100, 2: 200 });
    expect(loaded!.newsIds).toEqual([100, 200]);
    expect(typeof loaded!.savedAt).toBe('number');
  });

  it('returns null when the key is missing', () => {
    expect(loadBatchResult({ channelId: 1 }, 0, [])).toBeNull();
  });

  it('returns null when stored JSON is corrupt', () => {
    localStorage.setItem(batchKey({ channelId: 1 }, 0), 'not-json');
    expect(loadBatchResult({ channelId: 1 }, 0, [])).toBeNull();
  });

  it('returns null when stored newsIds do not match expected list (stale feed)', () => {
    const scope = { channelId: 1 };
    saveBatchResult(scope, 0, { result: 'x', refMap: {}, newsIds: [1, 2, 3] });
    // Feed now has a different first page
    expect(loadBatchResult(scope, 0, [1, 2, 4])).toBeNull();
  });

  it('returns null for an unknown schema version', () => {
    const scope = { channelId: 1 };
    localStorage.setItem(
      batchKey(scope, 0),
      JSON.stringify({ v: 999, result: 'x', refMap: {}, newsIds: [1], savedAt: 0 }),
    );
    expect(loadBatchResult(scope, 0, [1])).toBeNull();
  });

  it('generates distinct keys for different scopes', () => {
    expect(batchKey({ channelId: 1 }, 0)).not.toBe(batchKey({ channelId: 2 }, 0));
    expect(batchKey({ channelId: 1 }, 0)).not.toBe(batchKey({ channelId: 1 }, 1));
    expect(batchKey({ groupId: null }, 0)).not.toBe(batchKey({ groupId: 1 }, 0));
    expect(batchKey({ channelId: 1 }, 0)).not.toBe(batchKey({ groupId: 1 }, 0));
  });

  it('clearBatchResult removes a specific batch', () => {
    const scope = { channelId: 1 };
    saveBatchResult(scope, 0, { result: 'a', refMap: {}, newsIds: [1] });
    saveBatchResult(scope, 1, { result: 'b', refMap: {}, newsIds: [2] });
    clearBatchResult(scope, 0);
    expect(loadBatchResult(scope, 0, [1])).toBeNull();
    expect(loadBatchResult(scope, 1, [2])).not.toBeNull();
  });

  it('rejects objects missing required fields', () => {
    const scope = { channelId: 1 };
    localStorage.setItem(batchKey(scope, 0), JSON.stringify({ v: 1, result: 'x' }));
    expect(loadBatchResult(scope, 0, [1])).toBeNull();
  });
});
