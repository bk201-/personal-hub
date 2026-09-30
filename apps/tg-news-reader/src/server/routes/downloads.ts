import { zValidator } from '@hono/zod-validator';
import { and, eq, inArray } from 'drizzle-orm';
import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import type { DownloadTask } from '../../shared/types.js';
import { db } from '../db/index.js';
import { downloads } from '../db/schema.js';
import { enqueueTask, getActiveTasks, prioritizeTask } from '../services/downloadManager.js';
import { downloadProgressEmitter } from '../services/downloadProgress.js';
import { createDownloadSchema } from './schemas.js';

const router = new Hono();

function parseTaskId(value: string): number | null {
  const id = Number(value);
  return /^\d+$/.test(value) && Number.isSafeInteger(id) && id > 0 ? id : null;
}

// GET /api/downloads — active tasks plus retained done images for reconnects
router.get('/', async (c) => {
  const tasks = await getActiveTasks();
  return c.json(tasks);
});

// POST /api/downloads — enqueue a task (user-initiated → default priority=10)
router.post('/', zValidator('json', createDownloadSchema), async (c) => {
  const body = c.req.valid('json');
  const priority = body.priority ?? 10;
  await enqueueTask(body.newsId, body.type, body.url, priority);
  return c.json({ success: true });
});

// PATCH /api/downloads/:id/prioritize — boost to priority=10, reset failed → pending
router.patch('/:id/prioritize', async (c) => {
  const id = parseTaskId(c.req.param('id'));
  if (id === null) return c.json({ error: 'Invalid task ID' }, 400);
  if (!(await prioritizeTask(id))) return c.json({ error: 'Task not found' }, 404);
  return c.json({ success: true });
});

// DELETE /api/downloads/:id — cancel a pending or failed task
router.delete('/:id', async (c) => {
  const id = parseTaskId(c.req.param('id'));
  if (id === null) return c.json({ error: 'Invalid task ID' }, 400);
  // Atomically guard against a worker claiming the task after the user clicked.
  const [deleted] = await db
    .delete(downloads)
    .where(and(eq(downloads.id, id), inArray(downloads.status, ['pending', 'failed'])))
    .returning();
  if (!deleted) {
    const [existing] = await db.select({ id: downloads.id }).from(downloads).where(eq(downloads.id, id));
    if (!existing) return c.json({ error: 'Task not found' }, 404);
    return c.json({ error: 'Only pending or failed tasks can be cancelled' }, 409);
  }
  downloadProgressEmitter.emit('task_removed', id);
  return c.json({ success: true });
});

// GET /api/downloads/stream — SSE stream for real-time task updates
router.get('/stream', (c) => {
  const abortSignal = c.req.raw.signal;
  return streamSSE(c, async (stream) => {
    // Send current state on connect
    const activeTasks = await getActiveTasks();
    await stream.writeSSE({ event: 'init', data: JSON.stringify(activeTasks) });

    await new Promise<void>((resolve) => {
      const onTaskUpdate = (task: DownloadTask) => {
        void stream.writeSSE({ event: 'task_update', data: JSON.stringify(task) });
      };
      const onTasksRemoved = (newsIds: number[]) => {
        void stream.writeSSE({ event: 'tasks_removed', data: JSON.stringify({ newsIds }) });
      };
      const onTaskRemoved = (taskId: number) => {
        void stream.writeSSE({ event: 'task_removed', data: JSON.stringify({ taskId }) });
      };
      const onQueueChanged = () => {
        void stream.writeSSE({ event: 'queue_changed', data: '{}' });
      };
      downloadProgressEmitter.on('task_update', onTaskUpdate);
      downloadProgressEmitter.on('tasks_removed', onTasksRemoved);
      downloadProgressEmitter.on('task_removed', onTaskRemoved);
      downloadProgressEmitter.on('queue_changed', onQueueChanged);
      abortSignal.addEventListener('abort', () => {
        downloadProgressEmitter.off('task_update', onTaskUpdate);
        downloadProgressEmitter.off('tasks_removed', onTasksRemoved);
        downloadProgressEmitter.off('task_removed', onTaskRemoved);
        downloadProgressEmitter.off('queue_changed', onQueueChanged);
        resolve();
      });
    });
  });
});

export default router;
