import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Mocks ──────────────────────────────────────────────────────────────────

vi.mock('../config.js', () => ({
  JWT_SECRET: 'test-secret-key',
  JWT_ACCESS_EXPIRES_SEC: 900,
  REFRESH_EXPIRES_DAYS: 7,
  NEWS_DEFAULT_FETCH_DAYS: 3,
  NEWS_FETCH_LIMIT: 1000,
}));

vi.mock('../logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), fatal: vi.fn(), debug: vi.fn() },
}));

vi.mock('../services/telegram.js', () => ({
  getChannelInfo: vi.fn(),
  readChannelHistory: vi.fn().mockResolvedValue(undefined),
  fetchChannelMessages: vi.fn(),
  fetchMessageById: vi.fn(),
  getReadInboxMaxId: vi.fn(),
}));

vi.mock('../services/channelFetchService.js', () => ({
  fetchChannelNews: vi.fn(),
}));

vi.mock('../services/mediaProgress.js', () => ({
  mediaProgressEmitter: { on: vi.fn(), off: vi.fn(), emit: vi.fn() },
}));

import { Hono } from 'hono';
import { createTestUser, authHeaders } from '../__tests__/auth.js';
import { seedChannel, seedGroup } from '../__tests__/seed.js';
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

import { news } from '../db/schema.js';
import { authMiddleware } from '../middleware/auth.js';
import { fetchChannelNews } from '../services/channelFetchService.js';
import { getChannelInfo, readChannelHistory } from '../services/telegram.js';
import { ChannelUnavailableError } from '../services/telegramChannelErrors.js';
import channelsRouter from './channels.js';

function createApp() {
  const app = new Hono();
  app.use('/api/*', authMiddleware);
  app.route('/api/channels', channelsRouter);
  return app;
}

describe('Channels routes (integration)', () => {
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
    await testDb.client.execute('DELETE FROM groups');
    app = createApp();
  });

  // ── GET /api/channels ─────────────────────────────────────────────────────

  describe('GET /api/channels', () => {
    it('returns 401 without auth', async () => {
      const res = await app.request('/api/channels');
      expect(res.status).toBe(401);
    });

    it('returns empty list when no channels exist', async () => {
      const res = await app.request('/api/channels', { headers });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual([]);
    });

    it('returns channels sorted by sortOrder then createdAt', async () => {
      await seedChannel(testDb.db, { name: 'Second', telegramId: 's', sortOrder: 1 });
      await seedChannel(testDb.db, { name: 'First', telegramId: 'f', sortOrder: 0 });

      const res = await app.request('/api/channels', { headers });
      const body = await res.json();
      expect(body).toHaveLength(2);
      expect(body[0].name).toBe('First');
      expect(body[1].name).toBe('Second');
    });
  });

  // ── POST /api/channels ────────────────────────────────────────────────────

  describe('POST /api/channels', () => {
    it('creates a new channel', async () => {
      const res = await app.request('/api/channels', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ telegramId: 'durov', name: 'Durov Channel' }),
      });

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.telegramId).toBe('durov');
      expect(body.name).toBe('Durov Channel');
    });

    it('strips @, t.me prefix from telegramId', async () => {
      const res = await app.request('/api/channels', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ telegramId: 'https://t.me/meduzalive', name: 'Meduza' }),
      });

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.telegramId).toBe('meduzalive');
    });

    it('returns 409 for duplicate telegramId', async () => {
      await seedChannel(testDb.db, { telegramId: 'dup' });

      const res = await app.request('/api/channels', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ telegramId: 'dup', name: 'Duplicate' }),
      });

      expect(res.status).toBe(409);
    });

    it('assigns groupId when provided', async () => {
      const group = await seedGroup(testDb.db, { name: 'G1' });

      const res = await app.request('/api/channels', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ telegramId: 'grp_ch', name: 'Grouped', groupId: group.id }),
      });

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.groupId).toBe(group.id);
    });
  });

  // ── PUT /api/channels/:id ─────────────────────────────────────────────────

  describe('PUT /api/channels/:id', () => {
    it('updates channel fields', async () => {
      const ch = await seedChannel(testDb.db, { name: 'Old' });

      const res = await app.request(`/api/channels/${ch.id}`, {
        method: 'PUT',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'New', channelType: 'media' }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.name).toBe('New');
      expect(body.channelType).toBe('media');
    });

    it('accepts description: null (channel without a description)', async () => {
      // Regression: editing a channel that has no description used to send
      // `description: null`, which the schema rejected → 400 → save silently failed.
      const ch = await seedChannel(testDb.db, { name: 'NoDesc' });
      const group = await seedGroup(testDb.db, { name: 'G' });

      const res = await app.request(`/api/channels/${ch.id}`, {
        method: 'PUT',
        headers: { ...headers, 'Content-Type': 'application/json' },
        // mirrors exactly what the client sends when only the group changes
        body: JSON.stringify({
          telegramId: ch.telegramId,
          name: 'NoDesc',
          description: null,
          channelType: 'news',
          groupId: group.id,
        }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.groupId).toBe(group.id);
    });

    it('persists filterForwards and hides existing forwarded news', async () => {
      const ch = await seedChannel(testDb.db, { name: 'Fwd', filterForwards: 0 });
      await testDb.db.insert(news).values({
        channelId: ch.id,
        telegramMsgId: 1,
        text: 'repost',
        postedAt: Math.floor(Date.now() / 1000),
        forwardFromName: 'Other',
      });

      const res = await app.request(`/api/channels/${ch.id}`, {
        method: 'PUT',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ filterForwards: 1 }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.filterForwards).toBe(1);

      const rows = await testDb.client.execute('SELECT is_filtered FROM news WHERE channel_id = ?', [ch.id]);
      expect(rows.rows[0].is_filtered).toBe(1);
    });

    it('returns 404 for missing channel', async () => {
      const res = await app.request('/api/channels/99999', {
        method: 'PUT',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'X' }),
      });
      expect(res.status).toBe(404);
    });
  });

  // ── DELETE /api/channels/:id ──────────────────────────────────────────────

  describe('DELETE /api/channels/:id', () => {
    it('deletes a channel', async () => {
      const ch = await seedChannel(testDb.db);

      const res = await app.request(`/api/channels/${ch.id}`, {
        method: 'DELETE',
        headers,
      });

      expect(res.status).toBe(200);

      // Should be gone
      const listRes = await app.request('/api/channels', { headers });
      const body = await listRes.json();
      expect(body).toHaveLength(0);
    });

    it('returns 404 for missing channel', async () => {
      const res = await app.request('/api/channels/99999', {
        method: 'DELETE',
        headers,
      });
      expect(res.status).toBe(404);
    });
  });

  // ── POST /api/channels/:id/fetch ──────────────────────────────────────────

  describe('POST /api/channels/:id/fetch', () => {
    it.each(['fetch', 'mark-read-and-fetch'])(
      'returns an explicit 422 for unavailable channels on %s',
      async (action) => {
        const ch = await seedChannel(testDb.db);
        vi.mocked(fetchChannelNews).mockRejectedValueOnce(new ChannelUnavailableError(new Error('CHANNEL_PRIVATE')));
        const res = await app.request(`/api/channels/${ch.id}/${action}`, {
          method: 'POST',
          headers,
          body: JSON.stringify({}),
        });
        expect(res.status).toBe(422);
        expect((await res.json()).error).toBe('Telegram channel is unavailable (deleted, private, or inaccessible)');
      },
    );
    it('calls fetchChannelNews and returns result', async () => {
      const ch = await seedChannel(testDb.db);
      const mockResult = {
        inserted: 5,
        total: 10,
        mediaProcessing: false,
        totalNewsCount: 10,
        unreadCount: 5,
      };
      vi.mocked(fetchChannelNews).mockResolvedValueOnce(mockResult);

      const res = await app.request(`/api/channels/${ch.id}/fetch`, {
        method: 'POST',
        headers,
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.inserted).toBe(5);
      expect(body.total).toBe(10);
      expect(fetchChannelNews).toHaveBeenCalledWith(ch.id, {});
    });

    it('returns 404 when fetchChannelNews throws "Channel not found"', async () => {
      vi.mocked(fetchChannelNews).mockRejectedValueOnce(new Error('Channel not found'));

      const res = await app.request('/api/channels/99999/fetch', {
        method: 'POST',
        headers,
      });

      expect(res.status).toBe(404);
    });

    it('returns 500 on unexpected error', async () => {
      const ch = await seedChannel(testDb.db);
      vi.mocked(fetchChannelNews).mockRejectedValueOnce(new Error('Telegram timeout'));

      const res = await app.request(`/api/channels/${ch.id}/fetch`, {
        method: 'POST',
        headers,
      });

      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error).toBe('Telegram timeout');
    });
  });

  // ── GET /api/channels/lookup ──────────────────────────────────────────────

  describe('GET /api/channels/lookup', () => {
    it('returns channel info from Telegram', async () => {
      vi.mocked(getChannelInfo).mockResolvedValueOnce({
        name: 'Durov Channel',
        username: 'durov',
        description: 'About text',
      });

      const res = await app.request('/api/channels/lookup?username=durov', { headers });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.name).toBe('Durov Channel');
    });

    it('strips @ prefix from username', async () => {
      vi.mocked(getChannelInfo).mockResolvedValueOnce({
        name: 'At Channel',
        username: 'atchannel',
        description: 'Desc',
      });

      const res = await app.request('/api/channels/lookup?username=@atchannel', { headers });
      expect(res.status).toBe(200);
      expect(getChannelInfo).toHaveBeenCalledWith('atchannel');
    });

    it('returns 400 for empty username', async () => {
      const res = await app.request('/api/channels/lookup?username=', { headers });
      expect(res.status).toBe(400);
    });

    it('returns 404 when channel is not found', async () => {
      vi.mocked(getChannelInfo).mockRejectedValueOnce(new Error('not found'));

      const res = await app.request('/api/channels/lookup?username=nonexistent', { headers });
      expect(res.status).toBe(404);
    });
  });

  // ── PATCH /api/channels/reorder ───────────────────────────────────────────

  describe('PATCH /api/channels/reorder', () => {
    it('updates sortOrder for multiple channels', async () => {
      const ch1 = await seedChannel(testDb.db, { telegramId: 'r1', sortOrder: 0 });
      const ch2 = await seedChannel(testDb.db, { telegramId: 'r2', sortOrder: 1 });

      const res = await app.request('/api/channels/reorder', {
        method: 'PATCH',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: [
            { id: ch1.id, sortOrder: 1 },
            { id: ch2.id, sortOrder: 0 },
          ],
        }),
      });

      expect(res.status).toBe(200);

      // Verify new order
      const listRes = await app.request('/api/channels', { headers });
      const body = await listRes.json();
      expect(body[0].name).toBe(ch2.name);
      expect(body[1].name).toBe(ch1.name);
    });
  });

  // ── POST /api/channels/:id/mark-read-and-fetch ────────────────────────────

  describe('POST /api/channels/:id/mark-read-and-fetch', () => {
    it('marks all unread news as read, syncs to TG, then fetches', async () => {
      const ch = await seedChannel(testDb.db, { unreadCount: 2 });
      // Insert unread news items
      await testDb.db.insert(news).values([
        { channelId: ch.id, telegramMsgId: 100, postedAt: 1000, isRead: 0, text: 'a' },
        { channelId: ch.id, telegramMsgId: 200, postedAt: 2000, isRead: 0, text: 'b' },
      ]);

      const fetchResult = { inserted: 3, total: 5, mediaProcessing: false, totalNewsCount: 5, unreadCount: 3 };
      vi.mocked(fetchChannelNews).mockResolvedValueOnce(fetchResult);

      const res = await app.request(`/api/channels/${ch.id}/mark-read-and-fetch`, {
        method: 'POST',
        headers,
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.inserted).toBe(3);

      // readChannelHistory should have been called with the max telegramMsgId
      expect(readChannelHistory).toHaveBeenCalledWith(ch.telegramId, 200);
    });

    it('advances last_read_at even when the Telegram sync fails', async () => {
      // Regression (bug B): the read watermark must be written regardless of the
      // Telegram round-trip — otherwise last_read_at stays NULL and a later fetch
      // (which cleans up read items) permanently empties the channel.
      const ch = await seedChannel(testDb.db, { unreadCount: 1, lastReadAt: null });
      await testDb.db
        .insert(news)
        .values({ channelId: ch.id, telegramMsgId: 700, postedAt: 99999, isRead: 0, text: 'x' });

      vi.mocked(readChannelHistory).mockRejectedValueOnce(new Error('FLOOD_WAIT'));
      vi.mocked(fetchChannelNews).mockResolvedValueOnce({
        inserted: 0,
        total: 0,
        mediaProcessing: false,
        totalNewsCount: 1,
        unreadCount: 0,
      });

      const res = await app.request(`/api/channels/${ch.id}/mark-read-and-fetch`, {
        method: 'POST',
        headers,
      });
      expect(res.status).toBe(200);

      const listRes = await app.request('/api/channels', { headers });
      const list = await listRes.json();
      const updated = list.find((x: { id: number }) => x.id === ch.id);
      expect(updated.lastReadAt).toBe(99999);
    });

    it('returns 404 for non-existent channel', async () => {
      const res = await app.request('/api/channels/99999/mark-read-and-fetch', {
        method: 'POST',
        headers,
      });
      expect(res.status).toBe(404);
    });

    it('returns 500 when fetchChannelNews throws', async () => {
      const ch = await seedChannel(testDb.db);
      vi.mocked(fetchChannelNews).mockRejectedValueOnce(new Error('TG error'));

      const res = await app.request(`/api/channels/${ch.id}/mark-read-and-fetch`, {
        method: 'POST',
        headers,
      });

      expect(res.status).toBe(500);
    });
  });
});
