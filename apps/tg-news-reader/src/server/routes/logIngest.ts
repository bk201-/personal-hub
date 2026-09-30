/**
 * Log INGEST endpoint — `POST /api/log/client`.
 *
 * Direction: browser → server (WRITE path). Receives a batch of `warn`/`error`
 * log entries forwarded by the client logger and re-emits them through the
 * server pino instance (`module: client:*`), so browser problems land in the
 * same stdout/Log Analytics pipeline as server logs.
 *
 * Not to be confused with `logViewer.ts` (`GET /api/logs`), which READS the
 * server-side in-memory log buffer for the in-app log viewer.
 */
import { Hono } from 'hono';
import type { z } from 'zod';
import { logger } from '../logger.js';
import { clientLogSchema, parseOptionalBody } from './schemas.js';

const ALLOWED_LEVELS = new Set(['warn', 'error']);
const MAX_ENTRIES = 20;
const MAX_STRING = 2000;

function truncate(v: unknown): unknown {
  if (typeof v === 'string' && v.length > MAX_STRING) return v.slice(0, MAX_STRING) + '…';
  return v;
}

const router = new Hono();

router.post('/', async (c) => {
  const body = await parseOptionalBody(c, clientLogSchema, null as unknown as z.infer<typeof clientLogSchema>);
  if (!body) return c.json({ ok: false }, 400);

  const ip = c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';

  for (const entry of body.entries.slice(0, MAX_ENTRIES)) {
    if (!ALLOWED_LEVELS.has(entry.level)) continue;

    const { level, msg, module: mod, url, ...rest } = entry;
    const moduleName = `client:${typeof mod === 'string' ? mod : 'unknown'}`;
    const message = typeof msg === 'string' ? msg.slice(0, 500) : '(no message)';

    const meta: Record<string, unknown> = {
      module: moduleName,
      ip,
      ...(url ? { url: truncate(url) } : {}),
      ...Object.fromEntries(Object.entries(rest).map(([k, v]) => [k, truncate(v)])),
    };

    if (level === 'error') {
      logger.error(meta, message);
    } else {
      logger.warn(meta, message);
    }
  }

  return c.json({ ok: true });
});

export default router;
