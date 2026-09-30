import type { Channel, ChannelType, NewsItem } from '@shared/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { InfiniteData } from '@tanstack/react-query';
import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../../api/client';
import type { NewsResponse } from '../../../api/news';
import { useUIStore } from '../../../store/uiStore';
import { useNewsDetailHotkeys } from '../Detail/useNewsDetailHotkeys';
import { LightboxOverlay } from './LightboxOverlay';

const channel = vi.hoisted(() => ({
  id: 1,
  name: 'News',
  telegramId: 'news',
  channelType: 'news' as ChannelType,
}));
vi.mock('../../../api/client', () => ({
  api: { patch: vi.fn(), post: vi.fn(), get: vi.fn() },
}));
vi.mock('../../../api/channels', () => ({
  useChannels: () => ({ data: [channel] }),
}));
vi.mock('../../../api/markReadBatcher', () => ({
  MARK_READ_BATCHING_ENABLED: false,
  markReadBatcher: { enqueue: vi.fn() },
}));

function item(id: number, extra: Partial<NewsItem> = {}): NewsItem {
  return {
    id,
    channelId: 1,
    telegramMsgId: id,
    text: '',
    links: [],
    hashtags: [],
    isRead: 0,
    postedAt: id,
    mediaType: 'photo',
    localMediaPath: `media/${id}.jpg`,
    ...extra,
  };
}

function setup(items: NewsItem[]) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  qc.setQueryData<InfiniteData<NewsResponse>>(['news', 1, 'all'], {
    pages: [{ items, hasMore: false, nextCursor: null, filteredOut: 0 }],
    pageParams: [undefined],
  });
  qc.setQueryData(['channels'], [{ ...channel, unreadCount: items.filter((n) => !n.isRead).length }]);
  render(
    <QueryClientProvider client={qc}>
      <LightboxOverlay fetchNextPage={vi.fn()} hasNextPage={false} />
    </QueryClientProvider>,
  );
  act(() => useUIStore.getState().openLightbox(items[0].id, 0, 1));
  return {
    unread: () => qc.getQueryData<Channel[]>(['channels'])![0].unreadCount,
    news: () => qc.getQueryData<InfiniteData<NewsResponse>>(['news', 1, 'all'])!.pages[0].items,
  };
}

describe('lightbox close read tracking', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.patch).mockResolvedValue({});
    channel.channelType = 'news';
    useUIStore.setState({ lightbox: null, newsFilterMode: 'all', hashTagFilter: null });
  });
  afterEach(() => vi.restoreAllMocks());

  it.each(['news', 'news_link', 'media', 'blog'] as const)(
    'counts the viewed %s post when opened and closed without navigating',
    async (type) => {
      channel.channelType = type;
      const state = setup([item(1)]);
      const image = screen.getByRole('dialog').querySelector('img')!;
      expect(image.getAttribute('src')).toContain('media/1.jpg');
      fireEvent.load(image);
      await act(async () => {
        fireEvent.click(screen.getByTitle('lightbox.close'));
      });
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(state.unread()).toBe(0);
      expect(state.news()[0].isRead).toBe(1);
      expect(api.patch).toHaveBeenCalledExactlyOnceWith('/news/1/read', { isRead: 1 });
    },
  );

  it.each(['toolbar', 'Escape', 'backdrop', 'Back'] as const)(
    '%s explicitly finishes the current album without automatically reading it on open',
    async (close) => {
      const state = setup([item(1, { localMediaPaths: ['media/a.jpg', 'media/b.jpg'], albumMsgIds: [1, 2, 3] })]);
      await act(async () => {});
      expect(state.unread()).toBe(1);
      expect(state.news()[0].isRead).toBe(0);
      expect(api.patch).not.toHaveBeenCalled();
      await act(async () => {
        if (close === 'toolbar') fireEvent.click(screen.getByTitle('lightbox.close'));
        else if (close === 'Escape') fireEvent.keyDown(window, { key: 'Escape' });
        else if (close === 'backdrop') fireEvent.click(screen.getByRole('dialog'));
        else fireEvent.popState(window);
      });
      expect(useUIStore.getState().lightbox).toBeNull();
      expect(state.unread()).toBe(0);
      expect(state.news()[0].isRead).toBe(1);
      expect(api.patch).toHaveBeenCalledExactlyOnceWith('/news/1/read', { isRead: 1 });
    },
  );

  it('Back reads the latest post after album navigation without pushing extra history entries', async () => {
    const push = vi.spyOn(history, 'pushState');
    const replace = vi.spyOn(history, 'replaceState');
    const state = setup([item(1), item(2, { localMediaPaths: ['media/a.jpg', 'media/b.jpg'], albumMsgIds: [2, 3] })]);
    await act(async () => {
      fireEvent.click(screen.getByTitle('lightbox.next'));
    });
    await act(async () => {
      fireEvent.click(screen.getByTitle('lightbox.next'));
    });
    expect(useUIStore.getState().lightbox).toMatchObject({ newsId: 2, albumIndex: 1 });
    expect(push).toHaveBeenCalledTimes(1);
    expect(api.patch).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.popState(window);
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(state.unread()).toBe(1);
    expect(state.news().map((n) => n.isRead)).toEqual([0, 1]);
    expect(api.patch).toHaveBeenCalledExactlyOnceWith('/news/2/read', { isRead: 1 });
    expect(replace).not.toHaveBeenCalled();
  });

  it('does not decrement again after closing and reopening the same post', async () => {
    const state = setup([item(1)]);
    await act(async () => {
      fireEvent.click(screen.getByTitle('lightbox.close'));
    });
    act(() => useUIStore.getState().openLightbox(1, 0, 1));
    await act(async () => {
      fireEvent.keyDown(window, { key: 'Escape' });
    });
    expect(state.unread()).toBe(0);
    expect(api.patch).toHaveBeenCalledExactlyOnceWith('/news/1/read', { isRead: 1 });
  });

  it('does not mark unavailable media read on close', async () => {
    const state = setup([item(1, { mediaType: 'video', localMediaPath: undefined })]);
    expect(screen.getByRole('status')).toHaveTextContent('lightbox.no_media');
    await act(async () => {
      fireEvent.click(screen.getByTitle('lightbox.close'));
    });
    expect(state.unread()).toBe(1);
    expect(state.news()[0].isRead).toBe(0);
    expect(api.patch).not.toHaveBeenCalled();
  });

  it('keeps Space in the viewer instead of advancing the album in the background detail', async () => {
    const post = item(1, { localMediaPaths: ['media/a.jpg', 'media/b.jpg'], albumMsgIds: [1, 2] });
    const detail = renderHook(() =>
      useNewsDetailHotkeys({
        item: post,
        openUrl: 'https://example.com',
        articleQueued: false,
        isAlbum: true,
        albumLength: 2,
        albumExpectedLength: 2,
        mediaPending: false,
        onRefresh: vi.fn(),
        onExtractArticle: vi.fn(),
        onShare: vi.fn(),
      }),
    );
    setup([post]);
    await act(async () => {
      fireEvent.keyDown(screen.getByRole('dialog'), { key: ' ', code: 'Space' });
    });
    expect(useUIStore.getState().lightbox).toMatchObject({ newsId: 1, albumIndex: 1 });
    expect(detail.result.current.albumIndex).toBe(0);
    await act(async () => {
      fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape', code: 'Escape' });
    });
    act(() => {
      fireEvent.keyDown(document.body, { key: ' ', code: 'Space' });
    });
    expect(detail.result.current.albumIndex).toBe(1);
  });
});
