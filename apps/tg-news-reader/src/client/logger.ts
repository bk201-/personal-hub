/**
 * Client-side logger — mirrors the server pino API:
 *   logger.info({ module: 'auth' }, 'login success')
 *   logger.error({ module: 'window', err }, 'uncaught error')
 *
 * Level order: debug < info < warn < error
 * Default: 'debug' in dev, 'warn' in prod. Override via VITE_LOG_LEVEL.
 *
 * warn + error are forwarded to POST /api/log/client (server pino).
 * Errors flush immediately; warns are batched with a 2 s window.
 */

import { useAuthStore } from './store/authStore';

type Level = 'debug' | 'info' | 'warn' | 'error';
type Meta = Record<string, unknown>;

const LEVELS: Record<Level, number> = { debug: 0, info: 1, warn: 2, error: 3 };

const isDev = import.meta.env.DEV;
const envLevel = import.meta.env.VITE_LOG_LEVEL as string | undefined;
const minLevel = LEVELS[(envLevel ?? (isDev ? 'debug' : 'warn')) as Level] ?? (isDev ? 0 : 2);

// ─── Console output ───────────────────────────────────────────────────────────

const COLOURS: Record<Level, string> = {
  debug: 'color:#8b8b8b',
  info: 'color:#1677ff',
  warn: 'color:#fa8c16;font-weight:600',
  error: 'color:#f5222d;font-weight:600',
};

function toConsole(level: Level, meta: Meta, msg: string): void {
  if (isDev) {
    const { module: mod, ...rest } = meta;
    const prefix = mod ? `[${typeof mod === 'string' ? mod : JSON.stringify(mod)}]` : '';
    const extraArgs = Object.keys(rest).length ? [rest] : [];
    const fn =
      level === 'error'
        ? console.error
        : level === 'warn'
          ? console.warn
          : level === 'info'
            ? console.info
            : console.debug;
    fn(`%c[${level.toUpperCase()}] ${prefix}`, COLOURS[level], msg, ...extraArgs);
  } else {
    const fn = level === 'error' ? console.error : console.warn;
    fn(JSON.stringify({ level, ...meta, msg, time: Date.now() }));
  }
}

// ─── Remote transport (warn + error → POST /api/log/client) ──────────────────

interface RemoteEntry {
  level: 'warn' | 'error';
  msg: string;
  time: number;
  url: string;
  [key: string]: unknown;
}

const remoteBatch: RemoteEntry[] = [];
let batchTimer: ReturnType<typeof setTimeout> | null = null;
function serialize(v: unknown): unknown {
  if (v instanceof Error) return { message: v.message, stack: v.stack?.split('\n').slice(0, 6).join('\n') ?? '' };
  if (v && typeof v === 'object') {
    try {
      return JSON.parse(JSON.stringify(v)) as unknown;
    } catch {
      return '[non-serializable object]';
    }
  }
  return v;
}

function flushRemote(): void {
  if (remoteBatch.length === 0) return;
  const entries = remoteBatch.splice(0);
  const token = useAuthStore.getState().accessToken;
  if (!token) return; // not authenticated — drop silently
  void fetch('/api/log/client', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ entries }),
    keepalive: true, // survives page unload
  }).catch(() => {}); // logger must never throw
}

function scheduleFlush(): void {
  if (batchTimer) return;
  batchTimer = setTimeout(() => {
    batchTimer = null;
    flushRemote();
  }, 2000);
}

function addRemote(level: 'warn' | 'error', meta: Meta, msg: string): void {
  const { module: mod, err, ...rest } = meta;
  const entry: RemoteEntry = {
    level,
    msg,
    time: Date.now(),
    url: window.location.pathname + window.location.search,
    ...(mod !== undefined ? { module: serialize(mod) } : {}),
    ...(err !== undefined ? { err: serialize(err) } : {}),
    ...Object.fromEntries(Object.entries(rest).map(([k, v]) => [k, serialize(v)])),
  };
  remoteBatch.push(entry);

  if (level === 'error') {
    // Errors are urgent — flush immediately
    if (batchTimer) {
      clearTimeout(batchTimer);
      batchTimer = null;
    }
    flushRemote();
  } else {
    scheduleFlush();
  }
}

// ─── Main emit ────────────────────────────────────────────────────────────────

function emit(level: Level, meta: Meta, msg: string): void {
  if (LEVELS[level] < minLevel) return;
  toConsole(level, meta, msg);
  if (level === 'warn' || level === 'error') addRemote(level, meta, msg);
}

export const logger = {
  debug: (meta: Meta, msg: string) => emit('debug', meta, msg),
  info: (meta: Meta, msg: string) => emit('info', meta, msg),
  warn: (meta: Meta, msg: string) => emit('warn', meta, msg),
  error: (meta: Meta, msg: string) => emit('error', meta, msg),
};
