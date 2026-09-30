import type { ChannelType } from '@shared/types';
import { useCallback, useEffect } from 'react';
import { mediaUrl } from '../../../api/mediaUrl';
import { useMarkRead } from '../../../api/news';
import type { LightboxState } from '../../../store/uiStore';
import { isImagePath } from './lightboxMediaPaths';
import type { UseLightboxNavResult } from './useLightboxNav';

export function useLightboxMediaEffects(
  lightbox: LightboxState | null,
  channelType: ChannelType | undefined,
  nav: UseLightboxNavResult,
) {
  const { mutate: markRead } = useMarkRead();
  const albumIndex = lightbox?.albumIndex ?? 0;
  const isOpen = lightbox !== null;
  const newsId = lightbox?.newsId ?? null;
  const channelId = lightbox?.channelId ?? null;

  // Prefetch adjacent images: 1 behind + 2 ahead (full albums).
  useEffect(() => {
    const { entries, cursor } = nav;
    const entryPaths = (e: (typeof entries)[number] | undefined): string[] => {
      if (!e) return [];
      const paths = e.item.localMediaPaths ?? (e.item.localMediaPath ? [e.item.localMediaPath] : []);
      return paths.filter(isImagePath);
    };

    const toPreload: string[] = [
      ...entryPaths(entries[cursor]).slice(albumIndex + 1),
      ...entryPaths(entries[cursor - 1]),
      ...entryPaths(entries[cursor + 1]),
      ...entryPaths(entries[cursor + 2]),
    ];

    toPreload.forEach((p) => {
      const img = new Image();
      img.src = mediaUrl(p);
    });
  }, [nav, albumIndex]);

  const markCurrentRead = useCallback(() => {
    if (!isOpen || newsId === null || channelId === null) return;
    if (!nav.firstMediaPath || nav.currentEntry?.item.isRead !== 0) return;
    markRead({ id: newsId, isRead: 1, channelId });
  }, [isOpen, newsId, channelId, markRead, nav.firstMediaPath, nav.currentEntry?.item.isRead]);

  // Automatic reads remain limited to media/blog; explicit close also finishes news posts.
  useEffect(() => {
    if (channelType === 'media' || channelType === 'blog') markCurrentRead();
  }, [channelType, markCurrentRead]);

  return markCurrentRead;
}
