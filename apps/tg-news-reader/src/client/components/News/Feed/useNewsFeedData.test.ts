import type { Channel, Filter, NewsItem } from '@shared/types';
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mocks ──────────────────────────────────────────────────────────────
const mockNewsItems: NewsItem[] = [];
const mockFilters: Filter[] = [];
let mockIsXl = true;

vi.mock('../../../api/news', () => ({
  useNews: () => ({
    data: {
      pages: [{ items: mockNewsItems, filteredOut: 0, nextCursor: null, hasMore: false }],
      pageParams: [undefined],
    },
    isLoading: false,
    hasNextPage: false,
    fetchNextPage: vi.fn(),
    isFetchingNextPage: false,
  }),
  flattenPaginatedItems: (data: { pages: { items: NewsItem[] }[] } | undefined) =>
    data ? data.pages.flatMap((p) => p.items) : [],
}));

vi.mock('../../../api/filters', () => ({
  useFilters: () => ({ data: mockFilters }),
}));

vi.mock('../../../hooks/breakpoints', () => ({
  useIsXl: () => mockIsXl,
  BP_XL: 1200,
}));

vi.mock('../../../api/mediaProgress', () => ({
  useMediaProgressSSE: vi.fn(),
}));

// Mock useHashTagSync to pass through from uiStore
let mockHashTagFilter: string | null = null;
const mockSetHashTagFilter = vi.fn();
vi.mock('./useHashTagSync', () => ({
  useHashTagSync: () => ({
    hashTagFilter: mockHashTagFilter,
    setHashTagFilter: mockSetHashTagFilter,
  }),
}));

import { useUIStore } from '../../../store/uiStore';
import { useNewsFeedData } from './useNewsFeedData';

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

function makeChannel(overrides: Partial<Channel> = {}): Channel {
  return {
    id: 1,
    telegramId: 'test',
    name: 'Test',
    channelType: 'news',
    sortOrder: 0,
    isUnavailable: 0,
    unreadCount: 5,
    totalNewsCount: 10,
    createdAt: 1700000000,
    supportsDigest: true,
    ...overrides,
  };
}

describe('useNewsFeedData', () => {
  beforeEach(() => {
    mockNewsItems.length = 0;
    mockFilters.length = 0;
    mockIsXl = true;
    mockHashTagFilter = null;
    mockSetHashTagFilter.mockClear();
    useUIStore.setState({
      selectedNewsId: null,
      newsFilterMode: 'filtered',
      newsViewMode: 'list',
      hashTagFilter: null,
    });
  });

  it('returns displayItems from newsItems', () => {
    mockNewsItems.push(makeItem(1), makeItem(2));
    const { result } = renderHook(() => useNewsFeedData(makeChannel()));
    expect(result.current.displayItems).toHaveLength(2);
  });

  it('returns selectedItem when selectedNewsId matches', () => {
    mockNewsItems.push(makeItem(1), makeItem(2));
    useUIStore.setState({ selectedNewsId: 2 });
    const { result } = renderHook(() => useNewsFeedData(makeChannel()));
    expect(result.current.selectedItem?.id).toBe(2);
  });

  it('returns null selectedItem when no match', () => {
    mockNewsItems.push(makeItem(1));
    useUIStore.setState({ selectedNewsId: 99 });
    const { result } = renderHook(() => useNewsFeedData(makeChannel()));
    expect(result.current.selectedItem).toBeNull();
  });

  it('effectiveViewMode is accordion when not XL', () => {
    mockIsXl = false;
    const { result } = renderHook(() => useNewsFeedData(makeChannel()));
    expect(result.current.effectiveViewMode).toBe('accordion');
  });

  it('effectiveViewMode follows newsViewMode when XL', () => {
    mockIsXl = true;
    useUIStore.setState({ newsViewMode: 'list' });
    const { result } = renderHook(() => useNewsFeedData(makeChannel()));
    expect(result.current.effectiveViewMode).toBe('list');
  });

  it('newsFilterMode="all" returns all items including filtered-out', () => {
    const f: Filter = { id: 1, channelId: 1, name: 'tag', type: 'tag', value: 'hidden', isActive: 1, createdAt: 0 };
    mockFilters.push(f);
    mockNewsItems.push(makeItem(1, { hashtags: ['hidden'] }), makeItem(2));
    useUIStore.setState({ newsFilterMode: 'all' });
    const { result } = renderHook(() => useNewsFeedData(makeChannel()));
    expect(result.current.displayItems).toHaveLength(2);
  });

  it('newsFilterMode="hidden" trusts server output as-is', () => {
    // In 'hidden' mode the server already returns only filtered items; the
    // hook must NOT re-apply client filters (which would mark them as
    // "not passing" and produce an empty displayItems).
    const f: Filter = { id: 1, channelId: 1, name: 'tag', type: 'tag', value: 'hidden', isActive: 1, createdAt: 0 };
    mockFilters.push(f);
    mockNewsItems.push(makeItem(1, { hashtags: ['hidden'] }), makeItem(2, { hashtags: ['hidden'] }));
    useUIStore.setState({ newsFilterMode: 'hidden' });
    const { result } = renderHook(() => useNewsFeedData(makeChannel()));
    expect(result.current.displayItems).toHaveLength(2);
  });

  it('filters by hashtag when hashTagFilter is set', () => {
    mockNewsItems.push(makeItem(1, { hashtags: ['#tech'] }), makeItem(2, { hashtags: ['#politics'] }));
    mockHashTagFilter = 'tech';
    useUIStore.setState({ newsFilterMode: 'all' });
    const { result } = renderHook(() => useNewsFeedData(makeChannel()));
    expect(result.current.displayItems).toHaveLength(1);
    expect(result.current.displayItems[0].id).toBe(1);
  });
});
