import { logger } from '../logger';
import { useAuthStore } from '../store/authStore';
import type { AuthUser } from '../store/authStore';
import { useRateLimitStore } from '../store/rateLimitStore';

/** How long (ms) to show the rate-limit banner when a 429 is received. */
const RATE_LIMIT_WINDOW_MS = 60_000;

const BASE = '/api';

// ─── Typed HTTP error ─────────────────────────────────────────────────────────

/** Thrown for non-2xx HTTP responses. Carries the status code so retry logic can skip 4xx. */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// ─── Network-level retry (TypeError = "Failed to fetch") ─────────────────────

const NETWORK_RETRY_ATTEMPTS = 3;

async function fetchWithNetworkRetry(input: string, init?: RequestInit): Promise<Response> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= NETWORK_RETRY_ATTEMPTS; attempt++) {
    try {
      return await fetch(input, init);
    } catch (err) {
      lastErr = err;
      // AbortError — never retry
      if (err instanceof DOMException && err.name === 'AbortError') throw err;
      // Only retry pure network errors (TypeError: "Failed to fetch")
      if (!(err instanceof TypeError)) throw err;
      if (attempt === NETWORK_RETRY_ATTEMPTS) break;
      const delay = 500 * Math.pow(2, attempt); // 500ms, 1s, 2s
      logger.debug({ module: 'client', attempt: attempt + 1, delay }, 'network error — retrying fetch');
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
}

// Prevent multiple simultaneous refresh calls
let refreshing: Promise<string | null> | null = null;

export async function tryRefresh(): Promise<string | null> {
  if (refreshing) return refreshing;

  refreshing = fetchWithNetworkRetry('/api/auth/refresh', { method: 'POST', credentials: 'include' })
    .then(async (res) => {
      if (!res.ok) {
        if (res.status === 429) {
          // Rate limited — session may still be valid; don't boot user to login
          const retryAfterSec = Number(res.headers.get('Retry-After') ?? 0);
          const cooldownMs = retryAfterSec > 0 ? retryAfterSec * 1000 : RATE_LIMIT_WINDOW_MS;
          useRateLimitStore.getState().setRateLimited(Date.now() + cooldownMs);
          logger.warn({ module: 'client' }, 'token refresh rate-limited — keeping current auth state');
          return null;
        }
        if (res.status === 401 || res.status === 403) {
          // Server explicitly rejected the session — clear auth
          logger.info({ module: 'client' }, 'token refresh failed — clearing auth');
          useAuthStore.getState().clearAuth();
          return null;
        }
        // 5xx or other errors — don't clear auth, just fail silently
        logger.warn(
          { module: 'client', status: res.status },
          'token refresh server error — keeping current auth state',
        );
        return null;
      }
      const data = (await res.json()) as { accessToken: string; user: AuthUser };
      logger.debug({ module: 'client' }, 'token refreshed');
      useAuthStore.getState().setAuth(data.accessToken, data.user);
      return data.accessToken;
    })
    .catch((err: unknown) => {
      // Network error (no server response) — session may still be valid once connectivity returns.
      // Do NOT call clearAuth() here: that would redirect to login on every wake-from-sleep / brief
      // offline moment. The existing accessToken stays in the store; on next API call the 401 → refresh
      // cycle will retry and succeed once the network is back.
      logger.warn({ module: 'client', err }, 'token refresh network error — keeping current auth state');
      return null;
    })
    .finally(() => {
      refreshing = null;
    });

  return refreshing;
}

// ─── ETag caching is handled by the browser HTTP cache ────────────────────────
// Server sends `Cache-Control: no-cache, must-revalidate, private` + `ETag`.
// The browser stores the response, sends `If-None-Match` automatically on the
// next fetch(), and on 304 transparently returns the cached body as a normal 200.
// No client-side ETag map needed — the browser manages cache size and eviction.

async function request<T>(path: string, options?: RequestInit, isRetry = false): Promise<T> {
  const { accessToken } = useAuthStore.getState();

  const res = await fetchWithNetworkRetry(`${BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...options?.headers,
    },
    credentials: 'include',
    ...options,
  });

  // Auto-refresh on 401 (but not for auth endpoints themselves)
  if (res.status === 401 && !isRetry && !path.startsWith('/auth')) {
    logger.debug({ module: 'client', path }, '401 — attempting token refresh');
    const newToken = await tryRefresh();
    if (newToken) return request<T>(path, options, true);
    throw new ApiError(401, 'Session expired. Please log in again.');
  }

  if (!res.ok) {
    const err = (await res.json().catch(() => ({ error: res.statusText }))) as { error?: string };
    const msg = err.error || `HTTP ${res.status}`;
    logger.warn({ module: 'client', path, status: res.status }, msg);
    if (res.status === 429) {
      const retryAfterSec = Number(res.headers.get('Retry-After') ?? 0);
      const cooldownMs = retryAfterSec > 0 ? retryAfterSec * 1000 : RATE_LIMIT_WINDOW_MS;
      useRateLimitStore.getState().setRateLimited(Date.now() + cooldownMs);
    }
    throw new ApiError(res.status, msg);
  }

  return res.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: unknown) => request<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  put: <T>(path: string, body: unknown) => request<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) => request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: <T>(path: string, body?: unknown) =>
    request<T>(path, {
      method: 'DELETE',
      ...(body ? { body: JSON.stringify(body) } : {}),
    }),
};
