import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';
import { createRateLimitMiddleware } from '../src/index.js';

function app(readMultiplier?: number) {
  const router = new Hono();
  const logger = { warn: vi.fn() };
  router.use('*', createRateLimitMiddleware({ windowMs: 60_000, limit: 1, readMultiplier, logger }));
  router.all('/', (c) => c.text('ok'));
  return { router, logger };
}

describe('rate limiter contract', () => {
  it('uses independent app stores and news read/write budgets', async () => {
    const news = app(2);
    const czech = app();
    expect((await news.router.request('/')).status).toBe(200);
    expect((await news.router.request('/', { method: 'HEAD' })).status).toBe(200);
    expect((await news.router.request('/')).status).toBe(429);
    expect((await news.router.request('/', { method: 'POST' })).status).toBe(200);
    const limited = await news.router.request('/', { method: 'POST' });
    expect(limited.status).toBe(429);
    expect(await limited.json()).toEqual({ error: 'Too many requests, please slow down.' });
    expect(limited.headers.get('RateLimit-Limit')).toBe('1');
    expect(news.logger.warn).toHaveBeenCalled();
    expect((await czech.router.request('/')).status).toBe(200);
    expect((await czech.router.request('/', { method: 'POST' })).status).toBe(429);
  });

  it('preserves forwarded-IP priority and keeps different clients independent', async () => {
    const { router } = app();
    const headers = { 'x-forwarded-for': '192.0.2.1, 192.0.2.2', 'x-real-ip': '192.0.2.3' };
    expect((await router.request('/', { headers })).status).toBe(200);
    expect((await router.request('/', { headers: { 'x-forwarded-for': '192.0.2.1' } })).status).toBe(429);
    expect((await router.request('/', { headers: { 'x-real-ip': '192.0.2.3' } })).status).toBe(200);
  });
});
