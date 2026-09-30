/**
 * TG News Reader — Media Service Worker
 *
 * Strategy: Cache-First for /api/media/* requests.
 * The `?token=` query param is stripped from cache keys so that
 * JWT rotation doesn't cause unnecessary cache misses.
 *
 * Cache limits (overridable via postMessage):
 *   maxEntries : 2000  — max number of cached files
 *   maxAgeMs   : 30 days — TTL per entry
 */

const CACHE_NAME = 'tgr-media-v1';
const DEFAULT_MAX_ENTRIES = 2000;
const DEFAULT_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

// Runtime-configurable limits (can be updated via postMessage)
let maxEntries = DEFAULT_MAX_ENTRIES;
let maxAgeMs = DEFAULT_MAX_AGE_MS;

// ─── Lifecycle ────────────────────────────────────────────────────────────────

self.addEventListener('install', () => {
  // Activate immediately without waiting for old SW to be removed
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Delete old caches from previous SW versions
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)));
      // Take control of all open clients immediately
      await self.clients.claim();
    })(),
  );
});

// ─── Fetch interception ───────────────────────────────────────────────────────

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Only intercept GET /api/media/
  if (event.request.method !== 'GET' || !url.pathname.startsWith('/api/media/')) {
    return;
  }

  // Range requests (video seeking) return 206 Partial Content which the Cache API
  // cannot store — let the browser talk directly to the server for those.
  if (event.request.headers.has('Range')) {
    return;
  }

  event.respondWith(cacheFirst(event.request));
});

// ─── Cache-First strategy ─────────────────────────────────────────────────────

/**
 * Build a cache key from the request URL with `?token` stripped so the cache
 * remains valid across JWT rotations.
 */
function cacheKey(request) {
  const u = new URL(request.url);
  u.searchParams.delete('token');
  return new Request(u.toString(), { method: 'GET' });
}

async function cacheFirst(request) {
  const key = cacheKey(request);
  const cache = await caches.open(CACHE_NAME);

  // 1. Try cache
  const cached = await cache.match(key);
  if (cached) {
    // Check age — if entry is too old, treat as miss and refresh in background
    const dateHeader = cached.headers.get('x-cached-at');
    if (dateHeader) {
      const age = Date.now() - parseInt(dateHeader, 10);
      if (age > maxAgeMs) {
        // Background revalidation — serve stale, update cache
        fetchAndCache(request, key, cache).catch(() => {});
      }
    }
    return cached;
  }

  // 2. Fetch from network
  return fetchAndCache(request, key, cache);
}

async function fetchAndCache(request, key, cache) {
  const response = await fetch(request);

  // 206 Partial Content cannot be stored in the Cache API — skip caching
  if (response.ok && response.status !== 206) {
    // Clone and attach a timestamp header so we can implement TTL
    const headers = new Headers(response.headers);
    headers.set('x-cached-at', String(Date.now()));

    const timestamped = new Response(response.clone().body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });

    await cache.put(key, timestamped);
    await pruneCache(cache);
  }

  return response;
}

// ─── Cache pruning ────────────────────────────────────────────────────────────

async function pruneCache(cache) {
  const keys = await cache.keys();
  if (keys.length <= maxEntries) return;

  // Remove the oldest entries (FIFO approximation — oldest keys first)
  const overflow = keys.length - maxEntries;
  const toDelete = keys.slice(0, overflow);
  await Promise.all(toDelete.map((k) => cache.delete(k)));
}

// ─── Message API ──────────────────────────────────────────────────────────────

self.addEventListener('message', (event) => {
  const { type, payload } = event.data ?? {};

  switch (type) {
    case 'SET_LIMITS':
      if (payload?.maxEntries) maxEntries = payload.maxEntries;
      if (payload?.maxAgeDays) maxAgeMs = payload.maxAgeDays * 24 * 60 * 60 * 1000;
      event.source?.postMessage({ type: 'LIMITS_UPDATED', maxEntries, maxAgeMs });
      break;

    case 'CLEAR_CACHE':
      caches.delete(CACHE_NAME).then(() => {
        event.source?.postMessage({ type: 'CACHE_CLEARED' });
      });
      break;

    case 'GET_STATS':
      caches.open(CACHE_NAME).then(async (cache) => {
        const keys = await cache.keys();
        event.source?.postMessage({
          type: 'STATS',
          count: keys.length,
          maxEntries,
          maxAgeDays: Math.round(maxAgeMs / (24 * 60 * 60 * 1000)),
        });
      });
      break;
  }
});
