/**
 * useNewsFeedScroll — FAB visibility, scroll-to-top, sentinel, refs, auto-advance on filter.
 */

import { useCallback, useEffect, useRef } from 'react';
import type { VirtuosoHandle } from 'react-virtuoso';
import type { NewsItem } from '../../../../shared/types';
import { useUIStore } from '../../../store/uiStore';

export function useNewsFeedScroll(
  displayItems: NewsItem[],
  newsItems: NewsItem[],
  effectiveViewMode: 'list' | 'accordion',
  forceAccordion: boolean,
  markReadFn: (args: { id: number; isRead: number; channelId: number }) => void,
) {
  const { selectedNewsId, setSelectedNewsId, newsFilterMode } = useUIStore();

  // Stable refs for deps that should NOT re-trigger the auto-advance effect
  const advanceRef = useRef({ newsItems, selectedNewsId, newsFilterMode, markReadFn, setSelectedNewsId });
  useEffect(() => {
    advanceRef.current = { newsItems, selectedNewsId, newsFilterMode, markReadFn, setSelectedNewsId };
  });

  // ── Refs ──────────────────────────────────────────────────────────────
  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const scrollTopBtnRef = useRef<HTMLButtonElement>(null);
  const topSentinelRef = useRef<HTMLDivElement>(null);

  // ── Scroll-to-top FAB visibility via viewport IO on post-toolbar sentinel ─
  useEffect(() => {
    if (!forceAccordion) return;
    const sentinel = topSentinelRef.current;
    const btn = scrollTopBtnRef.current;
    if (!sentinel || !btn) return;
    const show = () => {
      btn.style.opacity = '1';
      btn.style.pointerEvents = 'auto';
      btn.style.transform = 'translateY(0)';
    };
    const hide = () => {
      btn.style.opacity = '0';
      btn.style.pointerEvents = 'none';
      btn.style.transform = 'translateY(8px)';
    };
    const observer = new IntersectionObserver(([entry]) => (entry.isIntersecting ? hide() : show()), {
      root: null,
      threshold: 0,
    });
    observer.observe(sentinel);
    return () => {
      observer.disconnect();
      hide();
    };
  }, [forceAccordion]);

  // ── Auto-advance selected news when filtered out ───────────────────────
  useEffect(() => {
    const {
      newsFilterMode: mode,
      selectedNewsId: snId,
      newsItems: ni,
      markReadFn: mrf,
      setSelectedNewsId: ssn,
    } = advanceRef.current;
    // In 'all' mode items never disappear from view → nothing to advance.
    if (mode === 'all' || !snId) return;
    if (displayItems.some((n) => n.id === snId)) return;
    const item = ni.find((n) => n.id === snId);
    if (item && item.isRead === 0) mrf({ id: item.id, isRead: 1, channelId: item.channelId });
    const currentIndex = ni.findIndex((n) => n.id === snId);
    const nextUnread =
      displayItems.find((n) => ni.findIndex((m) => m.id === n.id) > currentIndex && n.isRead === 0) ??
      displayItems.find((n) => n.isRead === 0) ??
      null;
    ssn(nextUnread?.id ?? null);
  }, [displayItems]);

  // ── Scroll selected item into view ────────────────────────────────────
  useEffect(() => {
    if (!selectedNewsId) return;
    const index = displayItems.findIndex((n) => n.id === selectedNewsId);
    if (index === -1) return;
    if (effectiveViewMode === 'accordion') {
      const id = setTimeout(() => {
        const el = document.querySelector(`[data-news-id="${selectedNewsId}"]`);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } else {
          virtuosoRef.current?.scrollToIndex({ index, behavior: 'smooth', align: 'start' });
        }
      }, 120);
      return () => clearTimeout(id);
    } else {
      virtuosoRef.current?.scrollToIndex({ index, behavior: 'smooth', align: 'center' });
    }
  }, [selectedNewsId, displayItems, effectiveViewMode]);

  const scrollToTop = useCallback(() => {
    if (forceAccordion) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      virtuosoRef.current?.scrollToIndex({ index: 0, behavior: 'smooth', align: 'start' });
    }
  }, [forceAccordion]);

  return {
    virtuosoRef,
    scrollTopBtnRef,
    topSentinelRef,
    scrollToTop,
  };
}
