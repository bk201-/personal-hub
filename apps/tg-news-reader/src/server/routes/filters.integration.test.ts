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

import { Hono } from 'hono';
import { createTestUser, authHeaders } from '../__tests__/auth.js';
import { seedChannel } from '../__tests__/seed.js';
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

import { eq } from 'drizzle-orm';
import { filters } from '../db/schema.js';
import { authMiddleware } from '../middleware/auth.js';
import filtersRouter from './filters.js';

function createApp() {
  const app = new Hono();
  app.use('/api/*', authMiddleware);
  app.route('/api/channels/:channelId/filters', filtersRouter);
  return app;
}

describe('Filters routes (integration)', () => {
  let app: ReturnType<typeof createApp>;
  let headers: Record<string, string>;
  let channelId: number;

  beforeAll(async () => {
    testDb = await createTestDb();
    const user = await createTestUser(testDb.db);
    headers = await authHeaders(user.id);
  });

  beforeEach(async () => {
    await testDb.client.execute('DELETE FROM filter_stats');
    await testDb.client.execute('DELETE FROM filters');
    await testDb.client.execute('DELETE FROM news');
    await testDb.client.execute('DELETE FROM channels');
    app = createApp();
    const ch = await seedChannel(testDb.db);
    channelId = ch.id;
  });

  // ── GET /api/channels/:channelId/filters ──────────────────────────────────

  describe('GET /', () => {
    it('returns 401 without auth', async () => {
      const res = await app.request(`/api/channels/${channelId}/filters`);
      expect(res.status).toBe(401);
    });

    it('returns empty list when no filters', async () => {
      const res = await app.request(`/api/channels/${channelId}/filters`, { headers });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual([]);
    });

    it('returns filters for the channel', async () => {
      await testDb.db.insert(filters).values({ channelId, name: 'F1', type: 'keyword', value: 'test' });
      await testDb.db.insert(filters).values({ channelId, name: 'F2', type: 'tag', value: 'ad' });

      const res = await app.request(`/api/channels/${channelId}/filters`, { headers });
      const body = await res.json();
      expect(body).toHaveLength(2);
    });
  });

  // ── POST /api/channels/:channelId/filters ─────────────────────────────────

  describe('POST /', () => {
    it('creates a filter and returns 201', async () => {
      const res = await app.request(`/api/channels/${channelId}/filters`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Crypto', type: 'keyword', value: ' Bitcoin ' }),
      });

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.name).toBe('Crypto');
      expect(body.value).toBe('bitcoin'); // trimmed + lowercased
      expect(body.type).toBe('keyword');
    });
  });

  // ── PUT /api/channels/:channelId/filters/:id ──────────────────────────────

  describe('PUT /:id', () => {
    it('updates a filter', async () => {
      const [f] = await testDb.db
        .insert(filters)
        .values({ channelId, name: 'Old', type: 'keyword', value: 'old' })
        .returning();

      const res = await app.request(`/api/channels/${channelId}/filters/${f.id}`, {
        method: 'PUT',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'New', value: 'NEW_VAL' }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.name).toBe('New');
      expect(body.value).toBe('new_val'); // lowercased
    });

    it('returns 404 for non-existent filter', async () => {
      const res = await app.request(`/api/channels/${channelId}/filters/99999`, {
        method: 'PUT',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'X' }),
      });
      expect(res.status).toBe(404);
    });

    it('updates isActive flag', async () => {
      const [f] = await testDb.db.insert(filters).values({ channelId, name: 'F', type: 'tag', value: 'x' }).returning();

      const res = await app.request(`/api/channels/${channelId}/filters/${f.id}`, {
        method: 'PUT',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: 0 }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.isActive).toBe(0);
    });
  });

  // ── DELETE /api/channels/:channelId/filters/:id ───────────────────────────

  describe('DELETE /:id', () => {
    it('deletes a filter', async () => {
      const [f] = await testDb.db
        .insert(filters)
        .values({ channelId, name: 'Del', type: 'keyword', value: 'x' })
        .returning();

      const res = await app.request(`/api/channels/${channelId}/filters/${f.id}`, {
        method: 'DELETE',
        headers,
      });

      expect(res.status).toBe(200);

      // Verify gone
      const remaining = await testDb.db.select().from(filters).where(eq(filters.channelId, channelId));
      expect(remaining).toHaveLength(0);
    });

    it('returns 404 for non-existent filter', async () => {
      const res = await app.request(`/api/channels/${channelId}/filters/99999`, {
        method: 'DELETE',
        headers,
      });
      expect(res.status).toBe(404);
    });
  });

  // ── GET /api/channels/:channelId/filters/stats ────────────────────────────

  describe('GET /stats', () => {
    it('returns stats for channel filters', async () => {
      const [f] = await testDb.db
        .insert(filters)
        .values({ channelId, name: 'F', type: 'keyword', value: 'x' })
        .returning();

      // No stats yet — should return zeros
      const res = await app.request(`/api/channels/${channelId}/filters/stats`, { headers });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toHaveLength(1);
      expect(body[0].filterId).toBe(f.id);
      expect(body[0].hitsTotal).toBe(0);
    });
  });

  // ── POST /api/channels/:channelId/filters/batch ───────────────────────────

  describe('POST /batch', () => {
    it('adds multiple filters in a single request', async () => {
      const res = await app.request(`/api/channels/${channelId}/filters/batch`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          toAdd: [
            { name: '#crypto', type: 'tag', value: '#crypto' },
            { name: '#ads', type: 'tag', value: '#ads' },
          ],
          toDelete: [],
        }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.added).toHaveLength(2);
      expect(body.deleted).toBe(0);

      const all = await testDb.db.select().from(filters).where(eq(filters.channelId, channelId));
      expect(all).toHaveLength(2);
    });

    it('deletes multiple filters in a single request', async () => {
      const [f1, f2] = await testDb.db
        .insert(filters)
        .values([
          { channelId, name: '#a', type: 'tag', value: 'a' },
          { channelId, name: '#b', type: 'tag', value: 'b' },
        ])
        .returning();

      const res = await app.request(`/api/channels/${channelId}/filters/batch`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ toAdd: [], toDelete: [f1.id, f2.id] }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.deleted).toBe(2);

      const remaining = await testDb.db.select().from(filters).where(eq(filters.channelId, channelId));
      expect(remaining).toHaveLength(0);
    });

    it('adds and deletes in the same request', async () => {
      const [existing] = await testDb.db
        .insert(filters)
        .values({ channelId, name: '#old', type: 'tag', value: 'old' })
        .returning();

      const res = await app.request(`/api/channels/${channelId}/filters/batch`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          toAdd: [{ name: '#new', type: 'tag', value: '#new' }],
          toDelete: [existing.id],
        }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.added).toHaveLength(1);
      expect(body.deleted).toBe(1);

      const all = await testDb.db.select().from(filters).where(eq(filters.channelId, channelId));
      expect(all).toHaveLength(1);
      expect(all[0].value).toBe('#new');
    });

    it('returns 200 for empty batch', async () => {
      const res = await app.request(`/api/channels/${channelId}/filters/batch`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ toAdd: [], toDelete: [] }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.added).toHaveLength(0);
      expect(body.deleted).toBe(0);
    });

    it('returns 401 without auth', async () => {
      const res = await app.request(`/api/channels/${channelId}/filters/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toAdd: [], toDelete: [] }),
      });
      expect(res.status).toBe(401);
    });
  });
});
