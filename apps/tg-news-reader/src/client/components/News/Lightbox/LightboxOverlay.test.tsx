import type { Channel, NewsItem } from '@shared/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { InfiniteData } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../../api/client';
import type { NewsResponse } from '../../../api/news';
import { useUIStore } from '../../../store/uiStore';
import { LightboxOverlay } from './LightboxOverlay';

vi.mock('../../../api/client', () => ({
  api: { patch: vi.fn().mockResolvedValue({}), post: vi.fn(), get: vi.fn() },
}));
vi.mock('../../../api/channels', () => ({
  useChannels: () => ({ data: [{ id: 1, name: 'Media', telegramId: 'media', channelType: 'media' }] }),
}));
vi.mock('../../../api/markReadBatcher', () => ({
  MARK_READ_BATCHING_ENABLED: false,
  markReadBatcher: { enqueue: vi.fn() },
}));
vi.mock('./LightboxMedia', () => ({ LightboxMedia: () => null }));
vi.mock('./LightboxToolbar', () => ({ LightboxToolbar: () => null }));

function item(id: number, overrides: Partial<NewsItem> = {}): NewsItem {
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
    ...overrides,
  };
}

function setup(items: NewsItem[]) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  qc.setQueryData<InfiniteData<NewsResponse>>(['news', 1, 'all'], {
    pages: [{ items, hasMore: false, nextCursor: null, filteredOut: 0 }],
    pageParams: [undefined],
  });
  qc.setQueryData(['channels'], [{ id: 1, unreadCount: items.filter((n) => n.isRead === 0).length }]);
  useUIStore.getState().openLightbox(items[0].id, 0, 1);
  render(
    <QueryClientProvider client={qc}>
      <LightboxOverlay fetchNextPage={vi.fn()} hasNextPage={false} />
    </QueryClientProvider>,
  );
  return () => qc.getQueryData<Channel[]>(['channels'])![0].unreadCount;
}

async function next() {
  await act(async () => {
    fireEvent.click(screen.getByTitle('lightbox.next'));
  });
}

describe('lightbox unread count', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useUIStore.setState({ lightbox: null, newsFilterMode: 'all', hashTagFilter: null });
  });

  afterEach(() => vi.restoreAllMocks());

  it('does not count album-image changes as additional read posts', async () => {
    const unread = setup([
      item(1, { localMediaPaths: ['media/a.jpg', 'media/b.jpg', 'media/c.jpg'] }),
      item(2),
      item(3),
      item(4),
    ]);
    await waitFor(() => expect(unread()).toBe(3));
    await next();
    expect(useUIStore.getState().lightbox?.albumIndex).toBe(1);
    expect(unread()).toBe(3);
    await next();
    expect(unread()).toBe(3);
    expect(api.patch).toHaveBeenCalledTimes(1);
  });

  it('counts each newly opened post once, including navigation and revisits', async () => {
    const unread = setup([item(1), item(2), item(3), item(4)]);
    await waitFor(() => expect(unread()).toBe(3));
    await next();
    expect(unread()).toBe(2);
    await act(async () => {
      fireEvent.click(screen.getByTitle('lightbox.prev'));
    });
    expect(unread()).toBe(2);
    expect(api.patch).toHaveBeenCalledTimes(2);
  });

  it('does not decrement the badge when reopening an already read post', async () => {
    const unread = setup([item(1, { isRead: 1 }), item(2), item(3)]);
    await act(async () => {});
    expect(unread()).toBe(2);
    expect(api.patch).not.toHaveBeenCalled();
  });

  it('does not mark an undownloaded post read', async () => {
    const unread = setup([item(1, { localMediaPath: undefined }), item(2)]);
    await act(async () => {});
    expect(unread()).toBe(2);
    expect(api.patch).not.toHaveBeenCalled();
  });

  it.each(['keyboard', 'wheel', 'swipe'] as const)(
    '%s navigation reads posts once, not album images or revisits',
    async (input) => {
      const push = vi.spyOn(history, 'pushState');
      const unread = setup([
        item(1, { localMediaPaths: ['media/a.jpg', 'media/b.jpg'], albumMsgIds: [1, 10, 11] }),
        item(2),
        item(3),
      ]);
      const navigate = async (direction: -1 | 1) => {
        await act(async () => {
          if (input === 'keyboard') fireEvent.keyDown(window, { key: direction === 1 ? 'ArrowDown' : 'ArrowUp' });
          else if (input === 'wheel') fireEvent.wheel(window, { deltaY: direction * 81 });
          else {
            fireEvent.touchStart(window, { touches: [{ clientX: 100, clientY: 100 }] });
            fireEvent.touchEnd(window, { changedTouches: [{ clientX: 100, clientY: 100 - direction * 60 }] });
          }
        });
      };

      await waitFor(() => expect(unread()).toBe(2));
      expect(screen.getByText('1 / 3 · 1/2')).toBeInTheDocument();
      await navigate(1);
      expect(useUIStore.getState().lightbox).toMatchObject({ newsId: 1, albumIndex: 1 });
      expect(screen.getByText('1 / 3 · 2/2')).toBeInTheDocument();
      expect(unread()).toBe(2);
      expect(api.patch).toHaveBeenCalledTimes(1);
      await navigate(1);
      expect(useUIStore.getState().lightbox).toMatchObject({ newsId: 2, albumIndex: 0 });
      expect(unread()).toBe(1);
      await navigate(-1);
      expect(useUIStore.getState().lightbox).toMatchObject({ newsId: 1, albumIndex: 1 });
      expect(unread()).toBe(1);
      expect(api.patch).toHaveBeenCalledTimes(2);
      expect(push).toHaveBeenCalledTimes(1);
    },
  );

  it('closes on Escape, restores scrolling, and removes input listeners', async () => {
    document.body.style.overflow = 'auto';
    const replace = vi.spyOn(history, 'replaceState');
    setup([item(1, { isRead: 1 }), item(2, { isRead: 1 })]);
    expect(document.body.style.overflow).toBe('hidden');
    expect(screen.getByRole('dialog')).toHaveFocus();
    await act(async () => {
      fireEvent.keyDown(window, { key: 'ArrowDown' });
    });
    expect(screen.getByRole('dialog')).toHaveFocus();
    await act(async () => {
      fireEvent.keyDown(window, { key: 'Escape' });
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(document.body.style.overflow).toBe('auto');
    expect(replace).toHaveBeenCalledWith(null, '', window.location.href);
    const key = new KeyboardEvent('keydown', { key: 'ArrowDown', cancelable: true });
    const wheel = new WheelEvent('wheel', { deltaY: 100, cancelable: true });
    fireEvent(window, key);
    fireEvent(window, wheel);
    expect(key.defaultPrevented).toBe(false);
    expect(wheel.defaultPrevented).toBe(false);
    expect(useUIStore.getState().lightbox).toBeNull();
    document.body.style.overflow = '';
  });

  it('closes on browser Back without replacing the destination history entry', async () => {
    const replace = vi.spyOn(history, 'replaceState');
    setup([item(1, { isRead: 1 })]);
    await act(async () => {
      fireEvent.popState(window);
    });
    expect(useUIStore.getState().lightbox).toBeNull();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(document.body.style.overflow).not.toBe('hidden');
    expect(replace).not.toHaveBeenCalled();
  });
});
