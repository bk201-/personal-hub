/**
 * Telegram Client — connection lifecycle management.
 *
 * Handles: lazy gramjs loading, connection mutex, startup delay,
 * reconnect, graceful disconnect.
 */

// Type-only imports — zero runtime cost, used only for TypeScript annotations
import type { Api, TelegramClient } from 'telegram';
import type { StringSession } from 'telegram/sessions/index.js';
import { TG_CONNECT_DELAY_MS } from '../config.js';
import { logger } from '../logger.js';
import { setReconnectCallback } from './telegramCircuitBreaker.js';

// Lazy runtime references — gramjs loads TL schema on import (~2.5s), so defer until first use
let _Api: typeof Api;
let _TelegramClient: typeof TelegramClient;
let _StringSession: typeof StringSession;

async function ensureTgLibs(): Promise<void> {
  if (_Api) return;
  const t = performance.now();
  const [tgMod, sessionMod] = await Promise.all([import('telegram'), import('telegram/sessions/index.js')]);
  _Api = tgMod.Api;
  _TelegramClient = tgMod.TelegramClient;
  _StringSession = sessionMod.StringSession;
  logger.info(
    { module: 'telegram', ms: Math.round(performance.now() - t) },
    `gramjs loaded lazily in ${Math.round(performance.now() - t)}ms`,
  );
}

/** Returns the lazily-loaded gramjs Api namespace. Must call ensureTgLibs() first. */
export function getApi(): typeof Api {
  return _Api;
}

/** Ensures gramjs is loaded and returns the Api namespace. */
export async function ensureAndGetApi(): Promise<typeof Api> {
  await ensureTgLibs();
  return _Api;
}

let client: TelegramClient | null = null;

const API_ID = parseInt(process.env.TG_API_ID || '0', 10);
const API_HASH = process.env.TG_API_HASH || '';
const SESSION = process.env.TG_SESSION || '';

// ─── Connection mutex ─────────────────────────────────────────────────────────
// Prevents multiple concurrent callers from creating duplicate connections.
// When getTelegramClient() is called by 13 channel fetches simultaneously,
// only one actually connects — the rest await the same promise.

let _connectPromise: Promise<TelegramClient> | null = null;

// ─── Startup delay ────────────────────────────────────────────────────────────
// During deploys old and new containers overlap. The old one gets SIGTERM and
// disconnects (see gracefulShutdown in index.ts). This delay gives the old
// container time to fully disconnect before the new one connects, preventing
// AUTH_KEY_DUPLICATED errors from Telegram.

let _startupDelayPromise: Promise<void> | null = null;
let _startupDelayDone = false;

/** Resolves when the startup delay is over. Called once, memoised. */
function waitForStartupDelay(): Promise<void> {
  if (_startupDelayDone) return Promise.resolve();
  if (_startupDelayPromise) return _startupDelayPromise;

  if (TG_CONNECT_DELAY_MS <= 0) {
    _startupDelayDone = true;
    return Promise.resolve();
  }

  logger.info(
    { module: 'telegram', delaySec: TG_CONNECT_DELAY_MS / 1_000 },
    `Delaying Telegram connection by ${TG_CONNECT_DELAY_MS / 1_000}s (TG_CONNECT_DELAY_SEC) to avoid AUTH_KEY_DUPLICATED during deploy`,
  );

  _startupDelayPromise = new Promise<void>((resolve) => {
    setTimeout(() => {
      _startupDelayDone = true;
      logger.info({ module: 'telegram' }, 'Startup delay complete — Telegram connection allowed');
      resolve();
    }, TG_CONNECT_DELAY_MS);
  });
  return _startupDelayPromise;
}

/** Whether the startup delay is still active (Telegram connection blocked). */
export function isTelegramDelayed(): boolean {
  return !_startupDelayDone && TG_CONNECT_DELAY_MS > 0;
}

export async function getTelegramClient(): Promise<TelegramClient> {
  await waitForStartupDelay();
  await ensureTgLibs();

  // Fast path: already connected
  if (client && client.connected) {
    return client;
  }

  // Mutex: if another caller is already connecting, wait for their result
  if (_connectPromise) {
    return _connectPromise;
  }

  // We are the one to connect — store the promise so others can await it
  _connectPromise = (async () => {
    try {
      const stringSession = new _StringSession(SESSION);
      const newClient = new _TelegramClient(stringSession, API_ID, API_HASH, { connectionRetries: 5 });
      await newClient.connect();
      client = newClient;
      return newClient;
    } finally {
      _connectPromise = null;
    }
  })();

  return _connectPromise;
}

/**
 * Reset the TG client — disconnect the old client first, then reconnect.
 * Deduplicated: concurrent callers share the same reconnect promise.
 */
let _reconnectPromise: Promise<void> | null = null;

export async function resetTelegramClient(): Promise<void> {
  // Deduplicate: if a reconnect is already in progress, wait for it
  if (_reconnectPromise) {
    return _reconnectPromise;
  }

  _reconnectPromise = (async () => {
    try {
      // Disconnect old client properly to release the auth key
      if (client) {
        try {
          await client.disconnect();
          logger.info({ module: 'telegram' }, 'Old Telegram client disconnected before reconnect');
        } catch (err) {
          logger.warn({ module: 'telegram', err }, 'Error disconnecting old Telegram client');
        }
        client = null;
      }

      // Small pause to let Telegram server release the auth key
      await new Promise((r) => setTimeout(r, 2_000));

      await getTelegramClient();
    } finally {
      _reconnectPromise = null;
    }
  })();

  return _reconnectPromise;
}

/** Gracefully disconnect the Telegram client (called on SIGTERM). */
export async function disconnectTelegramClient(): Promise<void> {
  if (client) {
    try {
      await client.disconnect();
      logger.info({ module: 'telegram' }, 'Telegram client disconnected gracefully');
    } catch (err) {
      logger.warn({ module: 'telegram', err }, 'Error disconnecting Telegram client');
    }
    client = null;
  }
}

// Register the reconnect callback for auto-recovery on AUTH_KEY_UNREGISTERED
setReconnectCallback(resetTelegramClient);

// Start the delay timer immediately at module load time so the countdown begins
// at server start, not at the first Telegram call. This way if the first request
// comes 60s after start, there's no unnecessary extra wait.
void waitForStartupDelay();
