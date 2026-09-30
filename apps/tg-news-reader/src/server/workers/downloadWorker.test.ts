import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { seedChannel, seedNews } from '../__tests__/seed.js';
import { createTestDb } from '../__tests__/testDb.js';
import type { TestDb } from '../__tests__/testDb.js';
import { downloadProgressEmitter } from '../services/downloadProgress.js';
import { deleteAllMediaFiles } from '../utils/mediaFiles.js';

const port = vi.hoisted(() => ({
  on: vi.fn(),
  postMessage: vi.fn(),
}));

vi.mock('worker_threads', () => ({
  isMainThread: false,
  workerData: { workerId: 0 },
  parentPort: port,
}));
vi.mock('../config.js', () => ({ ARTICLE_MAX_HTML_BYTES: 1024 }));
vi.mock('../logger.js', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('../services/readability.js', () => ({ parseHtml: vi.fn(), buildFullContent: vi.fn() }));
vi.mock('../utils/mediaFiles.js', () => ({ deleteAllMediaFiles: vi.fn() }));
vi.mock('../utils/retry.js', () => ({
  withRetry: (fn: () => Promise<unknown>) => fn(),
  TASK_POLICY: {},
  HTTP_FETCH_POLICY: {},
}));

let testDb: TestDb;
vi.mock('../db/index.js', () => ({
  get db() {
    return testDb.db;
  },
}));

type Message = {
  type: string;
  reqId?: number;
  result?: string | null;
  msgId?: number;
  reason?: 'no_media' | 'size_limit';
  payload?: { id: number; newsId: number; type: string; url: string | null; priority: number };
};
let receive: (msg: Message) => void;

describe('downloadWorker filtered media', () => {
  beforeAll(async () => {
    testDb = await createTestDb();
    await import('./downloadWorker.js');
    receive = port.on.mock.calls[0][1];
  });

  afterAll(() => testDb.client.close());
  afterEach(() => vi.restoreAllMocks());

  beforeEach(async () => {
    await testDb.client.execute('DELETE FROM news');
    await testDb.client.execute('DELETE FROM channels');
    vi.mocked(deleteAllMediaFiles).mockClear();
    port.postMessage.mockReset().mockImplementation((msg: Message) => {
      if (msg.type === 'tg:downloadMedia') {
        queueMicrotask(() => receive({ type: 'tg:result', reqId: msg.reqId, result: 'test/photo.jpg' }));
      }
    });
  });

  async function runTask(newsId: number, priority = 0, type: 'media' | 'article' | 'image' = 'media') {
    receive({
      type: 'task',
      payload: { id: 1, newsId, type, url: type === 'article' ? 'https://example.com' : null, priority },
    });
    await vi.waitFor(() => expect(port.postMessage).toHaveBeenCalledWith({ type: 'done', taskId: 1 }));
  }

  it('finishes without downloading or failing if the news was deleted before dispatch', async () => {
    await runTask(999);
    expect(port.postMessage).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'tg:downloadMedia' }));
  });

  it('previews hidden images with enforced limits on every mixed-album member and preserves cached video', async () => {
    const channel = await seedChannel(testDb.db);
    const item = await seedNews(testDb.db, channel.id, {
      isFiltered: 1,
      albumMsgIds: [10, 11, 12],
      telegramMsgId: 10,
      localMediaPath: 'test/10.mp4',
      localMediaPaths: ['test/10.mp4', 'test/12.jpg'],
    });
    port.postMessage.mockImplementation((msg: Message) => {
      if (msg.type === 'tg:downloadMedia') {
        queueMicrotask(() =>
          receive({
            type: 'tg:result',
            reqId: msg.reqId,
            result: msg.msgId === 10 ? null : `test/${msg.msgId}.jpg`,
            reason: msg.msgId === 10 ? 'no_media' : undefined,
          }),
        );
      }
    });
    await runTask(item.id, 10, 'image');
    const requests = port.postMessage.mock.calls.filter(([msg]) => msg.type === 'tg:downloadMedia');
    expect(requests).toHaveLength(3);
    for (const [request] of requests) expect(request).toMatchObject({ imagesOnly: true, ignoreLimit: false });
    const result = await testDb.client.execute('SELECT local_media_path, local_media_paths FROM news WHERE id = ?', [
      item.id,
    ]);
    expect(result.rows[0].local_media_path).toBe('test/10.mp4');
    expect(JSON.parse(result.rows[0].local_media_paths as string)).toEqual([
      'test/10.mp4',
      'test/11.jpg',
      'test/12.jpg',
    ]);
    expect(deleteAllMediaFiles).not.toHaveBeenCalled();
  });

  it.each(['no_media', 'size_limit'] as const)('completes an image preview with no paths on %s', async (reason) => {
    const channel = await seedChannel(testDb.db);
    const item = await seedNews(testDb.db, channel.id, { isFiltered: 1 });
    port.postMessage.mockImplementation((msg: Message) => {
      if (msg.type === 'tg:downloadMedia')
        queueMicrotask(() =>
          receive({
            type: 'tg:result',
            reqId: msg.reqId,
            result: null,
            reason,
          }),
        );
    });
    await runTask(item.id, 10, 'image');
    const result = await testDb.client.execute('SELECT local_media_path, local_media_paths FROM news WHERE id = ?', [
      item.id,
    ]);
    expect(result.rows[0]).toMatchObject({ local_media_path: null, local_media_paths: null });
    expect(deleteAllMediaFiles).not.toHaveBeenCalled();
  });

  it('does not mistake partial image-only paths for a fully downloaded media album', async () => {
    const channel = await seedChannel(testDb.db);
    const item = await seedNews(testDb.db, channel.id, {
      albumMsgIds: [10, 11],
      localMediaPath: 'test/11.jpg',
      localMediaPaths: ['test/11.jpg'],
    });
    port.postMessage.mockImplementation((msg: Message) => {
      if (msg.type === 'tg:downloadMedia')
        queueMicrotask(() =>
          receive({
            type: 'tg:result',
            reqId: msg.reqId,
            result: `test/${msg.msgId}.${msg.msgId === 10 ? 'mp4' : 'jpg'}`,
          }),
        );
    });
    await runTask(item.id);
    const requests = port.postMessage.mock.calls.filter(([msg]) => msg.type === 'tg:downloadMedia');
    expect(requests).toHaveLength(2);
    const result = await testDb.client.execute('SELECT local_media_paths FROM news WHERE id = ?', [item.id]);
    expect(JSON.parse(result.rows[0].local_media_paths as string)).toEqual(['test/10.mp4', 'test/11.jpg']);
  });

  it('does not fetch an article for deleted news', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('unexpected network request'));
    await runTask(999, 10, 'article');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('notifies the main thread when worker cleanup frees disk space', () => {
    downloadProgressEmitter.emit('storage_freed');
    expect(port.postMessage).toHaveBeenCalledExactlyOnceWith({ type: 'storage_freed' });
  });

  it.each([
    { albumMsgIds: null, priority: 0 },
    { albumMsgIds: [10, 11], priority: 0 },
    { albumMsgIds: [10, 11], priority: 10 },
  ])(
    'cleans up media returned after deleting the news ($albumMsgIds, $priority)',
    async ({ albumMsgIds, priority }) => {
      const channel = await seedChannel(testDb.db);
      const item = await seedNews(testDb.db, channel.id, { albumMsgIds });
      port.postMessage.mockImplementation(async (msg: Message) => {
        if (msg.type === 'tg:downloadMedia') {
          await testDb.client.execute('DELETE FROM news WHERE id = ?', [item.id]);
          receive({ type: 'tg:result', reqId: msg.reqId, result: 'test/photo.jpg' });
        }
      });

      await runTask(item.id, priority);

      expect(port.postMessage.mock.calls.filter(([msg]) => msg.type === 'tg:downloadMedia')).toHaveLength(1);
      expect(deleteAllMediaFiles).toHaveBeenCalledWith('test/photo.jpg', albumMsgIds ? ['test/photo.jpg'] : null);
    },
  );

  it('removes a recreated cached image when its news is deleted during the preview', async () => {
    const channel = await seedChannel(testDb.db);
    const item = await seedNews(testDb.db, channel.id, { localMediaPath: 'test/photo.jpg' });
    port.postMessage.mockImplementation(async (msg: Message) => {
      if (msg.type === 'tg:downloadMedia') {
        await testDb.client.execute('DELETE FROM news WHERE id = ?', [item.id]);
        receive({ type: 'tg:result', reqId: msg.reqId, result: 'test/photo.jpg' });
      }
    });
    await runTask(item.id, 10);
    expect(deleteAllMediaFiles).toHaveBeenCalledWith('test/photo.jpg', null);
  });

  it.each([{ albumMsgIds: null }, { albumMsgIds: [10, 11] }])(
    'skips previously queued hidden media ($albumMsgIds)',
    async ({ albumMsgIds }) => {
      const channel = await seedChannel(testDb.db);
      const item = await seedNews(testDb.db, channel.id, { isFiltered: 1, albumMsgIds });

      await runTask(item.id);

      expect(port.postMessage).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'tg:downloadMedia' }));
    },
  );

  it('still downloads visible media and explicitly requested hidden media', async () => {
    const channel = await seedChannel(testDb.db);
    const visible = await seedNews(testDb.db, channel.id);
    const hidden = await seedNews(testDb.db, channel.id, { isFiltered: 1 });

    await runTask(visible.id);
    expect(port.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'tg:downloadMedia', ignoreLimit: false }),
    );
    port.postMessage.mockClear();
    await runTask(hidden.id, 10);

    expect(port.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'tg:downloadMedia', ignoreLimit: true }),
    );
  });

  it('stops requesting remaining album members when the news becomes filtered', async () => {
    const channel = await seedChannel(testDb.db);
    const item = await seedNews(testDb.db, channel.id, { albumMsgIds: [10, 11, 12] });
    port.postMessage.mockImplementation(async (msg: Message) => {
      if (msg.type === 'tg:downloadMedia') {
        await testDb.client.execute('UPDATE news SET is_filtered = 1 WHERE id = ?', [item.id]);
        receive({ type: 'tg:result', reqId: msg.reqId, result: 'test/photo.jpg' });
      }
    });

    await runTask(item.id);

    const requests = port.postMessage.mock.calls.filter(([msg]) => msg.type === 'tg:downloadMedia');
    expect(requests).toHaveLength(1);
  });
});
