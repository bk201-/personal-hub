import type { Channel, NewsItem } from '@shared/types';
import { act, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHookWithProviders } from '../../../__tests__/renderWithProviders';
import { useChannels, useFetchChannel, useMarkReadAndFetch, useUpdateChannel } from '../../../api/channels';
import { api } from '../../../api/client';
import { useUIStore } from '../../../store/uiStore';
import { useNewsFeedActions } from './useNewsFeedActions';

vi.mock('../../../api/client', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn() },
}));

const channel: Channel = {
  id: 1,
  telegramId: 'channel',
  name: 'Channel',
  channelType: 'news',
  groupId: null,
  sortOrder: 0,
  filterForwards: 0,
  isUnavailable: 0,
  unreadCount: 5,
  totalNewsCount: 5,
  createdAt: 1,
  supportsDigest: true,
};
const fetched = { inserted: 0, total: 0, totalNewsCount: 3, unreadCount: 3 };
const marked = { success: true, affectedIds: [11, 12] };
const newItems: NewsItem[] = [21, 22].map((id) => ({
  id,
  channelId: 1,
  telegramMsgId: id,
  text: '',
  links: [],
  hashtags: [],
  isRead: 0,
  postedAt: 1,
}));

async function setup() {
  const hook = renderHookWithProviders(
    ({ items }: { items: NewsItem[] }) => ({
      feed: useNewsFeedActions(channel, items, 5, 0, vi.fn()),
      sidebarFetch: useFetchChannel(),
      combinedFetch: useMarkReadAndFetch(),
      editChannel: useUpdateChannel(),
    }),
    { initialProps: { items: newItems } },
  );
  await waitFor(() => expect(hook.result.current.feed.fetchChannel.isSuccess).toBe(true));
  await act(async () => {
    hook.result.current.feed.handleMarkAllReadAndAdvance();
  });
  await waitFor(() => expect(hook.result.current.feed.markAllRead.isSuccess).toBe(true));
  vi.mocked(api.post).mockClear();
  return hook;
}

beforeEach(() => {
  vi.resetAllMocks();
  useUIStore.setState({ autoAdvance: false, newsFilterMode: 'hidden', hashTagFilter: null });
  vi.mocked(api.get).mockResolvedValue([]);
  vi.mocked(api.put).mockResolvedValue(channel);
  vi.mocked(api.post).mockImplementation(async (path) => (path === '/news/read-all' ? marked : fetched));
});

describe('bulk-read undo with shared refresh mutations', () => {
  it.each(['sidebar', 'combined'] as const)(
    'shows a notification and refreshes observed availability after a failed %s refresh',
    async (source) => {
      vi.mocked(api.get).mockResolvedValue([channel]);
      const { result } = renderHookWithProviders(() => ({
        channels: useChannels(),
        sidebar: useFetchChannel(),
        combined: useMarkReadAndFetch(),
      }));
      await waitFor(() => expect(result.current.channels.data?.[0].isUnavailable).toBe(0));

      const error = new Error('Telegram channel is unavailable');
      vi.mocked(api.post).mockRejectedValueOnce(error);
      vi.mocked(api.get).mockResolvedValue([{ ...channel, isUnavailable: 1 }]);
      await act(async () => {
        const refresh =
          source === 'sidebar'
            ? result.current.sidebar.mutateAsync({ id: channel.id })
            : result.current.combined.mutateAsync(channel.id);
        await expect(refresh).rejects.toBe(error);
      });
      await waitFor(() => expect(result.current.channels.data?.[0].isUnavailable).toBe(1));
      expect(await screen.findByText(/channels.refresh_failed.*Telegram channel is unavailable/)).toBeVisible();

      vi.mocked(api.get).mockResolvedValue([channel]);
      await act(async () => {
        if (source === 'sidebar') await result.current.sidebar.mutateAsync({ id: channel.id });
        else await result.current.combined.mutateAsync(channel.id);
      });
      await waitFor(() => expect(result.current.channels.data?.[0].isUnavailable).toBe(0));
    },
  );

  it.each(['sidebar', 'combined'] as const)(
    'resets undo after %s refresh, even without inserted posts',
    async (source) => {
      const { result } = await setup();
      await act(async () => {
        if (source === 'sidebar') await result.current.sidebarFetch.mutateAsync({ id: 1 });
        else await result.current.combinedFetch.mutateAsync(1);
      });
      await act(async () => result.current.feed.handleMarkAllReadAndAdvance());
      expect(api.post).toHaveBeenLastCalledWith('/news/read-all', { newsIds: [21, 22] });
    },
  );

  it('does not undo deleted IDs when refresh leaves the visible view empty', async () => {
    const { result, rerender } = await setup();
    await act(async () => result.current.sidebarFetch.mutateAsync({ id: 1 }));
    rerender({ items: [] });
    vi.mocked(api.post).mockClear();
    await act(async () => result.current.feed.handleMarkAllReadAndAdvance());
    expect(api.post).not.toHaveBeenCalled();
  });

  it('preserves immediate undo through unrelated channel refreshes and edits', async () => {
    const { result } = await setup();
    await act(async () => {
      await result.current.sidebarFetch.mutateAsync({ id: 2 });
      await result.current.editChannel.mutateAsync({ id: 1, name: 'Edited' });
    });
    await act(async () => result.current.feed.handleMarkAllReadAndAdvance());
    expect(api.post).toHaveBeenLastCalledWith('/news/read-all', { newsIds: [11, 12], isRead: 0 });
  });

  it('invalidates undo as soon as refresh starts, even if that refresh fails', async () => {
    const { result } = await setup();
    const failure = new Error('Fetch failed after read cleanup');
    vi.mocked(api.post).mockRejectedValueOnce(failure);
    await act(async () => {
      await expect(result.current.sidebarFetch.mutateAsync({ id: 1 })).rejects.toBe(failure);
    });
    await act(async () => result.current.feed.handleMarkAllReadAndAdvance());
    expect(api.post).toHaveBeenLastCalledWith('/news/read-all', { newsIds: [21, 22] });
  });

  it('ignores late mark-all success from before a sidebar refresh', async () => {
    const { result } = await setup();
    await act(async () => result.current.feed.handleMarkAllReadAndAdvance()); // undo
    let completeMark!: (value: typeof marked) => void;
    vi.mocked(api.post).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          completeMark = resolve;
        }),
    );
    await act(async () => result.current.feed.handleMarkAllReadAndAdvance());
    await act(async () => result.current.sidebarFetch.mutateAsync({ id: 1 }));
    await act(async () => completeMark(marked));
    await act(async () => result.current.feed.handleMarkAllReadAndAdvance());
    expect(api.post).toHaveBeenLastCalledWith('/news/read-all', { newsIds: [21, 22] });
  });

  it('ignores a late response after leaving and returning to the same view', async () => {
    const { result } = await setup();
    await act(async () => result.current.feed.handleMarkAllReadAndAdvance()); // undo
    let completeMark!: (value: typeof marked) => void;
    vi.mocked(api.post).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          completeMark = resolve;
        }),
    );
    await act(async () => result.current.feed.handleMarkAllReadAndAdvance());
    act(() => useUIStore.setState({ newsFilterMode: 'all' }));
    act(() => useUIStore.setState({ newsFilterMode: 'hidden' }));
    await act(async () => completeMark(marked));
    await act(async () => result.current.feed.handleMarkAllReadAndAdvance());
    expect(api.post).toHaveBeenLastCalledWith('/news/read-all', { newsIds: [21, 22] });
  });
});
