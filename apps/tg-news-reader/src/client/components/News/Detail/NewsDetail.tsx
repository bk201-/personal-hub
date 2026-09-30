import type { NewsItem } from '@shared/types.ts';
import { createStyles } from 'antd-style';
import React, { useCallback, useRef } from 'react';
import { BP_XL, MOBILE_TOOLBAR_HEIGHT } from '../../../hooks/breakpoints';
import { NewsDetailBody } from './NewsDetailBody';
import { NewsDetailToolbar } from './NewsDetailToolbar';
import { NewsDetailTopPanel } from './NewsDetailTopPanel';
import { ScrollProgressBar } from './ScrollProgressBar';
import { useNewsDetailState } from './useNewsDetailState';
import { useScrollProgress } from './useScrollProgress';

const useStyles = createStyles(({ css, token }) => ({
  detail: css`
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
    position: relative;
  `,
  detailInline: css`
    height: auto;
    overflow: visible;
  `,
  header: css`
    flex-shrink: 0;
    background: ${token.colorBgLayout};
    border-bottom: 1px solid ${token.colorBorderSecondary};
    position: sticky;
    top: 0;
    z-index: 10;
    container-type: inline-size;
  `,
  headerInline: css`
    position: sticky;
    top: 0;
    @media (max-width: ${BP_XL - 1}px) {
      top: ${MOBILE_TOOLBAR_HEIGHT}px;
    }
    z-index: 10;
    background: ${token.colorBgContainer};
  `,
}));

interface NewsDetailProps {
  item: NewsItem;
  channelTelegramId: string;
  onMarkedRead?: (id: number) => void;
  variant?: 'panel' | 'inline';
  onHeaderClick?: () => void;
  onTagClick?: (tag: string, action: 'show' | 'addFilter') => void;
}

export function NewsDetail({
  item,
  channelTelegramId,
  onMarkedRead,
  variant = 'panel',
  onHeaderClick,
  onTagClick,
}: NewsDetailProps) {
  const { styles, cx } = useStyles();
  const s = useNewsDetailState({ item, channelTelegramId, onMarkedRead, variant });
  const detailRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const handleTogglePanel = useCallback(
    (p: typeof s.topPanel) => s.setTopPanel((prev) => (prev === p ? null : p)),
    [s],
  );
  const handleShare = useCallback(() => void s.handleShare(), [s]);
  const handleCloseTopPanel = useCallback(() => s.setTopPanel(null), [s]);
  const handleAlbumNav = useCallback(
    (delta: number) => s.setAlbumIndex((i) => Math.max(0, Math.min(s.albumLength - 1, i + delta))),
    [s],
  );
  const handleDownload = useCallback(
    () =>
      s.downloadMedia.mutate(item.id, {
        onSuccess: () => void s.message.success(s.t('news.detail.media_queued_toast')),
      }),
    [s, item.id],
  );
  const handleModalConfirm = useCallback(() => {
    s.setLinkModalOpen(false);
    s.handleExtract(s.selectedUrl);
  }, [s]);
  const handleModalCancel = useCallback(() => s.setLinkModalOpen(false), [s]);

  // Sticky offset = feed toolbar (on mobile) + approximate header height
  // On mobile (< BP_XL): MOBILE_TOOLBAR_HEIGHT is the feed toolbar above;
  // the detail header itself sticks below it. We track progress of the whole detail container.
  const stickyOffset = MOBILE_TOOLBAR_HEIGHT + 48; // toolbar + approx header height
  const scrollProgress = useScrollProgress(detailRef, stickyOffset, variant === 'inline');

  return (
    <div ref={detailRef} className={cx(styles.detail, variant === 'inline' && styles.detailInline)}>
      <div className={cx(styles.header, variant === 'inline' && styles.headerInline)}>
        <NewsDetailToolbar
          item={item}
          links={s.links}
          topPanel={s.topPanel}
          onTogglePanel={handleTogglePanel}
          variant={variant}
          title={s.title}
          articleLoading={s.articleLoading}
          articleQueued={s.articleQueued}
          onExtractClick={s.handleExtractClick}
          isRead={s.isRead}
          onMarkRead={s.handleMarkRead}
          markReadPending={s.markReadPending}
          onRefresh={s.handleRefresh}
          refreshPending={s.refreshPending}
          openUrl={s.openUrl}
          isExternalLink={s.isExternalLink}
          onHeaderClick={onHeaderClick}
          onTagClick={onTagClick}
          onShare={handleShare}
        />
        {variant === 'inline' && <ScrollProgressBar progress={scrollProgress} />}
      </div>

      {s.topPanel && (
        <NewsDetailTopPanel panel={s.topPanel} links={s.links} text={item.text} onClose={handleCloseTopPanel} />
      )}

      <NewsDetailBody
        item={item}
        links={s.links}
        firstMediaPath={s.firstMediaPath}
        isAlbum={s.isAlbum}
        isVideo={s.isVideo}
        isAudio={s.isAudio}
        albumIndex={s.albumIndex}
        albumLength={s.albumLength}
        albumExpectedLength={s.albumExpectedLength}
        onAlbumNav={handleAlbumNav}
        mediaLoading={s.mediaLoading}
        mediaQueued={s.mediaQueued}
        mediaTaskStatus={s.mediaTask?.status}
        mediaTaskError={s.mediaTask?.error ?? undefined}
        onDownload={handleDownload}
        articleLoading={s.articleLoading}
        articleQueued={s.articleQueued}
        articleTaskStatus={s.articleTask?.status}
        articleTaskError={s.articleTask?.error ?? undefined}
        onExtractClick={s.handleExtractClick}
        linkModalOpen={s.linkModalOpen}
        selectedUrl={s.selectedUrl}
        onSelectedUrlChange={s.setSelectedUrl}
        onModalConfirm={handleModalConfirm}
        onModalCancel={handleModalCancel}
        onDoubleTap={variant === 'inline' ? s.handleMarkRead : undefined}
        videoRef={videoRef}
      />
    </div>
  );
}
