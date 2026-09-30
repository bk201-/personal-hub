import { LoadingOutlined } from '@ant-design/icons';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { mediaUrl } from '../../../api/mediaUrl';
import { useLightboxMediaStyles } from './LightboxMedia.styles';
import { isVideoPath } from './lightboxMediaPaths';
import { LightboxVideo } from './LightboxVideo';

/** Max number of silent auto-retries before showing error UI */
const MAX_AUTO_RETRIES = 2;
/** Delay between auto-retries (ms) — gives time for file to finish writing */
const AUTO_RETRY_DELAY = 1500;

interface LightboxMediaProps {
  path: string | undefined;
  isAlbum: boolean;
  albumIndex: number;
  albumPaths: string[] | undefined;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  failed?: boolean;
  empty?: boolean;
  rotation?: number;
}

export function LightboxMedia({
  path,
  isAlbum,
  albumIndex,
  albumPaths,
  videoRef,
  failed = false,
  empty = false,
  rotation = 0,
}: LightboxMediaProps) {
  const { styles } = useLightboxMediaStyles();
  const { t } = useTranslation();

  const displayPath = isAlbum && albumPaths ? (albumPaths[albumIndex] ?? path) : path;
  // Per-item video detection: when navigating an album the current item may differ
  // from the first item that isVideo was computed from (e.g. video at index 0, photos at 1-3).
  const currentIsVideo = isVideoPath(displayPath ?? '');

  // Track loading/error per src — reset when displayPath changes without useEffect
  // (React "adjust state during render" pattern to avoid cascading-render lint error).
  const [trackedPath, setTrackedPath] = useState(displayPath);
  const [imgLoading, setImgLoading] = useState(!!displayPath);
  const [imgError, setImgError] = useState(false);
  // Auto-retry: silently reload the image with a cache-buster before showing error UI
  const [retryCount, setRetryCount] = useState(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  if (trackedPath !== displayPath) {
    setTrackedPath(displayPath);
    setImgLoading(!!displayPath);
    setImgError(false);
    setRetryCount(0);
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
  }

  // Cleanup timer on unmount
  useEffect(
    () => () => {
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    },
    [],
  );

  const handleImgError = useCallback(() => {
    if (retryCount < MAX_AUTO_RETRIES) {
      // Silent retry after a delay — file might still be writing to disk
      retryTimerRef.current = setTimeout(() => {
        setRetryCount((n) => n + 1);
        setImgLoading(true);
        setImgError(false);
      }, AUTO_RETRY_DELAY);
      setImgLoading(false);
      setImgError(false); // don't show error UI during auto-retry wait
    } else {
      setImgLoading(false);
      setImgError(true);
    }
  }, [retryCount]);

  const handleImgLoad = useCallback(() => {
    setImgLoading(false);
    setImgError(false);
    setRetryCount(0);
  }, []);

  /** Image URL with cache-buster to bypass browser/SW cache on retries */
  const imgSrc = displayPath
    ? retryCount > 0
      ? `${mediaUrl(displayPath)}&_r=${retryCount}`
      : mediaUrl(displayPath)
    : '';

  // No path at all — media not downloaded yet
  if (!displayPath) {
    return (
      <div className={styles.wrap}>
        {failed || empty ? (
          <div className={styles.errorOverlay} role="status">
            {t(failed ? 'lightbox.load_failed' : 'lightbox.no_media')}
          </div>
        ) : (
          <LoadingOutlined className={styles.spinner} aria-label={t('lightbox.loading_images')} />
        )}
      </div>
    );
  }

  if (currentIsVideo) {
    return <LightboxVideo key={displayPath} path={displayPath} angle={rotation} videoRef={videoRef} />;
  }
  return (
    <div className={styles.wrap}>
      {/* img intentionally has NO key — reusing the same DOM node lets the
              previous image stay visible while the new src is decoding (Issue 12).
              retryCount in key forces a fresh element after auto-retries. */}
      <img
        key={retryCount}
        src={imgSrc}
        alt=""
        className={styles.media}
        draggable={false}
        onLoad={handleImgLoad}
        onError={handleImgError}
      />
      {/* Spinner overlay while loading — previous image stays visible beneath */}
      {imgLoading && !imgError && (
        <div className={styles.loadingOverlay}>
          <LoadingOutlined className={styles.spinner} />
        </div>
      )}
      {/* Error state — shown only after all auto-retries exhausted */}
      {imgError && (
        <div className={styles.errorOverlay}>
          <span role="status">{t('lightbox.load_failed')}</span>
        </div>
      )}
    </div>
  );
}
