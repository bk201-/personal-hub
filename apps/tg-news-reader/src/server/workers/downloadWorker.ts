/**
 * Download Worker — runs in a worker_threads context.
 *
 * Handles download task types:
 *   - 'article': fetches HTML (with retry), parses with jsdom + Readability (CPU-bound),
 *                writes fullContent to DB via its own libsql connection.
 *   - 'media':   requests gramjs operations from the main thread via IPC bridge,
 *                writes localMediaPath(s) to DB via its own libsql connection.
 *   - 'image':   same path, but only images, even for hidden posts, with size limits.
 *
 * Each worker thread owns:
 *   - Its own libsql client (created when the module is first imported)
 *   - Its own jsdom + Readability instances (lazy-loaded on first article task)
 */
/* oxlint-disable import/first */
import { isMainThread, parentPort, workerData } from 'worker_threads';

if (isMainThread) {
  throw new Error('downloadWorker.ts must be run as a worker_threads Worker, not directly.');
}

import { eq } from 'drizzle-orm';
import type { DownloadType } from '../../shared/types.js';
import { ARTICLE_MAX_HTML_BYTES } from '../config.js';
import { db } from '../db/index.js';
import { news, channels } from '../db/schema.js';
import { logger } from '../logger.js';
import { downloadProgressEmitter } from '../services/downloadProgress.js';
import { parseHtml, buildFullContent } from '../services/readability.js';
import type { TgDownloadMediaMsg, MainToWorkerBridgeMsg } from '../services/telegramBridge.js';
import { deleteAllMediaFiles } from '../utils/mediaFiles.js';
import { withRetry, TASK_POLICY, HTTP_FETCH_POLICY } from '../utils/retry.js';

// ─── Worker identity ──────────────────────────────────────────────────────────

const { workerId } = workerData as { workerId: number };
downloadProgressEmitter.on('storage_freed', () => parentPort!.postMessage({ type: 'storage_freed' }));

// ─── IPC slot for Telegram bridge round-trips ─────────────────────────────────
// The worker processes one task at a time, so at most one IPC call is pending.

type IpcSlot = {
  reqId: number;
  resolve: (result: { path: string | null; reason?: 'no_media' | 'size_limit' }) => void;
  reject: (err: Error) => void;
} | null;

let pendingIpc: IpcSlot = null;
let reqCounter = 0;

async function ipcDownloadMedia(
  newsId: number,
  channelTelegramId: string,
  msgId: number,
  ignoreLimit: boolean,
  imagesOnly: boolean,
): Promise<{ path: string | null; reason?: 'no_media' | 'size_limit' | 'filtered' | 'deleted' }> {
  // Recheck before every file (and retry): filters can change while a task is queued
  // or an album is downloading. Explicit user downloads still bypass this gate.
  const [item] = await db.select({ isFiltered: news.isFiltered }).from(news).where(eq(news.id, newsId));
  if (!item) {
    logger.debug({ module: 'download', workerId, newsId }, 'media cancelled: news was deleted');
    return { path: null, reason: 'deleted' };
  }
  if (!imagesOnly && !ignoreLimit && item.isFiltered === 1) {
    logger.debug({ module: 'download', workerId, newsId }, 'background media skipped: news is filtered');
    return { path: null, reason: 'filtered' };
  }

  return new Promise((resolve, reject) => {
    const reqId = ++reqCounter;
    pendingIpc = { reqId, resolve, reject };
    const msg: TgDownloadMediaMsg = {
      type: 'tg:downloadMedia',
      reqId,
      channelTelegramId,
      msgId,
      ignoreLimit,
      ...(imagesOnly ? { imagesOnly: true } : {}),
    };
    parentPort!.postMessage(msg);
  });
}

// ─── Message types ────────────────────────────────────────────────────────────

interface TaskPayload {
  id: number;
  newsId: number;
  type: DownloadType;
  url: string | null;
  priority: number;
}

interface TaskMsg {
  type: 'task';
  payload: TaskPayload;
}

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

type IncomingMsg = TaskMsg | MainToWorkerBridgeMsg;

// ─── Message router ───────────────────────────────────────────────────────────

parentPort!.on('message', (msg: IncomingMsg) => {
  // Bridge replies: resolve/reject the pending IPC slot
  if (msg.type === 'tg:result') {
    if (pendingIpc?.reqId === msg.reqId) {
      pendingIpc.resolve({ path: msg.result, reason: msg.reason });
      pendingIpc = null;
    }
    return;
  }
  if (msg.type === 'tg:error') {
    if (pendingIpc?.reqId === msg.reqId) {
      pendingIpc.reject(Object.assign(new Error(msg.message), { code: msg.code }));
      pendingIpc = null;
    }
    return;
  }

  // Task from coordinator
  if (msg.type === 'task') {
    void handleTask(msg.payload);
  }
});

// ─── Task handlers ────────────────────────────────────────────────────────────

function pathMessageId(path: string): number {
  return Number(path.match(/(?:^|\/)(\d+)\.[^/]+$/)?.[1]);
}

async function processMediaTask(newsId: number, priority: number, imagesOnly = false): Promise<void> {
  const [row] = await db
    .select({
      telegramMsgId: news.telegramMsgId,
      localMediaPath: news.localMediaPath,
      localMediaPaths: news.localMediaPaths,
      albumMsgIds: news.albumMsgIds,
      channelTelegramId: channels.telegramId,
    })
    .from(news)
    .innerJoin(channels, eq(news.channelId, channels.id))
    .where(eq(news.id, newsId));

  if (!row) {
    logger.debug({ module: 'download', workerId, newsId }, 'media cancelled: news was deleted');
    return;
  }

  // Already downloaded — skip for background tasks (idempotent).
  // User-initiated (priority ≥ 10) always re-downloads — handles the case where
  // files were lost (disk unmount, cleanup) but localMediaPath is still set in DB.
  const existingPaths = new Set([...(row.localMediaPath ? [row.localMediaPath] : []), ...(row.localMediaPaths ?? [])]);
  const cachedIds = new Set([...existingPaths].map(pathMessageId));
  const alreadyDownloaded = row.albumMsgIds
    ? row.albumMsgIds.every((id) => cachedIds.has(id))
    : row.localMediaPath !== null;
  if (!imagesOnly && alreadyDownloaded && priority < 10) return;

  const ignoreLimit = !imagesOnly && priority >= 10;

  const paths: string[] = [];
  let saved = false;
  try {
    for (const msgId of row.albumMsgIds ?? [row.telegramMsgId]) {
      const { path, reason } = await ipcDownloadMedia(newsId, row.channelTelegramId, msgId, ignoreLimit, imagesOnly);
      if (reason === 'filtered' || reason === 'deleted') break;
      if (reason === 'no_media' || reason === 'size_limit') continue;
      if (!path) throw new Error('Download returned no path');
      paths.push(path);
    }

    if (paths.length === 0) return;
    // The coordinator serializes media/image tasks for this news. Merge rather
    // than replace: previews and size skips must never erase cached video paths.
    const merged = [...new Set([...existingPaths, ...paths])];
    if (row.albumMsgIds) {
      const order = new Map(row.albumMsgIds.map((id, index) => [id, index]));
      merged.sort((a, b) => (order.get(pathMessageId(a)) ?? Infinity) - (order.get(pathMessageId(b)) ?? Infinity));
    }
    const [updated] = await db
      .update(news)
      .set({
        localMediaPath: imagesOnly ? (row.localMediaPath ?? merged[0]) : merged[0],
        ...(row.albumMsgIds || merged.length > 1 ? { localMediaPaths: merged } : {}),
      })
      .where(eq(news.id, newsId))
      .returning({ id: news.id });
    saved = !!updated;
  } finally {
    // Cleanup may delete the row while Telegram is writing a file. Do not leave
    // files from that in-flight download (or an interrupted album) orphaned.
    if (!saved && paths.length > 0) {
      const [owner] = await db.select({ id: news.id }).from(news).where(eq(news.id, newsId));
      const orphanPaths = owner ? paths.filter((path) => !existingPaths.has(path)) : paths;
      if (orphanPaths.length > 0) {
        deleteAllMediaFiles(orphanPaths[0], row.albumMsgIds ? orphanPaths : null);
      }
    }
  }
}

async function processArticleTask(newsId: number, url: string): Promise<void> {
  // Fetch HTML with retry — throws on HTTP 5xx or network errors, triggers TASK_POLICY retry
  const response = await withRetry(
    async () => {
      const [item] = await db.select({ id: news.id }).from(news).where(eq(news.id, newsId));
      if (!item) {
        logger.debug({ module: 'download', workerId, newsId }, 'article cancelled: news was deleted');
        return null;
      }
      const r = await fetch(url, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
        },
        signal: AbortSignal.timeout(15_000),
      });
      if (!r.ok) throw new Error(`HTTP error ${r.status} for URL: ${url}`);
      return r;
    },
    HTTP_FETCH_POLICY,
    `article-fetch:${newsId}`,
  );
  if (!response) return;

  // Guard against huge pages — jsdom parsing multiplies memory 5-10×.
  // Treat oversized pages as a permanent failure (no retry) to avoid OOM.
  const contentLength = response.headers.get('content-length');
  if (contentLength && parseInt(contentLength, 10) > ARTICLE_MAX_HTML_BYTES) {
    logger.warn(
      { module: 'download', workerId, newsId, bytes: contentLength },
      `article skipped: Content-Length ${contentLength} exceeds ${ARTICLE_MAX_HTML_BYTES} byte limit`,
    );
    // Throwing a message that starts with "size limit" marks the task as permanently failed
    // (matches the permanent-error guard in the retry policy).
    throw Object.assign(new Error(`size limit: article HTML too large (${contentLength} bytes)`), {
      permanent: true,
    });
  }

  // Stream and count bytes — catches chunked responses that omit Content-Length
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('Response body is not readable');
  }
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > ARTICLE_MAX_HTML_BYTES) {
      await reader.cancel();
      logger.warn(
        { module: 'download', workerId, newsId, bytes: totalBytes },
        `article skipped: streamed body exceeds ${ARTICLE_MAX_HTML_BYTES} byte limit`,
      );
      throw Object.assign(new Error(`size limit: article HTML too large (>${ARTICLE_MAX_HTML_BYTES} bytes)`), {
        permanent: true,
      });
    }
    chunks.push(value);
  }
  const html = new TextDecoder().decode(
    chunks.reduce((acc, chunk) => {
      const merged = new Uint8Array(acc.byteLength + chunk.byteLength);
      merged.set(acc, 0);
      merged.set(chunk, acc.byteLength);
      return merged;
    }, new Uint8Array(0)),
  );

  // CPU-bound: runs in this worker thread — does NOT block the main event loop
  const extracted = await parseHtml(html, url);
  const { content, format } = buildFullContent(extracted);

  if (content) {
    await db.update(news).set({ fullContent: content, fullContentFormat: format }).where(eq(news.id, newsId));
  }
}

// ─── Main task handler ────────────────────────────────────────────────────────

async function handleTask(task: TaskPayload): Promise<void> {
  try {
    await withRetry(
      async () => {
        if (task.type === 'media' || task.type === 'image') {
          await processMediaTask(task.newsId, task.priority, task.type === 'image');
        } else {
          if (!task.url) throw new Error('Article task missing URL');
          await processArticleTask(task.newsId, task.url);
        }
      },
      TASK_POLICY,
      `task:${task.id}`,
    );

    logger.info({ module: 'download', workerId, taskId: task.id, type: task.type }, 'task done');
    const reply: DoneMsg = { type: 'done', taskId: task.id };
    parentPort!.postMessage(reply);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ module: 'download', workerId, taskId: task.id, type: task.type, err }, 'task failed');
    const code = err && typeof err === 'object' && 'code' in err ? String(err.code) : undefined;
    const reply: ErrorMsg = { type: 'error', taskId: task.id, message, code };
    parentPort!.postMessage(reply);
  }
}
