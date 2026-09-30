import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import 'dotenv/config';
import { Hono } from 'hono';
import { secureHeaders } from 'hono/secure-headers';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { DOWNLOAD_WORKER_CONCURRENCY, TTS_CLEANUP_INTERVAL_MS } from './config.js';
import { client } from './db/index.js';
import { runMigration } from './db/migrate.js';
import { logger } from './logger.js';
import { authMiddleware } from './middleware/auth.js';
import { corsMiddleware } from './middleware/cors.js';
import { rateLimitMiddleware } from './middleware/rateLimit.js';
import authRouter from './routes/auth.js';
import channelsRouter from './routes/channels.js';
import contentRouter from './routes/content.js';
import digestRouter from './routes/digest.js';
import downloadsRouter from './routes/downloads.js';
import filtersRouter from './routes/filters.js';
import groupsRouter from './routes/groups.js';
import logIngestRouter from './routes/logIngest.js';
import logViewerRouter from './routes/logViewer.js';
import mediaRouter from './routes/media.js';
import newsRouter from './routes/news.js';
import ttsRouter from './routes/tts.js';
import versionRouter from './routes/version.js';
import { sendAlert } from './services/alertBot.js';
import { isWorkerPoolStopped, startWorkerPool } from './services/downloadManager.js';
import { downloadStorage } from './services/downloadStorage.js';
import { renderErrorHtml } from './services/errorHtml.js';
import { disconnectTelegramClient, isTelegramDelayed } from './services/telegram.js';
import { getTelegramCircuitState, getTelegramSessionExpired } from './services/telegramCircuitBreaker.js';
import { cleanupExpiredTts, resetStuckTtsJobs } from './services/ttsService.js';

// All imports loaded — log how long module initialisation took
// (gramjs TL schema + crypto is the dominant cost, typically 5–8 s)
const tModules = performance.now();
logger.info({ module: 'server', ms: Math.round(tModules) }, `Modules loaded in ${Math.round(tModules)}ms`);

// DB migration is intentionally deferred — run AFTER the server starts listening
// so the startup probe can connect immediately instead of timing out during migration.

// ─── Process-level error handlers ────────────────────────────────────────────

process.on('uncaughtException', (err) => {
  logger.fatal({ module: 'process', err }, 'uncaughtException — shutting down');
  // Best-effort alert before exit (give it 3s, then exit anyway)
  const msg = `uncaughtException: ${err.message ?? String(err)}`;
  void sendAlert(msg, 'uncaughtException')
    .catch(() => {})
    .finally(() => process.exit(1));
  setTimeout(() => process.exit(1), 3_000).unref();
});

process.on('unhandledRejection', (reason) => {
  logger.error({ module: 'process', reason }, 'unhandledRejection');
});

// ─── Graceful shutdown ───────────────────────────────────────────────────────
// On SIGTERM (sent by Azure Container Apps during deploys) disconnect the
// Telegram client BEFORE the process exits. This prevents the old container
// from holding the auth key while the new one tries to connect, which causes
// AUTH_KEY_DUPLICATED errors.

let _shuttingDown = false;

async function gracefulShutdown(signal: string): Promise<void> {
  if (_shuttingDown) return;
  _shuttingDown = true;
  logger.info({ module: 'server', signal }, `${signal} received — disconnecting Telegram and shutting down`);
  try {
    await disconnectTelegramClient();
  } catch (err) {
    logger.warn({ module: 'server', err }, 'Error during Telegram disconnect on shutdown');
  }
  process.exit(0);
}

process.on('SIGTERM', () => void gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => void gracefulShutdown('SIGINT'));

// ─── App ──────────────────────────────────────────────────────────────────────

const isDev = process.env.NODE_ENV !== 'production';

const app = new Hono();

// ─── Access log (API only — static files are too noisy) ───────────────────────
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

// Override default 'no-referrer' — YouTube embeds need the Referer header to
// load their player configuration; without it they return Error 153.
// strict-origin-when-cross-origin sends origin only (no path) on cross-origin
// requests, which is sufficient for YouTube while still being safe.
app.use(
  '*',
  secureHeaders({
    referrerPolicy: 'strict-origin-when-cross-origin',
    contentSecurityPolicy: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"], // antd injects inline styles
      imgSrc: ["'self'", 'data:', 'blob:'],
      mediaSrc: ["'self'", 'blob:'],
      frameSrc: ['https://www.youtube.com', 'https://www.youtube-nocookie.com'],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      workerSrc: ["'self'"],
      objectSrc: ["'none'"],
    },
  }),
);

// Tell all crawlers and bots to stay away
app.use('*', async (c, next) => {
  await next();
  c.res.headers.set('X-Robots-Tag', 'noindex, nofollow, nosnippet, noarchive');
});

app.use('/api/*', corsMiddleware);

// Rate limiting — production only
if (!isDev) {
  app.use('/api/*', rateLimitMiddleware);
}

// Auth routes (login/refresh/logout are public; me/totp/sessions are self-protected)
app.route('/api/auth', authRouter);

// Protect all other /api/* routes with JWT auth
const PUBLIC_PATHS = new Set(['/api/health', '/api/ready', '/api/version']);
const PUBLIC_PREFIXES = ['/api/auth/'];

app.use('/api/*', async (c, next) => {
  const path = c.req.path;
  if (PUBLIC_PATHS.has(path) || PUBLIC_PREFIXES.some((p) => path.startsWith(p))) {
    return next();
  }
  // oxlint-disable-next-line typescript/no-unsafe-argument
  return authMiddleware(c, next);
});

// API routes
app.route('/api/channels', channelsRouter);
app.route('/api/groups', groupsRouter);
app.route('/api/news', newsRouter);
app.route('/api/channels/:channelId/filters', filtersRouter);
app.route('/api/content', contentRouter);
app.route('/api/media', mediaRouter);
app.route('/api/downloads', downloadsRouter);
app.route('/api/log/client', logIngestRouter);
app.route('/api/logs', logViewerRouter);
app.route('/api/digest', digestRouter);
app.route('/api/version', versionRouter);
app.route('/api/tts', ttsRouter);

// Health check — liveness/startup probe: "process is alive, HTTP works"
// Always 200 as long as the process is running (used by smoke test + startup probe).
app.get('/api/health', async (c) => {
  let dbOk = true;
  try {
    await client.execute('SELECT 1');
  } catch {
    dbOk = false;
  }

  const telegramCircuit = getTelegramCircuitState();
  const sessionExpired = getTelegramSessionExpired();
  const connectDelayed = isTelegramDelayed();
  const workerPoolStopped = isWorkerPoolStopped();
  const storage = downloadStorage.status;
  const status = !dbOk || telegramCircuit === 'open' || workerPoolStopped || storage.paused ? 'degraded' : 'ok';

  return c.json({
    status,
    timestamp: Date.now(),
    uptime: Math.floor(process.uptime()),
    db: dbOk ? 'ok' : 'error',
    telegram: { circuit: telegramCircuit, sessionExpired, connectDelayed },
    downloads: { workerPoolStopped, storage },
  });
});

// Readiness probe — "ready to accept user traffic"
// ⚠️ Must return 200 IMMEDIATELY (even during Telegram startup delay).
// Why: if we return 503 during delay, Azure won't kill the old container →
// old stays connected to Telegram → when delay expires, new connects too →
// AUTH_KEY_DUPLICATED (both containers hold the same session).
//
// Correct flow:
//   1. New container starts, /api/ready → 200 immediately
//   2. Azure switches traffic quickly, sends SIGTERM to old container
//   3. Old receives SIGTERM → disconnectTelegramClient() → session freed
//   4. Telegram startup delay (30s) still active → new does NOT connect yet
//   5. Delay expires → new connects to Telegram → clean, no overlap
app.get('/api/ready', (c) => {
  return c.json(
    {
      ready: true,
      telegram: { connectDelayed: isTelegramDelayed() },
    },
    200,
  );
});

// ─── Global error handlers ────────────────────────────────────────────────────

// 404 — unknown route
app.notFound((c) => {
  // API consumers get JSON; browser requests get a styled HTML page
  if (c.req.path.startsWith('/api/')) {
    return c.json({ error: 'Not Found' }, 404);
  }
  return c.html(renderErrorHtml(404), 404);
});

// 500 — uncaught handler error
app.onError((err, c) => {
  const status = ((err as { status?: number }).status ?? 500) as ContentfulStatusCode;
  logger.error({ module: 'http', path: c.req.path, status, err }, `Unhandled error: ${err.message}`);
  if (c.req.path.startsWith('/api/')) {
    return c.json({ error: err.message || 'Internal Server Error' }, status);
  }
  const detail = isDev ? err.stack : undefined;
  return c.html(renderErrorHtml(status, detail), status);
});

// Serve static files in production
if (process.env.NODE_ENV === 'production') {
  // Cache-Control for static assets:
  //   /assets/* → immutable (Vite content-hashes every filename → safe to cache 1 year)
  //   everything else (index.html, sw.js, robots.txt) → no-cache (always revalidate)
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

const port = parseInt(process.env.SERVER_PORT || '3173', 10);

// ── Start HTTP server FIRST so the startup probe can connect immediately ────
// Migration runs after serve() — during the ~3s migration window the health
// endpoint already responds (SELECT 1 works before schema changes), so the
// probe never sees "connection refused" and never fails.
serve({ fetch: app.fetch, port });
const honoMs = Math.round(performance.now() - tModules);
logger.info({ module: 'server', port, ms: honoMs }, `Hono listening on :${port} (setup ${honoMs}ms)`);

// Run migration, then start workers (both require a ready DB schema)
const t1 = performance.now();
await runMigration();
logger.info(
  { module: 'server', ms: Math.round(performance.now() - t1) },
  `Migration done in ${Math.round(performance.now() - t1)}ms`,
);

const t2 = performance.now();
startWorkerPool(DOWNLOAD_WORKER_CONCURRENCY);
logger.info(
  { module: 'server', workers: DOWNLOAD_WORKER_CONCURRENCY, ms: Math.round(performance.now() - t2) },
  `Worker pool started (${DOWNLOAD_WORKER_CONCURRENCY} workers) in ${Math.round(performance.now() - t2)}ms`,
);

// ── TTS cache maintenance ────────────────────────────────────────────────────
// Reset any rows stuck in 'processing' from a previous crash, then schedule periodic cleanup.
void resetStuckTtsJobs().catch((err) => logger.warn({ module: 'tts', err }, 'resetStuckTtsJobs failed'));
void cleanupExpiredTts().catch((err) => logger.warn({ module: 'tts', err }, 'cleanupExpiredTts failed (startup)'));
const ttsCleanupInterval = setInterval(() => {
  void cleanupExpiredTts().catch((err) => logger.warn({ module: 'tts', err }, 'cleanupExpiredTts failed (interval)'));
}, TTS_CLEANUP_INTERVAL_MS);
ttsCleanupInterval.unref();

logger.info(
  { module: 'server', totalMs: Math.round(performance.now()) },
  `✅ Ready in ${Math.round(performance.now())}ms total`,
);

// Startup alert — no dedup key so every (re)start fires (process is fresh each time).
// In prod: signals that the container came back up after a restart / new deploy.
// No-op in dev (ALERT_BOT_TOKEN not set locally).
if (process.env.NODE_ENV === 'production') {
  void sendAlert(`🟢 Server started — port ${port}`).catch(() => {});
}
