import type { NewsItem } from '@shared/types.ts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { InfiniteData } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NewsResponse } from '../../../api/news';
import { useUIStore } from '../../../store/uiStore';
import { useLightboxNav } from './useLightboxNav';

function makeItem(id: number, overrides: Partial<NewsItem> = {}): NewsItem {
  return {
    id,
    channelId: 1,
    telegramMsgId: id * 10,
    text: `item-${id}`,
    links: [],
    hashtags: [],
    isRead: 0,
    postedAt: 1700000000 + id,
    mediaType: 'photo',
    localMediaPath: `ch/${id}.jpg`,
    ...overrides,
  };
}

function makePaginatedData(items: NewsItem[]): InfiniteData<NewsResponse> {
  return {
    pages: [{ items, filteredOut: 0, nextCursor: null, hasMore: false }],
    pageParams: [undefined],
  };
}

function setup(items: NewsItem[], newsId: number, albumIndex = 0) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  qc.setQueryData(['news', 1, 'all'], makePaginatedData(items));
  const onNavigate = vi.fn();
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children);
  const { result } = renderHook(() => useLightboxNav(1, newsId, albumIndex, onNavigate), { wrapper });
  return { result, onNavigate };
}

describe('useLightboxNav', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useUIStore.setState({ newsFilterMode: 'all', hashTagFilter: null });
  });

  it('filters photo/video/document items, excluding webpage/audio', () => {
    const items = [
      makeItem(1, { mediaType: 'photo' }),
      makeItem(2, { mediaType: 'webpage' }),
      makeItem(3, { mediaType: 'document' }),
      makeItem(4, { mediaType: 'video', localMediaPath: 'ch/4.mp4' }),
      makeItem(5, { mediaType: 'audio' }),
    ];
    const { result } = setup(items, 1);
    expect(result.current.entries.map((e) => e.newsId)).toEqual([1, 3, 4]);
  });

  it('includes video items in the lightbox (regression: mediaType "video" was filtered out)', () => {
    const items = [makeItem(1, { mediaType: 'video', localMediaPath: 'ch/1.mp4' })];
    const { result } = setup(items, 1);
    expect(result.current.entries).toHaveLength(1);
    expect(result.current.isVideo).toBe(true);
    expect(result.current.firstMediaPath).toBe('ch/1.mp4');
  });

  it('skips undownloaded videos and non-image files, but keeps missing photos and image documents', () => {
    const { result, onNavigate } = setup(
      [
        makeItem(1),
        makeItem(2, { mediaType: 'video', localMediaPath: undefined }),
        makeItem(3, { mediaType: 'document', localMediaPath: 'ch/file.pdf' }),
        makeItem(4, { localMediaPath: undefined }),
        makeItem(5, { mediaType: 'document', localMediaPath: 'ch/image.png' }),
      ],
      1,
    );
    expect(result.current.entries.map((entry) => entry.newsId)).toEqual([1, 4, 5]);
    result.current.go(1);
    expect(onNavigate).toHaveBeenCalledWith(4, 0);
  });

  it('uses the selected hidden feed, not a stale all-items cache, and reacts to download completion', () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    qc.setQueryData(['news', 1, 'all'], makePaginatedData([makeItem(1)]));
    qc.setQueryData(['news', 1, 'hidden'], makePaginatedData([makeItem(2, { localMediaPath: undefined })]));
    useUIStore.setState({ newsFilterMode: 'hidden' });
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(QueryClientProvider, { client: qc }, children);
    const { result } = renderHook(() => useLightboxNav(1, 2, 0, vi.fn()), { wrapper });
    expect(result.current.entries.map((entry) => entry.newsId)).toEqual([2]);
    act(() => qc.setQueryData(['news', 1, 'hidden'], makePaginatedData([makeItem(2)])));
    expect(result.current.firstMediaPath).toBe('ch/2.jpg');
  });

  it('go(1) moves to the next item', () => {
    const items = [makeItem(1), makeItem(2), makeItem(3)];
    const { result, onNavigate } = setup(items, 1);
    result.current.go(1);
    expect(onNavigate).toHaveBeenCalledWith(2, 0);
  });

  it('continues pagination through video-only and nonmatching hashtag pages', () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    useUIStore.setState({ hashTagFilter: '#photo' });
    const firstPage = {
      items: [makeItem(1, { mediaType: 'video', localMediaPath: undefined, hashtags: ['#photo'] })],
      hasMore: true,
      filteredOut: 0,
      nextCursor: 'first',
    };
    qc.setQueryData(['news', 1, 'all'], { pages: [firstPage], pageParams: [undefined] });
    const fetchNextPage = vi.fn();
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(QueryClientProvider, { client: qc }, children);
    const { result, rerender } = renderHook(() => useLightboxNav(1, 1, 0, vi.fn(), fetchNextPage, true), { wrapper });
    expect(result.current.entries).toEqual([]);
    expect(fetchNextPage).toHaveBeenCalledTimes(1);
    rerender();
    expect(fetchNextPage).toHaveBeenCalledTimes(1);
    act(() =>
      qc.setQueryData(['news', 1, 'all'], {
        pages: [firstPage, { ...firstPage, items: [makeItem(2, { hashtags: ['#other'] })], nextCursor: 'second' }],
        pageParams: [undefined, 'first'],
      }),
    );
    expect(fetchNextPage).toHaveBeenCalledTimes(2);
    expect(result.current.entries).toEqual([]);
  });

  it('go(-1) moves to the previous item', () => {
    const items = [makeItem(1), makeItem(2), makeItem(3)];
    const { result, onNavigate } = setup(items, 2);
    result.current.go(-1);
    expect(onNavigate).toHaveBeenCalledWith(1, 0);
  });

  it('go(1) wraps around at the end (circular)', () => {
    const items = [makeItem(1), makeItem(2)];
    const { result, onNavigate } = setup(items, 2);
    result.current.go(1);
    expect(onNavigate).toHaveBeenCalledWith(1, 0);
  });

  it('go(-1) wraps around at the start (circular)', () => {
    const items = [makeItem(1), makeItem(2)];
    const { result, onNavigate } = setup(items, 1);
    result.current.go(-1);
    expect(onNavigate).toHaveBeenCalledWith(2, 0);
  });

  describe('album navigation', () => {
    const albumItem = makeItem(2, {
      localMediaPaths: ['ch/2a.jpg', 'ch/2b.jpg', 'ch/2c.jpg'],
      albumMsgIds: [20, 21, 22],
    });

    it('go(1) advances within album first', () => {
      const items = [makeItem(1), albumItem, makeItem(3)];
      const { result, onNavigate } = setup(items, 2, 0);
      result.current.go(1);
      // Should advance to album image 1, not next item
      expect(onNavigate).toHaveBeenCalledWith(2, 1);
    });

    it('go(1) moves to next item when at last album image', () => {
      const items = [makeItem(1), albumItem, makeItem(3)];
      const { result, onNavigate } = setup(items, 2, 2);
      result.current.go(1);
      expect(onNavigate).toHaveBeenCalledWith(3, 0);
    });

    it('go(-1) goes backward within album', () => {
      const items = [makeItem(1), albumItem, makeItem(3)];
      const { result, onNavigate } = setup(items, 2, 2);
      result.current.go(-1);
      expect(onNavigate).toHaveBeenCalledWith(2, 1);
    });

    it('go(-1) from album image 1 goes to image 0', () => {
      const items = [makeItem(1), albumItem, makeItem(3)];
      const { result, onNavigate } = setup(items, 2, 1);
      result.current.go(-1);
      expect(onNavigate).toHaveBeenCalledWith(2, 0);
    });

    it('go(-1) from album image 0 moves to previous item', () => {
      const items = [makeItem(1), albumItem, makeItem(3)];
      const { result, onNavigate } = setup(items, 2, 0);
      result.current.go(-1);
      expect(onNavigate).toHaveBeenCalledWith(1, 0);
    });

    it('go(-1) into album lands on LAST image', () => {
      const items = [makeItem(1), albumItem, makeItem(3)];
      const { result, onNavigate } = setup(items, 3);
      result.current.go(-1);
      // Going backward into album → land on last image (index 2)
      expect(onNavigate).toHaveBeenCalledWith(2, 2);
    });

    it('go(1) into album lands on FIRST image', () => {
      const items = [makeItem(1), albumItem, makeItem(3)];
      const { result, onNavigate } = setup(items, 1);
      result.current.go(1);
      // Going forward into album → land on first image (index 0)
      expect(onNavigate).toHaveBeenCalledWith(2, 0);
    });
  });

  describe('goToAlbumImage', () => {
    const albumItem = makeItem(1, {
      localMediaPaths: ['a.jpg', 'b.jpg', 'c.jpg'],
    });

    it('advances album image', () => {
      const { result, onNavigate } = setup([albumItem], 1, 0);
      result.current.goToAlbumImage(1);
      expect(onNavigate).toHaveBeenCalledWith(1, 1);
    });

    it('clamps at max index', () => {
      const { result, onNavigate } = setup([albumItem], 1, 2);
      result.current.goToAlbumImage(1);
      expect(onNavigate).not.toHaveBeenCalled();
    });

    it('clamps at min index', () => {
      const { result, onNavigate } = setup([albumItem], 1, 0);
      result.current.goToAlbumImage(-1);
      expect(onNavigate).not.toHaveBeenCalled();
    });
  });

  it('positionLabel shows album info', () => {
    const albumItem = makeItem(1, {
      localMediaPaths: ['a.jpg', 'b.jpg'],
      albumMsgIds: [10, 11],
    });
    const { result } = setup([albumItem, makeItem(2)], 1, 1);
    expect(result.current.positionLabel).toBe('1 / 2 · 2/2');
  });
});
