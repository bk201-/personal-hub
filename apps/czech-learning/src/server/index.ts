import 'dotenv/config';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { secureHeaders } from 'hono/secure-headers';
import authRouter from './routes/auth.js';
import wordsRouter from './routes/words.js';
import importRouter from './routes/import.js';
import { authMiddleware } from './middleware/auth.js';
import { corsMiddleware } from './middleware/cors.js';
import { rateLimitMiddleware } from './middleware/rateLimit.js';
import { logger } from './logger.js';
import { client } from './db/index.js';
import { runMigration } from './db/migrate.js';
import type { AppEnv } from './types.js';

const isDev = process.env.NODE_ENV !== 'production';

const app = new Hono<AppEnv>();

// ─── Access log (API only) ────────────────────────────────────────────────────
app.use('/api/*', async (c, next) => {
  const start = Date.now();
  await next();
  const ms = Date.now() - start;
  const ip = c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ?? c.req.header('x-real-ip') ?? 'unknown';
  logger.info(
    { module: 'http', method: c.req.method, path: c.req.path, status: c.res.status, ms, ip },
    `${c.req.method} ${c.req.path} ${c.res.status} ${ms}ms`,
  );
});

app.use('*', secureHeaders({ referrerPolicy: 'strict-origin-when-cross-origin' }));

app.use('*', async (c, next) => {
  await next();
  c.res.headers.set('X-Robots-Tag', 'noindex, nofollow, nosnippet, noarchive');
});

app.use('/api/*', corsMiddleware);

if (!isDev) {
  app.use('/api/*', rateLimitMiddleware);
}

// Auth routes (login/refresh/logout are public)
app.route('/api/auth', authRouter);

// Words CRUD (protected via global auth middleware below)
app.route('/api/words', wordsRouter);

// Import (admin-only batch insert)
app.route('/api/import', importRouter);

// Protect all other /api/* routes with JWT auth
const PUBLIC_PATHS = new Set(['/api/health']);
const PUBLIC_PREFIXES = ['/api/auth/'];

app.use('/api/*', async (c, next) => {
  const path = c.req.path;
  if (PUBLIC_PATHS.has(path) || PUBLIC_PREFIXES.some((p) => path.startsWith(p))) {
    return next();
  }
  // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
  return authMiddleware(c, next);
});

// Health check
app.get('/api/health', async (c) => {
  let dbOk = true;
  try {
    await client.execute('SELECT 1');
  } catch {
    dbOk = false;
  }

  const status = dbOk ? 'ok' : 'degraded';
  return c.json({
    status,
    timestamp: Date.now(),
    uptime: Math.floor(process.uptime()),
    db: dbOk ? 'ok' : 'error',
  });
});

// Serve static files in production
if (process.env.NODE_ENV === 'production') {
  app.use('/*', async (c, next) => {
    await next();
    if (c.req.path.startsWith('/assets/')) {
      c.res.headers.set('Cache-Control', 'public, max-age=31536000, immutable');
    } else {
      c.res.headers.set('Cache-Control', 'no-cache');
    }
  });
  app.use('/*', serveStatic({ root: './dist/client' }));
  app.get('*', serveStatic({ path: './dist/client/index.html' }));
}

const port = parseInt(process.env.SERVER_PORT ?? '3173', 10);

serve({ fetch: app.fetch, port });
logger.info({ module: 'server', port }, `Hono listening on :${port}`);

await runMigration();
logger.info({ module: 'server' }, '✅ Ready');

