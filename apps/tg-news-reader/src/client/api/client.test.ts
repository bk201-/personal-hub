import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '../store/authStore';

// Mock logger to silence output
vi.mock('../logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

describe('ApiError', () => {
  it('has status and message', async () => {
    const { ApiError } = await import('./client');
    const err = new ApiError(404, 'Not Found');
    expect(err.status).toBe(404);
    expect(err.message).toBe('Not Found');
    expect(err.name).toBe('ApiError');
    expect(err).toBeInstanceOf(Error);
  });
});

describe('api', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    useAuthStore.setState({ accessToken: 'test-token' });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    useAuthStore.setState({ accessToken: null });
    vi.restoreAllMocks();
  });

  it('GET sends Authorization header', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: 42 }),
    });

    const { api } = await import('./client');
    const result = await api.get<{ data: number }>('/test');

    expect(result).toEqual({ data: 42 });
    const [url, opts] = vi.mocked(globalThis.fetch).mock.calls[0];
    expect(url).toBe('/api/test');
    expect((opts!.headers as Record<string, string>)['Authorization']).toBe('Bearer test-token');
  });

  it('POST sends JSON body', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ ok: true }),
    });

    const { api } = await import('./client');
    await api.post('/items', { name: 'foo' });

    const [, opts] = vi.mocked(globalThis.fetch).mock.calls[0];
    expect(opts?.method).toBe('POST');
    expect(opts?.body).toBe(JSON.stringify({ name: 'foo' }));
  });

  it('throws ApiError on non-2xx response', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      json: () => Promise.resolve({ error: 'Invalid input' }),
    });

    const { api, ApiError } = await import('./client');
    await expect(api.get('/fail')).rejects.toThrow(ApiError);
    await expect(api.get('/fail')).rejects.toMatchObject({ status: 400, message: 'Invalid input' });
  });

  it('throws ApiError with fallback message when body parse fails', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      json: () => Promise.reject(new Error('parse error')),
    });

    const { api } = await import('./client');
    await expect(api.get('/crash')).rejects.toMatchObject({
      status: 500,
      message: 'Internal Server Error',
    });
  });

  it('DELETE sends method and optional body', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    });

    const { api } = await import('./client');
    await api.delete('/items/1', { reason: 'test' });

    const [, opts] = vi.mocked(globalThis.fetch).mock.calls[0];
    expect(opts?.method).toBe('DELETE');
    expect(opts?.body).toBe(JSON.stringify({ reason: 'test' }));
  });

  it('DELETE without body omits body field', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    });

    const { api } = await import('./client');
    await api.delete('/items/1');

    const [, opts] = vi.mocked(globalThis.fetch).mock.calls[0];
    expect(opts?.method).toBe('DELETE');
    expect(opts?.body).toBeUndefined();
  });

  it('PUT sends method and JSON body', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ ok: true }),
    });

    const { api } = await import('./client');
    await api.put('/items/1', { name: 'bar' });

    const [, opts] = vi.mocked(globalThis.fetch).mock.calls[0];
    expect(opts?.method).toBe('PUT');
    expect(opts?.body).toBe(JSON.stringify({ name: 'bar' }));
  });

  it('PATCH sends method and JSON body', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ ok: true }),
    });

    const { api } = await import('./client');
    await api.patch('/items/1', { status: 'done' });

    const [, opts] = vi.mocked(globalThis.fetch).mock.calls[0];
    expect(opts?.method).toBe('PATCH');
    expect(opts?.body).toBe(JSON.stringify({ status: 'done' }));
  });

  it('retries on 401 by refreshing token', async () => {
    let callCount = 0;
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (typeof url === 'string' && url.includes('/auth/refresh')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              accessToken: 'new-token',
              user: { id: 1, email: 'test@t.com', role: 'admin' },
            }),
        });
      }
      callCount++;
      if (callCount === 1) {
        return Promise.resolve({
          ok: false,
          status: 401,
          statusText: 'Unauthorized',
          json: () => Promise.resolve({ error: 'expired' }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ data: 'refreshed' }),
      });
    });

    const { api } = await import('./client');
    const result = await api.get<{ data: string }>('/protected');
    expect(result.data).toBe('refreshed');
  });

  it('throws 401 ApiError on auth endpoints (no retry)', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      json: () => Promise.resolve({ error: 'bad creds' }),
    });

    const { api, ApiError } = await import('./client');
    await expect(api.get('/auth/me')).rejects.toThrow(ApiError);
  });

  it('retries on TypeError (network error) then succeeds', async () => {
    let attempt = 0;
    globalThis.fetch = vi.fn().mockImplementation(() => {
      attempt++;
      if (attempt <= 1) {
        return Promise.reject(new TypeError('Failed to fetch'));
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ ok: true }),
      });
    });

    const { api } = await import('./client');
    const result = await api.get('/test');
    expect(result).toEqual({ ok: true });
    // first attempt fails, second succeeds
    expect(attempt).toBe(2);
  });

  it('does not send Authorization when no token', async () => {
    useAuthStore.setState({ accessToken: null });
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    });

    const { api } = await import('./client');
    await api.get('/public');

    const [, opts] = vi.mocked(globalThis.fetch).mock.calls[0];
    expect((opts!.headers as Record<string, string>)['Authorization']).toBeUndefined();
  });
});
