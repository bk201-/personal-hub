import { LeftOutlined, RightOutlined } from '@ant-design/icons';
import React, { useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useChannels } from '../../../api/channels';
import { useUIStore } from '../../../store/uiStore';
import type { LightboxState } from '../../../store/uiStore';
import { LightboxMedia } from './LightboxMedia';
import { useLightboxOverlayStyles } from './LightboxOverlay.styles';
import { LightboxToolbar } from './LightboxToolbar';
import { useLightboxImages } from './useLightboxImages';
import { useLightboxInput } from './useLightboxInput';
import { useLightboxLifecycle } from './useLightboxLifecycle';
import { useLightboxMediaEffects } from './useLightboxMediaEffects';
import { useLightboxNav } from './useLightboxNav';
import { useVideoRotation } from './useVideoRotation';

interface LightboxViewerProps {
  lightbox: LightboxState;
  /** fetchNextPage / hasNextPage forwarded from the parent news feed query.
   *  Avoids mounting a second observer on the same query key, which would
   *  trigger a background refetch and overwrite optimistic isRead updates. */
  fetchNextPage: () => void;
  hasNextPage: boolean;
}

export function LightboxViewer({ lightbox, fetchNextPage, hasNextPage }: LightboxViewerProps) {
  const { styles, cx } = useLightboxOverlayStyles();
  const { t } = useTranslation();
  const { closeLightbox, openLightbox } = useUIStore();
  const { data: channels = [] } = useChannels();
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  const { channelId, newsId, albumIndex } = lightbox;
  const previews = useLightboxImages(channelId, newsId);

  const channel = channels.find((c) => c.id === channelId);
  const channelType = channel?.channelType;

  const navigate = useCallback(
    (nextNewsId: number, nextAlbumIndex: number) => {
      // Simple flat list: forward → first image (0), backward → last image (passed by go())
      openLightbox(nextNewsId, nextAlbumIndex, channelId);
    },
    [openLightbox, channelId],
  );

  const nav = useLightboxNav(channelId, newsId, albumIndex, navigate, fetchNextPage, hasNextPage, previews.skippedIds);
  const rotation = useVideoRotation(`${newsId}:${albumIndex}:${nav.firstMediaPath ?? ''}`);

  const markCurrentRead = useLightboxMediaEffects(lightbox, channelType, nav);
  const handleClose = useCallback(() => {
    markCurrentRead();
    closeLightbox();
  }, [markCurrentRead, closeLightbox]);
  useLightboxLifecycle(true, handleClose);
  useLightboxInput(lightbox, nav, handleClose, overlayRef, videoRef);

  const handleOverlayClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) handleClose();
    },
    [handleClose],
  );

  const handleNavPrev = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      nav.go(-1);
    },
    [nav],
  );

  const handleNavNext = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      nav.go(1);
    },
    [nav],
  );

  if (!channel) return null;

  const { currentEntry, isAlbum, firstMediaPath } = nav;
  const item = currentEntry?.item;
  const albumPaths = item?.localMediaPaths;
  const currentMediaPath = isAlbum && albumPaths ? (albumPaths[albumIndex] ?? firstMediaPath) : firstMediaPath;

  return createPortal(
    <div
      ref={overlayRef}
      className={styles.overlay}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label={t('lightbox.title')}
      onClick={handleOverlayClick}
    >
      <LightboxToolbar
        item={item}
        channelName={channel.name}
        channelTelegramId={channel.telegramId}
        positionLabel={nav.positionLabel}
        currentMediaPath={currentMediaPath}
        onClose={handleClose}
        onRotate={nav.isVideo ? rotation.rotate : undefined}
      />

      {/* Image fills the full area; nav buttons are positioned on top */}
      <div className={styles.mediaArea} onClick={handleOverlayClick}>
        <button className={cx(styles.navBtn, styles.navPrev)} onClick={handleNavPrev} title={t('lightbox.prev')}>
          <LeftOutlined />
        </button>

        <LightboxMedia
          path={firstMediaPath}
          isAlbum={isAlbum}
          albumIndex={albumIndex}
          albumPaths={albumPaths}
          videoRef={videoRef}
          failed={previews.failed}
          empty={!currentEntry && !hasNextPage}
          rotation={rotation.angle}
        />

        <button className={cx(styles.navBtn, styles.navNext)} onClick={handleNavNext} title={t('lightbox.next')}>
          <RightOutlined />
        </button>
      </div>

      <div className={styles.counter}>{nav.positionLabel}</div>
    </div>,
    document.body,
  );
}
