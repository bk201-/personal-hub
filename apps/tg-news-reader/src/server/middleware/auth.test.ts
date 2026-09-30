import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the config module to provide a known secret
vi.mock('../config.js', () => ({
  JWT_SECRET: 'test-secret-key',
}));

import { sign } from 'hono/jwt';
import { authMiddleware } from './auth.js';

function createApp() {
  const app = new Hono();
  app.use('/*', authMiddleware);
  app.get('/test', (c) => {
    return c.json({
      userId: c.get('userId'),
      userRole: c.get('userRole'),
      sessionId: c.get('sessionId'),
    });
  });
  return app;
}

describe('authMiddleware', () => {
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    app = createApp();
  });

  it('returns 401 when no token is provided', async () => {
    const res = await app.request('/test');
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('Unauthorized');
  });

  it('accepts Bearer token from Authorization header', async () => {
    const token = await sign(
      { sub: '42', role: 'admin', sessionId: 'sess-1', exp: Math.floor(Date.now() / 1000) + 60 },
      'test-secret-key',
      'HS256',
    );

    const res = await app.request('/test', {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.userId).toBe(42);
    expect(body.userRole).toBe('admin');
    expect(body.sessionId).toBe('sess-1');
  });

  it('accepts token from ?token= query param', async () => {
    const token = await sign(
      { sub: '7', role: 'user', sessionId: 'sess-2', exp: Math.floor(Date.now() / 1000) + 60 },
      'test-secret-key',
      'HS256',
    );

    const res = await app.request(`/test?token=${encodeURIComponent(token)}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.userId).toBe(7);
  });

  it('returns 401 for an invalid token', async () => {
    const res = await app.request('/test', {
      headers: { Authorization: 'Bearer invalid.jwt.token' },
    });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('Invalid or expired token');
  });

  it('returns 401 for an expired token', async () => {
    const token = await sign(
      { sub: '1', role: 'admin', sessionId: 's', exp: Math.floor(Date.now() / 1000) - 60 },
      'test-secret-key',
      'HS256',
    );

    const res = await app.request('/test', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(401);
  });

  it('prefers Authorization header over query param', async () => {
    const headerToken = await sign(
      { sub: '10', role: 'admin', sessionId: 's1', exp: Math.floor(Date.now() / 1000) + 60 },
      'test-secret-key',
      'HS256',
    );
    const queryToken = await sign(
      { sub: '20', role: 'user', sessionId: 's2', exp: Math.floor(Date.now() / 1000) + 60 },
      'test-secret-key',
      'HS256',
    );

    const res = await app.request(`/test?token=${encodeURIComponent(queryToken)}`, {
      headers: { Authorization: `Bearer ${headerToken}` },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.userId).toBe(10); // from header, not query
  });
});
