import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, createHttpClient, rateLimitUntil } from './http.js';

const response = (status = 200, body: unknown = {}, headers?: HeadersInit) =>
  new Response(status === 204 ? null : JSON.stringify(body), { status, headers });

function setup(options: { networkRetries?: number; refreshFailurePolicy?: 'any-failure' } = {}) {
  let token: string | null = 'old-token';
  const auth = {
    getToken: () => token,
    setAuth: vi.fn((next: string, _user: { id: number }) => {
      token = next;
    }),
    clearAuth: vi.fn(() => {
      token = null;
    }),
  };
  const fetcher = vi.fn<typeof fetch>();
  const onRateLimited = vi.fn();
  return {
    auth,
    fetcher,
    onRateLimited,
    ...createHttpClient({
      auth,
      fetcher,
      onRateLimited,
      ...options,
    }),
  };
}

afterEach(() => vi.useRealTimers());

describe('HTTP client contract', () => {
  it('preserves JSON credentials, fresh authorization and caller headers', async () => {
    const client = setup();
    client.fetcher.mockResolvedValue(response(200, { ok: true }));
    await client.request('/items', { headers: new Headers({ 'X-Request': 'value' }), method: 'POST', body: '{}' });
    const [url, init] = client.fetcher.mock.calls[0];
    const headers = new Headers(init?.headers);
    expect(url).toBe('/api/items');
    expect(init).toMatchObject({ credentials: 'include', method: 'POST', body: '{}' });
    expect(headers.get('Authorization')).toBe('Bearer old-token');
    expect(headers.get('Content-Type')).toBe('application/json');
    expect(headers.get('X-Request')).toBe('value');
  });

  it('shares one refresh between HTTP requests and an explicit stream refresh', async () => {
    const client = setup();
    let finish!: (value: Response) => void;
    client.fetcher.mockImplementation(async (url, init) => {
      if (url === '/api/auth/refresh')
        return new Promise((resolve) => {
          finish = resolve;
        });
      return new Headers(init?.headers).get('Authorization') === 'Bearer new-token'
        ? response(200, { ok: true })
        : response(401);
    });
    const first = client.api.get('/first');
    const second = client.api.get('/second');
    const streamRefresh = client.tryRefresh();
    expect(client.tryRefresh()).toBe(streamRefresh);
    await Promise.resolve();
    finish(response(200, { accessToken: 'new-token', user: { id: 1 } }));
    await expect(Promise.all([first, second, streamRefresh])).resolves.toEqual([
      { ok: true },
      { ok: true },
      'new-token',
    ]);
    expect(client.fetcher.mock.calls.filter(([url]) => url === '/api/auth/refresh')).toHaveLength(1);
    expect(client.auth.setAuth).toHaveBeenCalledOnce();
  });

  it('keeps refreshes isolated between app instances', async () => {
    const news = setup();
    const czech = setup();
    news.fetcher.mockResolvedValue(response(200, { accessToken: 'news', user: { id: 1 } }));
    czech.fetcher.mockResolvedValue(response(200, { accessToken: 'czech', user: { id: 2 } }));
    await expect(Promise.all([news.tryRefresh(), czech.tryRefresh()])).resolves.toEqual(['news', 'czech']);
    expect(news.auth.getToken()).toBe('news');
    expect(czech.auth.getToken()).toBe('czech');
  });

  it.each([401, 403])('clears only explicitly rejected sessions (%s)', async (status) => {
    const client = setup();
    client.fetcher.mockResolvedValue(response(status));
    await expect(client.tryRefresh()).resolves.toBeNull();
    expect(client.auth.clearAuth).toHaveBeenCalledOnce();
  });

  it.each([429, 500, 503])('preserves news auth on transient refresh status %s', async (status) => {
    const client = setup();
    client.fetcher.mockResolvedValue(response(status, {}, { 'Retry-After': '10' }));
    await expect(client.tryRefresh()).resolves.toBeNull();
    expect(client.auth.clearAuth).not.toHaveBeenCalled();
    expect(client.onRateLimited).toHaveBeenCalledTimes(status === 429 ? 1 : 0);
  });

  it('preserves news auth on offline refresh and permits a later retry', async () => {
    const client = setup();
    client.fetcher
      .mockRejectedValueOnce(new TypeError('offline'))
      .mockResolvedValueOnce(response(200, { accessToken: 'new', user: { id: 1 } }));
    await expect(client.tryRefresh()).resolves.toBeNull();
    expect(client.auth.clearAuth).not.toHaveBeenCalled();
    await expect(client.tryRefresh()).resolves.toBe('new');
  });

  it('preserves Czech legacy logout policy without introducing network retries', async () => {
    const client = setup({ refreshFailurePolicy: 'any-failure' });
    client.fetcher.mockRejectedValue(new TypeError('offline'));
    await expect(client.tryRefresh()).resolves.toBeNull();
    expect(client.auth.clearAuth).toHaveBeenCalledOnce();
    expect(client.fetcher).toHaveBeenCalledOnce();
  });

  it('never recursively refreshes an auth endpoint or a retried 401', async () => {
    const client = setup();
    client.fetcher.mockResolvedValueOnce(response(401, { error: 'bad credentials' }));
    await expect(client.api.post('/auth/login', {})).rejects.toMatchObject({ status: 401 });
    expect(client.fetcher).toHaveBeenCalledOnce();
    client.fetcher
      .mockReset()
      .mockResolvedValueOnce(response(401))
      .mockResolvedValueOnce(response(200, { accessToken: 'new', user: { id: 1 } }))
      .mockResolvedValueOnce(response(401));
    await expect(client.api.get('/private')).rejects.toBeInstanceOf(ApiError);
    expect(client.fetcher).toHaveBeenCalledTimes(3);
  });

  it('uses app-provided session-expired text', async () => {
    const client = setup();
    client.fetcher.mockResolvedValue(response(401));
    const { api } = createHttpClient({
      auth: client.auth,
      fetcher: client.fetcher,
      sessionExpiredMessage: () => 'Přihlaste se',
    });
    await expect(api.get('/private')).rejects.toMatchObject({ status: 401, message: 'Přihlaste se' });
  });

  it('reports 429 even when the response body is not JSON and does not replay it', async () => {
    const client = setup({ networkRetries: 3 });
    client.fetcher.mockResolvedValue(new Response('slow down', { status: 429, headers: { 'Retry-After': '2' } }));
    await expect(client.api.post('/items', {})).rejects.toMatchObject({ status: 429 });
    expect(client.onRateLimited).toHaveBeenCalledOnce();
    expect(client.fetcher).toHaveBeenCalledOnce();
  });

  it('bounds news network backoff and does not retry aborts', async () => {
    vi.useFakeTimers();
    const client = setup({ networkRetries: 3 });
    client.fetcher.mockRejectedValue(new TypeError('offline'));
    const failure = client.api.get('/items').catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(3_500);
    expect(await failure).toMatchObject({ message: 'offline' });
    expect(client.fetcher).toHaveBeenCalledTimes(4);
    client.fetcher.mockReset().mockRejectedValue(new DOMException('stopped', 'AbortError'));
    await expect(client.api.get('/items')).rejects.toMatchObject({ name: 'AbortError' });
    expect(client.fetcher).toHaveBeenCalledOnce();
  });

  it('supports empty successes and false-valued DELETE bodies', async () => {
    const client = setup();
    client.fetcher.mockResolvedValue(response(204));
    await expect(client.api.delete('/item', false)).resolves.toBeUndefined();
    expect(client.fetcher.mock.calls[0][1]?.body).toBe('false');
  });

  it('normalizes both Retry-After formats with a bounded fallback', () => {
    const now = Date.parse('2026-09-30T12:00:00Z');
    expect(rateLimitUntil('5', now)).toBe(now + 5_000);
    expect(rateLimitUntil('Wed, 30 Sep 2026 12:00:20 GMT', now)).toBe(now + 20_000);
    for (const invalid of [null, '', 'invalid', 'Infinity', '1e308', '-1', '0']) {
      expect(rateLimitUntil(invalid, now)).toBe(now + 60_000);
    }
  });
});
