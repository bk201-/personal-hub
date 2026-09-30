/**
 * Telegram IPC Bridge — main-thread side.
 *
 * Worker threads cannot hold gramjs objects (they are not structurally cloneable).
 * Instead, workers send typed IPC messages to this bridge; the bridge executes
 * the gramjs call in the main thread (through the existing circuit breaker) and
 * posts the serialised result back.
 *
 * Protocol (Worker → Main):
 *   { type: 'tg:downloadMedia', reqId, channelTelegramId, msgId, ignoreLimit }
 *
 * Protocol (Main → Worker):
 *   { type: 'tg:result', reqId, result: string | null }  // localPath or null (no media / size limit)
 *   { type: 'tg:error',  reqId, message: string }
 *
 * reqId is a monotonic counter per worker — used to correlate async round-trips.
 */

import type { Worker } from 'worker_threads';
import { logger } from '../logger.js';
import { downloadMessageMedia, fetchMessageById } from './telegram.js';

// ─── Message types ────────────────────────────────────────────────────────────

export interface TgDownloadMediaMsg {
  type: 'tg:downloadMedia';
  reqId: number;
  channelTelegramId: string;
  msgId: number;
  ignoreLimit: boolean;
  imagesOnly?: boolean;
}

export interface TgResultMsg {
  type: 'tg:result';
  reqId: number;
  result: string | null;
  /** Only set when result is null — distinguishes "no media on message" from "size limit exceeded". */
  reason?: 'no_media' | 'size_limit';
}

export interface TgErrorMsg {
  type: 'tg:error';
  reqId: number;
  message: string;
  code?: string;
}

/** Union of all messages a worker can send to the bridge. */
export type WorkerToMainBridgeMsg = TgDownloadMediaMsg;

/** Union of all replies the bridge sends to a worker. */
export type MainToWorkerBridgeMsg = TgResultMsg | TgErrorMsg;

// ─── Handler ──────────────────────────────────────────────────────────────────

/**
 * Handle a single bridge message from a worker.
 * Call this from the coordinator's `worker.on('message')` handler for messages
 * whose `type` starts with `'tg:'`.
 */
export function handleBridgeMessage(worker: Worker, msg: WorkerToMainBridgeMsg, workerId: number): void {
  if (msg.type === 'tg:downloadMedia') {
    void downloadMediaForWorker(worker, msg, workerId);
  }
}

/**
 * Returns true if `msg.type` belongs to the Telegram bridge protocol.
 * Use this in the coordinator's message handler to route bridge messages.
 */
export function isBridgeMessage(msg: { type: string }): msg is WorkerToMainBridgeMsg {
  return msg.type.startsWith('tg:');
}

// ─── Implementation ───────────────────────────────────────────────────────────

async function downloadMediaForWorker(worker: Worker, msg: TgDownloadMediaMsg, workerId: number): Promise<void> {
  try {
    const tgMsg = await fetchMessageById(msg.channelTelegramId, msg.msgId, { downloadImages: false });

    if (!tgMsg?.rawMedia) {
      // No media on this message — not an error, just nothing to download
      const reply: TgResultMsg = { type: 'tg:result', reqId: msg.reqId, result: null, reason: 'no_media' };
      worker.postMessage(reply);
      return;
    }

    const localPath = await downloadMessageMedia(tgMsg, msg.channelTelegramId, {
      ignoreLimit: msg.imagesOnly ? false : msg.ignoreLimit,
      ...(msg.imagesOnly ? { imagesOnly: true } : {}),
    });

    // null means the file was skipped due to size limit (ignoreLimit=false)
    const reply: TgResultMsg = {
      type: 'tg:result',
      reqId: msg.reqId,
      result: localPath,
      reason: localPath === null ? 'size_limit' : undefined,
    };
    worker.postMessage(reply);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn(
      { module: 'telegram', workerId, reqId: msg.reqId, msgId: msg.msgId, err },
      'bridge: tg:downloadMedia failed',
    );
    const code = err && typeof err === 'object' && 'code' in err ? String(err.code) : undefined;
    const reply: TgErrorMsg = { type: 'tg:error', reqId: msg.reqId, message, code };
    worker.postMessage(reply);
  }
}
