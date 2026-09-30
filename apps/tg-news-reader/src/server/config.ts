export const JWT_SECRET = process.env.JWT_SECRET ?? 'dev-secret-change-in-production';
export const JWT_ACCESS_EXPIRES_SEC = 15 * 60; // 15 min
export const REFRESH_EXPIRES_DAYS = 7;

// ─── Rate limiting ────────────────────────────────────────────────────────────
// Applied only in production (see server/index.ts). GET/HEAD requests are cheap
// and idempotent, so they get a higher ceiling than mutating requests.
/** Sliding window length in ms. Env: RATE_LIMIT_WINDOW_SEC (default 60) */
export const RATE_LIMIT_WINDOW_MS = parseInt(process.env.RATE_LIMIT_WINDOW_SEC ?? '60', 10) * 1_000;
/** Base request budget per window for mutating methods (POST/PUT/PATCH/DELETE/OPTIONS…). Env: RATE_LIMIT_MAX (default 120) */
export const RATE_LIMIT_MAX = parseInt(process.env.RATE_LIMIT_MAX ?? '120', 10);
/** GET/HEAD budget = RATE_LIMIT_MAX × this. Env: RATE_LIMIT_GET_MULTIPLIER (default 5) */
export const RATE_LIMIT_GET_MULTIPLIER = parseInt(process.env.RATE_LIMIT_GET_MULTIPLIER ?? '5', 10);

// ─── Download Manager ─────────────────────────────────────────────────────────
/** Number of concurrent download workers. Env: DOWNLOAD_WORKER_CONCURRENCY */
export const DOWNLOAD_WORKER_CONCURRENCY = parseInt(process.env.DOWNLOAD_WORKER_CONCURRENCY ?? '10', 10);
/** How long (ms) to keep a completed task before auto-deleting it. Env: DOWNLOAD_TASK_CLEANUP_DELAY_SEC */
export const DOWNLOAD_TASK_CLEANUP_DELAY_MS = parseInt(process.env.DOWNLOAD_TASK_CLEANUP_DELAY_SEC ?? '30', 10) * 1_000;
/** Free space kept on the media filesystem, including for user-initiated downloads (default 1 GiB). */
export const DOWNLOAD_STORAGE_RESERVE_BYTES = Number(process.env.DOWNLOAD_STORAGE_RESERVE_MB ?? '1024') * 1024 * 1024;
if (!Number.isFinite(DOWNLOAD_STORAGE_RESERVE_BYTES) || DOWNLOAD_STORAGE_RESERVE_BYTES < 1024 * 1024 * 1024) {
  throw new Error('DOWNLOAD_STORAGE_RESERVE_MB must be at least 1024');
}

// ─── Worker pool circuit breaker ──────────────────────────────────────────────
/**
 * Fraction of workers that must crash within the window to trigger a fatal exit.
 * Set to 1.0 to disable (only individual restarts).
 * Env: WORKER_POOL_CRASH_THRESHOLD_RATIO
 */
export const WORKER_POOL_CRASH_THRESHOLD_RATIO = parseFloat(process.env.WORKER_POOL_CRASH_THRESHOLD_RATIO ?? '0.8');
/** Sliding window size in ms for crash counting. Env: WORKER_POOL_CRASH_WINDOW_SEC */
export const WORKER_POOL_CRASH_WINDOW_MS = parseInt(process.env.WORKER_POOL_CRASH_WINDOW_SEC ?? '60', 10) * 1_000;
/** Base restart delay for a crashed individual worker (ms). */
export const WORKER_RESTART_BASE_MS = 5_000;
/** Max random jitter added to worker restart delay (ms). */
export const WORKER_RESTART_JITTER_MS = 3_000;

// ─── Media size limits ────────────────────────────────────────────────────────
// Configure in MB via env; stored as bytes internally. Applied only to background (priority < 10) downloads.
/** Env: MAX_PHOTO_SIZE_MB (default 5) */
export const MAX_PHOTO_SIZE_BYTES = parseInt(process.env.MAX_PHOTO_SIZE_MB ?? '5', 10) * 1024 * 1024;
/** Env: MAX_VIDEO_SIZE_MB (default 75) */
export const MAX_VIDEO_SIZE_BYTES = parseInt(process.env.MAX_VIDEO_SIZE_MB ?? '75', 10) * 1024 * 1024;
/** Env: MAX_IMG_DOC_SIZE_MB (default 5) */
export const MAX_IMG_DOC_SIZE_BYTES = parseInt(process.env.MAX_IMG_DOC_SIZE_MB ?? '5', 10) * 1024 * 1024;

// ─── Telegram connection ──────────────────────────────────────────────────────
/** Seconds to delay the first Telegram connection after server start.
 *  Gives the old container time to disconnect on SIGTERM during deploys.
 *  Env: TG_CONNECT_DELAY_SEC (default 0 in dev, 15 in prod) */
export const TG_CONNECT_DELAY_MS =
  parseInt(process.env.TG_CONNECT_DELAY_SEC ?? (process.env.NODE_ENV === 'production' ? '30' : '0'), 10) * 1_000;

// ─── News fetching ────────────────────────────────────────────────────────────
/** Days to look back for a brand-new channel's first fetch. Env: NEWS_DEFAULT_FETCH_DAYS */
export const NEWS_DEFAULT_FETCH_DAYS = parseInt(process.env.NEWS_DEFAULT_FETCH_DAYS ?? '3', 10);
/** Max messages fetched per channel sync. Env: NEWS_FETCH_LIMIT */
export const NEWS_FETCH_LIMIT = parseInt(process.env.NEWS_FETCH_LIMIT ?? '1000', 10);

// ─── Azure OpenAI / OpenAI ───────────────────────────────────────────────────
/** Azure OpenAI endpoint URL. When set, Azure provider is used; otherwise falls back to OPENAI_API_KEY. */
export const AZURE_OPENAI_ENDPOINT = process.env.AZURE_OPENAI_ENDPOINT ?? '';
/** Azure OpenAI API key. */
export const AZURE_OPENAI_KEY = process.env.AZURE_OPENAI_KEY ?? '';
/** Azure OpenAI deployment name (e.g. "gpt-4o-mini"). */
export const AZURE_OPENAI_DEPLOYMENT = process.env.AZURE_OPENAI_DEPLOYMENT ?? 'gpt-4o-mini';
/** Direct OpenAI API key (fallback when Azure vars are absent). */
export const OPENAI_API_KEY = process.env.OPENAI_API_KEY ?? '';
/** Max news items to include in a single digest request. */
export const DIGEST_MAX_ITEMS = parseInt(process.env.DIGEST_MAX_ITEMS ?? '200', 10);
/** Max chars per item when fullContent is available. Env: DIGEST_ARTICLE_CONTENT_LIMIT */
export const DIGEST_ARTICLE_CONTENT_LIMIT = parseInt(process.env.DIGEST_ARTICLE_CONTENT_LIMIT ?? '1500', 10);
/** Max ms to wait for article prefetch before proceeding. Env: DIGEST_ARTICLE_PREFETCH_TIMEOUT_SEC */
export const DIGEST_ARTICLE_PREFETCH_TIMEOUT_MS =
  parseInt(process.env.DIGEST_ARTICLE_PREFETCH_TIMEOUT_SEC ?? '30', 10) * 1_000;
/**
 * Max number of articles to prefetch for a single digest request.
 * Caps the number of download tasks enqueued to avoid saturating the download worker pool.
 * Env: DIGEST_MAX_PREFETCH (default 20)
 */
export const DIGEST_MAX_PREFETCH = parseInt(process.env.DIGEST_MAX_PREFETCH ?? '20', 10);

// ─── OpenAI TTS (Read Aloud) ──────────────────────────────────────────────────
/** TTS model name. Env: OPENAI_TTS_MODEL (default "gpt-4o-mini-tts") */
export const OPENAI_TTS_MODEL = process.env.OPENAI_TTS_MODEL ?? 'gpt-4o-mini-tts';
/** Default voice. Env: OPENAI_TTS_VOICE_DEFAULT (default "nova") */
export const OPENAI_TTS_VOICE_DEFAULT = process.env.OPENAI_TTS_VOICE_DEFAULT ?? 'nova';
/**
 * Voices supported by `gpt-4o-mini-tts`. OpenAI does NOT expose a "list voices" API —
 * this is the documented enum (https://platform.openai.com/docs/guides/text-to-speech).
 * Order is deliberate: defaults first, then the more recent / characterful additions.
 */
export const OPENAI_TTS_VOICES = [
  'nova',
  'alloy',
  'echo',
  'fable',
  'onyx',
  'shimmer',
  'ash',
  'ballad',
  'coral',
  'sage',
] as const;
export type OpenAiTtsVoice = (typeof OPENAI_TTS_VOICES)[number];
/**
 * Azure OpenAI TTS deployment name. When set (along with Azure endpoint+key),
 * Azure provider is used for TTS. Otherwise the service falls back to direct OPENAI_API_KEY.
 * Env: AZURE_OPENAI_TTS_DEPLOYMENT
 */
export const AZURE_OPENAI_TTS_DEPLOYMENT = process.env.AZURE_OPENAI_TTS_DEPLOYMENT ?? '';
/**
 * Hard cap on input length for TTS. At gpt-4o-mini-tts pricing (~$12/M chars),
 * 20 000 chars = ~$0.24 per request and ~10 min of audio.
 * Env: TTS_MAX_INPUT_CHARS (default 20000)
 */
export const TTS_MAX_INPUT_CHARS = parseInt(process.env.TTS_MAX_INPUT_CHARS ?? '20000', 10);
/**
 * Per-call OpenAI TTS limit is 4096 chars; we use a slightly smaller chunk
 * size and split at sentence boundaries. Env: TTS_CHUNK_SIZE_CHARS (default 4000)
 */
export const TTS_CHUNK_SIZE_CHARS = parseInt(process.env.TTS_CHUNK_SIZE_CHARS ?? '4000', 10);
/** TTL for cached MP3s and DB rows in seconds. Env: TTS_CACHE_TTL_SEC (default 86400 = 1 day) */
export const TTS_CACHE_TTL_SEC = parseInt(process.env.TTS_CACHE_TTL_SEC ?? '86400', 10);
/** Cleanup interval in ms — how often the periodic cleanup job runs. Default 1h. */
export const TTS_CLEANUP_INTERVAL_MS = parseInt(process.env.TTS_CLEANUP_INTERVAL_SEC ?? '3600', 10) * 1_000;

// ─── Article download limits ──────────────────────────────────────────────────
/**
 * Max number of workers that may process article (jsdom) tasks concurrently.
 * jsdom loaded in a worker costs ~100 MB; limiting concurrency prevents OOM bursts.
 * Env: ARTICLE_WORKER_CONCURRENCY (default 3)
 */
export const ARTICLE_WORKER_CONCURRENCY = parseInt(process.env.ARTICLE_WORKER_CONCURRENCY ?? '3', 10);
/**
 * Max HTML response size in bytes for article extraction.
 * Pages larger than this are skipped as a permanent failure (no retry).
 * Env: ARTICLE_MAX_HTML_MB (default 3)
 */
export const ARTICLE_MAX_HTML_BYTES = parseInt(process.env.ARTICLE_MAX_HTML_MB ?? '3', 10) * 1024 * 1024;

if (process.env.NODE_ENV === 'production' && JWT_SECRET === 'dev-secret-change-in-production') {
  throw new Error('JWT_SECRET env variable must be set in production!');
}
