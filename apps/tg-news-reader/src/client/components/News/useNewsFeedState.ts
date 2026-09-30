/**
 * useNewsFeedState — thin coordinator composing data, actions, and scroll hooks.
 *
 * Split into:
 *   Feed/useNewsFeedData.ts    — queries, filtering, derived values
 *   Feed/useNewsFeedActions.ts — handlers: mark read, fetch, tag, auto-advance
 *   Feed/useNewsFeedScroll.ts  — FAB, sentinel, scroll-to-index, auto-advance on filter
 */

import { useCallback, useEffect, useMemo } from 'react';
import type { Channel } from '../../../shared/types';
import type { DigestParams } from '../../api/digest';
import { useUIStore } from '../../store/uiStore';
import { useNewsFeedActions } from './Feed/useNewsFeedActions';
import { useNewsFeedData } from './Feed/useNewsFeedData';
import { useNewsFeedHotkeys } from './Feed/useNewsFeedHotkeys';
import { useNewsFeedScroll } from './Feed/useNewsFeedScroll';
import { useNewsHotkeys } from './Feed/useNewsHotkeys';

export function useNewsFeedState(channel: Channel) {
  const {
    selectedNewsId,
    setSelectedNewsId,
    newsFilterMode,
    setNewsFilterMode,
    cycleNewsFilterMode,
    setFilterPanelOpen,
    newsViewMode,
    setNewsViewMode,
    autoAdvance,
    pendingAutoSelectFirst,
    consumeAutoSelectFirst,
  } = useUIStore();

  const data = useNewsFeedData(channel);
  const actions = useNewsFeedActions(
    channel,
    data.displayItems,
    data.unreadCount,
    data.serverFilteredOut,
    data.setMediaProgressKey,
  );

  // After auto-advance switches to this channel, select its first news item once
  // the list has loaded. If the channel genuinely has no items, clear the flag
  // and stop (matching the pre-existing "just switch" behaviour).
  //
  // Important: `displayItems` can be transiently empty right after the switch —
  // the news query, the filters query and the initial channel auto-fetch all
  // settle independently. So we only "give up" once the list is done loading AND
  // the initial fetch is no longer pending; until then we keep waiting for items.
  useEffect(() => {
    if (!pendingAutoSelectFirst) return;
    if (data.displayItems.length > 0) {
      setSelectedNewsId(data.displayItems[0].id);
      consumeAutoSelectFirst();
      return;
    }
    if (!data.isLoading && !actions.fetchChannel.isPending) {
      consumeAutoSelectFirst();
    }
  }, [
    pendingAutoSelectFirst,
    data.isLoading,
    data.displayItems,
    actions.fetchChannel.isPending,
    setSelectedNewsId,
    consumeAutoSelectFirst,
  ]);

  // Tag click needs setHashTagFilter from data + createFilter from actions
  const { setHashTagFilter } = data;
  const { handleTagClick: actionsHandleTagClick } = actions;
  const handleTagClick = useCallback(
    (tag: string | null, action: 'show' | 'addFilter') => {
      if (action === 'show') {
        setHashTagFilter(tag);
        // Clicking a tag should bring the user back to the default view so the
        // newly chosen tag is visible (a tag click while in 'hidden' or 'all'
        // is otherwise confusing).
        setNewsFilterMode('filtered');
      } else if (tag !== null) {
        actionsHandleTagClick(tag, action);
      }
    },
    [setHashTagFilter, setNewsFilterMode, actionsHandleTagClick],
  );

  const scroll = useNewsFeedScroll(
    data.displayItems,
    data.newsItems,
    data.effectiveViewMode,
    data.forceAccordion,
    (args) => actions.markRead.mutate(args),
  );

  useNewsHotkeys(data.displayItems, selectedNewsId, setSelectedNewsId, actions.handleSpaceKey);
  useNewsFeedHotkeys({
    onFetch: actions.handleFetchDefault,
    onCycleFilterMode: cycleNewsFilterMode,
    onMarkAllRead: actions.handleMarkAllReadAndAdvance,
    onOpenFilters: () => setFilterPanelOpen(true),
  });

  // ── Digest params — scoped to tag when hashTagFilter is active ───────────
  const digestParams = useMemo<DigestParams>(() => {
    if (data.hashTagFilter && data.displayItems.length > 0) {
      return { newsIds: data.displayItems.map((i) => i.id) };
    }
    return { channelIds: [channel.id] };
  }, [data.hashTagFilter, data.displayItems, channel.id]);

  // Visible newsIds in chronological order (oldest first) — used by the batched
  // digest flow. API returns items DESC (newest first); reverse for chronology.
  const visibleNewsIdsChrono = useMemo(() => {
    return [...data.displayItems].reverse().map((item) => item.id);
  }, [data.displayItems]);

  // ── Toolbar props ─────────────────────────────────────────────────────
  const toolbarProps = {
    fetchPending: actions.fetchChannel.isPending,
    fetchPeriod: actions.fetchPeriod,
    onFetchDefault: actions.handleFetchDefault,
    onFetchPeriod: actions.handleFetchPeriod,
    newsFilterMode,
    onCycleFilterMode: cycleNewsFilterMode,
    markAllPending:
      actions.markAllRead.isPending ||
      actions.markReadAndFetch.isPending ||
      (autoAdvance && actions.fetchChannel.isPending),
    onMarkAllRead: actions.handleMarkAllReadAndAdvance,
    activeFilterCount: data.activeFilterCount,
    onOpenFilters: () => setFilterPanelOpen(true),
    hashTagFilter: data.hashTagFilter,
    onClearHashTag: () => data.setHashTagFilter(null),
    shownCount: data.displayItems.length,
    hiddenCount: data.hiddenByFilters,
    totalCount: data.totalCount,
    unreadCount: data.unreadCount,
    newsViewMode,
    onSetViewMode: setNewsViewMode,
    isMobile: data.forceAccordion,
    onOpenDigest: () => data.setDigestOpen(true),
    showDigest: channel.supportsDigest,
    channelTelegramId: channel.telegramId,
    hasTags: data.tagCounts.length > 0,
    onOpenTagBrowser: () => data.setTagBrowserOpen(true),
  };

  return {
    // Data
    isLoading: data.isLoading,
    displayItems: data.displayItems,
    filteredIds: data.filteredIds,
    selectedNewsId,
    selectedItem: data.selectedItem,
    newsFilterMode,
    hashTagFilter: data.hashTagFilter,
    activeFilterCount: data.activeFilterCount,
    effectiveViewMode: data.effectiveViewMode,
    forceAccordion: data.forceAccordion,
    // Pagination
    hasNextPage: data.hasNextPage,
    fetchNextPage: data.fetchNextPage,
    isFetchingNextPage: data.isFetchingNextPage,
    // Digest
    digestOpen: data.digestOpen,
    setDigestOpen: data.setDigestOpen,
    digestParams,
    visibleNewsIdsChrono,
    // Tag browser
    tagBrowserOpen: data.tagBrowserOpen,
    setTagBrowserOpen: data.setTagBrowserOpen,
    tagCounts: data.tagCounts,
    // Toolbar
    toolbarProps,
    // Handlers
    setSelectedNewsId,
    handleMarkedRead: actions.handleMarkedRead,
    handleTagClick,
    scrollToTop: scroll.scrollToTop,
    // Refs
    virtuosoRef: scroll.virtuosoRef,
    scrollTopBtnRef: scroll.scrollTopBtnRef,
    topSentinelRef: scroll.topSentinelRef,
  };
}
