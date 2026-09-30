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

vi.mock('../services/logBuffer.js', () => {
  const mockEntries = [
    { time: Date.now(), level: 30, module: 'test', msg: 'info message' },
    { time: Date.now(), level: 50, module: 'test', msg: 'error message' },
    { time: Date.now() - 3 * 60 * 60 * 1000, level: 40, module: 'test', msg: 'old warning' },
  ];

  return {
    getLogEntries: vi.fn((sinceMs: number, minLevel: number) =>
      mockEntries.filter((e) => e.time >= sinceMs && e.level >= minLevel),
    ),
    getBufferSize: vi.fn(() => mockEntries.length),
    LEVEL_MAP: {
      trace: 10,
      debug: 20,
      info: 30,
      warn: 40,
      error: 50,
      fatal: 60,
    },
  };
});

import { Hono } from 'hono';
import { createTestUser, authHeaders } from '../__tests__/auth.js';
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

import { authMiddleware } from '../middleware/auth.js';
import { getLogEntries, getBufferSize } from '../services/logBuffer.js';
import logViewerRouter from './logViewer.js';

function createApp() {
  const app = new Hono();
  app.use('/api/*', authMiddleware);
  app.route('/api/logs', logViewerRouter);
  return app;
}

describe('Log viewer route (integration)', () => {
  let app: ReturnType<typeof createApp>;
  let headers: Record<string, string>;

  beforeAll(async () => {
    testDb = await createTestDb();
    const user = await createTestUser(testDb.db);
    headers = await authHeaders(user.id);
  });

  beforeEach(() => {
    app = createApp();
    vi.clearAllMocks();
  });

  // ── GET /api/logs ──────────────────────────────────────────────────────────

  describe('GET /', () => {
    it('returns 401 without auth', async () => {
      const res = await app.request('/api/logs');
      expect(res.status).toBe(401);
    });

    it('returns log entries with default params', async () => {
      const res = await app.request('/api/logs', { headers });
      expect(res.status).toBe(200);
      const body = await res.json();

      expect(body).toHaveProperty('entries');
      expect(body).toHaveProperty('total');
      expect(body).toHaveProperty('bufferSize');
      expect(body).toHaveProperty('sinceMs');
      expect(body).toHaveProperty('minLevel');

      // Default: hours=2, level=debug
      expect(getLogEntries).toHaveBeenCalledWith(expect.any(Number), 20); // debug=20
    });

    it('filters by hours param', async () => {
      const res = await app.request('/api/logs?hours=1', { headers });
      expect(res.status).toBe(200);

      const callArgs = vi.mocked(getLogEntries).mock.calls[0];
      const sinceMs = callArgs[0];
      // sinceMs should be approximately 1 hour ago
      const oneHourAgo = Date.now() - 1 * 60 * 60 * 1000;
      expect(sinceMs).toBeGreaterThan(oneHourAgo - 1000);
      expect(sinceMs).toBeLessThan(oneHourAgo + 1000);
    });

    it('filters by level param', async () => {
      const res = await app.request('/api/logs?level=error', { headers });
      expect(res.status).toBe(200);

      expect(getLogEntries).toHaveBeenCalledWith(expect.any(Number), 50); // error=50
    });

    it('clamps hours to min 0.25', async () => {
      await app.request('/api/logs?hours=0', { headers });
      const callArgs = vi.mocked(getLogEntries).mock.calls[0];
      const sinceMs = callArgs[0];
      const quarterHourAgo = Date.now() - 0.25 * 60 * 60 * 1000;
      expect(sinceMs).toBeGreaterThan(quarterHourAgo - 1000);
      expect(sinceMs).toBeLessThan(quarterHourAgo + 1000);
    });

    it('clamps hours to max 24', async () => {
      await app.request('/api/logs?hours=100', { headers });
      const callArgs = vi.mocked(getLogEntries).mock.calls[0];
      const sinceMs = callArgs[0];
      const twentyFourHoursAgo = Date.now() - 24 * 60 * 60 * 1000;
      expect(sinceMs).toBeGreaterThan(twentyFourHoursAgo - 1000);
      expect(sinceMs).toBeLessThan(twentyFourHoursAgo + 1000);
    });

    it('falls back to debug for unknown level', async () => {
      await app.request('/api/logs?level=unknown', { headers });
      expect(getLogEntries).toHaveBeenCalledWith(expect.any(Number), 20);
    });

    it('returns bufferSize from getBufferSize()', async () => {
      const res = await app.request('/api/logs', { headers });
      const body = await res.json();
      expect(body.bufferSize).toBe(3);
      expect(getBufferSize).toHaveBeenCalled();
    });
  });
});
