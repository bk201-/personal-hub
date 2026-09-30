import type { Context, MiddlewareHandler } from 'hono';
import { rateLimiter } from 'hono-rate-limiter';
import type { AuthLogger } from './types.js';

export function createRateLimitMiddleware(options: {
  windowMs: number;
  limit: number;
  readMultiplier?: number;
  logger: Pick<AuthLogger, 'warn'>;
}): MiddlewareHandler {
  const clientIp = (c: Context) =>
    c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ?? c.req.raw.headers.get('x-real-ip') ?? 'unknown';
  const createLimiter = (limit: number) =>
    rateLimiter({
      windowMs: options.windowMs,
      limit,
      standardHeaders: 'draft-6',
      keyGenerator: clientIp,
      handler: (c) => {
        const ip = clientIp(c);
        options.logger.warn(
          { module: 'rateLimit', ip, method: c.req.method, path: c.req.path },
          `Rate limit exceeded: ${ip} ${c.req.method} ${c.req.path}`,
        );
        return c.json({ error: 'Too many requests, please slow down.' }, 429);
      },
    });
  const writeLimiter = createLimiter(options.limit);
  // Omitting the multiplier deliberately keeps one shared read/write budget.
  if (options.readMultiplier === undefined) return writeLimiter;
  const readLimiter = createLimiter(options.limit * options.readMultiplier);
  return (c, next) =>
    c.req.method === 'GET' || c.req.method === 'HEAD' ? readLimiter(c, next) : writeLimiter(c, next);
}
