/**
 * useNewsFeedActions — handlers: mark read, fetch, tag, auto-advance.
 */

import { App } from 'antd';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Channel, NewsItem } from '../../../../shared/types';
import { useChannels, useFetchChannel, useMarkReadAndFetch } from '../../../api/channels';
import { useCreateFilter } from '../../../api/filters';
import { useMarkAllRead, useMarkRead } from '../../../api/news';
import { useUIStore } from '../../../store/uiStore';
import { useBulkMarkUndo } from './useBulkMarkUndo';

export function useNewsFeedActions(
  channel: Channel,
  displayItems: NewsItem[],
  unreadCount: number,
  serverFilteredOut: number,
  setMediaProgressKey: React.Dispatch<React.SetStateAction<number>>,
) {
  const { message } = App.useApp();
  const { t } = useTranslation();
  const {
    setSelectedNewsId,
    newsFilterMode,
    setSelectedChannelId,
    autoAdvance,
    hashTagFilter,
    requestAutoSelectFirst,
  } = useUIStore();
  const { data: allChannels = [] } = useChannels();

  const markAllRead = useMarkAllRead();
  const markRead = useMarkRead();
  const fetchChannel = useFetchChannel();
  const createFilter = useCreateFilter(channel.id);
  const markReadAndFetch = useMarkReadAndFetch();
  const {
    reset: resetBulkMark,
    capture: captureBulkMark,
    take: takeBulkMark,
  } = useBulkMarkUndo(
    channel.id,
    JSON.stringify([channel.groupId ?? null, hashTagFilter, newsFilterMode, autoAdvance]),
  );

  // fetchPeriod resets on channel change: [channelId, period] tuple — React
  // setState in render is fine when gated by a value comparison (see React docs
  // "Adjusting state based on props").
  const [fetchPeriodState, setFetchPeriodState] = useState<[number, string]>([channel.id, '']);
  const fetchPeriod = fetchPeriodState[0] === channel.id ? fetchPeriodState[1] : '';
  const setFetchPeriod = useCallback((v: string) => setFetchPeriodState([channel.id, v]), [channel.id]);

  // Advance to the next channel in order (circular), regardless of unread count.
  const goToNextChannel = useCallback(() => {
    const sameGroup = allChannels
      .filter((ch) => (ch.groupId ?? null) === (channel.groupId ?? null))
      .sort((a, b) => a.sortOrder - b.sortOrder);

    const currentIdx = sameGroup.findIndex((ch) => ch.id === channel.id);
    if (currentIdx === -1 || sameGroup.length <= 1) return;

    const next = sameGroup[(currentIdx + 1) % sameGroup.length];
    // Ask the feed to select the first news item once the new channel loads,
    // so auto-advance actually lands the user on something to read.
    requestAutoSelectFirst();
    setSelectedChannelId(next.id);
  }, [allChannels, channel.id, channel.groupId, setSelectedChannelId, requestAutoSelectFirst]);

  // Called after a USER-TRIGGERED fetch (button, double-space at end).
  const onUserFetchSuccess = useCallback(
    (data: { inserted: number; mediaProcessing?: boolean }) => {
      if (data.mediaProcessing) {
        setMediaProgressKey((k) => k + 1);
      }
      if (autoAdvance && data.inserted === 0 && unreadCount === 0) {
        goToNextChannel();
      }
    },
    [goToNextChannel, unreadCount, autoAdvance, setMediaProgressKey],
  );

  const handleMarkedRead = useCallback(
    (currentId: number) => {
      const currentIndex = displayItems.findIndex((item) => item.id === currentId);
      const nextUnread = displayItems.slice(currentIndex + 1).find((item) => item.isRead === 0);
      if (nextUnread) {
        setSelectedNewsId(nextUnread.id);
      } else {
        const remainingVisible = displayItems.filter((item) => item.id !== currentId && item.isRead === 0);
        // When a hashtag filter is active, the items hidden from view are NOT user-filtered junk —
        // they're news that simply don't match the current tag. Marking the whole channel as read
        // here would silently lose all of them. Only "consume" server-filtered items (junk filters)
        // when no tag filter is narrowing the view AND we're in the default 'filtered' mode
        // (not 'all' — user already sees everything, no need to sweep; not 'hidden' — user is
        // intentionally working through hidden items only, don't touch the visible ones).
        if (!hashTagFilter && newsFilterMode === 'filtered' && remainingVisible.length === 0 && serverFilteredOut > 0)
          markAllRead.mutate({ channelId: channel.id });
      }
    },
    [displayItems, setSelectedNewsId, newsFilterMode, serverFilteredOut, markAllRead, channel.id, hashTagFilter],
  );

  const handleTagClick = useCallback(
    (tag: string, action: 'show' | 'addFilter') => {
      if (action === 'show') {
        // setHashTagFilter is managed externally by the caller
      } else {
        void createFilter
          .mutateAsync({ name: tag, type: 'tag', value: tag.toLowerCase() })
          .then(() => void message.success(t('news.list.tag_added_toast', { tag })));
      }
    },
    [createFilter, message, t],
  );

  const handleFetchDefault = useCallback(() => {
    resetBulkMark();
    setFetchPeriod('');
    fetchChannel.mutate({ id: channel.id }, { onSuccess: onUserFetchSuccess });
  }, [channel.id, fetchChannel, onUserFetchSuccess, setFetchPeriod, resetBulkMark]);

  // Stable ref for the auto-fetch callback — avoids re-triggering the effect
  // when fetchChannel/setMediaProgressKey change identity across renders.
  const autoFetchRef = useRef({ fetchChannel, setMediaProgressKey });
  useEffect(() => {
    autoFetchRef.current = { fetchChannel, setMediaProgressKey };
  });

  // ── Auto-fetch on channel open ────────────────────────────────────────
  useEffect(() => {
    const { fetchChannel: fc, setMediaProgressKey: smpk } = autoFetchRef.current;
    fc.mutate(
      { id: channel.id },
      {
        onSuccess: (data) => {
          if (data.mediaProcessing) smpk((k) => k + 1);
        },
      },
    );
  }, [channel.id]);

  const handleFetchPeriod = useCallback(
    (val: string | number) => {
      resetBulkMark();
      const v = String(val);
      setFetchPeriod(v);
      const since = new Date();
      since.setDate(since.getDate() - parseInt(v, 10));
      since.setHours(0, 0, 0, 0);
      fetchChannel.mutate({ id: channel.id, since: since.toISOString() }, { onSuccess: onUserFetchSuccess });
    },
    [channel.id, fetchChannel, onUserFetchSuccess, setFetchPeriod, resetBulkMark],
  );

  const handleSpaceKey = useCallback(
    (item: NewsItem) => {
      if (item.isRead === 0) {
        markRead.mutate(
          { id: item.id, isRead: 1, channelId: item.channelId },
          { onSuccess: () => handleMarkedRead(item.id) },
        );
      } else {
        const idx = displayItems.findIndex((n) => n.id === item.id);
        const next = displayItems.slice(idx + 1).find((n) => n.isRead === 0);
        if (next) setSelectedNewsId(next.id);
        else handleFetchDefault();
      }
    },
    [displayItems, markRead, handleMarkedRead, setSelectedNewsId, handleFetchDefault],
  );

  const handleMarkAllReadAndAdvance = useCallback(() => {
    const undoIds = takeBulkMark();
    if (undoIds) {
      markAllRead.mutate({ newsIds: undoIds, isRead: 0 });
      return;
    }

    // Scoped views must never send empty IDs: the server treats that as an unscoped sweep.
    if (hashTagFilter || newsFilterMode === 'hidden') {
      if (displayItems.length === 0) return;
      markAllRead.mutate({ newsIds: displayItems.map((i) => i.id) }, { onSuccess: captureBulkMark() });
      return;
    }

    if (!autoAdvance) {
      markAllRead.mutate({ channelId: channel.id }, { onSuccess: captureBulkMark() });
      return;
    }
    markReadAndFetch.mutate(channel.id, {
      onSuccess: (data) => {
        if (data.mediaProcessing) setMediaProgressKey((k) => k + 1);
        if (data.inserted === 0) goToNextChannel();
      },
    });
  }, [
    takeBulkMark,
    hashTagFilter,
    newsFilterMode,
    autoAdvance,
    markAllRead,
    channel.id,
    markReadAndFetch,
    goToNextChannel,
    setMediaProgressKey,
    displayItems,
    captureBulkMark,
  ]);

  return {
    fetchChannel,
    markAllRead,
    markReadAndFetch,
    markRead,
    fetchPeriod,
    handleMarkedRead,
    handleTagClick,
    handleFetchDefault,
    handleFetchPeriod,
    handleSpaceKey,
    handleMarkAllReadAndAdvance,
    goToNextChannel,
  };
}
