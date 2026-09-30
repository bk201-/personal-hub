import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Mocks ──────────────────────────────────────────────────────────────────

vi.mock('../config.js', () => ({
  JWT_SECRET: 'test-secret-key',
  JWT_ACCESS_EXPIRES_SEC: 900,
  REFRESH_EXPIRES_DAYS: 7,
  NEWS_DEFAULT_FETCH_DAYS: 3,
  NEWS_FETCH_LIMIT: 1000,
  TG_CONNECT_DELAY_MS: 0,
}));

vi.mock('../logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), fatal: vi.fn(), debug: vi.fn() },
}));

// Mock Telegram — no real TG calls
vi.mock('../services/telegram.js', () => ({
  readChannelHistory: vi.fn().mockResolvedValue(undefined),
  getChannelInfo: vi.fn(),
  fetchChannelMessages: vi.fn(),
  fetchMessageById: vi.fn(),
  getReadInboxMaxId: vi.fn(),
}));

import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { createTestUser, authHeaders } from '../__tests__/auth.js';
import { seedChannel, seedNews, seedDownload } from '../__tests__/seed.js';
import { createTestDb } from '../__tests__/testDb.js';
import type { TestDb } from '../__tests__/testDb.js';
import { channels, news } from '../db/schema.js';
import { readChannelHistory } from '../services/telegram.js';

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
import newsRouter from './news.js';

function createApp() {
  const app = new Hono();
  app.use('/api/*', authMiddleware);
  app.route('/api/news', newsRouter);
  return app;
}

describe('News routes (integration)', () => {
  let app: ReturnType<typeof createApp>;
  let headers: Record<string, string>;

  beforeAll(async () => {
    testDb = await createTestDb();
    const user = await createTestUser(testDb.db);
    headers = await authHeaders(user.id);
  });

  beforeEach(async () => {
    await testDb.client.execute('DELETE FROM news');
    await testDb.client.execute('DELETE FROM channels');
    app = createApp();
  });

  // ── GET /api/news ─────────────────────────────────────────────────────────

  describe('GET /api/news', () => {
    it('returns 401 without auth', async () => {
      const res = await app.request('/api/news');
      expect(res.status).toBe(401);
    });

    it('returns empty items for an empty DB', async () => {
      const res = await app.request('/api/news', { headers });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.items).toEqual([]);
      expect(body.hasMore).toBe(false);
    });

    it('returns news items ordered by postedAt asc', async () => {
      const ch = await seedChannel(testDb.db);
      const n1 = await seedNews(testDb.db, ch.id, { postedAt: 1000, text: 'first' });
      const n2 = await seedNews(testDb.db, ch.id, { postedAt: 2000, text: 'second' });

      const res = await app.request('/api/news', { headers });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.items).toHaveLength(2);
      expect(body.items[0].id).toBe(n1.id);
      expect(body.items[1].id).toBe(n2.id);
    });

    it('filters by channelId', async () => {
      const ch1 = await seedChannel(testDb.db, { telegramId: 'ch1' });
      const ch2 = await seedChannel(testDb.db, { telegramId: 'ch2' });
      await seedNews(testDb.db, ch1.id, { text: 'ch1 news' });
      await seedNews(testDb.db, ch2.id, { text: 'ch2 news' });

      const res = await app.request(`/api/news?channelId=${ch1.id}`, { headers });
      const body = await res.json();
      expect(body.items).toHaveLength(1);
      expect(body.items[0].text).toBe('ch1 news');
    });

    it('supports cursor-based pagination', async () => {
      const ch = await seedChannel(testDb.db);
      await seedNews(testDb.db, ch.id, { postedAt: 100 });
      await seedNews(testDb.db, ch.id, { postedAt: 200, telegramMsgId: 201 });
      await seedNews(testDb.db, ch.id, { postedAt: 300, telegramMsgId: 301 });

      // First page: limit=2
      const res1 = await app.request(`/api/news?channelId=${ch.id}&limit=2`, { headers });
      const body1 = await res1.json();
      expect(body1.items).toHaveLength(2);
      expect(body1.hasMore).toBe(true);
      expect(body1.nextCursor).toBe(200);

      // Second page using cursor
      const res2 = await app.request(`/api/news?channelId=${ch.id}&limit=2&cursor=${body1.nextCursor}`, { headers });
      const body2 = await res2.json();
      expect(body2.items).toHaveLength(1);
      expect(body2.hasMore).toBe(false);
    });
  });

  // ── GET /api/news/:id ─────────────────────────────────────────────────────

  describe('GET /api/news/:id', () => {
    it('returns a single news item', async () => {
      const ch = await seedChannel(testDb.db);
      const n = await seedNews(testDb.db, ch.id, { text: 'hello world' });

      const res = await app.request(`/api/news/${n.id}`, { headers });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.id).toBe(n.id);
      expect(body.text).toBe('hello world');
    });

    it('returns 404 for missing item', async () => {
      const res = await app.request('/api/news/99999', { headers });
      expect(res.status).toBe(404);
    });
  });

  // ── PATCH /api/news/:id/read ──────────────────────────────────────────────

  describe('PATCH /api/news/:id/read', () => {
    it('marks a news item as read and updates unreadCount', async () => {
      const ch = await seedChannel(testDb.db, { unreadCount: 1 });
      const n = await seedNews(testDb.db, ch.id, { isRead: 0 });

      const res = await app.request(`/api/news/${n.id}/read`, {
        method: 'PATCH',
        headers,
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.isRead).toBe(1);
    });

    it('returns 404 for missing item', async () => {
      const res = await app.request('/api/news/99999/read', {
        method: 'PATCH',
        headers,
      });
      expect(res.status).toBe(404);
    });
  });

  // ── POST /api/news/read-all ───────────────────────────────────────────────

  describe('POST /api/news/read-all', () => {
    it('marks all unread news as read', async () => {
      const ch = await seedChannel(testDb.db, { unreadCount: 2 });
      await seedNews(testDb.db, ch.id, { isRead: 0, telegramMsgId: 1 });
      await seedNews(testDb.db, ch.id, { isRead: 0, telegramMsgId: 2 });

      const res = await app.request('/api/news/read-all', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelId: ch.id }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);

      // Verify they're all read
      const checkRes = await app.request(`/api/news?channelId=${ch.id}&isRead=0`, { headers });
      const checkBody = await checkRes.json();
      expect(checkBody.items).toHaveLength(0);
    });

    it('returns affectedIds with the rows that were actually flipped', async () => {
      const ch = await seedChannel(testDb.db, { unreadCount: 1 });
      const unread = await seedNews(testDb.db, ch.id, { isRead: 0, telegramMsgId: 11 });
      // Already-read items must NOT be re-counted in affectedIds
      await seedNews(testDb.db, ch.id, { isRead: 1, telegramMsgId: 12 });

      const res = await app.request('/api/news/read-all', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelId: ch.id }),
      });

      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.affectedIds).toEqual([unread.id]);
    });

    it('returns empty affectedIds when nothing matches the source state', async () => {
      const ch = await seedChannel(testDb.db, { unreadCount: 0 });
      await seedNews(testDb.db, ch.id, { isRead: 1, telegramMsgId: 13 });

      const res = await app.request('/api/news/read-all', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelId: ch.id }),
      });

      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.affectedIds).toEqual([]);
    });

    it('advances last_read_at even when the Telegram sync fails', async () => {
      // Regression (bug B): the read watermark is local bookkeeping and must persist
      // even if readChannelHistory throws — otherwise last_read_at stays NULL and the
      // channel can be emptied on the next fetch.
      const ch = await seedChannel(testDb.db, { unreadCount: 1, lastReadAt: null });
      await seedNews(testDb.db, ch.id, { isRead: 0, telegramMsgId: 500, postedAt: 12345 });
      vi.mocked(readChannelHistory).mockRejectedValueOnce(new Error('FLOOD_WAIT'));

      const res = await app.request('/api/news/read-all', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelId: ch.id }),
      });
      expect(res.status).toBe(200);

      const [row] = await testDb.db.select().from(channels).where(eq(channels.id, ch.id));
      expect(row.lastReadAt).toBe(12345);
    });

    it('isRead=0 flips read items back to unread (toolbar undo-toggle)', async () => {
      const ch = await seedChannel(testDb.db, { unreadCount: 0 });
      const a = await seedNews(testDb.db, ch.id, { isRead: 1, telegramMsgId: 21 });
      const b = await seedNews(testDb.db, ch.id, { isRead: 1, telegramMsgId: 22 });

      const res = await app.request('/api/news/read-all', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ newsIds: [a.id, b.id], isRead: 0 }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect([...body.affectedIds].sort((x: number, y: number) => x - y)).toEqual([a.id, b.id].sort((x, y) => x - y));

      // Both should now be unread
      const checkRes = await app.request(`/api/news?channelId=${ch.id}&isRead=0`, { headers });
      const checkBody = await checkRes.json();
      expect(checkBody.items).toHaveLength(2);
    });

    it('isRead=0 with channelId flips all read items in the channel to unread', async () => {
      const ch = await seedChannel(testDb.db, { unreadCount: 0 });
      await seedNews(testDb.db, ch.id, { isRead: 1, telegramMsgId: 31 });
      await seedNews(testDb.db, ch.id, { isRead: 1, telegramMsgId: 32 });

      const res = await app.request('/api/news/read-all', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelId: ch.id, isRead: 0 }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.affectedIds).toHaveLength(2);

      // unreadCount on the channel should be recalculated to 2
      const checkRes = await app.request(`/api/news?channelId=${ch.id}&isRead=0`, { headers });
      const checkBody = await checkRes.json();
      expect(checkBody.items).toHaveLength(2);
    });

    it('isRead=0 leaves rows already unread untouched (no double flip)', async () => {
      const ch = await seedChannel(testDb.db, { unreadCount: 1 });
      await seedNews(testDb.db, ch.id, { isRead: 0, telegramMsgId: 41 }); // already unread
      const wasRead = await seedNews(testDb.db, ch.id, { isRead: 1, telegramMsgId: 42 });

      const res = await app.request('/api/news/read-all', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelId: ch.id, isRead: 0 }),
      });

      const body = await res.json();
      // Only the previously-read row should appear in affectedIds
      expect(body.affectedIds).toEqual([wasRead.id]);
    });
  });

  // ── POST /api/news/read-batch ──────────────────────────────────────────────

  describe('POST /api/news/read-batch', () => {
    it('flips readIds unread→read and unreadIds read→unread in one request', async () => {
      const ch = await seedChannel(testDb.db, { unreadCount: 1 });
      const a = await seedNews(testDb.db, ch.id, { isRead: 0, telegramMsgId: 101 });
      const b = await seedNews(testDb.db, ch.id, { isRead: 1, telegramMsgId: 102 });

      const res = await app.request('/api/news/read-batch', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ readIds: [a.id], unreadIds: [b.id] }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.readAffected).toEqual([a.id]);
      expect(body.unreadAffected).toEqual([b.id]);

      const readState = await testDb.db.select().from(news).where(eq(news.channelId, ch.id));
      const byId = new Map(readState.map((r) => [r.id, r.isRead]));
      expect(byId.get(a.id)).toBe(1);
      expect(byId.get(b.id)).toBe(0);
    });

    it('recounts the channel unread_count after a batch', async () => {
      const ch = await seedChannel(testDb.db, { unreadCount: 3 });
      const a = await seedNews(testDb.db, ch.id, { isRead: 0, telegramMsgId: 111 });
      const bb = await seedNews(testDb.db, ch.id, { isRead: 0, telegramMsgId: 112 });
      await seedNews(testDb.db, ch.id, { isRead: 0, telegramMsgId: 113 });

      await app.request('/api/news/read-batch', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ readIds: [a.id, bb.id] }),
      });

      const [row] = await testDb.db.select().from(channels).where(eq(channels.id, ch.id));
      expect(row.unreadCount).toBe(1);
    });

    it('excludes rows already in the target state from the affected arrays', async () => {
      const ch = await seedChannel(testDb.db, { unreadCount: 1 });
      const unread = await seedNews(testDb.db, ch.id, { isRead: 0, telegramMsgId: 121 });
      const alreadyRead = await seedNews(testDb.db, ch.id, { isRead: 1, telegramMsgId: 122 });

      const res = await app.request('/api/news/read-batch', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ readIds: [unread.id, alreadyRead.id] }),
      });

      const body = await res.json();
      expect(body.readAffected).toEqual([unread.id]);
    });

    it('syncs read state to Telegram for the max flipped msg id', async () => {
      vi.mocked(readChannelHistory).mockClear();
      const ch = await seedChannel(testDb.db, { unreadCount: 2, telegramId: 'batch_sync_chan' });
      const a = await seedNews(testDb.db, ch.id, { isRead: 0, telegramMsgId: 200 });
      const b = await seedNews(testDb.db, ch.id, { isRead: 0, telegramMsgId: 210 });

      await app.request('/api/news/read-batch', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ readIds: [a.id, b.id] }),
      });

      expect(readChannelHistory).toHaveBeenCalledWith('batch_sync_chan', 210);
    });

    it('advances last_read_at even when the Telegram sync fails', async () => {
      // Regression (bug B): watermark must persist independently of the TG round-trip.
      vi.mocked(readChannelHistory).mockRejectedValueOnce(new Error('FLOOD_WAIT'));
      const ch = await seedChannel(testDb.db, { unreadCount: 1, lastReadAt: null, telegramId: 'batch_fail_chan' });
      const item = await seedNews(testDb.db, ch.id, { isRead: 0, telegramMsgId: 600, postedAt: 54321 });

      const res = await app.request('/api/news/read-batch', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ readIds: [item.id] }),
      });
      expect(res.status).toBe(200);

      const [row] = await testDb.db.select().from(channels).where(eq(channels.id, ch.id));
      expect(row.lastReadAt).toBe(54321);
    });

    it('handles an empty body without error', async () => {
      const res = await app.request('/api/news/read-batch', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({ success: true, readAffected: [], unreadAffected: [] });
    });
  });

  // ── DELETE /api/news/read ─────────────────────────────────────────────────

  describe('DELETE /api/news/read', () => {
    it('deletes all read news', async () => {
      const ch = await seedChannel(testDb.db, { totalNewsCount: 3 });
      await seedNews(testDb.db, ch.id, { isRead: 1, telegramMsgId: 1 });
      await seedNews(testDb.db, ch.id, { isRead: 1, telegramMsgId: 2 });
      await seedNews(testDb.db, ch.id, { isRead: 0, telegramMsgId: 3 });

      const res = await app.request('/api/news/read', {
        method: 'DELETE',
        headers,
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.deleted).toBe(2);

      // Unread item should still be there
      const checkRes = await app.request('/api/news', { headers });
      const checkBody = await checkRes.json();
      expect(checkBody.items).toHaveLength(1);
    });

    it('deletes read news for a specific channel only', async () => {
      const ch1 = await seedChannel(testDb.db, { telegramId: 'ch_del1', totalNewsCount: 2 });
      const ch2 = await seedChannel(testDb.db, { telegramId: 'ch_del2', totalNewsCount: 1 });
      await seedNews(testDb.db, ch1.id, { isRead: 1, telegramMsgId: 10 });
      await seedNews(testDb.db, ch1.id, { isRead: 1, telegramMsgId: 11 });
      await seedNews(testDb.db, ch2.id, { isRead: 1, telegramMsgId: 20 });

      const res = await app.request('/api/news/read', {
        method: 'DELETE',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelId: ch1.id }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.deleted).toBe(2);

      // ch2's read news should still be there
      const checkRes = await app.request('/api/news', { headers });
      const checkBody = await checkRes.json();
      expect(checkBody.items).toHaveLength(1);
      expect(checkBody.items[0].channelId).toBe(ch2.id);
    });

    it('protects read news with active (pending/processing) downloads', async () => {
      const ch = await seedChannel(testDb.db, { totalNewsCount: 3 });
      const n1 = await seedNews(testDb.db, ch.id, { isRead: 1, telegramMsgId: 30 });
      const n2 = await seedNews(testDb.db, ch.id, { isRead: 1, telegramMsgId: 31 });
      const n3 = await seedNews(testDb.db, ch.id, { isRead: 1, telegramMsgId: 32 });

      // n1 has a pending download, n2 has a processing download — both protected
      await seedDownload(testDb.db, n1.id, { status: 'pending' });
      await seedDownload(testDb.db, n2.id, { status: 'processing' });
      // n3 has a completed download — NOT protected
      await seedDownload(testDb.db, n3.id, { status: 'done' });

      const res = await app.request('/api/news/read', {
        method: 'DELETE',
        headers,
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      // Only n3 should be deleted; n1 and n2 are protected
      expect(body.deleted).toBe(1);

      // n1 and n2 should still exist
      const checkRes = await app.request('/api/news', { headers });
      const checkBody = await checkRes.json();
      expect(checkBody.items).toHaveLength(2);
      const ids = checkBody.items.map((i: { id: number }) => i.id);
      expect(ids).toContain(n1.id);
      expect(ids).toContain(n2.id);
    });
  });

  // ── ETag support ─────────────────────────────────────────────────────────

  describe('GET /api/news (ETag)', () => {
    it('invalidates an image-only album response when later media adds a video', async () => {
      const ch = await seedChannel(testDb.db);
      const item = await seedNews(testDb.db, ch.id, {
        localMediaPath: 'ch/10.jpg',
        localMediaPaths: ['ch/10.jpg'],
        albumMsgIds: [10, 11],
      });
      const before = await app.request(`/api/news?channelId=${ch.id}`, { headers });
      await testDb.client.execute({
        sql: 'UPDATE news SET local_media_paths = ? WHERE id = ?',
        args: [JSON.stringify(['ch/10.jpg', 'ch/11.mp4']), item.id],
      });
      const after = await app.request(`/api/news?channelId=${ch.id}`, {
        headers: { ...headers, 'If-None-Match': before.headers.get('ETag')! },
      });
      expect(after.status).toBe(200);
      expect((await after.json()).items[0].localMediaPaths).toEqual(['ch/10.jpg', 'ch/11.mp4']);
    });

    it('returns 304 when If-None-Match matches ETag', async () => {
      const ch = await seedChannel(testDb.db);
      await seedNews(testDb.db, ch.id, { postedAt: 5000 });

      // First request to get the ETag
      const res1 = await app.request('/api/news', { headers });
      expect(res1.status).toBe(200);
      const etag = res1.headers.get('ETag');
      expect(etag).toBeTruthy();

      // Second request with If-None-Match
      const res2 = await app.request('/api/news', {
        headers: { ...headers, 'If-None-Match': etag! },
      });
      expect(res2.status).toBe(304);
    });

    it('ETag changes when localMediaPath is set (download complete)', async () => {
      const ch = await seedChannel(testDb.db);
      const n = await seedNews(testDb.db, ch.id, { postedAt: 6000 });

      // First request — no media path
      const res1 = await app.request(`/api/news?channelId=${ch.id}`, { headers });
      expect(res1.status).toBe(200);
      const etag1 = res1.headers.get('ETag');

      // Simulate download worker updating localMediaPath
      await testDb.client.execute(`UPDATE news SET local_media_path = 'ch/1.jpg' WHERE id = ${n.id}`);

      // Second request — ETag should differ, must NOT return 304
      const res2 = await app.request(`/api/news?channelId=${ch.id}`, {
        headers: { ...headers, 'If-None-Match': etag1! },
      });
      expect(res2.status).toBe(200);
      const body = (await res2.json()) as { items: Array<{ localMediaPath?: string }> };
      expect(body.items[0].localMediaPath).toBe('ch/1.jpg');
    });

    it('ETag changes when an item is marked as read (prevents stale 304 reverting checkboxes)', async () => {
      // Regression: opening the lightbox auto-marks items as read via PATCH /:id/read.
      // If ETag does not include isRead, a subsequent /api/news refetch returns 304
      // and the browser HTTP cache replays the OLD body with isRead=0 → the
      // just-flipped read checkboxes "fall off" in the news panel.
      const ch = await seedChannel(testDb.db);
      const n = await seedNews(testDb.db, ch.id, { postedAt: 7000, isRead: 0 });

      // First request — item is unread
      const res1 = await app.request(`/api/news?channelId=${ch.id}`, { headers });
      expect(res1.status).toBe(200);
      const etag1 = res1.headers.get('ETag');
      const body1 = (await res1.json()) as { items: Array<{ isRead: number }> };
      expect(body1.items[0].isRead).toBe(0);

      // Simulate the PATCH /:id/read effect (or lightbox auto-mark-read)
      await testDb.client.execute(`UPDATE news SET is_read = 1 WHERE id = ${n.id}`);

      // Second request — ETag should differ, MUST NOT return 304
      const res2 = await app.request(`/api/news?channelId=${ch.id}`, {
        headers: { ...headers, 'If-None-Match': etag1! },
      });
      expect(res2.status).toBe(200);
      const etag2 = res2.headers.get('ETag');
      expect(etag2).not.toBe(etag1);
      const body2 = (await res2.json()) as { items: Array<{ isRead: number }> };
      expect(body2.items[0].isRead).toBe(1);
    });
  });

  // ── POST /api/news/read-all (global) ───────────────────────────────────

  describe('POST /api/news/read-all (global)', () => {
    it('marks all unread news across all channels as read', async () => {
      const ch1 = await seedChannel(testDb.db, { telegramId: 'g1', unreadCount: 1 });
      const ch2 = await seedChannel(testDb.db, { telegramId: 'g2', unreadCount: 1 });
      await seedNews(testDb.db, ch1.id, { isRead: 0, telegramMsgId: 50 });
      await seedNews(testDb.db, ch2.id, { isRead: 0, telegramMsgId: 60 });

      const res = await app.request('/api/news/read-all', {
        method: 'POST',
        headers,
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);

      // Verify all are read
      const checkRes = await app.request('/api/news?isRead=0', { headers });
      const checkBody = await checkRes.json();
      expect(checkBody.items).toHaveLength(0);
    });
  });

  // ── PATCH /api/news/:id/read (mark unread) ─────────────────────────────

  describe('PATCH /api/news/:id/read (mark unread)', () => {
    it('marks a read news item as unread', async () => {
      const ch = await seedChannel(testDb.db, { unreadCount: 0 });
      const n = await seedNews(testDb.db, ch.id, { isRead: 1 });

      const res = await app.request(`/api/news/${n.id}/read`, {
        method: 'PATCH',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ isRead: 0 }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.isRead).toBe(0);
    });
  });

  // ── GET /api/news?filtered=1 ───────────────────────────────────────────

  describe('GET /api/news (filtered)', () => {
    it('excludes isFiltered=1 items when filtered=1', async () => {
      const ch = await seedChannel(testDb.db);
      await seedNews(testDb.db, ch.id, { isFiltered: 0, postedAt: 100, telegramMsgId: 70 });
      await seedNews(testDb.db, ch.id, { isFiltered: 1, postedAt: 200, telegramMsgId: 71 });

      const res = await app.request(`/api/news?channelId=${ch.id}&filtered=1`, { headers });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.items).toHaveLength(1);
      expect(body.filteredOut).toBe(1);
    });

    it('auto-filters non-media posts for media channel type', async () => {
      const ch = await seedChannel(testDb.db, { channelType: 'media' });
      await seedNews(testDb.db, ch.id, { mediaType: 'photo', postedAt: 100, telegramMsgId: 80 });
      await seedNews(testDb.db, ch.id, { mediaType: 'webpage', postedAt: 200, telegramMsgId: 81 });

      const res = await app.request(`/api/news?channelId=${ch.id}&filtered=1`, { headers });
      expect(res.status).toBe(200);
      const body = await res.json();
      // Only 'photo' passes the media filter (photo/document/audio)
      expect(body.items).toHaveLength(1);
      expect(body.items[0].mediaType).toBe('photo');
    });

    it('shows video posts in the visible view of a media channel (regression)', async () => {
      const ch = await seedChannel(testDb.db, { channelType: 'media' });
      const video = await seedNews(testDb.db, ch.id, { mediaType: 'video', postedAt: 100, telegramMsgId: 82 });
      await seedNews(testDb.db, ch.id, { mediaType: 'webpage', postedAt: 200, telegramMsgId: 83 });

      const res = await app.request(`/api/news?channelId=${ch.id}&view=filtered`, { headers });
      expect(res.status).toBe(200);
      const body = await res.json();
      // Video must NOT be treated as hidden — it is real media content.
      expect(body.items).toHaveLength(1);
      expect(body.items[0].id).toBe(video.id);
      expect(body.items[0].mediaType).toBe('video');
      expect(body.filteredOut).toBe(1); // only the webpage post is hidden
    });

    it('view=filtered behaves the same as filtered=1', async () => {
      const ch = await seedChannel(testDb.db);
      await seedNews(testDb.db, ch.id, { isFiltered: 0, postedAt: 100, telegramMsgId: 90 });
      await seedNews(testDb.db, ch.id, { isFiltered: 1, postedAt: 200, telegramMsgId: 91 });

      const res = await app.request(`/api/news?channelId=${ch.id}&view=filtered`, { headers });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.items).toHaveLength(1);
      expect(body.filteredOut).toBe(1);
    });

    it('view=hidden returns only isFiltered=1 items', async () => {
      const ch = await seedChannel(testDb.db);
      await seedNews(testDb.db, ch.id, { isFiltered: 0, postedAt: 100, telegramMsgId: 100 });
      const hidden = await seedNews(testDb.db, ch.id, { isFiltered: 1, postedAt: 200, telegramMsgId: 101 });

      const res = await app.request(`/api/news?channelId=${ch.id}&view=hidden`, { headers });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.items).toHaveLength(1);
      expect(body.items[0].id).toBe(hidden.id);
      // filteredOut is still the count of hidden items, regardless of view
      expect(body.filteredOut).toBe(1);
    });

    it('view=hidden on media channel includes non-media items too', async () => {
      const ch = await seedChannel(testDb.db, { channelType: 'media' });
      await seedNews(testDb.db, ch.id, { mediaType: 'photo', postedAt: 100, telegramMsgId: 110 });
      const nonMedia = await seedNews(testDb.db, ch.id, {
        mediaType: 'webpage',
        postedAt: 200,
        telegramMsgId: 111,
      });
      const isFilteredOne = await seedNews(testDb.db, ch.id, {
        mediaType: 'photo',
        isFiltered: 1,
        postedAt: 300,
        telegramMsgId: 112,
      });

      const res = await app.request(`/api/news?channelId=${ch.id}&view=hidden`, { headers });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.items).toHaveLength(2);
      const ids = body.items.map((i: { id: number }) => i.id).sort((a: number, b: number) => a - b);
      expect(ids).toEqual([nonMedia.id, isFilteredOne.id].sort((a, b) => a - b));
    });

    it('view=all returns every item including hidden ones', async () => {
      const ch = await seedChannel(testDb.db);
      await seedNews(testDb.db, ch.id, { isFiltered: 0, postedAt: 100, telegramMsgId: 120 });
      await seedNews(testDb.db, ch.id, { isFiltered: 1, postedAt: 200, telegramMsgId: 121 });

      const res = await app.request(`/api/news?channelId=${ch.id}&view=all`, { headers });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.items).toHaveLength(2);
      // filteredOut should still report the hidden count so the toolbar can show it
      expect(body.filteredOut).toBe(1);
    });
  });
});
