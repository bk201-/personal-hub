/**
 * EventSource wrapper with exponential backoff on reconnection.
 *
 * Native EventSource auto-reconnects on error with a fixed ~3s delay,
 * which floods the server when it's down. This wrapper closes on error
 * and re-creates the connection with exponential backoff (1s → 2s → 4s → … → 30s cap).
 * The backoff resets on a successful connection (open event).
 */

import { logger } from '../logger';

const BASE_DELAY_MS = 1_000;
const MAX_DELAY_MS = 30_000;

export interface ReconnectingES {
  /** Close the connection permanently — no more reconnects. */
  close: () => void;
}

interface ReconnectingESOptions {
  /**
   * URL factory — called on every connect/reconnect attempt so a fresh token
   * is always used. Pass a function returning the URL with the current token.
   */
  getUrl: () => string;
  /** Called on every new EventSource instance so the caller can attach listeners. */
  onConnect: (es: EventSource) => void;
  /**
   * Async hook called after an SSE error, before the reconnect delay fires.
   * Use this to refresh the auth token so the next connect uses a fresh URL.
   */
  onBeforeReconnect?: () => Promise<void>;
  /**
   * When true, the connection is released while the page is hidden
   * (tab in background / window minimized) and re-established when the page
   * becomes visible again. Avoids keeping the server awake and burning the
   * network on a page nobody is looking at.
   */
  pauseWhenHidden?: boolean;
  /** Module name for logging. */
  module?: string;
}

export function createReconnectingEventSource({
  getUrl,
  onConnect,
  onBeforeReconnect,
  pauseWhenHidden = false,
  module = 'sse',
}: ReconnectingESOptions): ReconnectingES {
  let attempt = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let es: EventSource | null = null;
  let closed = false;
  let paused = false;

  function clearTimer() {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  }

  function connect() {
    if (closed || paused) return;

    es = new EventSource(getUrl());

    es.addEventListener('open', () => {
      // Connection succeeded — reset backoff
      attempt = 0;
    });

    es.onerror = () => {
      if (closed || paused) return;
      es?.close();
      es = null;

      const delay = Math.min(BASE_DELAY_MS * Math.pow(2, attempt), MAX_DELAY_MS);
      attempt++;
      logger.warn({ module, attempt, delay }, 'SSE error — reconnecting with backoff');

      void (async () => {
        // Refresh auth token (e.g. after a JWT expiry 401) before reconnecting.
        // If rec.close() was called (or the page was hidden) during the async
        // await, skip the reconnect.
        await onBeforeReconnect?.();
        if (closed || paused) return;
        timer = setTimeout(connect, delay);
      })();
    };

    onConnect(es);
  }

  function handleVisibility() {
    if (document.hidden) {
      // Page hidden/minimized — release the connection so we don't keep the
      // server awake or reconnect in the background.
      if (paused) return;
      paused = true;
      clearTimer();
      es?.close();
      es = null;
      logger.debug({ module }, 'SSE paused — page hidden');
    } else if (paused) {
      // Page visible again — reconnect immediately with a fresh backoff.
      paused = false;
      attempt = 0;
      clearTimer();
      logger.debug({ module }, 'SSE resumed — page visible');
      connect();
    }
  }

  const visibilityEnabled = pauseWhenHidden && typeof document !== 'undefined';
  if (visibilityEnabled) {
    document.addEventListener('visibilitychange', handleVisibility);
    // Honour the current state on creation (e.g. created while tab is backgrounded).
    if (document.hidden) paused = true;
  }

  connect();

  return {
    close() {
      closed = true;
      clearTimer();
      if (visibilityEnabled) {
        document.removeEventListener('visibilitychange', handleVisibility);
      }
      es?.close();
      es = null;
    },
  };
}
