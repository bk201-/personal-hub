import type { DownloadTask, NewsItem } from '@shared/types';
import type { InfiniteData } from '@tanstack/react-query';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./client', () => ({
  api: {
    get: vi.fn().mockResolvedValue([]),
    post: vi.fn().mockResolvedValue({ success: true }),
    patch: vi.fn().mockResolvedValue({ success: true }),
    delete: vi.fn().mockResolvedValue({ success: true }),
  },
}));

vi.mock('../store/authStore', () => ({
  useAuthStore: (selector: (s: { accessToken: string | null }) => unknown) => selector({ accessToken: 'test-token' }),
}));

vi.mock('../services/reconnectingEventSource', () => ({
  createReconnectingEventSource: vi.fn(() => ({ close: vi.fn() })),
}));

import { createReconnectingEventSource } from '../services/reconnectingEventSource';
import { api } from './client';
import {
  downloadsKeys,
  useDownloads,
  useCreateDownload,
  usePrioritizeDownload,
  useCancelDownload,
  useNewsDownloadTask,
  useDownloadsSSE,
} from './downloads';
import type { NewsResponse } from './news';

const mockedApi = vi.mocked(api);

const imageTask: DownloadTask = {
  id: 3,
  newsId: 10,
  channelId: 7,
  type: 'image',
  priority: 10,
  status: 'done',
  createdAt: 0,
  localMediaPath: 'channel/photo.jpg',
  localMediaPaths: ['channel/photo.jpg', 'channel/photo2.jpg'],
};

function seedNews(queryClient: QueryClient, overrides: Partial<NewsItem> = {}) {
  const item: NewsItem = {
    id: 10,
    channelId: 7,
    telegramMsgId: 100,
    text: 'Photo',
    links: [],
    hashtags: [],
    isRead: 1,
    postedAt: 0,
    ...overrides,
  };
  const data: InfiniteData<NewsResponse> = {
    pages: [
      { items: [{ ...item, id: 11 }], filteredOut: 2, nextCursor: 10, hasMore: true },
      { items: [item], filteredOut: 0, nextCursor: null, hasMore: false },
    ],
    pageParams: [undefined, 10],
  };
  queryClient.setQueryData(['news', 7, 'all'], data);
  queryClient.setQueryData(['news', 7, 'unread'], data);
  queryClient.setQueryData(['news', 8, 'all'], data);
  return data;
}

describe('image download completion', () => {
  beforeEach(() => vi.clearAllMocks());

  it.each(['init', 'reconnect', 'GET'])('reconciles ready images from %s into news caches', async (source) => {
    const { Wrapper, queryClient } = createWrapper();
    const before = seedNews(queryClient);
    const tasks: DownloadTask[] = [
      imageTask,
      { ...imageTask, id: 4, newsId: 11, status: 'processing' },
      { ...imageTask, id: 5, newsId: 12, localMediaPath: null, localMediaPaths: null },
    ];
    if (source === 'GET') mockedApi.get.mockResolvedValueOnce(tasks);
    const useSnapshot = source === 'GET' ? useDownloads : useDownloadsSSE;
    const { unmount } = renderHook(() => useSnapshot(), { wrapper: Wrapper });
    if (source !== 'GET') {
      const onConnect = vi.mocked(createReconnectingEventSource).mock.calls[0][0].onConnect;
      if (source === 'reconnect') onConnect(new EventTarget() as EventSource);
      const es = new EventTarget() as EventSource;
      onConnect(es);
      act(() => es.dispatchEvent(new MessageEvent('init', { data: JSON.stringify(tasks) })));
    }
    await waitFor(() => {
      for (const mode of ['all', 'unread']) {
        const cached = queryClient.getQueryData<InfiniteData<NewsResponse>>(['news', 7, mode])!;
        expect(cached.pages[1].items[0]).toEqual({
          ...before.pages[1].items[0],
          localMediaPath: 'channel/photo.jpg',
          localMediaPaths: ['channel/photo.jpg', 'channel/photo2.jpg'],
        });
        expect(cached.pages[0]).toEqual(before.pages[0]);
        expect(cached.pageParams).toEqual(before.pageParams);
      }
    });
    expect(queryClient.getQueryData(['news', 8, 'all'])).toEqual(before);
    expect(queryClient.getQueryData(downloadsKeys.all)).toEqual(tasks);
    expect(mockedApi.get.mock.calls).toEqual(source === 'GET' ? [['/downloads']] : []);
    unmount();
  });

  it.each([
    { localMediaPath: imageTask.localMediaPath, localMediaPaths: imageTask.localMediaPaths },
    { localMediaPath: null, localMediaPaths: null },
  ])('patches image paths without refetching and retains terminal tasks until removal: %j', async (paths) => {
    const { Wrapper, queryClient } = createWrapper();
    const before = seedNews(queryClient);
    const done = { ...imageTask, ...paths };
    queryClient.setQueryData(downloadsKeys.all, [{ ...imageTask, status: 'processing' }]);
    const { unmount } = renderHook(() => useDownloadsSSE(), { wrapper: Wrapper });
    const es = new EventTarget() as EventSource;
    vi.mocked(createReconnectingEventSource).mock.calls[0][0].onConnect(es);
    await act(async () => {
      es.dispatchEvent(new MessageEvent('task_update', { data: JSON.stringify(done) }));
    });

    expect(mockedApi.get).not.toHaveBeenCalled();
    for (const mode of ['all', 'unread']) {
      const cached = queryClient.getQueryData<InfiniteData<NewsResponse>>(['news', 7, mode])!;
      expect(cached.pages[1].items[0]).toEqual({
        ...before.pages[1].items[0],
        localMediaPath: paths.localMediaPath ?? undefined,
        localMediaPaths: paths.localMediaPaths ?? undefined,
      });
      expect(cached.pages[0]).toEqual(before.pages[0]);
      expect(cached.pageParams).toEqual(before.pageParams);
    }
    expect(queryClient.getQueryData(['news', 8, 'all'])).toEqual(before);
    expect(queryClient.getQueryData(downloadsKeys.all)).toEqual([done]);
    act(() => es.dispatchEvent(new MessageEvent('task_removed', { data: JSON.stringify({ taskId: done.id }) })));
    expect(queryClient.getQueryData(downloadsKeys.all)).toEqual([]);
    unmount();
  });

  it.each(['done', 'failed'] as const)('retains pathless image %s until removal', async (status) => {
    const { Wrapper, queryClient } = createWrapper();
    const sibling: DownloadTask = { ...imageTask, id: 4, type: 'media', status: 'processing' };
    queryClient.setQueryData(downloadsKeys.all, [sibling]);
    const { result, unmount } = renderHook(
      () => {
        useDownloadsSSE();
        return useNewsDownloadTask(10, 'image');
      },
      { wrapper: Wrapper },
    );
    const es = new EventTarget() as EventSource;
    vi.mocked(createReconnectingEventSource).mock.calls[0][0].onConnect(es);
    const terminal: DownloadTask = {
      ...imageTask,
      channelId: undefined,
      localMediaPath: undefined,
      localMediaPaths: undefined,
      status,
    };
    act(() => es.dispatchEvent(new MessageEvent('task_update', { data: JSON.stringify(terminal) })));
    await waitFor(() => expect(result.current).toEqual(terminal));
    act(() => es.dispatchEvent(new MessageEvent('task_removed', { data: JSON.stringify({ taskId: terminal.id }) })));
    await waitFor(() => expect(result.current).toBeNull());
    expect(queryClient.getQueryData(downloadsKeys.all)).toEqual([sibling]);
    expect(mockedApi.get).not.toHaveBeenCalled();
    unmount();
  });

  it('preserves existing media paths when an image completion omits result fields', () => {
    const { Wrapper, queryClient } = createWrapper();
    const before = seedNews(queryClient, {
      localMediaPath: 'channel/existing.jpg',
      localMediaPaths: ['channel/existing.jpg'],
    });
    const { unmount } = renderHook(() => useDownloadsSSE(), { wrapper: Wrapper });
    const es = new EventTarget() as EventSource;
    vi.mocked(createReconnectingEventSource).mock.calls[0][0].onConnect(es);
    act(() =>
      es.dispatchEvent(
        new MessageEvent('task_update', {
          data: JSON.stringify({ ...imageTask, localMediaPath: null, localMediaPaths: null }),
        }),
      ),
    );
    expect(queryClient.getQueryData(['news', 7, 'all'])).toEqual(before);
    unmount();
  });

  it.each(['media', 'article'] as const)('preserves %s completion and keeps sibling image tasks', async (type) => {
    const { Wrapper, queryClient } = createWrapper();
    const before = seedNews(queryClient);
    const done: DownloadTask = { ...imageTask, id: 4, type };
    queryClient.setQueryData(downloadsKeys.all, [imageTask, { ...done, status: 'processing' }]);
    if (type === 'article') {
      mockedApi.get.mockResolvedValueOnce({ ...before.pages[1].items[0], fullContent: 'Article body', isRead: 0 });
    }
    const { unmount } = renderHook(() => useDownloadsSSE(), { wrapper: Wrapper });
    const es = new EventTarget() as EventSource;
    vi.mocked(createReconnectingEventSource).mock.calls[0][0].onConnect(es);
    await act(async () => {
      es.dispatchEvent(new MessageEvent('task_update', { data: JSON.stringify(done) }));
    });
    const cached = queryClient.getQueryData<InfiniteData<NewsResponse>>(['news', 7, 'all'])!;
    expect(cached.pages[1].items[0]).toEqual({
      ...before.pages[1].items[0],
      ...(type === 'article'
        ? { fullContent: 'Article body' }
        : { localMediaPath: 'channel/photo.jpg', localMediaPaths: ['channel/photo.jpg', 'channel/photo2.jpg'] }),
    });
    expect(mockedApi.get.mock.calls).toEqual(type === 'article' ? [['/news/10']] : []);
    expect(queryClient.getQueryData(downloadsKeys.all)).toEqual([imageTask]);
    unmount();
  });
});

describe('useDownloadsSSE removal', () => {
  it('removes only the cancelled task, keeping its sibling article task', () => {
    vi.clearAllMocks();
    const { Wrapper, queryClient } = createWrapper();
    const tasks: DownloadTask[] = [
      { id: 1, newsId: 10, type: 'media', priority: 0, status: 'pending', createdAt: 0 },
      { id: 2, newsId: 10, type: 'article', priority: 0, status: 'pending', createdAt: 0 },
    ];
    queryClient.setQueryData(downloadsKeys.all, tasks);
    const { unmount } = renderHook(() => useDownloadsSSE(), { wrapper: Wrapper });
    const es = new EventTarget() as EventSource;
    vi.mocked(createReconnectingEventSource).mock.calls[0][0].onConnect(es);
    act(() => es.dispatchEvent(new MessageEvent('task_removed', { data: JSON.stringify({ taskId: 1 }) })));
    expect(queryClient.getQueryData(downloadsKeys.all)).toEqual([tasks[1]]);
    unmount();
  });

  it('refetches authoritative queue ordering when another client prioritizes a task', () => {
    vi.clearAllMocks();
    const { Wrapper, queryClient } = createWrapper();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    const { unmount } = renderHook(() => useDownloadsSSE(), { wrapper: Wrapper });
    const es = new EventTarget() as EventSource;
    vi.mocked(createReconnectingEventSource).mock.calls[0][0].onConnect(es);
    act(() => es.dispatchEvent(new MessageEvent('queue_changed', { data: '{}' })));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: downloadsKeys.all });
    unmount();
  });

  it('removes all tasks for deleted news without fetching deleted articles', () => {
    vi.clearAllMocks();
    const { Wrapper, queryClient } = createWrapper();
    const tasks: DownloadTask[] = [
      { id: 1, newsId: 10, type: 'media', priority: 0, status: 'processing', createdAt: 0 },
      { id: 2, newsId: 10, type: 'article', priority: 0, status: 'pending', createdAt: 0 },
      { id: 3, newsId: 20, type: 'media', priority: 0, status: 'pending', createdAt: 0 },
    ];
    queryClient.setQueryData(downloadsKeys.all, tasks);
    const { unmount } = renderHook(() => useDownloadsSSE(), { wrapper: Wrapper });
    const es = new EventTarget() as EventSource;
    vi.mocked(createReconnectingEventSource).mock.calls[0][0].onConnect(es);

    act(() => es.dispatchEvent(new MessageEvent('tasks_removed', { data: JSON.stringify({ newsIds: [10] }) })));

    expect(queryClient.getQueryData(downloadsKeys.all)).toEqual([tasks[2]]);
    expect(mockedApi.get).not.toHaveBeenCalled();
    unmount();
  });
});

function createWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  const Wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children);
  return { Wrapper, queryClient: qc };
}

describe('downloadsKeys', () => {
  it('all returns correct key', () => {
    expect(downloadsKeys.all).toEqual(['downloads']);
  });
});

describe('useDownloads', () => {
  beforeEach(() => vi.clearAllMocks());

  it('fetches from /downloads', async () => {
    const { Wrapper } = createWrapper();
    renderHook(() => useDownloads(), { wrapper: Wrapper });
    await waitFor(() => expect(mockedApi.get).toHaveBeenCalledWith('/downloads'));
  });
});

describe('useCreateDownload', () => {
  beforeEach(() => vi.clearAllMocks());

  it('posts image requests through the existing mutation without a URL', async () => {
    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useCreateDownload(), { wrapper: Wrapper });
    await act(async () => {
      await result.current.mutateAsync({ newsId: 10, type: 'image', priority: 10 });
    });
    expect(mockedApi.post).toHaveBeenCalledWith('/downloads', { newsId: 10, type: 'image', priority: 10 });
  });

  it('posts and invalidates downloads', async () => {
    const { Wrapper, queryClient } = createWrapper();
    const spy = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useCreateDownload(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync({ newsId: 1, type: 'media' });
    });

    expect(mockedApi.post).toHaveBeenCalledWith('/downloads', { newsId: 1, type: 'media' });
    expect(spy).toHaveBeenCalledWith({ queryKey: downloadsKeys.all });
  });
});

describe('usePrioritizeDownload', () => {
  beforeEach(() => vi.clearAllMocks());

  it('refreshes stale queue state after a failed priority request and preserves the error', async () => {
    const { Wrapper, queryClient } = createWrapper();
    const spy = vi.spyOn(queryClient, 'invalidateQueries');
    mockedApi.patch.mockRejectedValueOnce(new Error('Task not found'));
    const { result } = renderHook(() => usePrioritizeDownload(), { wrapper: Wrapper });
    await act(async () => {
      await expect(result.current.mutateAsync(5)).rejects.toThrow('Task not found');
    });
    expect(spy).toHaveBeenCalledWith({ queryKey: downloadsKeys.all });
    await waitFor(() => expect(result.current.error?.message).toBe('Task not found'));
  });

  it('patches and invalidates', async () => {
    const { Wrapper, queryClient } = createWrapper();
    const spy = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => usePrioritizeDownload(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync(5);
    });

    expect(mockedApi.patch).toHaveBeenCalledWith('/downloads/5/prioritize', {});
    expect(spy).toHaveBeenCalledWith({ queryKey: downloadsKeys.all });
  });
});

describe('useCancelDownload', () => {
  beforeEach(() => vi.clearAllMocks());

  it('refreshes stale queue state when cancellation races with worker dispatch', async () => {
    const { Wrapper, queryClient } = createWrapper();
    const spy = vi.spyOn(queryClient, 'invalidateQueries');
    mockedApi.delete.mockRejectedValueOnce(new Error('Only pending or failed tasks can be cancelled'));
    const { result } = renderHook(() => useCancelDownload(), { wrapper: Wrapper });
    await act(async () => {
      await expect(result.current.mutateAsync(5)).rejects.toThrow('Only pending or failed tasks can be cancelled');
    });
    expect(spy).toHaveBeenCalledWith({ queryKey: downloadsKeys.all });
  });

  it('deletes and invalidates', async () => {
    const { Wrapper, queryClient } = createWrapper();
    const spy = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useCancelDownload(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync(5);
    });

    expect(mockedApi.delete).toHaveBeenCalledWith('/downloads/5');
    expect(spy).toHaveBeenCalledWith({ queryKey: downloadsKeys.all });
  });
});

describe('useNewsDownloadTask', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns matching task', async () => {
    const tasks: DownloadTask[] = [
      { id: 1, newsId: 10, type: 'media', priority: 0, status: 'processing', createdAt: 0 },
      { id: 2, newsId: 20, type: 'article', priority: 0, status: 'pending', createdAt: 0 },
    ];
    mockedApi.get.mockResolvedValueOnce(tasks);

    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useNewsDownloadTask(10, 'media'), { wrapper: Wrapper });

    await waitFor(() => expect(result.current).not.toBeNull());
    expect(result.current?.id).toBe(1);
  });

  it('returns null when no match', async () => {
    mockedApi.get.mockResolvedValueOnce([]);

    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useNewsDownloadTask(99, 'media'), { wrapper: Wrapper });

    // Give it time to settle
    await waitFor(() => expect(mockedApi.get).toHaveBeenCalled());
    expect(result.current).toBeNull();
  });
});
