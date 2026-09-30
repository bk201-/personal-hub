/**
 * Download Coordinator — worker thread management.
 *
 * Spawns N worker_threads for article, media and image tasks.
 * The coordinator:
 *   - Polls DB for pending tasks and dispatches them to available workers
 *   - Routes Telegram IPC messages (tg:*) from workers to telegramBridge
 *   - Emits SSE events via downloadProgressEmitter
 *   - Pool-level circuit breaker: ≥ ⌈N × ratio⌉ crashes in window → fatal + exit
 */

import { Worker } from 'worker_threads';
import { and, eq, getTableColumns, inArray, isNull, sql } from 'drizzle-orm';
import type { DownloadTask } from '../../shared/types.js';
import {
  ARTICLE_WORKER_CONCURRENCY,
  DOWNLOAD_TASK_CLEANUP_DELAY_MS,
  WORKER_POOL_CRASH_THRESHOLD_RATIO,
  WORKER_POOL_CRASH_WINDOW_MS,
  WORKER_RESTART_BASE_MS,
  WORKER_RESTART_JITTER_MS,
} from '../config.js';
import { db } from '../db/index.js';
import { channels, downloads, news } from '../db/schema.js';
import { logger } from '../logger.js';
import { DB_POLL_POLICY, withRetry } from '../utils/retry.js';
import { sendAlert } from './alertBot.js';
import { downloadOrderBy, downloadPriority } from './downloadPriority.js';
import { downloadProgressEmitter, emitTaskUpdate } from './downloadProgress.js';
import { downloadStorage, isStorageCapacityError, StoragePausedError } from './downloadStorage.js';
import { handleBridgeMessage, isBridgeMessage } from './telegramBridge.js';

const WAKEUP_EVENT = 'wakeup';

// Apply to both selection and the atomic claim: concurrent polls can hold stale candidates.
const noMediaConflict = sql`(
  ${downloads.type} NOT IN ('media', 'image') OR NOT EXISTS (
    SELECT 1 FROM downloads AS active_download
    WHERE active_download.news_id = ${downloads.newsId}
      AND active_download.id != ${downloads.id}
      AND active_download.type IN ('media', 'image')
      AND active_download.status = 'processing'
  )
)`;

// ─── Context query (for SSE payloads) ────────────────────────────────────────

async function getTaskWithContext(id: number): Promise<DownloadTask | null> {
  const [row] = await db
    .select({
      id: downloads.id,
      newsId: downloads.newsId,
      type: downloads.type,
      url: downloads.url,
      priority: downloadPriority,
      status: downloads.status,
      error: downloads.error,
      createdAt: downloads.createdAt,
      processedAt: downloads.processedAt,
      newsText: news.text,
      channelId: news.channelId,
      channelName: channels.name,
      localMediaPath: news.localMediaPath,
      localMediaPaths: news.localMediaPaths,
    })
    .from(downloads)
    .innerJoin(news, eq(downloads.newsId, news.id))
    .innerJoin(channels, eq(news.channelId, channels.id))
    .where(eq(downloads.id, id));

  if (!row) return null;
  return {
    ...row,
    type: row.type as DownloadTask['type'],
    status: row.status as DownloadTask['status'],
    url: row.url ?? null,
    error: row.error ?? null,
    newsText: row.newsText || undefined,
    channelId: row.channelId || undefined,
    channelName: row.channelName || undefined,
    localMediaPath: row.localMediaPath ?? null,
    localMediaPaths: row.localMediaPaths ?? null,
  };
}

// ─── Worker message types ─────────────────────────────────────────────────────

interface DoneMsg {
  type: 'done';
  taskId: number;
}
interface ErrorMsg {
  type: 'error';
  taskId: number;
  message: string;
  code?: string;
}
type WorkerMsg = DoneMsg | ErrorMsg | { type: string };

// ─── Coordinator ──────────────────────────────────────────────────────────────

export class DownloadCoordinator {
  private readonly workers = new Map<number, Worker>();
  private readonly available = new Set<number>();
  private readonly crashLog: number[] = [];
  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly cleanupTimers = new Map<number, ReturnType<typeof setTimeout>>();
  private readonly concurrency: number;
  private _stopped = false;
  /** Track slots independently of DB rows, which read-news cleanup may delete. */
  private readonly articleWorkers = new Set<number>();
  /** Max concurrent article (jsdom) tasks — capped to avoid OOM. */
  private readonly maxConcurrentArticles: number;

  constructor(concurrency: number) {
    this.concurrency = concurrency;
    this.maxConcurrentArticles = Math.min(ARTICLE_WORKER_CONCURRENCY, concurrency);
  }

  /** Whether the pool has been stopped by the circuit breaker. Exposed for health checks. */
  get stopped(): boolean {
    return this._stopped;
  }

  async start(): Promise<void> {
    await db.update(downloads).set({ status: 'pending' }).where(eq(downloads.status, 'processing'));
    const completed = await db
      .select({ id: downloads.id, processedAt: downloads.processedAt })
      .from(downloads)
      .where(eq(downloads.status, 'done'));
    for (const task of completed) {
      const remaining =
        task.processedAt === null ? 0 : task.processedAt * 1000 + DOWNLOAD_TASK_CLEANUP_DELAY_MS - Date.now();
      if (remaining <= 0) await this.removeDoneTask(task.id, task.processedAt);
      else this.scheduleCleanup(task.id, task.processedAt, Math.min(remaining, DOWNLOAD_TASK_CLEANUP_DELAY_MS));
    }
    for (let i = 0; i < this.concurrency; i++) this.spawnWorker(i);
    downloadProgressEmitter.on(WAKEUP_EVENT, () => void this.tryDispatch());
    downloadProgressEmitter.on('storage_freed', () => void this.onStorageFreed());
    downloadProgressEmitter.on('tasks_removed', () => void this.onStorageFreed());
    downloadProgressEmitter.on('task_removed', () => void this.onStorageFreed());
    logger.info(
      { module: 'download', concurrency: this.concurrency, maxConcurrentArticles: this.maxConcurrentArticles },
      `worker pool started (${this.concurrency} workers, max ${this.maxConcurrentArticles} article tasks)`,
    );
  }

  private spawnWorker(id: number): void {
    if (this._stopped) return;
    const isDev = process.env.NODE_ENV !== 'production';
    // Dev:  use a plain .mjs shim that calls register('tsx/esm') then
    //       dynamically imports downloadWorker.ts — the only reliable way
    //       to activate tsx hooks in worker_threads with Node.js 22.12+.
    // Prod: use the compiled .js directly, no loader needed.
    const workerUrl = new URL(
      isDev ? '../workers/downloadWorkerShim.mjs' : '../workers/downloadWorker.js',
      import.meta.url,
    );

    const worker = new Worker(workerUrl, {
      workerData: { workerId: id },
      execArgv: [], // tsx registration is handled inside the shim, not via execArgv
    });

    worker.on('message', (msg: WorkerMsg) => this.handleWorkerMessage(worker, id, msg));
    worker.on('error', (err) => this.handleWorkerCrash(id, err));
    worker.on('exit', (code) => {
      if (code !== 0) this.handleWorkerCrash(id, new Error(`Worker ${id} exited with code ${code}`));
    });

    this.workers.set(id, worker);
    this.available.add(id);
    void this.tryDispatch();
  }

  private handleWorkerCrash(id: number, err: unknown): void {
    this.articleWorkers.delete(id);
    this.available.delete(id);
    this.workers.delete(id);

    // Sliding-window pool circuit breaker
    const now = Date.now();
    const windowStart = now - WORKER_POOL_CRASH_WINDOW_MS;
    while (this.crashLog.length > 0 && this.crashLog[0] < windowStart) this.crashLog.shift();
    this.crashLog.push(now);

    const threshold = Math.ceil(this.concurrency * WORKER_POOL_CRASH_THRESHOLD_RATIO);
    if (this.crashLog.length >= threshold) {
      logger.fatal(
        { module: 'download', crashCount: this.crashLog.length, windowMs: WORKER_POOL_CRASH_WINDOW_MS, threshold },
        'worker pool circuit breaker — too many crashes, stopping pool (server stays alive)',
      );
      void sendAlert(
        `Download worker pool STOPPED: ${this.crashLog.length} crashes in ${WORKER_POOL_CRASH_WINDOW_MS / 1000}s (threshold ${threshold}/${this.concurrency}). Pool disabled — downloads unavailable until restart.`,
        'worker-pool-fatal',
      );
      this._stopped = true;
      // Terminate all remaining workers
      for (const [wId, w] of this.workers) {
        try {
          void w.terminate();
        } catch {
          /* ignore */
        }
        this.available.delete(wId);
      }
      this.workers.clear();
      if (this.pollTimer) {
        clearTimeout(this.pollTimer);
        this.pollTimer = null;
      }
      return;
    }

    const delay = WORKER_RESTART_BASE_MS + Math.floor(Math.random() * WORKER_RESTART_JITTER_MS);
    logger.error({ module: 'download', workerId: id, err }, `worker crashed — restarting in ${delay}ms`);
    void sendAlert(`Download worker ${id} crashed: ${err instanceof Error ? err.message : 'unknown'}`, 'worker-crash');
    setTimeout(() => this.spawnWorker(id), delay);
  }

  private handleWorkerMessage(worker: Worker, workerId: number, msg: WorkerMsg): void {
    if (msg.type === 'storage_freed') {
      void this.onStorageFreed();
      return;
    }
    if (isBridgeMessage(msg)) {
      handleBridgeMessage(worker, msg, workerId);
      return;
    }
    if (msg.type === 'done') void this.onTaskDone(workerId, (msg as DoneMsg).taskId);
    else if (msg.type === 'error') void this.onTaskError(workerId, msg as ErrorMsg);
  }

  private async onTaskDone(workerId: number, taskId: number): Promise<void> {
    this.articleWorkers.delete(workerId);
    const now = Math.floor(Date.now() / 1000);
    await db.update(downloads).set({ status: 'done', processedAt: now }).where(eq(downloads.id, taskId));
    const doneTask = await getTaskWithContext(taskId);
    if (doneTask) {
      emitTaskUpdate({ ...doneTask, status: 'done' });
      this.scheduleCleanup(taskId, now);
    }
    this.available.add(workerId);
    void this.tryDispatch();
  }

  private cancelCleanup(taskId: number): void {
    const timer = this.cleanupTimers.get(taskId);
    if (timer !== undefined) clearTimeout(timer);
    this.cleanupTimers.delete(taskId);
  }

  private scheduleCleanup(taskId: number, processedAt: number | null, delay = DOWNLOAD_TASK_CLEANUP_DELAY_MS): void {
    this.cancelCleanup(taskId);
    const timer = setTimeout(() => {
      this.cleanupTimers.delete(taskId);
      void this.removeDoneTask(taskId, processedAt);
    }, delay);
    this.cleanupTimers.set(taskId, timer);
  }

  private async removeDoneTask(taskId: number, processedAt: number | null): Promise<void> {
    try {
      const [removed] = await db
        .delete(downloads)
        .where(
          and(
            eq(downloads.id, taskId),
            eq(downloads.status, 'done'),
            processedAt === null ? isNull(downloads.processedAt) : eq(downloads.processedAt, processedAt),
          ),
        )
        .returning({ id: downloads.id });
      if (removed) downloadProgressEmitter.emit('task_removed', removed.id);
    } catch (err) {
      logger.error({ module: 'download', taskId, err }, 'done task cleanup failed');
    }
  }

  private async onTaskError(workerId: number, { taskId, message: errorMsg, code }: ErrorMsg): Promise<void> {
    this.articleWorkers.delete(workerId);
    const storageError = isStorageCapacityError({ message: errorMsg, code });
    if (storageError) downloadStorage.pause(new StoragePausedError(errorMsg));
    const now = Math.floor(Date.now() / 1000);
    await db
      .update(downloads)
      .set({ status: storageError ? 'pending' : 'failed', error: errorMsg, processedAt: storageError ? null : now })
      .where(eq(downloads.id, taskId));
    const failedTask = await getTaskWithContext(taskId);
    if (failedTask) {
      emitTaskUpdate(failedTask);
    }
    if (!storageError && failedTask)
      logger.error({ module: 'download', taskId, err: errorMsg }, 'task permanently failed');
    this.available.add(workerId);
    void this.tryDispatch();
  }

  private async tryDispatch(): Promise<void> {
    if (this._stopped) return;
    if (this.available.size === 0) return;

    if (this.pollTimer !== null) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }

    // Pick the best available worker.
    //
    // Worker pinning rule (prevents jsdom proliferation → OOM):
    //   - Workers with id < maxConcurrentArticles are ARTICLE-capable workers.
    //     They are the ONLY ones allowed to process 'article' tasks (jsdom parsing).
    //     Once such a worker has loaded jsdom into its V8 isolate, jsdom stays
    //     ~100 MB resident. Keeping article tasks pinned to a small set caps
    //     overall jsdom memory at `maxConcurrentArticles × 100 MB`.
    //   - Workers with id ≥ maxConcurrentArticles are MEDIA-ONLY workers. They
    //     never touch jsdom, so their baseline memory stays small.
    //
    // Task selection strategy:
    //   - If an article worker is available, prefer fetching any pending task
    //     (article, media or image) — article workers can process all types.
    //   - If only media-only workers are available, fetch media or image tasks.
    const articleCapableIds: number[] = [];
    const mediaOnlyIds: number[] = [];
    for (const id of this.available) {
      if (id < this.maxConcurrentArticles) articleCapableIds.push(id);
      else mediaOnlyIds.push(id);
    }
    const hasArticleCapable = articleCapableIds.length > 0;
    // Article workers get priority so pending articles don't starve behind media tasks
    const workerId = hasArticleCapable ? articleCapableIds[0] : mediaOnlyIds[0];
    this.available.delete(workerId);

    let task: typeof downloads.$inferSelect | undefined;
    try {
      await downloadStorage.check();
      [task] = await withRetry(
        () => {
          // Media-only workers: never claim article tasks.
          // Article-capable workers: claim anything, but still respect the in-flight cap.
          const canClaimArticle = hasArticleCapable && this.articleWorkers.size < this.maxConcurrentArticles;
          return db
            .select({ ...getTableColumns(downloads), priority: downloadPriority })
            .from(downloads)
            .innerJoin(news, eq(downloads.newsId, news.id))
            .where(
              and(
                eq(downloads.status, 'pending'),
                canClaimArticle ? undefined : inArray(downloads.type, ['media', 'image']),
                noMediaConflict,
              ),
            )
            .orderBy(...downloadOrderBy)
            .limit(1);
        },
        DB_POLL_POLICY,
        'poll',
      );
    } catch (err) {
      if (!(err instanceof StoragePausedError)) {
        if (isStorageCapacityError(err)) downloadStorage.pause(err);
        logger.error({ module: 'download', err }, 'db poll failed permanently — will retry in 1s');
      }
      this.available.add(workerId);
      this.schedulePoll();
      return;
    }

    if (!task) {
      this.available.add(workerId);
      this.schedulePoll();
      return;
    }

    if (downloadStorage.status.paused) {
      this.available.add(workerId);
      this.schedulePoll();
      return;
    }

    const worker = this.workers.get(workerId);
    if (!worker) {
      this.available.delete(workerId);
      void this.tryDispatch();
      return;
    }

    const [claimed] = await db
      .update(downloads)
      .set({ status: 'processing', error: null, processedAt: null })
      .where(and(eq(downloads.id, task.id), eq(downloads.status, 'pending'), noMediaConflict))
      .returning();

    if (!claimed) {
      this.available.add(workerId);
      void this.tryDispatch();
      return;
    }

    // A retry may finish in the same second as its previous generation.
    // Status/timestamp guards alone cannot distinguish those completions.
    this.cancelCleanup(task.id);
    const taskCtx = await getTaskWithContext(task.id);
    if (downloadStorage.status.paused) {
      await db.update(downloads).set({ status: 'pending' }).where(eq(downloads.id, task.id));
      this.available.add(workerId);
      this.schedulePoll();
      return;
    }
    if (taskCtx) emitTaskUpdate({ ...taskCtx, status: 'processing' });

    if (task.type === 'article') this.articleWorkers.add(workerId);

    worker.postMessage({
      type: 'task',
      payload: { id: task.id, newsId: task.newsId, type: task.type, url: task.url, priority: task.priority },
    });

    if (this.available.size > 0) void this.tryDispatch();
  }

  private async onStorageFreed(): Promise<void> {
    await downloadStorage.notifySpaceFreed();
    await this.tryDispatch();
  }

  private schedulePoll(): void {
    if (this.pollTimer !== null) return;
    this.pollTimer = setTimeout(() => {
      this.pollTimer = null;
      void this.tryDispatch();
    }, 1_000);
  }
}
