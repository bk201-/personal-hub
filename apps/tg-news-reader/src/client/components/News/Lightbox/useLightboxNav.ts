import type { NewsItem } from '@shared/types.ts';
import { useEffect, useMemo, useRef } from 'react';
import { isVideoPath, lightboxMediaPaths, needsImagePreview } from './lightboxMediaPaths';
import { useLightboxFeed } from './useLightboxFeed';

/** Media types that appear in the lightbox (photo, video, and document image/video files) */
const LIGHTBOX_MEDIA_TYPES = new Set(['photo', 'video', 'document']);

/** How many entries before the end of the list to trigger fetchNextPage */
const PREFETCH_THRESHOLD = 5;
const NO_SKIPPED_ITEMS = new Set<number>();

export interface LightboxEntry {
  newsId: number;
  item: NewsItem;
}

export interface UseLightboxNavResult {
  /** All media entries in the channel, sorted by postedAt */
  entries: LightboxEntry[];
  /** Index of the current news item in entries[] */
  cursor: number;
  currentEntry: LightboxEntry | null;
  /** True when the current item is a video */
  isVideo: boolean;
  /** True when current item has ≥2 downloaded images */
  isAlbum: boolean;
  /** Number of downloaded images in the current album */
  albumLength: number;
  /** Expected total album size (from albumMsgIds) */
  albumExpectedLength: number;
  /** First media path of the current entry */
  firstMediaPath: string | undefined;
  /** Navigate forward/backward through the unified flat list (albums included) */
  go: (delta: -1 | 1) => void;
  /** Navigate within album only (Left/Right arrows) */
  goToAlbumImage: (delta: -1 | 1) => void;
  totalCount: number;
  /** 1-based position string for display: "3 / 12" */
  positionLabel: string;
}

export function useLightboxNav(
  channelId: number,
  newsId: number,
  albumIndex: number,
  onNavigate: (newsId: number, albumIndex: number) => void,
  fetchNextPage?: () => void,
  hasNextPage?: boolean,
  skippedIds: ReadonlySet<number> = NO_SKIPPED_ITEMS,
): UseLightboxNavResult {
  const { items, pageKey } = useLightboxFeed(channelId);

  const entries = useMemo<LightboxEntry[]>(() => {
    return items
      .filter((item) => item.mediaType && LIGHTBOX_MEDIA_TYPES.has(item.mediaType))
      .filter((item) => lightboxMediaPaths(item).length > 0 || (!skippedIds.has(item.id) && needsImagePreview(item)))
      .map((item) => {
        const paths = lightboxMediaPaths(item);
        return { newsId: item.id, item: { ...item, localMediaPath: paths[0], localMediaPaths: paths } };
      });
  }, [items, skippedIds]);

  const cursor = useMemo(() => entries.findIndex((e) => e.newsId === newsId), [entries, newsId]);
  const currentEntry = cursor >= 0 ? entries[cursor] : null;

  const item = currentEntry?.item;
  const firstMediaPath = item?.localMediaPaths?.[0] ?? item?.localMediaPath;
  const isVideo = isVideoPath(item?.localMediaPaths?.[albumIndex] ?? firstMediaPath ?? '');
  const albumLength = item?.localMediaPaths?.length ?? 0;
  const albumExpectedLength = item?.albumMsgIds?.length ?? albumLength;
  const isAlbum = albumLength > 1;

  const totalCount = entries.length;
  // Position: "item N / total (image M/K)" for albums
  const positionLabel = useMemo(() => {
    if (cursor < 0) return '';
    const itemPos = `${cursor + 1} / ${totalCount}`;
    if (isAlbum) return `${itemPos} · ${albumIndex + 1}/${albumLength}`;
    return itemPos;
  }, [cursor, totalCount, isAlbum, albumIndex, albumLength]);

  // ── Auto-fetch next page when near the end of loaded entries ──────────
  const fetchedThrough = useRef<string | null>(null);
  const direction = useRef<-1 | 1>(1);
  useEffect(() => {
    if (
      (cursor < 0 || totalCount - cursor <= PREFETCH_THRESHOLD) &&
      hasNextPage &&
      fetchedThrough.current !== pageKey
    ) {
      fetchedThrough.current = pageKey;
      fetchNextPage?.();
    }
  }, [cursor, totalCount, hasNextPage, fetchNextPage, pageKey]);

  useEffect(() => {
    if (cursor >= 0 || entries.length === 0) return;
    const sourceIndex = items.findIndex((entry) => entry.id === newsId);
    const eligible = new Set(entries.map((entry) => entry.newsId));
    const candidates = direction.current === 1 ? items.slice(sourceIndex + 1) : items.slice(0, sourceIndex).reverse();
    const nextItem = candidates.find((entry) => eligible.has(entry.id));
    const next =
      entries.find((entry) => entry.newsId === nextItem?.id) ??
      entries[direction.current === 1 ? 0 : entries.length - 1];
    onNavigate(next.newsId, direction.current === -1 ? Math.max(0, (next.item.localMediaPaths?.length ?? 1) - 1) : 0);
  }, [cursor, entries, items, newsId, onNavigate]);

  // ── Unified navigation: albums are part of the flat list ──────────────
  // Forward (delta=1): advance album image first, then next item.
  // Backward (delta=-1): go to previous album image first; when entering a
  // new item that is an album, land on its LAST image.
  const go = (delta: -1 | 1) => {
    if (entries.length === 0) return;
    direction.current = delta;

    // Try to advance within the current album first
    if (isAlbum) {
      const nextAlbumIdx = albumIndex + delta;
      if (nextAlbumIdx >= 0 && nextAlbumIdx < albumLength) {
        onNavigate(newsId, nextAlbumIdx);
        return;
      }
    }

    // Move to next/previous news item (circular)
    const next = (cursor + delta + entries.length) % entries.length;
    const nextEntry = entries[next];

    // When going backward into an album, land on its last image
    if (delta === -1) {
      const nextAlbumLen = nextEntry.item.localMediaPaths?.length ?? 0;
      if (nextAlbumLen > 1) {
        onNavigate(nextEntry.newsId, nextAlbumLen - 1);
        return;
      }
    }

    onNavigate(nextEntry.newsId, 0);
  };

  const goToAlbumImage = (delta: -1 | 1) => {
    if (!item) return;
    const maxIdx = albumLength - 1;
    const next = Math.max(0, Math.min(maxIdx, albumIndex + delta));
    if (next !== albumIndex) {
      onNavigate(newsId, next);
    }
  };

  return {
    entries,
    cursor,
    currentEntry,
    isVideo,
    isAlbum,
    albumLength,
    albumExpectedLength,
    firstMediaPath,
    go,
    goToAlbumImage,
    totalCount,
    positionLabel,
  };
}
