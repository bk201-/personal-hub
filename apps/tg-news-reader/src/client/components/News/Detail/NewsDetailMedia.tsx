import { DownloadOutlined, LeftOutlined, LoadingOutlined, RightOutlined, SoundOutlined } from '@ant-design/icons';
import type { NewsItem } from '@shared/types.ts';
import { Button, Typography } from 'antd';
import { createStyles } from 'antd-style';
import React, { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { mediaUrl } from '../../../api/mediaUrl';
import { useUIStore } from '../../../store/uiStore';
import { formatBytes } from '../newsUtils';

const { Text } = Typography;

const CURSOR_POINTER = { cursor: 'pointer' as const };
const ICON_DOWNLOAD = <DownloadOutlined />;
const ICON_LOADING = <LoadingOutlined />;

const useStyles = createStyles(({ css, token }) => ({
  media: css`
    text-align: center;
    margin-bottom: 12px;
    width: 100%;
  `,
  mediaAlbum: css`
    text-align: left;
  `,
  mediaFile: css`
    display: block;
    max-width: 100%;
    max-height: calc(100vh - 300px);
    width: auto;
    height: auto;
    object-fit: contain;
    border-radius: 8px;
    margin: 0 auto;
    cursor: pointer;
  `,
  audioPlayer: css`
    display: block;
    width: 100%;
    max-width: 480px;
    margin: 0 auto;
  `,
  audioPlaceholder: css`
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 24px 16px 12px;
    gap: 4px;
    color: ${token.colorTextSecondary};
    font-size: 32px;
  `,
  carousel: css`
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    &:hover .carousel-btn {
      opacity: 1;
    }
  `,
  carouselBtn: css`
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    z-index: 2;
    background: rgba(0, 0, 0, 0.45);
    color: #fff;
    border: none;
    border-radius: 50%;
    width: 38px;
    height: 38px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 15px;
    cursor: pointer;
    opacity: 0;
    transition:
      opacity 0.18s,
      background 0.18s;
    &:disabled {
      opacity: 0.15 !important;
      cursor: default;
    }
    &:not(:disabled):hover {
      background: rgba(0, 0, 0, 0.65);
    }
  `,
  carouselBtnPrev: css`
    left: 8px;
  `,
  carouselBtnNext: css`
    right: 8px;
  `,
  counter: css`
    text-align: center;
    font-size: 12px;
    color: ${token.colorTextSecondary};
    margin-top: 6px;
  `,
  counterHint: css`
    opacity: 0.6;
  `,
  albumGrid: css`
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
    gap: 6px;
  `,
  albumImg: css`
    width: 100%;
    height: 180px;
    object-fit: cover;
    border-radius: 6px;
    display: block;
  `,
  download: css`
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    margin-bottom: 12px;
    scroll-margin-top: 56px;
    padding-top: 4px;
  `,
  mediaError: css`
    font-size: 12px;
    display: block;
    margin-top: 8px;
  `,
  brokenMedia: css`
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 24px 16px;
    color: ${token.colorTextSecondary};
    font-size: 13px;
  `,
}));

interface NewsDetailMediaProps {
  item: NewsItem;
  firstMediaPath?: string;
  isAlbum: boolean;
  isVideo: boolean;
  /** true when the post is an audio message (shows audio player when downloaded) */
  isAudio: boolean;
  albumIndex: number;
  albumLength: number; // downloaded images count (navigation limit)
  albumExpectedLength: number; // expected total from albumMsgIds (counter)
  onAlbumNav: (delta: -1 | 1) => void;
  mediaLoading: boolean;
  mediaQueued: boolean;
  mediaTaskStatus?: string;
  mediaTaskError?: string;
  onDownload: () => void;
  /** Ref forwarded to the active <video> element so callers can pause it (e.g. before opening lightbox) */
  videoRef?: React.RefObject<HTMLVideoElement | null>;
}

export function NewsDetailMedia({
  item,
  firstMediaPath,
  isAlbum,
  isVideo,
  isAudio,
  albumIndex,
  albumLength,
  albumExpectedLength,
  onAlbumNav,
  mediaLoading,
  mediaQueued,
  mediaTaskStatus,
  mediaTaskError,
  onDownload,
  videoRef,
}: NewsDetailMediaProps) {
  const { styles, cx } = useStyles();
  const { t } = useTranslation();
  const openLightbox = useUIStore((s) => s.openLightbox);
  const isLightboxOpen = useUIStore((s) => s.lightbox !== null);
  const [mediaBroken, setMediaBroken] = useState(false);

  // Video is unmounted while the lightbox is open — this reliably stops playback
  // (pause() via ref can be ignored by the browser when autoPlay is active).
  // The video remounts when the lightbox closes.
  //
  // BUT: Chromium has a long-standing quirk where a <video> element removed from
  // the DOM mid-playback can keep its audio pipeline alive briefly (until GC),
  // so the user hears ghost audio from the "removed" element while the lightbox
  // video plays in parallel. We use React 19's ref-callback cleanup form to
  // synchronously tear down the media element before React unmounts it:
  // pause → mute → drop src → load(). This forces the browser to release the
  // decoder pipeline immediately, so audio stops the instant the lightbox opens.
  const videoRefCallback = useCallback(
    (el: HTMLVideoElement | null) => {
      if (videoRef) videoRef.current = el;
      if (!el) return;
      return () => {
        try {
          el.pause();
          el.muted = true;
          el.removeAttribute('src');
          el.load();
        } catch {
          // Best-effort cleanup — never throw from a ref callback
        }
        if (videoRef) videoRef.current = null;
      };
    },
    [videoRef],
  );

  // Cache-buster: incremented after a successful re-download so the browser
  // doesn't serve the previously-cached 404 response for the same URL.
  const [cacheBuster, setCacheBuster] = useState(0);

  // Reset broken state when switching items or after successful re-download.
  const resetKey = `${item.id}:${firstMediaPath}`;
  const [prevResetKey, setPrevResetKey] = useState(resetKey);
  if (resetKey !== prevResetKey) {
    setPrevResetKey(resetKey);
    setMediaBroken(false);
  }

  // Detect when a download task completes: status transitions from
  // 'processing'/'pending' to undefined (task cleaned up after done).
  // At that point reset the broken state and bump cache-buster.
  const [prevTaskStatus, setPrevTaskStatus] = useState(mediaTaskStatus);
  if (mediaTaskStatus !== prevTaskStatus) {
    setPrevTaskStatus(mediaTaskStatus);
    if (!mediaTaskStatus && prevTaskStatus && mediaBroken) {
      setMediaBroken(false);
      setCacheBuster((n) => n + 1);
    }
  }

  /** mediaUrl with cache-buster appended after re-downloads */
  const murl = (path: string) => {
    const base = mediaUrl(path);
    return cacheBuster > 0 ? `${base}&_r=${cacheBuster}` : base;
  };

  const handleMediaBroken = useCallback(() => setMediaBroken(true), []);
  const handleNavPrev = useCallback(() => onAlbumNav(-1), [onAlbumNav]);
  const handleNavNext = useCallback(() => onAlbumNav(1), [onAlbumNav]);
  const handleOpenLightboxAlbum = useCallback(() => {
    videoRef?.current?.pause();
    openLightbox(item.id, albumIndex, item.channelId);
  }, [openLightbox, item.id, albumIndex, item.channelId, videoRef]);
  const handleOpenLightboxSingle = useCallback(() => {
    videoRef?.current?.pause();
    openLightbox(item.id, 0, item.channelId);
  }, [openLightbox, item.id, item.channelId, videoRef]);
  const downloadIcon = mediaLoading ? ICON_LOADING : ICON_DOWNLOAD;

  // When media file is missing on server (404), show re-download button
  if (mediaBroken && firstMediaPath) {
    return (
      <div className={styles.brokenMedia}>
        <span>{t('news.detail.media_missing')}</span>
        <Button icon={downloadIcon} onClick={onDownload} loading={mediaLoading} disabled={mediaQueued}>
          {mediaQueued ? t('news.detail.queued') : t('news.detail.redownload_media')}
        </Button>
        {mediaTaskStatus === 'failed' && (
          <Text type="danger" className={styles.mediaError}>
            {t('news.detail.error', { error: mediaTaskError })}
          </Text>
        )}
      </div>
    );
  }

  if (isAlbum) {
    const paths = item.localMediaPaths!;
    const currentPath = paths[albumIndex];
    const currentIsVideo = /\.(mp4|webm|mov)$/i.test(currentPath ?? '');
    return (
      <div className={cx(styles.media, styles.mediaAlbum)}>
        <div className={styles.carousel}>
          <button
            className={cx(styles.carouselBtn, styles.carouselBtnPrev, 'carousel-btn')}
            onClick={handleNavPrev}
            disabled={albumIndex === 0}
            aria-label={t('news.detail.prev')}
          >
            <LeftOutlined />
          </button>
          {currentIsVideo ? (
            !isLightboxOpen ? (
              <video
                ref={videoRefCallback}
                key={currentPath}
                src={murl(currentPath)}
                className={styles.mediaFile}
                controls
                muted
                autoPlay
                loop
                disablePictureInPicture
                onClick={handleOpenLightboxAlbum}
                onError={handleMediaBroken}
                style={CURSOR_POINTER}
              />
            ) : null
          ) : (
            <img
              src={murl(currentPath)}
              alt={t('news.detail.photo_alt', { current: albumIndex + 1, total: albumExpectedLength })}
              className={styles.mediaFile}
              onClick={handleOpenLightboxAlbum}
              onError={handleMediaBroken}
            />
          )}
          <button
            className={cx(styles.carouselBtn, styles.carouselBtnNext, 'carousel-btn')}
            onClick={handleNavNext}
            disabled={albumIndex === albumLength - 1}
            aria-label={t('news.detail.next')}
          >
            <RightOutlined />
          </button>
        </div>
        <div className={styles.counter}>
          {/* Show expected total so the user sees e.g. "2 / 10" even when only 2 are downloaded */}
          <span>
            {albumIndex + 1} / {albumExpectedLength}
          </span>
          {albumIndex >= (mediaLoading || mediaQueued ? albumExpectedLength : albumLength) - 1 && (
            <span className={styles.counterHint}>{t('news.detail.space_hint')}</span>
          )}
        </div>
      </div>
    );
  }

  if (firstMediaPath) {
    return (
      <div className={styles.media}>
        {isAudio ? (
          <>
            <div className={styles.audioPlaceholder}>
              <SoundOutlined />
            </div>
            <audio src={murl(firstMediaPath)} controls className={styles.audioPlayer} onError={handleMediaBroken} />
          </>
        ) : isVideo ? (
          !isLightboxOpen ? (
            <video
              ref={videoRefCallback}
              src={murl(firstMediaPath)}
              controls
              muted
              autoPlay
              loop
              disablePictureInPicture
              className={styles.mediaFile}
              onClick={handleOpenLightboxSingle}
              onError={handleMediaBroken}
              style={CURSOR_POINTER}
            />
          ) : null
        ) : (
          <img
            src={murl(firstMediaPath)}
            alt="media"
            className={styles.mediaFile}
            onClick={handleOpenLightboxSingle}
            onError={handleMediaBroken}
          />
        )}
      </div>
    );
  }

  if (item.mediaType && item.mediaType !== 'webpage' && item.mediaType !== 'other') {
    return (
      <div className={styles.download}>
        <Button icon={downloadIcon} onClick={onDownload} loading={mediaLoading} disabled={mediaQueued}>
          {mediaQueued
            ? t('news.detail.queued')
            : mediaTaskStatus === 'failed'
              ? t('news.detail.retry_download')
              : item.mediaSize
                ? t('news.detail.download_media_size', { size: formatBytes(item.mediaSize) })
                : t('news.detail.download_media')}
        </Button>
        {mediaTaskStatus === 'failed' && (
          <Text type="danger" className={styles.mediaError}>
            {t('news.detail.error', { error: mediaTaskError })}
          </Text>
        )}
      </div>
    );
  }

  return null;
}
