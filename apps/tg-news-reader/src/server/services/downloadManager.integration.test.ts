import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Mocks ──────────────────────────────────────────────────────────────────

vi.mock('../config.js', () => ({
  JWT_SECRET: 'test-secret-key',
  JWT_ACCESS_EXPIRES_SEC: 900,
  REFRESH_EXPIRES_DAYS: 7,
  DOWNLOAD_TASK_CLEANUP_DELAY_MS: 30_000,
  WORKER_POOL_CRASH_THRESHOLD_RATIO: 0.8,
  WORKER_POOL_CRASH_WINDOW_MS: 60_000,
  WORKER_RESTART_BASE_MS: 5_000,
  WORKER_RESTART_JITTER_MS: 3_000,
}));

vi.mock('../logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), fatal: vi.fn(), debug: vi.fn() },
}));

vi.mock('./downloadProgress.js', () => ({
  downloadProgressEmitter: { on: vi.fn(), off: vi.fn(), emit: vi.fn() },
  emitTaskUpdate: vi.fn(),
}));

vi.mock('./DownloadCoordinator.js', () => {
  return {
    DownloadCoordinator: class MockCoordinator {
      stopped = false;
      start = vi.fn().mockResolvedValue(undefined);
    },
  };
});

import { seedChannel, seedNews } from '../__tests__/seed.js';
import { createTestDb } from '../__tests__/testDb.js';
import type { TestDb } from '../__tests__/testDb.js';

let testDb: TestDb;

vi.mock('../db/index.js', () => ({
  get client() {
    return testDb.client;
  },
  get db() {
    return testDb.db;
  },
}));

import {
  enqueueTask,
  prioritizeTask,
  getActiveTasks,
  startWorkerPool,
  isWorkerPoolStopped,
} from './downloadManager.js';
import { downloadProgressEmitter } from './downloadProgress.js';

describe('downloadManager — public API (integration)', () => {
  let channelId: number;
  let newsId: number;

  beforeAll(async () => {
    testDb = await createTestDb();
  });

  beforeEach(async () => {
    await testDb.client.execute('DELETE FROM downloads');
    await testDb.client.execute('DELETE FROM news');
    await testDb.client.execute('DELETE FROM channels');
    vi.clearAllMocks();

    const ch = await seedChannel(testDb.db);
    channelId = ch.id;
    const n = await seedNews(testDb.db, channelId);
    newsId = n.id;
  });

  // ── enqueueTask ──────────────────────────────────────────────────────────

  describe('enqueueTask', () => {
    it('queues images for filtered news without allowing background full media', async () => {
      await testDb.client.execute('UPDATE news SET is_filtered = 1 WHERE id = ?', [newsId]);
      await enqueueTask(newsId, 'image');
      await enqueueTask(newsId, 'media');

      expect(await getActiveTasks()).toEqual([expect.objectContaining({ newsId, type: 'image', status: 'pending' })]);
    });

    it.each(['failed', 'done'])('clears processedAt when re-enqueuing a %s image', async (status) => {
      await enqueueTask(newsId, 'image');
      await testDb.client.execute('UPDATE downloads SET status = ?, processed_at = 123 WHERE news_id = ?', [
        status,
        newsId,
      ]);

      await enqueueTask(newsId, 'image', undefined, 10);

      expect(await getActiveTasks()).toEqual([
        expect.objectContaining({ type: 'image', status: 'pending', processedAt: null }),
      ]);
    });

    it('does not enqueue background media for filtered news', async () => {
      await testDb.client.execute('UPDATE news SET is_filtered = 1 WHERE id = ?', [newsId]);

      await enqueueTask(newsId, 'media');

      const rows = await testDb.client.execute('SELECT * FROM downloads');
      expect(rows.rows).toHaveLength(0);
      expect(downloadProgressEmitter.emit).not.toHaveBeenCalled();
    });

    it('allows an explicit media download for filtered news', async () => {
      await testDb.client.execute('UPDATE news SET is_filtered = 1 WHERE id = ?', [newsId]);

      await enqueueTask(newsId, 'media', undefined, 10);

      const rows = await testDb.client.execute('SELECT * FROM downloads');
      expect(rows.rows).toHaveLength(1);
      expect(rows.rows[0].priority).toBe(10);
    });

    it('inserts a pending task and emits wakeup', async () => {
      await enqueueTask(newsId, 'media', undefined, 0);

      const rows = await testDb.client.execute('SELECT * FROM downloads WHERE news_id = ?', [newsId]);
      expect(rows.rows).toHaveLength(1);
      expect(rows.rows[0].type).toBe('media');
      expect(rows.rows[0].status).toBe('pending');
      expect(rows.rows[0].priority).toBe(0);
      expect(downloadProgressEmitter.emit).toHaveBeenCalledWith('wakeup');
    });

    it('inserts an article task with url', async () => {
      await enqueueTask(newsId, 'article', 'https://example.com', 0);

      const rows = await testDb.client.execute('SELECT * FROM downloads WHERE news_id = ?', [newsId]);
      expect(rows.rows).toHaveLength(1);
      expect(rows.rows[0].type).toBe('article');
      expect(rows.rows[0].url).toBe('https://example.com');
    });

    it('keeps MAX(priority) on conflict', async () => {
      await enqueueTask(newsId, 'media', undefined, 0);
      await enqueueTask(newsId, 'media', undefined, 10);

      const rows = await testDb.client.execute('SELECT * FROM downloads WHERE news_id = ?', [newsId]);
      expect(rows.rows).toHaveLength(1);
      expect(rows.rows[0].priority).toBe(10);
    });

    it('does not downgrade priority on re-enqueue', async () => {
      await enqueueTask(newsId, 'media', undefined, 10);
      await enqueueTask(newsId, 'media', undefined, 0);

      const rows = await testDb.client.execute('SELECT * FROM downloads WHERE news_id = ?', [newsId]);
      expect(rows.rows[0].priority).toBe(10);
    });

    it('resets failed task to pending on re-enqueue', async () => {
      await enqueueTask(newsId, 'media', undefined, 0);
      await testDb.client.execute("UPDATE downloads SET status = 'failed', error = 'some error' WHERE news_id = ?", [
        newsId,
      ]);

      await enqueueTask(newsId, 'media', undefined, 0);

      const rows = await testDb.client.execute('SELECT * FROM downloads WHERE news_id = ?', [newsId]);
      expect(rows.rows[0].status).toBe('pending');
      expect(rows.rows[0].error).toBeNull();
    });

    it('resets done task to pending only for user-initiated priority', async () => {
      await enqueueTask(newsId, 'media', undefined, 0);
      await testDb.client.execute("UPDATE downloads SET status = 'done' WHERE news_id = ?", [newsId]);

      // Background re-enqueue (priority=0) should NOT reset done
      await enqueueTask(newsId, 'media', undefined, 0);
      let rows = await testDb.client.execute('SELECT * FROM downloads WHERE news_id = ?', [newsId]);
      expect(rows.rows[0].status).toBe('done');

      // User-initiated (priority=10) should reset done → pending
      await enqueueTask(newsId, 'media', undefined, 10);
      rows = await testDb.client.execute('SELECT * FROM downloads WHERE news_id = ?', [newsId]);
      expect(rows.rows[0].status).toBe('pending');
    });

    it('preserves url via COALESCE on conflict', async () => {
      await enqueueTask(newsId, 'article', 'https://example.com', 0);
      await enqueueTask(newsId, 'article', undefined, 10);

      const rows = await testDb.client.execute('SELECT * FROM downloads WHERE news_id = ?', [newsId]);
      expect(rows.rows[0].url).toBe('https://example.com');
    });
  });

  // ── prioritizeTask ───────────────────────────────────────────────────────

  describe('prioritizeTask', () => {
    it('returns false for a missing task without announcing a successful change', async () => {
      expect(await prioritizeTask(99999)).toBe(false);
      expect(downloadProgressEmitter.emit).not.toHaveBeenCalled();
    });

    it('announces queue changes so other clients refresh priority and ordering', async () => {
      await enqueueTask(newsId, 'media');
      const [task] = await getActiveTasks();
      vi.clearAllMocks();

      expect(await prioritizeTask(task.id)).toBe(true);
      expect(downloadProgressEmitter.emit).toHaveBeenCalledWith('queue_changed');
    });

    it('clears the completion timestamp when retrying a failed manual task', async () => {
      await enqueueTask(newsId, 'media', undefined, 10);
      const [task] = await getActiveTasks();
      await testDb.client.execute(
        "UPDATE downloads SET status = 'failed', error = 'err', processed_at = 123 WHERE id = ?",
        [task.id],
      );
      await prioritizeTask(task.id);
      const [updated] = await getActiveTasks();
      expect(updated).toMatchObject({ status: 'pending', error: null, processedAt: null, priority: 10 });
    });

    it('sets priority to 10 and emits wakeup', async () => {
      await enqueueTask(newsId, 'media', undefined, 0);
      const rows = await testDb.client.execute('SELECT id FROM downloads WHERE news_id = ?', [newsId]);
      const taskId = rows.rows[0].id as number;

      vi.clearAllMocks();
      await prioritizeTask(taskId);

      const updated = await testDb.client.execute('SELECT * FROM downloads WHERE id = ?', [taskId]);
      expect(updated.rows[0].priority).toBe(10);
      expect(downloadProgressEmitter.emit).toHaveBeenCalledWith('wakeup');
    });

    it('resets failed task to pending when prioritized', async () => {
      await enqueueTask(newsId, 'media', undefined, 0);
      const rows = await testDb.client.execute('SELECT id FROM downloads WHERE news_id = ?', [newsId]);
      const taskId = rows.rows[0].id as number;

      await testDb.client.execute("UPDATE downloads SET status = 'failed', error = 'err' WHERE id = ?", [taskId]);

      await prioritizeTask(taskId);

      const updated = await testDb.client.execute('SELECT * FROM downloads WHERE id = ?', [taskId]);
      expect(updated.rows[0].status).toBe('pending');
      expect(updated.rows[0].error).toBeNull();
    });

    it('does not change status of pending task', async () => {
      await enqueueTask(newsId, 'media', undefined, 0);
      const rows = await testDb.client.execute('SELECT id FROM downloads WHERE news_id = ?', [newsId]);
      const taskId = rows.rows[0].id as number;

      await prioritizeTask(taskId);

      const updated = await testDb.client.execute('SELECT * FROM downloads WHERE id = ?', [taskId]);
      expect(updated.rows[0].status).toBe('pending');
    });
  });

  // ── getActiveTasks ───────────────────────────────────────────────────────

  describe('getActiveTasks', () => {
    it.each([null, ['channel/preview.jpg', 'channel/photo.jpg']])(
      'retains done image tasks with their current paths (%j) for reconnect',
      async (paths) => {
        await enqueueTask(newsId, 'image');
        await testDb.client.execute("UPDATE downloads SET status = 'done', processed_at = 123 WHERE news_id = ?", [
          newsId,
        ]);
        await testDb.client.execute('UPDATE news SET local_media_path = ?, local_media_paths = ? WHERE id = ?', [
          paths?.[0] ?? null,
          paths ? JSON.stringify(paths) : null,
          newsId,
        ]);
        await enqueueTask(newsId, 'media');
        await testDb.client.execute("UPDATE downloads SET status = 'done' WHERE type = 'media'");

        expect(await getActiveTasks()).toEqual([
          expect.objectContaining({
            newsId,
            type: 'image',
            status: 'done',
            processedAt: 123,
            channelId,
            localMediaPath: paths?.[0] ?? null,
            localMediaPaths: paths,
          }),
        ]);
      },
    );

    it('lists manual requests before all images, including previously queued photos, then other media', async () => {
      const video = await seedNews(testDb.db, channelId, { mediaType: 'video' });
      const photo = await seedNews(testDb.db, channelId, { mediaType: 'photo' });
      const imageDocument = await seedNews(testDb.db, channelId, { mediaType: 'document' });
      const manual = await seedNews(testDb.db, channelId, { mediaType: 'audio' });
      await enqueueTask(video.id, 'media');
      await enqueueTask(photo.id, 'media');
      await enqueueTask(imageDocument.id, 'media', undefined, 5);
      await enqueueTask(manual.id, 'media', undefined, 10);

      expect((await getActiveTasks()).map((task) => task.newsId)).toEqual([
        manual.id,
        photo.id,
        imageDocument.id,
        video.id,
      ]);
    });

    it('returns empty array when no tasks', async () => {
      const tasks = await getActiveTasks();
      expect(tasks).toEqual([]);
    });

    it('returns pending and failed tasks with channel context', async () => {
      await enqueueTask(newsId, 'media', undefined, 0);

      const tasks = await getActiveTasks();
      expect(tasks).toHaveLength(1);
      expect(tasks[0].newsId).toBe(newsId);
      expect(tasks[0].type).toBe('media');
      expect(tasks[0].status).toBe('pending');
      expect(tasks[0].channelName).toBeDefined();
    });

    it('excludes done tasks', async () => {
      await enqueueTask(newsId, 'media', undefined, 0);
      await testDb.client.execute("UPDATE downloads SET status = 'done' WHERE news_id = ?", [newsId]);

      const tasks = await getActiveTasks();
      expect(tasks).toHaveLength(0);
    });

    it('orders by priority desc, then created_at asc', async () => {
      const n2 = await seedNews(testDb.db, channelId);

      await enqueueTask(newsId, 'media', undefined, 0);
      await enqueueTask(n2.id, 'media', undefined, 10);

      const tasks = await getActiveTasks();
      expect(tasks).toHaveLength(2);
      expect(tasks[0].newsId).toBe(n2.id); // priority 10 first
      expect(tasks[1].newsId).toBe(newsId); // priority 0 second
    });
  });

  // ── isWorkerPoolStopped ────────────────────────────────────────────────

  describe('isWorkerPoolStopped', () => {
    it('returns false when no coordinator is created', () => {
      expect(isWorkerPoolStopped()).toBe(false);
    });

    it('returns false after startWorkerPool when pool is healthy', () => {
      startWorkerPool(2);
      expect(isWorkerPoolStopped()).toBe(false);
    });
  });
});
