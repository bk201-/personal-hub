import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { notifyError } = vi.hoisted(() => ({ notifyError: vi.fn() }));
vi.mock('antd', () => ({ App: { useApp: () => ({ message: { error: notifyError } }) } }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string, options: { error: string }) => `${key}: ${options.error}` }),
}));

vi.mock('./client', () => ({
  api: {
    get: vi.fn().mockResolvedValue([]),
    post: vi.fn().mockResolvedValue({ inserted: 0, total: 0, totalNewsCount: 10, unreadCount: 5 }),
    put: vi.fn().mockResolvedValue({}),
    patch: vi.fn().mockResolvedValue({ ok: true }),
    delete: vi.fn().mockResolvedValue({}),
  },
}));

import {
  channelKeys,
  useChannels,
  useCreateChannel,
  useUpdateChannel,
  useDeleteChannel,
  useFetchChannel,
  useReorderChannels,
  useMarkReadAndFetch,
  useChannelLookup,
} from './channels';
import { api } from './client';

const mockedApi = vi.mocked(api);

function createWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  const Wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children);
  return { Wrapper, queryClient: qc };
}

describe('channelKeys', () => {
  it('all returns correct key', () => {
    expect(channelKeys.all).toEqual(['channels']);
  });
});

describe('useChannels', () => {
  beforeEach(() => vi.clearAllMocks());

  it('fetches from /channels', async () => {
    const { Wrapper } = createWrapper();
    renderHook(() => useChannels(), { wrapper: Wrapper });
    await waitFor(() => expect(mockedApi.get).toHaveBeenCalledWith('/channels'));
  });
});

describe('useCreateChannel', () => {
  beforeEach(() => vi.clearAllMocks());

  it('posts and invalidates channels', async () => {
    const { Wrapper, queryClient } = createWrapper();
    const spy = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useCreateChannel(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync({ telegramId: 'test', name: 'Test', channelType: 'news' });
    });

    expect(mockedApi.post).toHaveBeenCalledWith('/channels', expect.any(Object));
    expect(spy).toHaveBeenCalledWith({ queryKey: channelKeys.all });
  });
});

describe('useUpdateChannel', () => {
  beforeEach(() => vi.clearAllMocks());

  it('puts and invalidates', async () => {
    const { Wrapper, queryClient } = createWrapper();
    const spy = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useUpdateChannel(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync({ id: 1, name: 'Updated' });
    });

    expect(mockedApi.put).toHaveBeenCalledWith('/channels/1', { name: 'Updated' });
    expect(spy).toHaveBeenCalledWith({ queryKey: channelKeys.all });
  });
});

describe('useDeleteChannel', () => {
  beforeEach(() => vi.clearAllMocks());

  it('deletes and invalidates', async () => {
    const { Wrapper, queryClient } = createWrapper();
    const spy = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useDeleteChannel(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync(5);
    });

    expect(mockedApi.delete).toHaveBeenCalledWith('/channels/5');
    expect(spy).toHaveBeenCalledWith({ queryKey: channelKeys.all });
  });
});

describe('useFetchChannel', () => {
  beforeEach(() => vi.clearAllMocks());

  it('reconciles channel availability after a rejected refresh', async () => {
    const { Wrapper, queryClient } = createWrapper();
    const spy = vi.spyOn(queryClient, 'invalidateQueries');
    const error = new Error('Telegram channel is unavailable');
    mockedApi.post.mockRejectedValueOnce(error);
    const { result } = renderHook(() => useFetchChannel(), { wrapper: Wrapper });

    await act(async () => {
      await expect(result.current.mutateAsync({ id: 1 })).rejects.toBe(error);
    });

    expect(spy).toHaveBeenCalledWith({ queryKey: channelKeys.all });
    expect(notifyError).toHaveBeenCalledWith('channels.refresh_failed: Telegram channel is unavailable');
  });

  it('posts to /channels/:id/fetch and updates cache', async () => {
    const { Wrapper, queryClient } = createWrapper();
    // Seed channels cache
    queryClient.setQueryData(channelKeys.all, [
      { id: 1, name: 'Ch1', unreadCount: 0, totalNewsCount: 5, lastFetchedAt: null, isUnavailable: 1 },
    ]);
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useFetchChannel(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync({ id: 1 });
    });

    expect(mockedApi.post).toHaveBeenCalledWith('/channels/1/fetch', { since: undefined, limit: undefined });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['news', 1] });

    // Should have updated the channel cache
    const channels = queryClient.getQueryData(channelKeys.all) as Array<{ id: number; unreadCount: number }>;
    expect(channels[0].unreadCount).toBe(5);
    expect(channels[0]).toMatchObject({ isUnavailable: 0 });
  });
});

describe('useReorderChannels', () => {
  beforeEach(() => vi.clearAllMocks());

  it('patches and invalidates', async () => {
    const { Wrapper, queryClient } = createWrapper();
    const spy = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useReorderChannels(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync([
        { id: 1, sortOrder: 0 },
        { id: 2, sortOrder: 1 },
      ]);
    });

    expect(mockedApi.patch).toHaveBeenCalledWith('/channels/reorder', {
      items: [
        { id: 1, sortOrder: 0 },
        { id: 2, sortOrder: 1 },
      ],
    });
    expect(spy).toHaveBeenCalledWith({ queryKey: channelKeys.all });
  });
});

describe('useMarkReadAndFetch', () => {
  beforeEach(() => vi.clearAllMocks());

  it('reconciles channels and news and notifies when fetch fails after marking read', async () => {
    const { Wrapper, queryClient } = createWrapper();
    const spy = vi.spyOn(queryClient, 'invalidateQueries');
    const error = new Error('Telegram channel is unavailable');
    mockedApi.post.mockRejectedValueOnce(error);
    const { result } = renderHook(() => useMarkReadAndFetch(), { wrapper: Wrapper });
    await act(async () => {
      await expect(result.current.mutateAsync(1)).rejects.toBe(error);
    });
    expect(spy).toHaveBeenCalledWith({ queryKey: channelKeys.all });
    expect(spy).toHaveBeenCalledWith({ queryKey: ['news', 1] });
    expect(notifyError).toHaveBeenCalledWith('channels.refresh_failed: Telegram channel is unavailable');
  });

  it('reconciles every channel and reports errors during concurrent bulk refresh', async () => {
    const { Wrapper, queryClient } = createWrapper();
    const spy = vi.spyOn(queryClient, 'invalidateQueries');
    mockedApi.post.mockRejectedValueOnce(new Error('Telegram channel is unavailable'));
    const { result } = renderHook(() => useFetchChannel(), { wrapper: Wrapper });
    await act(async () => {
      const results = await Promise.allSettled([1, 2].map((id) => result.current.mutateAsync({ id })));
      expect(results.map((item) => item.status)).toEqual(['rejected', 'fulfilled']);
    });
    expect(spy).toHaveBeenCalledWith({ queryKey: channelKeys.all });
    expect(spy).toHaveBeenCalledWith({ queryKey: ['news', 1] });
    expect(spy).toHaveBeenCalledWith({ queryKey: ['news', 2] });
    expect(notifyError).toHaveBeenCalledTimes(1);
  });

  it('posts to mark-read-and-fetch endpoint', async () => {
    const { Wrapper, queryClient } = createWrapper();
    queryClient.setQueryData(channelKeys.all, [
      { id: 1, name: 'Ch1', unreadCount: 3, totalNewsCount: 10, lastFetchedAt: null },
    ]);

    const { result } = renderHook(() => useMarkReadAndFetch(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync(1);
    });

    expect(mockedApi.post).toHaveBeenCalledWith('/channels/1/mark-read-and-fetch', {});
  });
});

describe('useChannelLookup', () => {
  beforeEach(() => vi.clearAllMocks());

  it('gets lookup by username', async () => {
    mockedApi.get.mockResolvedValueOnce({ name: 'Found', username: 'found', description: 'desc' });
    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useChannelLookup(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync('testuser');
    });

    expect(mockedApi.get).toHaveBeenCalledWith('/channels/lookup?username=testuser');
  });
});
