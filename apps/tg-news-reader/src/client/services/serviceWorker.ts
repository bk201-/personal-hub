/**
 * Service Worker registration and messaging helpers.
 *
 * The SW is only registered in production builds to avoid interfering
 * with Vite HMR in development.
 */

import { logger } from '../logger';

export interface SwStats {
  count: number;
  maxEntries: number;
  maxAgeDays: number;
}

interface SwMessage {
  type: string;
  count?: number;
  maxEntries?: number;
  maxAgeDays?: number;
}

// ─── Registration ─────────────────────────────────────────────────────────────

export function registerMediaServiceWorker(): void {
  if (!('serviceWorker' in navigator)) return;

  // Only activate in production — dev uses Vite HMR which can conflict with SW
  if (import.meta.env.DEV) return;

  // When a new SW takes control (skipWaiting + clients.claim), reload the page
  // so the user immediately gets the updated SW without stale behaviour.
  let isFirstController = !navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (isFirstController) {
      // First activation (no previous SW) — no reload needed
      isFirstController = false;
      return;
    }
    logger.info({ module: 'sw' }, 'new service worker activated, reloading');
    window.location.reload();
  });

  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js', { scope: '/', updateViaCache: 'none' })
      .then((reg) => {
        logger.info({ module: 'sw', scope: reg.scope }, 'service worker registered');
      })
      .catch((err: unknown) => {
        logger.warn({ module: 'sw', err }, 'service worker registration failed');
      });
  });
}

// ─── Messaging helpers ────────────────────────────────────────────────────────

function getController(): ServiceWorker | null {
  return navigator.serviceWorker?.controller ?? null;
}

/** Ask the SW for cache stats (entries count, limits). */
export function getSwStats(): Promise<SwStats> {
  return new Promise((resolve, reject) => {
    const sw = getController();
    if (!sw) {
      reject(new Error('No active service worker'));
      return;
    }

    const channel = new MessageChannel();
    channel.port1.onmessage = (e: MessageEvent<SwMessage>) => {
      if (e.data?.type === 'STATS') resolve(e.data as SwStats);
    };
    setTimeout(() => reject(new Error('SW stats timeout')), 3000);

    sw.postMessage({ type: 'GET_STATS' }, [channel.port2]);
  });
}

/** Clear all cached media files. */
export function clearSwCache(): Promise<void> {
  return new Promise((resolve, reject) => {
    const sw = getController();
    if (!sw) {
      resolve(); // nothing to clear
      return;
    }

    const channel = new MessageChannel();
    channel.port1.onmessage = (e: MessageEvent<SwMessage>) => {
      if (e.data?.type === 'CACHE_CLEARED') resolve();
    };
    setTimeout(() => reject(new Error('SW clear timeout')), 3000);

    sw.postMessage({ type: 'CLEAR_CACHE' }, [channel.port2]);
  });
}

/** Update SW cache limits at runtime. */
export function setSwLimits(opts: { maxEntries?: number; maxAgeDays?: number }): void {
  getController()?.postMessage({ type: 'SET_LIMITS', payload: opts });
}
