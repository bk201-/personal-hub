/**
 * useNewsDetailState — derived values + stable handler refs for NewsDetail.
 */

import type { NewsItem } from '@shared/types.ts';
import { App } from 'antd';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useNewsDownloadTask } from '../../../api/downloads';
import { useDownloadMedia, useExtractContent, useMarkRead, useRefreshNewsItem } from '../../../api/news';
import { getNewsTitle, isYouTubeUrl } from '../newsUtils';
import { useNewsDetailHotkeys } from './useNewsDetailHotkeys';

interface UseNewsDetailStateArgs {
  item: NewsItem;
  channelTelegramId: string;
  onMarkedRead?: (id: number) => void;
  variant: 'panel' | 'inline';
}

export function useNewsDetailState({ item, channelTelegramId, onMarkedRead, variant }: UseNewsDetailStateArgs) {
  const { message } = App.useApp();
  const { t } = useTranslation();
  const markRead = useMarkRead();
  const extractContent = useExtractContent();
  const downloadMedia = useDownloadMedia();
  const refreshNewsItem = useRefreshNewsItem();

  const mediaTask = useNewsDownloadTask(item.id, 'media');
  const articleTask = useNewsDownloadTask(item.id, 'article');

  // ── Derived values ────────────────────────────────────────────────────
  const links = item.links || [];
  const isRead = item.isRead === 1;
  const firstLink = links[0];
  const openUrl = firstLink ?? `https://t.me/${channelTelegramId}/${item.telegramMsgId}`;
  const isExternalLink = !!firstLink;
  const shareUrl = `https://t.me/${channelTelegramId}/${item.telegramMsgId}`;
  const firstMediaPath = item.localMediaPaths?.[0] ?? item.localMediaPath;
  const albumLength = item.localMediaPaths?.length ?? 0;
  const albumExpectedLength = item.albumMsgIds?.length ?? albumLength;
  const isAlbum = albumLength > 1;
  const isVideo = /\.(mp4|webm|mov)$/i.test(firstMediaPath ?? '');
  const isAudio = item.mediaType === 'audio';
  const articleLoading = extractContent.isPending || articleTask?.status === 'processing';
  const articleQueued = articleTask?.status === 'pending';
  const mediaLoading = downloadMedia.isPending || mediaTask?.status === 'processing';
  const mediaQueued = mediaTask?.status === 'pending';

  // ── Handlers (stable refs passed to the hotkeys hook) ─────────────────
  const handleRefresh = useCallback(() => {
    if (markRead.isPending) return;
    refreshNewsItem.mutate(item.id);
  }, [refreshNewsItem, item.id, markRead.isPending]);
  const handleExtract = useCallback(
    (url: string) =>
      extractContent.mutate(
        { newsId: item.id, url },
        { onSuccess: () => void message.success(t('news.detail.article_queued_toast')) },
      ),
    [extractContent, item.id, message, t],
  );
  const handleShare = useCallback(async () => {
    const isTouchDevice = navigator.maxTouchPoints > 0 || 'ontouchstart' in window;
    if (navigator.share && isTouchDevice) {
      await navigator.share({ url: shareUrl });
    } else {
      await navigator.clipboard.writeText(shareUrl);
      void message.success(t('news.detail.share_copied'));
    }
  }, [shareUrl, message, t]);

  // ── Hotkeys + driven state ────────────────────────────────────────────
  const {
    albumIndex,
    setAlbumIndex,
    topPanel,
    setTopPanel,
    linkModalOpen,
    setLinkModalOpen,
    selectedUrl,
    setSelectedUrl,
  } = useNewsDetailHotkeys({
    item,
    openUrl,
    articleQueued,
    isAlbum,
    albumLength,
    albumExpectedLength,
    mediaPending: mediaLoading || mediaQueued,
    onRefresh: handleRefresh,
    onExtractArticle: handleExtract,
    onShare: () => void handleShare(),
  });

  // ── Click handlers ─────────────────────────────────────────────────────
  const handleMarkRead = () =>
    markRead.mutate(
      { id: item.id, isRead: isRead ? 0 : 1, channelId: item.channelId },
      {
        onSuccess: () => {
          if (!isRead) onMarkedRead?.(item.id);
        },
      },
    );

  const handleExtractClick = () => {
    const nonYtLinks = links.filter((l) => !isYouTubeUrl(l));
    if (nonYtLinks.length === 0) return;
    if (nonYtLinks.length === 1) handleExtract(nonYtLinks[0]);
    else {
      setSelectedUrl(nonYtLinks[0]);
      setLinkModalOpen(true);
    }
  };

  const title =
    variant === 'inline' ? getNewsTitle(item, t('news.list.message_fallback', { id: item.telegramMsgId })) : undefined;

  return {
    // Derived
    links,
    isRead,
    openUrl,
    isExternalLink,
    shareUrl,
    firstMediaPath,
    albumLength,
    albumExpectedLength,
    isAlbum,
    isVideo,
    isAudio,
    articleLoading,
    articleQueued,
    mediaLoading,
    mediaQueued,
    title,
    // Tasks
    mediaTask,
    articleTask,
    // Hotkey-driven state
    albumIndex,
    setAlbumIndex,
    topPanel,
    setTopPanel,
    linkModalOpen,
    setLinkModalOpen,
    selectedUrl,
    setSelectedUrl,
    // Handlers
    handleRefresh,
    refreshPending: refreshNewsItem.isPending || markRead.isPending,
    handleExtract,
    handleShare,
    handleMarkRead,
    handleExtractClick,
    markReadPending: markRead.isPending,
    // Download
    downloadMedia,
    message,
    t,
  };
}
