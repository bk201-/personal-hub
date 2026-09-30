import { rateLimiter } from 'hono-rate-limiter';
import { logger } from '../logger.js';

export const rateLimitMiddleware = rateLimiter({
  windowMs: 60 * 1000, // 1-minute window
  limit: 120, // max 120 requests per window
  standardHeaders: 'draft-6',
  keyGenerator: (c) =>
    c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ?? c.req.raw.headers.get('x-real-ip') ?? 'unknown',
  handler: (c) => {
    const ip =
      c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ?? c.req.raw.headers.get('x-real-ip') ?? 'unknown';
    logger.warn(
      { module: 'rateLimit', ip, method: c.req.method, path: c.req.path },
      `Rate limit exceeded: ${ip} ${c.req.method} ${c.req.path}`,
    );
    return c.json({ error: 'Too many requests, please slow down.' }, 429);
  },
});

