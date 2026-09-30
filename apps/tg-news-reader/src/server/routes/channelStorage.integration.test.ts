import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs/promises';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { authHeaders, createTestSession, createTestUser, generateTestToken } from '../__tests__/auth.js';
import { seedChannel, seedGroup } from '../__tests__/seed.js';
import { createTestDb } from '../__tests__/testDb.js';
import type { TestDb } from '../__tests__/testDb.js';
import type { channels } from '../db/schema.js';
import { sessions } from '../db/schema.js';
import { logger } from '../logger.js';
import { authMiddleware } from '../middleware/auth.js';
import { channelStorage } from '../services/channelStorage.js';
import channelsRouter from './channels.js';

vi.mock('../config.js', () => ({ JWT_SECRET: 'test-secret-key' }));
vi.mock('../logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), fatal: vi.fn(), debug: vi.fn() },
}));
vi.mock('../services/telegram.js', () => ({ getChannelInfo: vi.fn(), readChannelHistory: vi.fn() }));
vi.mock('../services/channelFetchService.js', () => ({ fetchChannelNews: vi.fn() }));
vi.mock('node:fs/promises', async (importOriginal) => ({
  ...(await importOriginal<typeof fs>()),
}));

let testDb: TestDb;
vi.mock('../db/index.js', () => ({
  get db() {
    return testDb.db;
  },
  get client() {
    return testDb.client;
  },
}));

const app = new Hono();
app.use('/api/*', authMiddleware);
app.route('/api/channels', channelsRouter);
const fixtureDirectories = new Set<string>();
let userId: number;
let sessionId: string;
let headers: Record<string, string>;

async function storedChannel(overrides: Partial<typeof channels.$inferInsert> = {}) {
  return seedChannel(testDb.db, { telegramId: `storage_test_${randomUUID().replaceAll('-', '')}`, ...overrides });
}

async function addFile(telegramId: string, filename: string, bytes: number) {
  const directory = join(process.cwd(), 'data', telegramId);
  fixtureDirectories.add(directory);
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(join(directory, filename), Buffer.alloc(bytes));
}

function request(id: number | string, requestHeaders = headers) {
  return app.request(`/api/channels/${id}/storage`, { headers: requestHeaders });
}

beforeAll(async () => {
  testDb = await createTestDb();
  userId = (await createTestUser(testDb.db)).id;
});

beforeEach(async () => {
  vi.clearAllMocks();
  await testDb.client.executeMultiple('DELETE FROM channels; DELETE FROM groups; DELETE FROM sessions;');
  sessionId = (await createTestSession(testDb.db, userId)).id;
  headers = await authHeaders(userId, { sessionId });
});

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all([...fixtureDirectories].map((path) => fs.rm(path, { recursive: true, force: true })));
  fixtureDirectories.clear();
});

afterAll(() => testDb.client.close());

describe('GET /api/channels/:id/storage', () => {
  it('returns real on-disk storage with UNIX seconds, without requiring news records', async () => {
    const channel = await storedChannel();
    await addFile(channel.telegramId, 'photo.jpg', 13);
    await addFile(channel.telegramId, 'iv_1_0.jpg', 7);
    await addFile(channel.telegramId, 'orphan.part', 3);
    const start = Math.floor(Date.now() / 1000);
    const response = await request(channel.id);
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    const body = await response.json();
    expect(body).toEqual({ bytes: 23, fileCount: 3, checkedAt: expect.any(Number) });
    expect(body.checkedAt).toBeGreaterThanOrEqual(start);
    expect(body.checkedAt).toBeLessThanOrEqual(Math.floor(Date.now() / 1000));

    const open = vi.spyOn(fs, 'opendir');
    expect(await (await request(channel.id)).json()).toEqual(body);
    expect(open).not.toHaveBeenCalled();
  });

  it('returns zero for a channel whose directory does not exist', async () => {
    const channel = await storedChannel();
    const response = await request(channel.id);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ bytes: 0, fileCount: 0 });
  });

  it('returns 401 without auth or with an invalid token, before stats access', async () => {
    const get = vi.spyOn(channelStorage, 'getStats');
    const channel = await storedChannel();
    expect((await request(channel.id, {})).status).toBe(401);
    expect((await request(channel.id, { Authorization: 'Bearer invalid' })).status).toBe(401);
    const bareRouter = new Hono().route('/api/channels', channelsRouter);
    expect((await bareRouter.request(`/api/channels/${channel.id}/storage`)).status).toBe(401);
    expect(get).not.toHaveBeenCalled();
  });

  it.each(['0', '-1', '1abc', '1.5', '1e2', '01', 'NaN', '9007199254740992', '%20'])(
    'returns 400 for malformed ID %s before stats access',
    async (id) => {
      const get = vi.spyOn(channelStorage, 'getStats');
      expect((await request(id)).status).toBe(400);
      expect(get).not.toHaveBeenCalled();
    },
  );

  it('returns 404 for a missing channel before stats access', async () => {
    const get = vi.spyOn(channelStorage, 'getStats');
    expect((await request(Number.MAX_SAFE_INTEGER)).status).toBe(404);
    expect(get).not.toHaveBeenCalled();
  });

  it('allows channels in groups without a PIN', async () => {
    const group = await seedGroup(testDb.db);
    const channel = await storedChannel({ groupId: group.id });
    expect((await request(channel.id)).status).toBe(200);
  });

  it('uses current session unlocks, not JWT claims, and blocks cache reads immediately after locking', async () => {
    const group = await seedGroup(testDb.db, { pinHash: 'configured-pin' });
    const channel = await storedChannel({ groupId: group.id });
    const get = vi.spyOn(channelStorage, 'getStats');
    expect((await request(channel.id)).status).toBe(403);
    expect(get).not.toHaveBeenCalled();

    await testDb.db
      .update(sessions)
      .set({ unlockedGroupIds: JSON.stringify([group.id]) })
      .where(eq(sessions.id, sessionId));
    // The original token has no unlock claims; the session is authoritative.
    expect((await request(channel.id)).status).toBe(200);
    expect(get).toHaveBeenCalledTimes(1);
    get.mockClear();

    const staleToken = await generateTestToken(userId, { sessionId, unlockedGroupIds: [group.id] });
    await testDb.db.update(sessions).set({ unlockedGroupIds: '[]' }).where(eq(sessions.id, sessionId));
    expect((await request(channel.id, { Authorization: `Bearer ${staleToken}` })).status).toBe(403);
    expect(get).not.toHaveBeenCalled();
  });

  it('does not expose another session’s warmed cache to a locked session', async () => {
    const group = await seedGroup(testDb.db, { pinHash: 'configured-pin' });
    const channel = await storedChannel({ groupId: group.id });
    await testDb.db
      .update(sessions)
      .set({ unlockedGroupIds: JSON.stringify([group.id]) })
      .where(eq(sessions.id, sessionId));
    expect((await request(channel.id)).status).toBe(200);
    const other = await createTestSession(testDb.db, userId);
    const get = vi.spyOn(channelStorage, 'getStats');
    expect((await request(channel.id, await authHeaders(userId, { sessionId: other.id }))).status).toBe(403);
    expect(get).not.toHaveBeenCalled();
  });

  it.each(['missing', 'expired', 'foreign', 'invalid-json', 'non-array', 'string-id'])(
    'fails closed with a %s session unlock state',
    async (state) => {
      const group = await seedGroup(testDb.db, { pinHash: 'configured-pin' });
      const channel = await storedChannel({ groupId: group.id });
      await testDb.db
        .update(sessions)
        .set({ unlockedGroupIds: JSON.stringify([group.id]) })
        .where(eq(sessions.id, sessionId));
      if (state === 'missing') await testDb.db.delete(sessions).where(eq(sessions.id, sessionId));
      else {
        const updates: Partial<typeof sessions.$inferInsert> =
          state === 'expired'
            ? { expiresAt: Math.floor(Date.now() / 1000) }
            : state === 'foreign'
              ? { userId: (await createTestUser(testDb.db)).id }
              : {
                  unlockedGroupIds:
                    state === 'invalid-json' ? '{' : state === 'non-array' ? '{}' : JSON.stringify([`${group.id}`]),
                };
        await testDb.db.update(sessions).set(updates).where(eq(sessions.id, sessionId));
      }
      const get = vi.spyOn(channelStorage, 'getStats');
      expect((await request(channel.id)).status).toBe(403);
      expect(get).not.toHaveBeenCalled();
    },
  );

  it('returns safe 503s, logs the actual error, and cools down permission failures', async () => {
    const channel = await storedChannel();
    await addFile(channel.telegramId, 'photo.jpg', 4);
    const error = Object.assign(new Error('private filesystem details'), { code: 'EACCES' });
    const open = vi.spyOn(fs, 'opendir').mockRejectedValue(error);
    for (let i = 0; i < 2; i++) {
      const response = await request(channel.id);
      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({ error: 'Channel storage unavailable' });
    }
    expect(open).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledExactlyOnceWith(
      { module: 'channelStorage', err: error },
      'Channel storage scan failed',
    );
  });

  it('rejects persisted unsafe directory names rather than inspecting shared storage', async () => {
    const channel = await storedChannel({ telegramId: 'tts' });
    const stat = vi.spyOn(fs, 'lstat');
    expect((await request(channel.id)).status).toBe(503);
    expect(stat).not.toHaveBeenCalled();
  });

  it('never computes stats or performs filesystem I/O on the channel list', async () => {
    await storedChannel();
    const get = vi.spyOn(channelStorage, 'getStats');
    const stat = vi.spyOn(fs, 'lstat');
    const open = vi.spyOn(fs, 'opendir');
    const response = await app.request('/api/channels', { headers });
    expect(response.status).toBe(200);
    expect(await response.json()).toHaveLength(1);
    expect(get).not.toHaveBeenCalled();
    expect(stat).not.toHaveBeenCalled();
    expect(open).not.toHaveBeenCalled();
  });
});
