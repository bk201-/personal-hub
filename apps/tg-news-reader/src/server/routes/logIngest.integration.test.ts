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

import { logger } from '../logger.js';
import { authMiddleware } from '../middleware/auth.js';
import logIngestRouter from './logIngest.js';

function createApp() {
  const app = new Hono();
  app.use('/api/*', authMiddleware);
  app.route('/api/log/client', logIngestRouter);
  return app;
}

describe('Log ingest route (integration)', () => {
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

  // ── POST /api/log/client ───────────────────────────────────────────────────

  describe('POST /', () => {
    it('returns 401 without auth', async () => {
      const res = await app.request('/api/log/client', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entries: [] }),
      });
      expect(res.status).toBe(401);
    });

    it('returns ok:true for valid entries', async () => {
      const res = await app.request('/api/log/client', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entries: [
            { level: 'warn', msg: 'something happened', module: 'test' },
            { level: 'error', msg: 'something broke', module: 'test' },
          ],
        }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);
    });

    it('calls logger.warn for warn-level entries', async () => {
      await app.request('/api/log/client', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entries: [{ level: 'warn', msg: 'test warning', module: 'myModule' }],
        }),
      });

      expect(logger.warn).toHaveBeenCalledWith(expect.objectContaining({ module: 'client:myModule' }), 'test warning');
    });

    it('calls logger.error for error-level entries', async () => {
      await app.request('/api/log/client', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entries: [{ level: 'error', msg: 'test error', module: 'errMod' }],
        }),
      });

      expect(logger.error).toHaveBeenCalledWith(expect.objectContaining({ module: 'client:errMod' }), 'test error');
    });

    it('ignores entries with disallowed levels', async () => {
      const res = await app.request('/api/log/client', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entries: [{ level: 'info', msg: 'should be ignored' }],
        }),
      });

      // Schema enforces z.enum(['warn', 'error']) — 'info' fails validation.
      // parseOptionalBody converts ZodError → HTTPException(400).
      expect(res.status).toBe(400);
    });

    it('returns 400 for body that fails Zod validation', async () => {
      const res = await app.request('/api/log/client', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: '{}',
      });

      // Missing required `entries` field → ZodError → HTTPException(400)
      expect(res.status).toBe(400);
    });

    it('returns 400 for malformed JSON', async () => {
      const res = await app.request('/api/log/client', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: 'not json',
      });

      expect(res.status).toBe(400);
    });

    it('truncates long strings in entry fields', async () => {
      const longMsg = 'x'.repeat(600);
      await app.request('/api/log/client', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entries: [{ level: 'warn', msg: longMsg, module: 'test' }],
        }),
      });

      // msg is truncated to 500 chars in the route
      expect(logger.warn).toHaveBeenCalledWith(expect.anything(), expect.stringMatching(/^x{500}$/));
    });

    it('limits entries to MAX_ENTRIES (20)', async () => {
      const entries = Array.from({ length: 25 }, (_, i) => ({
        level: 'warn' as const,
        msg: `msg-${i}`,
        module: 'test',
      }));

      await app.request('/api/log/client', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ entries }),
      });

      // Only first 20 should be logged
      expect(logger.warn).toHaveBeenCalledTimes(20);
    });

    it('uses "unknown" for missing module', async () => {
      await app.request('/api/log/client', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entries: [{ level: 'warn', msg: 'no module' }],
        }),
      });

      expect(logger.warn).toHaveBeenCalledWith(expect.objectContaining({ module: 'client:unknown' }), 'no module');
    });

    it('passes extra fields through with truncation', async () => {
      const longUrl = 'https://example.com/' + 'a'.repeat(2500);
      await app.request('/api/log/client', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entries: [{ level: 'error', msg: 'err', module: 'x', url: longUrl }],
        }),
      });

      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          url: expect.stringContaining('…'),
        }),
        'err',
      );
    });
  });
});
