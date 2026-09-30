import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '../store/authStore';
import { useGenerateTts, useTtsAudioUrl, useTtsConfig, useTtsStatus } from './tts';

// fetch mock
const originalFetch = globalThis.fetch;

beforeEach(() => {
  useAuthStore.setState({ accessToken: 'test-token', user: null, unlockedGroupIds: [], isCheckingAuth: false });
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

function wrap() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  // eslint-disable-next-line react/display-name
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return Wrapper;
}

describe('useTtsAudioUrl', () => {
  it('returns null when hash is null', () => {
    const { result } = renderHook(() => useTtsAudioUrl(null));
    expect(result.current).toBeNull();
  });

  it('appends the auth token as a query param and defaults to chunk 0', () => {
    const { result } = renderHook(() => useTtsAudioUrl('abc'));
    expect(result.current).toBe('/api/tts/abc/0.mp3?token=test-token');
  });

  it('returns the bare URL when no token is set', () => {
    useAuthStore.setState({ accessToken: null, user: null, unlockedGroupIds: [], isCheckingAuth: false });
    const { result } = renderHook(() => useTtsAudioUrl('abc'));
    expect(result.current).toBe('/api/tts/abc/0.mp3');
  });

  it('builds a URL for a specific chunk index', () => {
    const { result } = renderHook(() => useTtsAudioUrl('abc', 3));
    expect(result.current).toBe('/api/tts/abc/3.mp3?token=test-token');
  });
});

describe('useTtsConfig', () => {
  it('returns server config from /api/tts/config', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          enabled: true,
          defaultVoice: 'nova',
          voices: ['nova', 'alloy', 'echo'],
          maxInputChars: 20000,
          model: 'gpt-4o-mini-tts',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    ) as typeof fetch;
    const { result } = renderHook(() => useTtsConfig(), { wrapper: wrap() });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data?.enabled).toBe(true);
    expect(result.current.data?.defaultVoice).toBe('nova');
    expect(result.current.data?.voices).toEqual(['nova', 'alloy', 'echo']);
  });
});

describe('useGenerateTts', () => {
  it('POSTs to /api/tts and returns the hash result', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          hash: 'deadbeef'.repeat(8),
          status: 'pending',
          chunksTotal: 2,
          chunksDone: 0,
          error: null,
          cached: false,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    globalThis.fetch = fetchMock as typeof fetch;
    const { result } = renderHook(() => useGenerateTts(), { wrapper: wrap() });
    result.current.mutate({ text: 'hello', voice: 'nova' });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.hash).toBe('deadbeef'.repeat(8));
    expect(fetchMock).toHaveBeenCalledWith('/api/tts', expect.objectContaining({ method: 'POST' }));
  });
});

describe('useTtsStatus', () => {
  it('polls /api/tts/:hash/status when enabled', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ hash: 'abc', status: 'done', chunksTotal: 1, chunksDone: 1, error: null }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    ) as typeof fetch;
    const { result } = renderHook(() => useTtsStatus('abc'), { wrapper: wrap() });
    await waitFor(() => expect(result.current.data?.status).toBe('done'));
  });

  it('does not fetch when hash is null', () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    renderHook(() => useTtsStatus(null), { wrapper: wrap() });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
