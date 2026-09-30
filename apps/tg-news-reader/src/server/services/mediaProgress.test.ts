import { describe, expect, it, vi } from 'vitest';
import { emitMediaProgress, mediaProgressEmitter } from './mediaProgress.js';
import type { MediaProgressEvent } from './mediaProgress.js';

describe('mediaProgress', () => {
  it('emits on correct channel key', () => {
    const handler = vi.fn();
    mediaProgressEmitter.on('channel:42', handler);

    const event: MediaProgressEvent = { type: 'item', newsId: 1, done: 3, total: 10 };
    emitMediaProgress(42, event);

    expect(handler).toHaveBeenCalledWith(event);
    mediaProgressEmitter.off('channel:42', handler);
  });

  it('does not emit to other channel keys', () => {
    const handler = vi.fn();
    mediaProgressEmitter.on('channel:99', handler);

    emitMediaProgress(42, { type: 'complete', done: 10, total: 10 });
    expect(handler).not.toHaveBeenCalled();

    mediaProgressEmitter.off('channel:99', handler);
  });
});
