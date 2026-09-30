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

import bcrypt from 'bcryptjs';
import { Hono } from 'hono';
import { createTestUser, createTestSession, authHeaders } from '../__tests__/auth.js';
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

import { eq } from 'drizzle-orm';
import { groups, channels } from '../db/schema.js';
import { authMiddleware } from '../middleware/auth.js';
import groupsRouter from './groups.js';

function createApp() {
  const app = new Hono();
  app.use('/api/*', authMiddleware);
  app.route('/api/groups', groupsRouter);
  return app;
}

describe('Groups routes (integration)', () => {
  let app: ReturnType<typeof createApp>;
  let headers: Record<string, string>;
  let userId: number;

  beforeAll(async () => {
    testDb = await createTestDb();
    const user = await createTestUser(testDb.db);
    userId = user.id;
    headers = await authHeaders(user.id);
  });

  beforeEach(async () => {
    await testDb.client.execute('DELETE FROM sessions');
    await testDb.client.execute('DELETE FROM channels');
    await testDb.client.execute('DELETE FROM groups');
    app = createApp();
  });

  // ── GET /api/groups ─────────────────────────────────────────────────────

  describe('GET /', () => {
    it('returns 401 without auth', async () => {
      const res = await app.request('/api/groups');
      expect(res.status).toBe(401);
    });

    it('returns empty list when no groups', async () => {
      const res = await app.request('/api/groups', { headers });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual([]);
    });

    it('returns groups with hasPIN flag (not the hash)', async () => {
      await seedGroup(testDb.db, { name: 'No-PIN' });
      await seedGroup(testDb.db, { name: 'With-PIN', pinHash: await bcrypt.hash('1234', 4) });

      const res = await app.request('/api/groups', { headers });
      const body = await res.json();
      expect(body).toHaveLength(2);

      const noPinGroup = body.find((g: { name: string }) => g.name === 'No-PIN');
      const pinGroup = body.find((g: { name: string }) => g.name === 'With-PIN');
      expect(noPinGroup.hasPIN).toBe(false);
      expect(pinGroup.hasPIN).toBe(true);
      // pinHash should NOT be exposed
      expect(noPinGroup.pinHash).toBeUndefined();
      expect(pinGroup.pinHash).toBeUndefined();
    });
  });

  // ── POST /api/groups ────────────────────────────────────────────────────

  describe('POST /', () => {
    it('creates a group without PIN', async () => {
      const res = await app.request('/api/groups', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'News', color: '#ff0000' }),
      });

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.name).toBe('News');
      expect(body.color).toBe('#ff0000');
      expect(body.hasPIN).toBe(false);
    });

    it('creates a group with PIN (hashed)', async () => {
      const res = await app.request('/api/groups', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Private', pin: '1234' }),
      });

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.hasPIN).toBe(true);

      // Verify PIN is hashed in DB
      const [row] = await testDb.db.select().from(groups).where(eq(groups.id, body.id));
      expect(row.pinHash).toBeTruthy();
      expect(await bcrypt.compare('1234', row.pinHash!)).toBe(true);
    });
  });

  // ── PUT /api/groups/:id ─────────────────────────────────────────────────

  describe('PUT /:id', () => {
    it('updates group name and color', async () => {
      const g = await seedGroup(testDb.db, { name: 'Old' });

      const res = await app.request(`/api/groups/${g.id}`, {
        method: 'PUT',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'New', color: '#00ff00' }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.name).toBe('New');
      expect(body.color).toBe('#00ff00');
    });

    it('sets PIN on a group', async () => {
      const g = await seedGroup(testDb.db);

      const res = await app.request(`/api/groups/${g.id}`, {
        method: 'PUT',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: '9999' }),
      });

      expect(res.status).toBe(200);
      expect((await res.json()).hasPIN).toBe(true);
    });

    it('removes PIN when pin=null', async () => {
      const g = await seedGroup(testDb.db, { pinHash: await bcrypt.hash('1234', 4) });

      const res = await app.request(`/api/groups/${g.id}`, {
        method: 'PUT',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: null }),
      });

      expect(res.status).toBe(200);
      expect((await res.json()).hasPIN).toBe(false);
    });

    it('returns 404 for missing group', async () => {
      const res = await app.request('/api/groups/99999', {
        method: 'PUT',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'X' }),
      });
      expect(res.status).toBe(404);
    });
  });

  // ── DELETE /api/groups/:id ──────────────────────────────────────────────

  describe('DELETE /:id', () => {
    it('deletes a group and unlinks its channels', async () => {
      const g = await seedGroup(testDb.db, { name: 'ToDelete' });
      await seedChannel(testDb.db, { groupId: g.id });

      const res = await app.request(`/api/groups/${g.id}`, {
        method: 'DELETE',
        headers,
      });

      expect(res.status).toBe(200);

      // Group should be gone
      const remaining = await testDb.db.select().from(groups);
      expect(remaining).toHaveLength(0);

      // Channel should have groupId = null
      const chs = await testDb.db.select().from(channels);
      expect(chs[0].groupId).toBeNull();
    });

    it('returns 404 for missing group', async () => {
      const res = await app.request('/api/groups/99999', {
        method: 'DELETE',
        headers,
      });
      expect(res.status).toBe(404);
    });
  });

  // ── PATCH /api/groups/reorder ───────────────────────────────────────────

  describe('PATCH /reorder', () => {
    it('updates sortOrder for groups', async () => {
      const g1 = await seedGroup(testDb.db, { name: 'G1', sortOrder: 0 });
      const g2 = await seedGroup(testDb.db, { name: 'G2', sortOrder: 1 });

      const res = await app.request('/api/groups/reorder', {
        method: 'PATCH',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: [
            { id: g1.id, sortOrder: 1 },
            { id: g2.id, sortOrder: 0 },
          ],
        }),
      });

      expect(res.status).toBe(200);

      // Verify new order
      const listRes = await app.request('/api/groups', { headers });
      const body = await listRes.json();
      expect(body[0].name).toBe('G2');
      expect(body[1].name).toBe('G1');
    });
  });

  // ── POST /api/groups/:id/verify-pin ─────────────────────────────────────

  describe('POST /:id/verify-pin', () => {
    it('returns success for group without PIN', async () => {
      const g = await seedGroup(testDb.db);

      const res = await app.request(`/api/groups/${g.id}/verify-pin`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: 'anything' }),
      });

      expect(res.status).toBe(200);
      expect((await res.json()).success).toBe(true);
    });

    it('returns 401 for wrong PIN', async () => {
      const g = await seedGroup(testDb.db, { pinHash: await bcrypt.hash('1234', 4) });

      const res = await app.request(`/api/groups/${g.id}/verify-pin`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: 'wrong' }),
      });

      expect(res.status).toBe(401);
    });

    it('returns success + accessToken for correct PIN with session', async () => {
      const g = await seedGroup(testDb.db, { pinHash: await bcrypt.hash('1234', 4) });
      const session = await createTestSession(testDb.db, userId);
      const sessionHeaders = await authHeaders(userId, { sessionId: session.id });

      const res = await app.request(`/api/groups/${g.id}/verify-pin`, {
        method: 'POST',
        headers: { ...sessionHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: '1234' }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.accessToken).toBeDefined();
      expect(body.unlockedGroupIds).toContain(g.id);
    });

    it('returns 404 for missing group', async () => {
      const res = await app.request('/api/groups/99999/verify-pin', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: '1234' }),
      });
      expect(res.status).toBe(404);
    });
  });

  // ── POST /api/groups/lock-all ───────────────────────────────────────────

  describe('POST /lock-all', () => {
    it('clears unlocked groups and returns new token', async () => {
      const session = await createTestSession(testDb.db, userId);
      const sessionHeaders = await authHeaders(userId, { sessionId: session.id });

      const res = await app.request('/api/groups/lock-all', {
        method: 'POST',
        headers: sessionHeaders,
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.accessToken).toBeDefined();
    });
  });
});
