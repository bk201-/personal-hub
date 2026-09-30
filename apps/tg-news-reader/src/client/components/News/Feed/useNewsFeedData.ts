/**
 * useNewsFeedData — queries, filtering, derived values for NewsFeed.
 */

import { useMemo, useState } from 'react';
import type { Channel } from '../../../../shared/types';
import { useFilters } from '../../../api/filters';
import { useMediaProgressSSE } from '../../../api/mediaProgress';
import { flattenPaginatedItems, useNews } from '../../../api/news';
import { useIsXl } from '../../../hooks/breakpoints';
import { useUIStore } from '../../../store/uiStore';
import { applyFilters } from '../filterUtils';
import { useHashTagSync } from './useHashTagSync';

export function useNewsFeedData(channel: Channel) {
  const { selectedNewsId, newsFilterMode, newsViewMode } = useUIStore();

  const forceAccordion = !useIsXl();
  const effectiveViewMode = forceAccordion ? 'accordion' : newsViewMode;

  const { hashTagFilter, setHashTagFilter } = useHashTagSync(channel.id);

  const {
    data: newsData,
    isLoading,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
  } = useNews(channel.id, newsFilterMode);
  const newsItems = useMemo(() => flattenPaginatedItems(newsData), [newsData]);
  const serverFilteredOut = newsData?.pages[0]?.filteredOut ?? 0;
  const { data: filters = [] } = useFilters(channel.id);

  const selectedItem = useMemo(
    () => newsItems.find((n) => n.id === selectedNewsId) || null,
    [newsItems, selectedNewsId],
  );
  const filteredIds = useMemo(() => applyFilters(newsItems, filters), [newsItems, filters]);
  const activeFilterCount = filters.filter((f) => f.isActive === 1).length;

  const displayItems = useMemo(() => {
    let base: typeof newsItems;
    if (newsFilterMode === 'all') {
      base = newsItems;
    } else if (newsFilterMode === 'hidden') {
      // Server already returns only hidden items in this mode, so trust it.
      // (Client-side `applyFilters` would mark all of them as "not passing".)
      base = newsItems;
    } else {
      // 'filtered' — keep only items that pass active filters
      base = newsItems.filter((item) => filteredIds.has(item.id));
    }
    if (!hashTagFilter) return base;
    const normalized = hashTagFilter.toLowerCase().replace(/^#/, '');
    return base.filter((item) => (item.hashtags || []).some((h) => h.toLowerCase().replace(/^#/, '') === normalized));
  }, [newsItems, filteredIds, newsFilterMode, hashTagFilter]);

  const unreadCount = channel.unreadCount;
  // Total hidden in the channel: server now always reports filteredOut from a
  // 'filtered' perspective, regardless of current view, so this is consistent.
  // Fallback: when on 'all' view and server didn't report, derive from filteredIds.
  const hiddenByFilters =
    newsFilterMode === 'all' && serverFilteredOut === 0
      ? Math.max(0, newsItems.length - filteredIds.size)
      : serverFilteredOut;
  const totalCount = channel.totalNewsCount;

  const [digestOpen, setDigestOpen] = useState(false);
  const [tagBrowserOpen, setTagBrowserOpen] = useState(false);
  const [mediaProgressKey, setMediaProgressKey] = useState(0);

  // ── Tag counts — computed from all loaded items (not filtered) ─────────────
  const tagCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of newsItems) {
      for (const rawTag of item.hashtags ?? []) {
        const tag = rawTag.startsWith('#') ? rawTag : `#${rawTag}`;
        const key = tag.toLowerCase();
        map.set(key, (map.get(key) ?? 0) + 1);
      }
    }
    return Array.from(map.entries())
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count);
  }, [newsItems]);

  // ── Media progress SSE ─────────────────────────────────────────────────
  useMediaProgressSSE(channel.id, mediaProgressKey);

  return {
    newsItems,
    isLoading,
    hasNextPage: hasNextPage ?? false,
    fetchNextPage,
    isFetchingNextPage,
    selectedItem,
    filteredIds,
    activeFilterCount,
    displayItems,
    unreadCount,
    hiddenByFilters,
    totalCount,
    serverFilteredOut,
    hashTagFilter,
    setHashTagFilter,
    effectiveViewMode,
    forceAccordion,
    digestOpen,
    setDigestOpen,
    tagBrowserOpen,
    setTagBrowserOpen,
    tagCounts,
    mediaProgressKey,
    setMediaProgressKey,
  };
}
