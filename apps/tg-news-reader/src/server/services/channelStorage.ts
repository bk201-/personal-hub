import { logger } from '../logger.js';
import { scanChannelStorage } from './channelStorageScan.js';

type ChannelStorageStats = Awaited<ReturnType<typeof scanChannelStorage>>;

interface StorageOptions {
  scan?: (telegramId: string) => Promise<ChannelStorageStats>;
  now?: () => number;
  ttlMs?: number;
  errorTtlMs?: number;
  maxCacheEntries?: number;
  concurrency?: number;
  maxQueued?: number;
}

type CacheEntry = { expiresAt: number } & (
  | { stats: ChannelStorageStats; error?: never }
  | { stats?: never; error: Error }
);

export function createChannelStorageService({
  scan = scanChannelStorage,
  now = Date.now,
  ttlMs = 60_000,
  errorTtlMs = 10_000,
  maxCacheEntries = 128,
  concurrency = 2,
  maxQueued = 16,
}: StorageOptions = {}) {
  for (const limit of [ttlMs, errorTtlMs, maxCacheEntries, concurrency, maxQueued + 1]) {
    if (!Number.isSafeInteger(limit) || limit < 1) throw new Error('Invalid channel storage limit');
  }
  const cache = new Map<string, CacheEntry>();
  const inFlight = new Map<string, Promise<ChannelStorageStats>>();
  const waiting: Array<() => void> = [];
  let active = 0;

  function remember(key: string, entry: CacheEntry) {
    cache.delete(key);
    cache.set(key, entry);
    while (cache.size > maxCacheEntries) cache.delete(cache.keys().next().value!);
  }

  async function run(telegramId: string): Promise<ChannelStorageStats> {
    if (active >= concurrency) await new Promise<void>((resolve) => waiting.push(resolve));
    else active++;
    try {
      const stats = Object.freeze({ ...(await scan(telegramId)) });
      remember(telegramId, { stats, expiresAt: now() + ttlMs });
      return stats;
    } catch (err) {
      const error = new Error('Channel storage unavailable');
      remember(telegramId, { error, expiresAt: now() + errorTtlMs });
      logger.warn({ module: 'channelStorage', err }, 'Channel storage scan failed');
      throw error;
    } finally {
      const next = waiting.shift();
      if (next) next();
      else active--;
      inFlight.delete(telegramId);
    }
  }

  async function getStats(telegramId: string): Promise<ChannelStorageStats> {
    const cached = cache.get(telegramId);
    if (cached && now() < cached.expiresAt) {
      remember(telegramId, cached);
      if (cached.error) throw cached.error;
      return cached.stats;
    }
    cache.delete(telegramId);
    const pending = inFlight.get(telegramId);
    if (pending) return pending;
    if (inFlight.size >= concurrency + maxQueued) throw new Error('Channel storage queue full');
    const result = Promise.resolve().then(() => run(telegramId));
    inFlight.set(telegramId, result);
    return result;
  }

  return { getStats };
}

export const channelStorage = createChannelStorageService();
