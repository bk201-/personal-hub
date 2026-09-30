import type { Context, Next } from 'hono';
import { rateLimiter } from 'hono-rate-limiter';
import { RATE_LIMIT_GET_MULTIPLIER, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS } from '../config.js';
import { logger } from '../logger.js';

function clientIp(c: Context): string {
  return c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ?? c.req.raw.headers.get('x-real-ip') ?? 'unknown';
}

function handler(c: Context) {
  const ip = clientIp(c);
  logger.warn(
    { module: 'rateLimit', ip, method: c.req.method, path: c.req.path },
    `Rate limit exceeded: ${ip} ${c.req.method} ${c.req.path}`,
  );
  return c.json({ error: 'Too many requests, please slow down.' }, 429);
}

// Two independent limiters, each with its own in-memory store → separate counters.
// GET/HEAD are cheap & idempotent, so they get a higher budget (base × multiplier);
// mutating requests keep the base budget.
const writeLimiter = rateLimiter({
  windowMs: RATE_LIMIT_WINDOW_MS,
  limit: RATE_LIMIT_MAX,
  standardHeaders: 'draft-6',
  keyGenerator: clientIp,
  handler,
});

const getLimiter = rateLimiter({
  windowMs: RATE_LIMIT_WINDOW_MS,
  limit: RATE_LIMIT_MAX * RATE_LIMIT_GET_MULTIPLIER,
  standardHeaders: 'draft-6',
  keyGenerator: clientIp,
  handler,
});

/** Dispatches to the read or write limiter based on HTTP method. */
export const rateLimitMiddleware = (c: Context, next: Next) => {
  const method = c.req.method;
  if (method === 'GET' || method === 'HEAD') return getLimiter(c, next);
  return writeLimiter(c, next);
};
