import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Mocks ──────────────────────────────────────────────────────────────────

vi.mock('../config.js', () => ({
  JWT_SECRET: 'test-secret-key',
  JWT_ACCESS_EXPIRES_SEC: 900,
  REFRESH_EXPIRES_DAYS: 7,
}));

vi.mock('../logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), fatal: vi.fn(), debug: vi.fn() },
}));

vi.mock('../services/downloadManager.js', () => ({
  enqueueTask: vi.fn().mockResolvedValue(undefined),
  prioritizeTask: vi.fn().mockResolvedValue(true),
  getActiveTasks: vi.fn().mockResolvedValue([]),
  startWorkerPool: vi.fn(),
  isWorkerPoolStopped: vi.fn().mockReturnValue(false),
}));

vi.mock('../services/downloadProgress.js', async () => {
  const { EventEmitter } = await import('node:events');
  return { downloadProgressEmitter: new EventEmitter() };
});

import { Hono } from 'hono';
import { createTestUser, authHeaders } from '../__tests__/auth.js';
import { seedChannel, seedNews, seedDownload } from '../__tests__/seed.js';
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

import { authMiddleware } from '../middleware/auth.js';
import { enqueueTask, prioritizeTask, getActiveTasks } from '../services/downloadManager.js';
import { downloadProgressEmitter } from '../services/downloadProgress.js';
import downloadsRouter from './downloads.js';

function createApp() {
  const app = new Hono();
  app.use('/api/*', authMiddleware);
  app.route('/api/downloads', downloadsRouter);
  return app;
}

describe('Downloads routes (integration)', () => {
  let app: ReturnType<typeof createApp>;
  let headers: Record<string, string>;

  beforeAll(async () => {
    testDb = await createTestDb();
    const user = await createTestUser(testDb.db);
    headers = await authHeaders(user.id);
  });

  beforeEach(async () => {
    await testDb.client.execute('DELETE FROM downloads');
    await testDb.client.execute('DELETE FROM news');
    await testDb.client.execute('DELETE FROM channels');
    app = createApp();
    vi.clearAllMocks();
  });

  // ── GET /api/downloads ────────────────────────────────────────────────────

  it('streams task removals and unregisters the listener on disconnect', async () => {
    const controller = new AbortController();
    const response = await app.request('/api/downloads/stream', { headers, signal: controller.signal });
    const reader = response.body!.getReader();
    try {
      await reader.read(); // init event
      await vi.waitFor(() => expect(downloadProgressEmitter.listenerCount('tasks_removed')).toBe(1));
      downloadProgressEmitter.emit('tasks_removed', [10, 20]);
      const { value } = await reader.read();
      expect(new TextDecoder().decode(value)).toContain('event: tasks_removed\ndata: {"newsIds":[10,20]}');
    } finally {
      controller.abort();
      await reader.cancel();
    }
    expect(downloadProgressEmitter.listenerCount('tasks_removed')).toBe(0);
  });

  it('streams individual cancellation and priority changes, then cleans up listeners', async () => {
    const controller = new AbortController();
    const response = await app.request('/api/downloads/stream', { headers, signal: controller.signal });
    const reader = response.body!.getReader();
    try {
      await reader.read();
      await vi.waitFor(() => expect(downloadProgressEmitter.listenerCount('task_removed')).toBe(1));
      downloadProgressEmitter.emit('task_removed', 42);
      expect(new TextDecoder().decode((await reader.read()).value)).toContain(
        'event: task_removed\ndata: {"taskId":42}',
      );
      downloadProgressEmitter.emit('queue_changed');
      expect(new TextDecoder().decode((await reader.read()).value)).toContain('event: queue_changed\ndata: {}');
    } finally {
      controller.abort();
      await reader.cancel();
    }
    expect(downloadProgressEmitter.listenerCount('task_removed')).toBe(0);
    expect(downloadProgressEmitter.listenerCount('queue_changed')).toBe(0);
  });

  describe('GET /api/downloads', () => {
    it.each([null, ['channel/preview.jpg', 'channel/photo.jpg']])(
      'returns retained done images with path context (%j), including no-path completions',
      async (paths) => {
        const tasks = [
          {
            id: 1,
            newsId: 10,
            type: 'image',
            status: 'done',
            priority: 0,
            localMediaPath: paths?.[0] ?? null,
            localMediaPaths: paths,
          },
        ];
        vi.mocked(getActiveTasks).mockResolvedValueOnce(tasks as never);

        const res = await app.request('/api/downloads', { headers });

        expect(res.status).toBe(200);
        expect(await res.json()).toEqual(tasks);
      },
    );

    it('includes retained done images in the SSE reconnect snapshot', async () => {
      const tasks = [{ id: 1, newsId: 10, type: 'image', status: 'done', localMediaPath: null, localMediaPaths: null }];
      vi.mocked(getActiveTasks).mockResolvedValueOnce(tasks as never);
      const controller = new AbortController();
      const response = await app.request('/api/downloads/stream', { headers, signal: controller.signal });
      const reader = response.body!.getReader();
      try {
        expect(new TextDecoder().decode((await reader.read()).value)).toContain(
          `event: init\ndata: ${JSON.stringify(tasks)}`,
        );
      } finally {
        controller.abort();
        await reader.cancel();
      }
    });

    it('returns 401 without auth', async () => {
      const res = await app.request('/api/downloads');
      expect(res.status).toBe(401);
    });

    it('returns active tasks from downloadManager', async () => {
      const mockTasks = [{ id: 1, newsId: 10, type: 'media', status: 'pending', priority: 0 }];
      vi.mocked(getActiveTasks).mockResolvedValueOnce(mockTasks as never);

      const res = await app.request('/api/downloads', { headers });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual(mockTasks);
    });
  });

  // ── POST /api/downloads ───────────────────────────────────────────────────

  describe('POST /api/downloads', () => {
    it.each(['image', 'media', 'article'])('requires authentication for %s tasks', async (type) => {
      for (const authorization of [undefined, 'Bearer invalid-token']) {
        const res = await app.request('/api/downloads', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(authorization ? { Authorization: authorization } : {}),
          },
          body: JSON.stringify({ newsId: 1, type }),
        });
        expect(res.status).toBe(401);
      }
      expect(enqueueTask).not.toHaveBeenCalled();
    });

    it.each([undefined, 0])('accepts authenticated image tasks with priority %s', async (priority) => {
      const res = await app.request('/api/downloads', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ newsId: 1, type: 'image', priority }),
      });

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ success: true });
      expect(enqueueTask).toHaveBeenCalledWith(1, 'image', undefined, priority ?? 10);
    });

    it('enqueues a download task with default priority=10', async () => {
      const res = await app.request('/api/downloads', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ newsId: 1, type: 'media' }),
      });

      expect(res.status).toBe(200);
      expect(enqueueTask).toHaveBeenCalledWith(1, 'media', undefined, 10);
    });

    it('passes url and custom priority', async () => {
      const res = await app.request('/api/downloads', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ newsId: 5, type: 'article', url: 'https://example.com', priority: 0 }),
      });

      expect(res.status).toBe(200);
      expect(enqueueTask).toHaveBeenCalledWith(5, 'article', 'https://example.com', 0);
    });
  });

  // ── PATCH /api/downloads/:id/prioritize ───────────────────────────────────

  describe('PATCH /api/downloads/:id/prioritize', () => {
    it('returns 404 for a missing task instead of silently succeeding', async () => {
      vi.mocked(prioritizeTask).mockResolvedValueOnce(false as never);
      const res = await app.request('/api/downloads/99999/prioritize', { method: 'PATCH', headers });
      expect(res.status).toBe(404);
    });

    it('rejects malformed IDs instead of prioritizing a different task', async () => {
      const res = await app.request('/api/downloads/42oops/prioritize', { method: 'PATCH', headers });
      expect(res.status).toBe(400);
      expect(prioritizeTask).not.toHaveBeenCalled();
    });

    it('calls prioritizeTask with the correct id', async () => {
      const res = await app.request('/api/downloads/42/prioritize', {
        method: 'PATCH',
        headers,
      });

      expect(res.status).toBe(200);
      expect(prioritizeTask).toHaveBeenCalledWith(42);
    });
  });

  // ── DELETE /api/downloads/:id ─────────────────────────────────────────────

  describe('DELETE /api/downloads/:id', () => {
    it('broadcasts removal by task ID without removing sibling tasks for the same news', async () => {
      const ch = await seedChannel(testDb.db);
      const n = await seedNews(testDb.db, ch.id);
      const dl = await seedDownload(testDb.db, n.id);
      const onRemoved = vi.fn();
      downloadProgressEmitter.once('task_removed', onRemoved);

      const res = await app.request(`/api/downloads/${dl.id}`, { method: 'DELETE', headers });

      expect(res.status).toBe(200);
      expect(onRemoved).toHaveBeenCalledWith(dl.id);
      downloadProgressEmitter.off('task_removed', onRemoved);
    });

    it('does not pretend to cancel an active network download', async () => {
      const ch = await seedChannel(testDb.db);
      const n = await seedNews(testDb.db, ch.id);
      const dl = await seedDownload(testDb.db, n.id, { status: 'processing' });
      const res = await app.request(`/api/downloads/${dl.id}`, { method: 'DELETE', headers });
      expect(res.status).toBe(409);
      const rows = await testDb.client.execute('SELECT id FROM downloads WHERE id = ?', [dl.id]);
      expect(rows.rows).toHaveLength(1);
    });

    it('rejects malformed IDs', async () => {
      const res = await app.request('/api/downloads/42oops', { method: 'DELETE', headers });
      expect(res.status).toBe(400);
    });

    it('deletes a download task from the DB', async () => {
      const ch = await seedChannel(testDb.db);
      const n = await seedNews(testDb.db, ch.id);
      const dl = await seedDownload(testDb.db, n.id);

      const res = await app.request(`/api/downloads/${dl.id}`, {
        method: 'DELETE',
        headers,
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
    });

    it('returns 404 for non-existent task', async () => {
      const res = await app.request('/api/downloads/99999', {
        method: 'DELETE',
        headers,
      });
      expect(res.status).toBe(404);
    });
  });
});
