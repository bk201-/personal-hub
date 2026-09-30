// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '../store/authStore';
import { useRateLimitStore } from '../store/rateLimitStore';
import { api, ApiError, tryRefresh } from './client';

vi.mock('../logger', () => ({ logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn() } }));
vi.mock('../i18n', () => ({ default: { t: () => 'Localized session expired' } }));

beforeEach(() => {
  useAuthStore.setState({ accessToken: 'old', user: null });
  useRateLimitStore.getState().clear();
});
afterEach(() => vi.unstubAllGlobals());

describe('Czech HTTP adapter', () => {
  it('refreshes and retries vocabulary requests with the new app-local token', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response('{}', { status: 401 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ accessToken: 'new', user: { id: 1, email: 'learner@example.test', role: 'admin' } }),
        ),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ words: ['příliš'] })));
    vi.stubGlobal('fetch', fetcher);
    await expect(api.get('/words')).resolves.toEqual({ words: ['příliš'] });
    expect(useAuthStore.getState().accessToken).toBe('new');
    expect(new Headers(fetcher.mock.calls[2][1].headers).get('Authorization')).toBe('Bearer new');
  });

  it('retains localized errors and the existing transient-failure logout policy', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 401 })));
    await expect(api.get('/words')).rejects.toMatchObject({ status: 401, message: 'Localized session expired' });
    useAuthStore.setState({ accessToken: 'old' });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')));
    await expect(tryRefresh()).resolves.toBeNull();
    expect(useAuthStore.getState().accessToken).toBeNull();
  });

  it('reports rate limits without replaying vocabulary mutations', async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response('{"error":"Slow down"}', {
        status: 429,
        headers: { 'Retry-After': '10' },
      }),
    );
    vi.stubGlobal('fetch', fetcher);
    await expect(api.post('/words', { czech: 'slovo' })).rejects.toBeInstanceOf(ApiError);
    expect(fetcher).toHaveBeenCalledOnce();
    expect(useRateLimitStore.getState().until).toBeGreaterThan(Date.now());
  });
});
