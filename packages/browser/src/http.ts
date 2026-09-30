export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface HttpClientOptions<User> {
  auth: {
    getToken: () => string | null;
    setAuth: (token: string, user: User) => void;
    clearAuth: () => void;
  };
  onRateLimited?: (until: number) => void;
  sessionExpiredMessage?: () => string;
  /** Preserve an application's legacy logout-on-transient-failure policy when required. */
  refreshFailurePolicy?: 'rejected-session' | 'any-failure';
  networkRetries?: number;
  fetcher?: typeof fetch;
  baseUrl?: string;
  logger?: {
    debug: (context: Record<string, unknown>, message: string) => void;
    info: (context: Record<string, unknown>, message: string) => void;
    warn: (context: Record<string, unknown>, message: string) => void;
  };
}

/** Accept both Retry-After formats; a malformed header must never produce an infinite cooldown. */
export function rateLimitUntil(retryAfter: string | null, now = Date.now()): number {
  const seconds = retryAfter === null ? NaN : Number(retryAfter);
  const deadline = now + seconds * 1_000;
  if (Number.isFinite(seconds) && seconds > 0 && Number.isFinite(deadline)) return deadline;
  const date = retryAfter && !Number.isFinite(seconds) ? Date.parse(retryAfter) : NaN;
  return Number.isFinite(date) && date > now ? date : now + 60_000;
}

export function createHttpClient<User>({
  auth,
  onRateLimited,
  sessionExpiredMessage = () => 'Session expired. Please log in again.',
  refreshFailurePolicy = 'rejected-session',
  networkRetries = 0,
  fetcher = (...args) => globalThis.fetch(...args),
  baseUrl = '/api',
  logger,
}: HttpClientOptions<User>) {
  let refreshing: Promise<string | null> | null = null;

  const reportRateLimit = (response: Response) => {
    onRateLimited?.(rateLimitUntil(response.headers.get('Retry-After')));
  };

  async function fetchWithRetry(input: string, init?: RequestInit): Promise<Response> {
    for (let attempt = 0; ; attempt++) {
      try {
        init?.signal?.throwIfAborted();
        return await fetcher(input, init);
      } catch (error) {
        if (!(error instanceof TypeError) || init?.signal?.aborted || attempt >= networkRetries) throw error;
        const delay = 500 * 2 ** attempt;
        logger?.debug({ module: 'client', attempt: attempt + 1, delay }, 'network error — retrying fetch');
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  function tryRefresh(): Promise<string | null> {
    if (refreshing) return refreshing;
    refreshing = fetchWithRetry(`${baseUrl}/auth/refresh`, { method: 'POST', credentials: 'include' })
      .then(async (response) => {
        if (!response.ok) {
          if (response.status === 429) reportRateLimit(response);
          if (response.status === 401 || response.status === 403 || refreshFailurePolicy === 'any-failure') {
            logger?.info({ module: 'client' }, 'token refresh failed — clearing auth');
            auth.clearAuth();
          } else {
            logger?.warn(
              { module: 'client', status: response.status },
              'token refresh failed — keeping current auth state',
            );
          }
          return null;
        }
        const data = (await response.json()) as { accessToken: string; user: User };
        auth.setAuth(data.accessToken, data.user);
        logger?.debug({ module: 'client' }, 'token refreshed');
        return data.accessToken;
      })
      .catch((error: unknown) => {
        logger?.warn({ module: 'client', err: error }, 'token refresh network error');
        if (refreshFailurePolicy === 'any-failure') auth.clearAuth();
        return null;
      })
      .finally(() => {
        refreshing = null;
      });
    return refreshing;
  }

  async function request<T>(path: string, options?: RequestInit, isRetry = false): Promise<T> {
    const token = auth.getToken();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    new Headers(options?.headers).forEach((value, key) => {
      const existing = Object.keys(headers).find((name) => name.toLowerCase() === key);
      if (existing) delete headers[existing];
      headers[key] = value;
    });
    const response = await fetchWithRetry(`${baseUrl}${path}`, {
      credentials: 'include',
      ...options,
      headers,
    });
    if (response.status === 401 && !isRetry && !path.startsWith('/auth')) {
      logger?.debug({ module: 'client', path }, '401 — attempting token refresh');
      // A concurrent request may have already refreshed the token before this response arrived.
      const newToken = auth.getToken() !== token ? auth.getToken() : await tryRefresh();
      if (newToken) return request<T>(path, options, true);
      throw new ApiError(401, sessionExpiredMessage());
    }
    if (!response.ok) {
      if (response.status === 429) reportRateLimit(response);
      const body: unknown = await response.json().catch(() => ({ error: response.statusText }));
      const error = body && typeof body === 'object' && 'error' in body ? body.error : undefined;
      const message = typeof error === 'string' && error ? error : `HTTP ${response.status}`;
      logger?.warn({ module: 'client', path, status: response.status }, message);
      throw new ApiError(response.status, message);
    }
    if (response.status === 204) return undefined as T;
    return response.json() as Promise<T>;
  }

  return {
    tryRefresh,
    request,
    api: {
      get: <T>(path: string) => request<T>(path),
      post: <T>(path: string, body: unknown) => request<T>(path, { method: 'POST', body: JSON.stringify(body) }),
      put: <T>(path: string, body: unknown) => request<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
      patch: <T>(path: string, body: unknown) => request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
      delete: <T>(path: string, body?: unknown) =>
        request<T>(path, {
          method: 'DELETE',
          ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        }),
    },
  };
}
