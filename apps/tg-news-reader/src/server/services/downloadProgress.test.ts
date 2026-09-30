import { describe, expect, it, vi } from 'vitest';
import type { DownloadTask } from '../../shared/types.js';
import { downloadProgressEmitter, emitTaskUpdate } from './downloadProgress.js';

describe('downloadProgress', () => {
  it('emits task_update event with the task payload', () => {
    const handler = vi.fn();
    downloadProgressEmitter.on('task_update', handler);

    const task = {
      id: 1,
      newsId: 10,
      type: 'media' as const,
      url: null,
      priority: 0,
      status: 'done' as const,
      error: null,
      createdAt: 123,
      processedAt: 456,
    } satisfies DownloadTask;

    emitTaskUpdate(task);
    expect(handler).toHaveBeenCalledWith(task);

    downloadProgressEmitter.off('task_update', handler);
  });
});
