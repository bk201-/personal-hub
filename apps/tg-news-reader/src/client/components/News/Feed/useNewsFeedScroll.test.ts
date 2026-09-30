import type { NewsItem } from '@shared/types';
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useUIStore } from '../../../store/uiStore';
import { useNewsFeedScroll } from './useNewsFeedScroll';

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
    ...overrides,
  };
}

describe('useNewsFeedScroll', () => {
  const markReadFn = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    useUIStore.setState({ selectedNewsId: null, newsFilterMode: 'filtered' });
  });

  it('auto-advances to next unread when selected item is filtered out', () => {
    const allItems = [makeItem(1, { isRead: 0 }), makeItem(2, { isRead: 0 }), makeItem(3, { isRead: 0 })];
    // Only items 2 and 3 are in display (item 1 was filtered out)
    const displayItems = [makeItem(2, { isRead: 0 }), makeItem(3, { isRead: 0 })];

    const setSelectedNewsId = vi.fn();
    useUIStore.setState({ selectedNewsId: 1, newsFilterMode: 'filtered', setSelectedNewsId });

    renderHook(() => useNewsFeedScroll(displayItems, allItems, 'list', false, markReadFn));

    // Should mark the filtered-out item as read
    expect(markReadFn).toHaveBeenCalledWith({ id: 1, isRead: 1, channelId: 1 });
    // Should advance to next unread in display
    expect(setSelectedNewsId).toHaveBeenCalledWith(2);
  });

  it('does not auto-advance when newsFilterMode is "all"', () => {
    const allItems = [makeItem(1), makeItem(2)];
    const displayItems = [makeItem(2)]; // item 1 not in display

    const setSelectedNewsId = vi.fn();
    useUIStore.setState({ selectedNewsId: 1, newsFilterMode: 'all', setSelectedNewsId });

    renderHook(() => useNewsFeedScroll(displayItems, allItems, 'list', false, markReadFn));

    expect(markReadFn).not.toHaveBeenCalled();
    expect(setSelectedNewsId).not.toHaveBeenCalled();
  });

  it('does not auto-advance when selected item is in displayItems', () => {
    const allItems = [makeItem(1), makeItem(2)];
    const displayItems = [makeItem(1), makeItem(2)];

    const setSelectedNewsId = vi.fn();
    useUIStore.setState({ selectedNewsId: 1, newsFilterMode: 'filtered', setSelectedNewsId });

    renderHook(() => useNewsFeedScroll(displayItems, allItems, 'list', false, markReadFn));

    expect(markReadFn).not.toHaveBeenCalled();
    expect(setSelectedNewsId).not.toHaveBeenCalled();
  });

  it('sets selectedNewsId to null when no unread items remain', () => {
    const allItems = [makeItem(1, { isRead: 0 })];
    const displayItems: NewsItem[] = []; // all filtered out

    const setSelectedNewsId = vi.fn();
    useUIStore.setState({ selectedNewsId: 1, newsFilterMode: 'filtered', setSelectedNewsId });

    renderHook(() => useNewsFeedScroll(displayItems, allItems, 'list', false, markReadFn));

    expect(setSelectedNewsId).toHaveBeenCalledWith(null);
  });

  it('returns refs for virtuoso and scroll-to-top', () => {
    const { result } = renderHook(() => useNewsFeedScroll([], [], 'list', false, markReadFn));
    expect(result.current.virtuosoRef).toBeDefined();
    expect(result.current.scrollTopBtnRef).toBeDefined();
    expect(result.current.topSentinelRef).toBeDefined();
    expect(typeof result.current.scrollToTop).toBe('function');
  });
});
