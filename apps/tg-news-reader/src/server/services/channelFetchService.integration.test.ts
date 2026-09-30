import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { Hono } from 'hono';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../config.js', async (importOriginal) => ({
  ...(await importOriginal<typeof ConfigModule>()),
  NEWS_DEFAULT_FETCH_DAYS: 3,
  NEWS_FETCH_LIMIT: 1000,
}));

vi.mock('../logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), fatal: vi.fn(), debug: vi.fn() },
}));

vi.mock('./telegram.js', () => ({
  getChannelInfo: vi.fn(),
  readChannelHistory: vi.fn().mockResolvedValue(undefined),
  fetchChannelMessages: vi.fn(),
  fetchMessageById: vi.fn(),
  getReadInboxMaxId: vi.fn(),
  resolveInstantViewImages: vi.fn(),
}));
vi.mock('./downloadManager.js', () => ({ enqueueTask: vi.fn() }));
vi.mock('../utils/mediaFiles.js', () => ({ deleteAllMediaFiles: vi.fn() }));

import { seedChannel, seedDownload, seedNews } from '../__tests__/seed.js';
import { createTestDb } from '../__tests__/testDb.js';
import type { TestDb } from '../__tests__/testDb.js';
import type * as ConfigModule from '../config.js';

let testDb: TestDb;

vi.mock('../db/index.js', () => ({
  get client() {
    return testDb.client;
  },
  get db() {
    return testDb.db;
  },
}));

import { filters } from '../db/schema.js';
import channelsRouter from '../routes/channels.js';
import { deleteAllMediaFiles } from '../utils/mediaFiles.js';
import { fetchChannelNews } from './channelFetchService.js';
import { enqueueTask } from './downloadManager.js';
import { downloadProgressEmitter } from './downloadProgress.js';
import { fetchChannelMessages, fetchMessageById, getReadInboxMaxId, resolveInstantViewImages } from './telegram.js';
import type { TelegramMessage } from './telegram.js';

const NOW = Math.floor(Date.now() / 1000);
const DAY = 86400;
const HOUR = 3600;
const emit = vi.spyOn(downloadProgressEmitter, 'emit');

/** Read back the `sinceDate` passed to the (mocked) Telegram fetch. */
function sinceArgMs(): number {
  const call = vi.mocked(fetchChannelMessages).mock.calls[0];
  const opts = call[1] as { sinceDate?: Date };
  return opts.sinceDate!.getTime();
}

describe('channelFetchService (integration)', () => {
  // Uses a file-backed DB: fetchChannelNews runs an interactive db.transaction(),
  // which libsql can't service against a :memory: connection (each connection is a
  // separate empty in-memory database).
  const dbFile = join(process.cwd(), `tg-fetch-${process.pid}-${Date.now()}.sqlite`);

  beforeAll(async () => {
    testDb = await createTestDb(`file:${dbFile}`);
  });

  afterAll(() => {
    testDb.client.close();
    // Best-effort cleanup — Windows may still hold the file handle briefly after close().
    for (const suffix of ['', '-wal', '-shm']) {
      try {
        if (existsSync(dbFile + suffix)) rmSync(dbFile + suffix, { force: true });
      } catch {
        // temp file — OS will reclaim it
      }
    }
  });

  beforeEach(async () => {
    await testDb.client.execute('DELETE FROM downloads');
    await testDb.client.execute('DELETE FROM news');
    await testDb.client.execute('DELETE FROM channels');
    vi.mocked(fetchChannelMessages).mockReset().mockResolvedValue([]);
    vi.mocked(fetchMessageById).mockReset().mockResolvedValue(null);
    vi.mocked(getReadInboxMaxId).mockReset().mockResolvedValue(null);
    vi.mocked(enqueueTask).mockReset().mockResolvedValue(undefined);
    vi.mocked(deleteAllMediaFiles).mockClear();
    emit.mockClear();
    vi.mocked(resolveInstantViewImages)
      .mockReset()
      .mockImplementation(async (msg) => {
        msg.instantViewContent = '![photo](test/iv.jpg)';
      });
  });

  const app = new Hono().route('/api/channels', channelsRouter);

  it.each([
    new Error('USERNAME_NOT_OCCUPIED'),
    new Error('No user has "deleted_channel" as username'),
    new Error('400: CHANNEL_PRIVATE (caused by messages.GetHistory)'),
    Object.assign(new Error('RPC failed'), { errorMessage: 'CHANNEL_INVALID' }),
    new Error('USERNAME_INVALID'),
    new Error('CHANNEL_PUBLIC_GROUP_NA'),
  ])('persists unavailable status and returns an explicit refresh error for %s', async (error) => {
    const ch = await seedChannel(testDb.db, { unreadCount: 2, totalNewsCount: 2 });
    await seedNews(testDb.db, ch.id);
    await seedNews(testDb.db, ch.id);
    vi.mocked(fetchChannelMessages).mockRejectedValueOnce(error);

    const response = await app.request(`/api/channels/${ch.id}/fetch`, { method: 'POST' });
    const list = await (await app.request('/api/channels')).json();
    expect(list[0]).toMatchObject({ isUnavailable: 1, unreadCount: 2, totalNewsCount: 2, lastFetchedAt: null });
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ error: expect.stringMatching(/unavailable/i) });
  });

  it.each(['fetch', 'mark-read-and-fetch'])(
    'retries unavailable channels and clears the flag via %s',
    async (route) => {
      const ch = await seedChannel(testDb.db, { isUnavailable: 1 });
      const response = await app.request(`/api/channels/${ch.id}/${route}`, { method: 'POST' });
      expect(response.status).toBe(200);
      expect(fetchChannelMessages).toHaveBeenCalledWith(ch.telegramId, expect.any(Object));
      const list = await (await app.request('/api/channels')).json();
      expect(list[0]).toMatchObject({ isUnavailable: 0, unreadCount: 0, totalNewsCount: 0 });
    },
  );

  it.each(['ETIMEDOUT', 'ECONNRESET', 'FLOOD_WAIT_30', 'Telegram circuit breaker OPEN', 'AUTH_KEY_UNREGISTERED'])(
    'does not mark a channel unavailable for %s',
    async (message) => {
      const ch = await seedChannel(testDb.db);
      vi.mocked(fetchChannelMessages).mockRejectedValueOnce(new Error(message));
      const response = await app.request(`/api/channels/${ch.id}/fetch`, { method: 'POST' });
      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({ error: message });
      const list = await (await app.request('/api/channels')).json();
      expect(list[0].isUnavailable).toBe(0);
    },
  );

  it('preserves an unavailable flag if its retry fails transiently', async () => {
    const ch = await seedChannel(testDb.db, { isUnavailable: 1 });
    vi.mocked(fetchChannelMessages).mockRejectedValueOnce(new Error('Network error'));
    await expect(fetchChannelNews(ch.id)).rejects.toThrow('Network error');
    const list = await (await app.request('/api/channels')).json();
    expect(list[0].isUnavailable).toBe(1);
  });

  it('propagates permanent read-watermark failures instead of treating the channel as empty', async () => {
    const ch = await seedChannel(testDb.db);
    vi.mocked(getReadInboxMaxId).mockRejectedValueOnce(new Error('CHANNEL_PRIVATE'));
    const response = await app.request(`/api/channels/${ch.id}/fetch`, { method: 'POST' });
    expect(response.status).toBe(422);
    const list = await (await app.request('/api/channels')).json();
    expect(list[0].isUnavailable).toBe(1);
  });

  it.each(['fetch', 'mark-read-and-fetch'])('keeps cleanup counts accurate when %s fails', async (route) => {
    const ch = await seedChannel(testDb.db, { unreadCount: 1, totalNewsCount: 2, lastFetchedAt: NOW });
    await seedNews(testDb.db, ch.id, { isRead: 1 });
    await seedNews(testDb.db, ch.id, { isRead: 0 });
    vi.mocked(fetchChannelMessages).mockRejectedValueOnce(new Error('CHANNEL_PRIVATE'));
    const response = await app.request(`/api/channels/${ch.id}/${route}`, { method: 'POST' });
    expect(response.status).toBe(422);
    const list = await (await app.request('/api/channels')).json();
    const remaining = route === 'fetch' ? 1 : 0;
    expect(list[0]).toMatchObject({
      isUnavailable: 1,
      unreadCount: remaining,
      totalNewsCount: remaining,
      lastFetchedAt: NOW,
    });
  });

  it.each(['pending', 'processing', 'failed', 'done'] as const)(
    'deletes read news and its %s downloads on refresh, preserving unread news and other channels',
    async (status) => {
      const ch = await seedChannel(testDb.db, { lastFetchedAt: NOW, lastReadAt: NOW - HOUR });
      const read = await seedNews(testDb.db, ch.id, {
        isRead: 1,
        postedAt: NOW - HOUR,
        localMediaPath: 'test/first.jpg',
        localMediaPaths: ['test/first.jpg', 'test/second.jpg'],
      });
      await seedDownload(testDb.db, read.id, { status, type: 'media' });
      await seedDownload(testDb.db, read.id, { status, type: 'article', url: 'https://example.com' });
      const unread = await seedNews(testDb.db, ch.id);
      const unreadTask = await seedDownload(testDb.db, unread.id);
      const otherChannel = await seedChannel(testDb.db);
      const otherNews = await seedNews(testDb.db, otherChannel.id, { isRead: 1 });
      const otherTask = await seedDownload(testDb.db, otherNews.id);

      const result = await fetchChannelNews(ch.id);

      const remainingNews = await testDb.client.execute('SELECT id FROM news ORDER BY id');
      expect(remainingNews.rows.map((row) => row.id)).toEqual([unread.id, otherNews.id]);
      const remainingTasks = await testDb.client.execute('SELECT id FROM downloads ORDER BY id');
      expect(remainingTasks.rows.map((row) => row.id)).toEqual([unreadTask.id, otherTask.id]);
      expect(deleteAllMediaFiles).toHaveBeenCalledExactlyOnceWith('test/first.jpg', [
        'test/first.jpg',
        'test/second.jpg',
      ]);
      expect(result.totalNewsCount).toBe(1);
      expect(result.unreadCount).toBe(1);
      expect(emit).toHaveBeenCalledWith('tasks_removed', [read.id]);
    },
  );

  it('does not fetch deleted read news again while Telegram read sync is still pending', async () => {
    const postedAt = NOW - HOUR;
    const ch = await seedChannel(testDb.db, { lastFetchedAt: NOW, lastReadAt: null, channelType: 'blog' });
    const item = await seedNews(testDb.db, ch.id, { isRead: 1, postedAt });
    await seedDownload(testDb.db, item.id);
    vi.mocked(fetchChannelMessages).mockImplementation(async (_channel, options) =>
      options!.sinceDate!.getTime() < postedAt * 1000
        ? [{ id: item.telegramMsgId, date: postedAt, message: '', links: [], hashtags: [], mediaType: 'photo' }]
        : [],
    );

    await fetchChannelNews(ch.id);
    await fetchChannelNews(ch.id);

    expect((await testDb.client.execute('SELECT id FROM news')).rows).toHaveLength(0);
    expect((await testDb.client.execute('SELECT id FROM downloads')).rows).toHaveLength(0);
    expect(enqueueTask).not.toHaveBeenCalled();
  });

  it.each(['keyword', 'tag', 'forward'] as const)(
    'does not download media or Instant View images hidden by %s',
    async (kind) => {
      const ch = await seedChannel(testDb.db, { channelType: 'blog', filterForwards: kind === 'forward' ? 1 : 0 });
      if (kind !== 'forward') {
        await testDb.db.insert(filters).values({ channelId: ch.id, name: 'hide', type: kind, value: 'blocked' });
      }
      const messages: TelegramMessage[] = ['photo', 'document', 'video'].map((mediaType, i) => ({
        id: i + 1,
        message: 'blocked',
        hashtags: ['blocked'],
        links: [],
        date: NOW,
        mediaType,
        forwardFromName: kind === 'forward' ? 'Other channel' : undefined,
        instantViewContent: '![photo](iv://0)',
        instantViewImages: [{ placeholder: 'iv://0', media: {} as never }],
      }));
      vi.mocked(fetchChannelMessages).mockResolvedValue(messages);

      const result = await fetchChannelNews(ch.id);

      expect(result.inserted).toBe(3);
      expect(result.mediaProcessing).toBe(false);
      expect(resolveInstantViewImages).not.toHaveBeenCalled();
      expect(enqueueTask).not.toHaveBeenCalled();
      const rows = await testDb.client.execute('SELECT is_filtered FROM news');
      expect(rows.rows.every((row) => row.is_filtered === 1)).toBe(true);
    },
  );

  it('resolves Instant View images and queues media only for visible news in a mixed fetch', async () => {
    const ch = await seedChannel(testDb.db, { channelType: 'blog' });
    await testDb.db.insert(filters).values({ channelId: ch.id, name: 'hide', type: 'keyword', value: 'blocked' });
    const messages: TelegramMessage[] = ['blocked', 'visible'].map((message, i) => ({
      id: i + 1,
      message,
      hashtags: [],
      links: [],
      date: NOW,
      mediaType: 'photo',
      instantViewContent: '![photo](iv://0)',
      instantViewImages: [{ placeholder: 'iv://0', media: {} as never }],
    }));
    vi.mocked(fetchChannelMessages).mockResolvedValue(messages);

    const result = await fetchChannelNews(ch.id);

    expect(result.mediaProcessing).toBe(true);
    expect(resolveInstantViewImages).toHaveBeenCalledExactlyOnceWith(messages[1], ch.telegramId);
    await vi.waitFor(() => expect(enqueueTask).toHaveBeenCalledTimes(1));
    const rows = await testDb.client.execute('SELECT id, full_content FROM news WHERE is_filtered = 0');
    expect(enqueueTask).toHaveBeenCalledWith(rows.rows[0].id, 'media', undefined, 5);
    expect(rows.rows[0].full_content).toBe('![photo](test/iv.jpg)');
  });

  it('first-ever fetch (no lastFetchedAt, unread channel) uses the default look-back window', async () => {
    const ch = await seedChannel(testDb.db, { lastFetchedAt: null, lastReadAt: null });

    await fetchChannelNews(ch.id);

    // Fallback branch: ~NEWS_DEFAULT_FETCH_DAYS days ago
    expect(sinceArgMs()).toBeLessThanOrEqual((NOW - 2 * DAY) * 1000);
  });

  it('does not download images while reading the Telegram read watermark', async () => {
    const ch = await seedChannel(testDb.db);
    vi.mocked(getReadInboxMaxId).mockResolvedValue(42);
    vi.mocked(fetchMessageById).mockResolvedValue({
      id: 42,
      message: '',
      date: NOW,
      hashtags: [],
      links: [],
    });

    await fetchChannelNews(ch.id);

    expect(fetchMessageById).toHaveBeenCalledWith(ch.telegramId, 42, { downloadImages: false });
  });

  it('re-fetches the look-back window when a previously-fetched channel is now empty', async () => {
    // Regression: after all news were read + cleaned up, a subsequent fetch used the
    // wall-clock lastFetchedAt as the boundary — always later than any real post — so
    // Telegram returned nothing and the channel stayed permanently empty.
    const ch = await seedChannel(testDb.db, { lastFetchedAt: NOW, lastReadAt: null });

    await fetchChannelNews(ch.id);

    expect(sinceArgMs()).toBeLessThanOrEqual((NOW - 2 * DAY) * 1000);
  });

  it('uses the newest stored post as the boundary, not the wall-clock lastFetchedAt', async () => {
    const postedAt = NOW - 2 * HOUR;
    const ch = await seedChannel(testDb.db, { lastFetchedAt: NOW });
    await seedNews(testDb.db, ch.id, { telegramMsgId: 10, postedAt, isRead: 0 });

    await fetchChannelNews(ch.id);

    expect(sinceArgMs()).toBe(postedAt * 1000);
  });

  it('uses the read watermark when it is newer than the newest stored post', async () => {
    const lastReadAt = NOW - 1 * HOUR;
    const postedAt = NOW - 5 * HOUR;
    const ch = await seedChannel(testDb.db, { lastFetchedAt: NOW, lastReadAt });
    await seedNews(testDb.db, ch.id, { telegramMsgId: 11, postedAt, isRead: 0 });

    await fetchChannelNews(ch.id);

    expect(sinceArgMs()).toBe(lastReadAt * 1000);
  });
});
