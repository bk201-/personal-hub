import { existsSync } from 'fs';
import { mkdir, readdir, rename, rm, unlink, writeFile } from 'fs/promises';
import { join } from 'path';
import { and, eq, lt } from 'drizzle-orm';
import { OPENAI_TTS_MODEL, OPENAI_TTS_VOICE_DEFAULT, TTS_CACHE_TTL_SEC, TTS_CHUNK_SIZE_CHARS } from '../config.js';
import { db } from '../db/index.js';
import { ttsCache } from '../db/schema.js';
import { logger } from '../logger.js';
import { createTtsClient } from './openaiClient.js';
import { chunkTextForTts, computeTtsHash } from './ttsChunker.js';

const TTS_DIR = join(process.cwd(), 'data', 'tts');

/** Single-flight registry: ensures concurrent identical requests share one generation job. */
const inFlight = new Map<string, Promise<void>>();

export interface TtsJobStatus {
  hash: string;
  status: 'pending' | 'processing' | 'done' | 'failed';
  chunksTotal: number;
  chunksDone: number;
  error: string | null;
}

export interface TtsStartResult extends TtsJobStatus {
  /** True when the cached row was found and is `done` — caller can stream immediately. */
  cached: boolean;
}

/** Per-hash directory containing one MP3 file per chunk (`0.mp3`, `1.mp3`, …). */
export function ttsChunkDir(hash: string): string {
  return join(TTS_DIR, hash);
}

/** Absolute path to a single chunk MP3 (used by the streaming route). */
export function ttsChunkPath(hash: string, idx: number): string {
  return join(ttsChunkDir(hash), `${idx}.mp3`);
}

/**
 * Look up or kick off a TTS generation for the given input.
 *
 * - If a `done` row + chunk dir already exist → returns `cached: true`, bumps lastAccessedAt.
 * - If a row exists with status `pending`/`processing` → returns current status (no new job).
 * - If a row exists with status `failed` → resets to `pending` and re-runs.
 * - Otherwise → inserts a `pending` row and kicks off generation in the background.
 *
 * Never throws for "in progress" cases — only for invalid input or DB errors.
 */
export async function startOrGetTts(text: string, voice?: string): Promise<TtsStartResult> {
  const v = voice && voice.trim() ? voice.trim() : OPENAI_TTS_VOICE_DEFAULT;
  const model = OPENAI_TTS_MODEL;
  const hash = computeTtsHash(text, v, model);
  const now = Math.floor(Date.now() / 1000);

  await mkdir(TTS_DIR, { recursive: true });

  const existing = await db.select().from(ttsCache).where(eq(ttsCache.contentHash, hash)).limit(1);
  const row = existing[0];

  if (row && row.status === 'done' && existsSync(ttsChunkPath(hash, 0))) {
    await db.update(ttsCache).set({ lastAccessedAt: now }).where(eq(ttsCache.contentHash, hash));
    return {
      hash,
      status: 'done',
      chunksTotal: row.chunksTotal,
      chunksDone: row.chunksDone,
      error: null,
      cached: true,
    };
  }

  if (row && (row.status === 'pending' || row.status === 'processing')) {
    return {
      hash,
      status: row.status,
      chunksTotal: row.chunksTotal,
      chunksDone: row.chunksDone,
      error: row.error,
      cached: false,
    };
  }

  // Fresh row, or previous attempt failed / files vanished → (re)start generation
  const chunks = chunkTextForTts(text, TTS_CHUNK_SIZE_CHARS);

  if (row) {
    await db
      .update(ttsCache)
      .set({
        status: 'pending',
        chunksTotal: chunks.length,
        chunksDone: 0,
        error: null,
        lastAccessedAt: now,
      })
      .where(eq(ttsCache.contentHash, hash));
  } else {
    await db.insert(ttsCache).values({
      contentHash: hash,
      voice: v,
      model,
      charCount: text.length,
      status: 'pending',
      chunksTotal: chunks.length,
      chunksDone: 0,
      lastAccessedAt: now,
    });
  }

  void scheduleGeneration(hash, v, model, chunks);

  return {
    hash,
    status: 'pending',
    chunksTotal: chunks.length,
    chunksDone: 0,
    error: null,
    cached: false,
  };
}

/**
 * Read the current job status from the DB. Used by polling clients.
 */
export async function getTtsStatus(hash: string): Promise<TtsJobStatus | null> {
  const rows = await db.select().from(ttsCache).where(eq(ttsCache.contentHash, hash)).limit(1);
  const row = rows[0];
  if (!row) return null;
  return {
    hash,
    status: row.status,
    chunksTotal: row.chunksTotal,
    chunksDone: row.chunksDone,
    error: row.error,
  };
}

/** Bumps lastAccessedAt — called by the audio-streaming route on every hit. */
export async function touchTts(hash: string): Promise<void> {
  await db
    .update(ttsCache)
    .set({ lastAccessedAt: Math.floor(Date.now() / 1000) })
    .where(eq(ttsCache.contentHash, hash));
}

/**
 * Periodic cleanup — deletes rows + chunk dirs where lastAccessedAt is older than TTL.
 * Also sweeps legacy single-file MP3s left over from the Phase 2 initial layout.
 */
export async function cleanupExpiredTts(): Promise<number> {
  const cutoff = Math.floor(Date.now() / 1000) - TTS_CACHE_TTL_SEC;
  const expired = await db
    .select({ contentHash: ttsCache.contentHash })
    .from(ttsCache)
    .where(lt(ttsCache.lastAccessedAt, cutoff));

  let deleted = 0;
  for (const { contentHash } of expired) {
    const dir = ttsChunkDir(contentHash);
    try {
      if (existsSync(dir)) await rm(dir, { recursive: true, force: true });
    } catch (err) {
      logger.warn({ module: 'tts', hash: contentHash, err }, 'failed to delete expired tts chunk dir');
    }
    await db.delete(ttsCache).where(eq(ttsCache.contentHash, contentHash));
    deleted += 1;
  }

  // One-shot cleanup of legacy `{hash}.mp3` single-file cache.
  try {
    if (existsSync(TTS_DIR)) {
      const entries = await readdir(TTS_DIR, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isFile() && /^[0-9a-f]{64}\.mp3$/.test(entry.name)) {
          try {
            await unlink(join(TTS_DIR, entry.name));
            logger.info({ module: 'tts', file: entry.name }, 'removed legacy single-file tts cache');
          } catch {
            /* best-effort */
          }
        }
      }
    }
  } catch {
    /* best-effort */
  }

  if (deleted > 0) {
    logger.info({ module: 'tts', deleted }, `cleaned up ${deleted} expired tts entries`);
  }
  return deleted;
}

/** Resets any rows stuck in 'processing' on server startup (crash recovery). */
export async function resetStuckTtsJobs(): Promise<void> {
  const stuck = await db
    .update(ttsCache)
    .set({ status: 'failed', error: 'Server restarted during generation' })
    .where(and(eq(ttsCache.status, 'processing')))
    .returning({ contentHash: ttsCache.contentHash });
  if (stuck.length > 0) {
    logger.warn({ module: 'tts', count: stuck.length }, 'marked stuck in-progress tts jobs as failed');
  }
}

// ─── Internal: background generation ──────────────────────────────────────────

function scheduleGeneration(hash: string, voice: string, model: string, chunks: string[]): Promise<void> {
  const existing = inFlight.get(hash);
  if (existing) return existing;

  const promise = generate(hash, voice, model, chunks).finally(() => {
    inFlight.delete(hash);
  });
  inFlight.set(hash, promise);
  return promise;
}

async function generate(hash: string, voice: string, model: string, chunks: string[]): Promise<void> {
  const dir = ttsChunkDir(hash);

  try {
    await db.update(ttsCache).set({ status: 'processing', chunksDone: 0 }).where(eq(ttsCache.contentHash, hash));

    // Clean slate — a previous failed attempt may have left partial files behind.
    if (existsSync(dir)) await rm(dir, { recursive: true, force: true });
    await mkdir(dir, { recursive: true });

    const client = createTtsClient();
    let totalBytes = 0;

    for (let i = 0; i < chunks.length; i++) {
      const response = await client.audio.speech.create({
        model,
        voice,
        input: chunks[i],
        response_format: 'mp3',
      });
      const arrayBuf = await response.arrayBuffer();
      const buf = Buffer.from(arrayBuf);
      totalBytes += buf.length;

      // Atomic per-chunk write — readers that arrive mid-write never see a partial file.
      const finalPath = ttsChunkPath(hash, i);
      const tmpPath = `${finalPath}.tmp`;
      await writeFile(tmpPath, buf);
      await rename(tmpPath, finalPath);

      await db
        .update(ttsCache)
        .set({ chunksDone: i + 1, lastAccessedAt: Math.floor(Date.now() / 1000) })
        .where(eq(ttsCache.contentHash, hash));
      logger.debug({ module: 'tts', hash, chunk: i + 1, total: chunks.length }, 'tts chunk done');
    }

    await db
      .update(ttsCache)
      .set({ status: 'done', lastAccessedAt: Math.floor(Date.now() / 1000) })
      .where(eq(ttsCache.contentHash, hash));

    logger.info({ module: 'tts', hash, chunks: chunks.length, sizeBytes: totalBytes }, 'tts generation complete');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ module: 'tts', hash, err }, 'tts generation failed');
    await db
      .update(ttsCache)
      .set({ status: 'failed', error: message.slice(0, 500) })
      .where(eq(ttsCache.contentHash, hash));
    try {
      if (existsSync(dir)) await rm(dir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }
}
