import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Mocks (must be before any imports that touch them) ─────────────────────

vi.mock('../config.js', () => ({
  JWT_SECRET: 'test-secret-key',
  JWT_ACCESS_EXPIRES_SEC: 900,
  REFRESH_EXPIRES_DAYS: 7,
}));

vi.mock('../logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), fatal: vi.fn(), debug: vi.fn() },
}));

import { Hono } from 'hono';
import { createTestUser, createTestSession, authHeaders } from '../__tests__/auth.js';
import { createTestDb } from '../__tests__/testDb.js';
import type { TestDb } from '../__tests__/testDb.js';

// We need to mock db/index so the auth routes use our in-memory DB
let testDb: TestDb;

vi.mock('../db/index.js', () => ({
  get client() {
    return testDb.client;
  },
  get db() {
    return testDb.db;
  },
}));

import authRouter from './auth.js';

function createApp() {
  const app = new Hono();
  app.route('/api/auth', authRouter);
  return app;
}

describe('Auth routes (integration)', () => {
  let app: ReturnType<typeof createApp>;

  beforeAll(async () => {
    testDb = await createTestDb();
  });

  beforeEach(async () => {
    // Clean tables between tests
    await testDb.client.execute('DELETE FROM sessions');
    await testDb.client.execute('DELETE FROM users');
    app = createApp();
  });

  // ── POST /api/auth/login ──────────────────────────────────────────────────

  describe('POST /api/auth/login', () => {
    it('returns 200 + accessToken + refresh cookie on valid credentials', async () => {
      await createTestUser(testDb.db, { email: 'user@test.com', password: 'secret' });

      const res = await app.request('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'user@test.com', password: 'secret' }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.accessToken).toBeDefined();
      expect(body.user.email).toBe('user@test.com');

      // Session cookies should be set
      const setCookie = res.headers.get('set-cookie');
      expect(setCookie).toContain('refresh_token=');
      expect(setCookie).toContain('media_token=');
      expect(setCookie).toContain('Path=/api/media');
    });

    it('returns 401 for unknown email', async () => {
      const res = await app.request('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'nobody@test.com', password: 'any' }),
      });

      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error).toBe('Invalid credentials');
    });

    it('returns 401 for wrong password', async () => {
      await createTestUser(testDb.db, { email: 'user@test.com', password: 'correct' });

      const res = await app.request('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'user@test.com', password: 'wrong' }),
      });

      expect(res.status).toBe(401);
    });

    it('returns 401 with requiresTOTP when user has TOTP and no code given', async () => {
      await createTestUser(testDb.db, {
        email: 'totp@test.com',
        password: 'secret',
        totpSecret: 'JBSWY3DPEHPK3PXP', // any valid base32
      });

      const res = await app.request('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'totp@test.com', password: 'secret' }),
      });

      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.requiresTOTP).toBe(true);
    });
  });

  // ── POST /api/auth/refresh ────────────────────────────────────────────────

  describe('POST /api/auth/refresh', () => {
    it('returns new accessToken with a valid refresh cookie', async () => {
      const user = await createTestUser(testDb.db, { email: 'r@test.com', password: 'p' });
      const session = await createTestSession(testDb.db, user.id);

      const res = await app.request('/api/auth/refresh', {
        method: 'POST',
        headers: { Cookie: `refresh_token=${session.cookieValue}` },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.accessToken).toBeDefined();
      expect(body.user.email).toBe('r@test.com');
      expect(res.headers.get('set-cookie')).toContain('media_token=');
    });

    it('returns 401 without a refresh cookie', async () => {
      const res = await app.request('/api/auth/refresh', { method: 'POST' });
      expect(res.status).toBe(401);
    });

    it('returns 401 for an invalid refresh token', async () => {
      const user = await createTestUser(testDb.db, { email: 'bad@test.com', password: 'p' });
      const session = await createTestSession(testDb.db, user.id);

      const res = await app.request('/api/auth/refresh', {
        method: 'POST',
        headers: { Cookie: `refresh_token=${session.id}:wrong-token` },
      });

      expect(res.status).toBe(401);
    });
  });

  // ── POST /api/auth/logout ─────────────────────────────────────────────────

  describe('POST /api/auth/logout', () => {
    it('deletes the session and clears the cookie', async () => {
      const user = await createTestUser(testDb.db, { email: 'out@test.com', password: 'p' });
      const session = await createTestSession(testDb.db, user.id);

      const res = await app.request('/api/auth/logout', {
        method: 'POST',
        headers: { Cookie: `refresh_token=${session.cookieValue}` },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(res.headers.get('set-cookie')).toContain('media_token=');

      // Session should be gone — refresh should fail
      const refreshRes = await app.request('/api/auth/refresh', {
        method: 'POST',
        headers: { Cookie: `refresh_token=${session.cookieValue}` },
      });
      expect(refreshRes.status).toBe(401);
    });
  });

  // ── GET /api/auth/me ──────────────────────────────────────────────────────

  describe('GET /api/auth/me', () => {
    it('returns 401 without auth', async () => {
      const res = await app.request('/api/auth/me');
      expect(res.status).toBe(401);
    });

    it('returns user info with valid token', async () => {
      const user = await createTestUser(testDb.db, { email: 'me@test.com', password: 'p' });
      const headers = await authHeaders(user.id);

      const res = await app.request('/api/auth/me', { headers });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.email).toBe('me@test.com');
      expect(body.hasTOTP).toBe(false);
    });
  });

  // ── GET /api/auth/totp/setup ──────────────────────────────────────────────

  describe('GET /api/auth/totp/setup', () => {
    it('returns QR code and secret', async () => {
      const user = await createTestUser(testDb.db, { email: 'totp-setup@test.com', password: 'p' });
      const headers = await authHeaders(user.id);

      const res = await app.request('/api/auth/totp/setup', { headers });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.qrCode).toContain('data:image/png');
      expect(body.secret).toBeDefined();
      expect(body.otpauthUrl).toContain('otpauth://totp/');
    });
  });

  // ── DELETE /api/auth/totp ─────────────────────────────────────────────────

  describe('DELETE /api/auth/totp', () => {
    it('disables TOTP for the user', async () => {
      const user = await createTestUser(testDb.db, {
        email: 'totp-del@test.com',
        password: 'p',
        totpSecret: 'JBSWY3DPEHPK3PXP',
      });
      const headers = await authHeaders(user.id);

      const res = await app.request('/api/auth/totp', { method: 'DELETE', headers });
      expect(res.status).toBe(200);

      // Verify TOTP is gone via /me
      const meRes = await app.request('/api/auth/me', { headers });
      const me = await meRes.json();
      expect(me.hasTOTP).toBe(false);
    });
  });

  // ── GET /api/auth/sessions ────────────────────────────────────────────────

  describe('GET /api/auth/sessions', () => {
    it('returns list of sessions for the user', async () => {
      const user = await createTestUser(testDb.db, { email: 'sess@test.com', password: 'p' });
      const session = await createTestSession(testDb.db, user.id);
      const headers = await authHeaders(user.id, { sessionId: session.id });

      const res = await app.request('/api/auth/sessions', { headers });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toHaveLength(1);
      expect(body[0].id).toBe(session.id);
      expect(body[0].isCurrent).toBe(true);
    });
  });

  // ── DELETE /api/auth/sessions/:id ─────────────────────────────────────────

  describe('DELETE /api/auth/sessions/:id', () => {
    it('deletes a session by id', async () => {
      const user = await createTestUser(testDb.db, { email: 'del-sess@test.com', password: 'p' });
      const s1 = await createTestSession(testDb.db, user.id);
      const s2 = await createTestSession(testDb.db, user.id);
      const headers = await authHeaders(user.id, { sessionId: s1.id });

      const res = await app.request(`/api/auth/sessions/${s2.id}`, { method: 'DELETE', headers });
      expect(res.status).toBe(200);

      // Only s1 should remain
      const listRes = await app.request('/api/auth/sessions', { headers });
      const list = await listRes.json();
      expect(list).toHaveLength(1);
      expect(list[0].id).toBe(s1.id);
    });

    it('returns 404 for non-existing session', async () => {
      const user = await createTestUser(testDb.db, { email: 'noex@test.com', password: 'p' });
      const headers = await authHeaders(user.id);

      const res = await app.request('/api/auth/sessions/non-existent-id', { method: 'DELETE', headers });
      expect(res.status).toBe(404);
    });
  });
});
