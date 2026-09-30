import { createStyles } from 'antd-style';
import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import type { MouseEvent, RefObject } from 'react';
import { mediaUrl } from '../../../api/mediaUrl';
import { useLightboxMediaStyles } from './LightboxMedia.styles';
import { fitRotatedVideo } from './videoRotation';

const useStyles = createStyles(
  ({ css }, { angle, size }: { angle: number; size: ReturnType<typeof fitRotatedVideo> }) => ({
    video: css`
    display: block;
    flex-shrink: 0;
    object-fit: contain;
    border-radius: 4px;
    outline: none;
    width: ${size ? `${size.width}px` : 'auto'};
    height: ${size ? `${size.height}px` : 'auto'};
    max-width: ${size ? 'none' : '100%'};
    max-height: ${size ? 'none' : '100%'};
    transform: rotate(${angle}deg);
  `,
  }),
);

interface LightboxVideoProps {
  path: string;
  angle: number;
  videoRef: RefObject<HTMLVideoElement | null>;
}

export function LightboxVideo({ path, angle, videoRef }: LightboxVideoProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [media, setMedia] = useState({ width: 0, height: 0 });
  const size = fitRotatedVideo(media.width, media.height, viewport.width, viewport.height, angle);
  const { styles } = useStyles({ angle, size });
  const { styles: layout } = useLightboxMediaStyles();

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const measure = () => {
      const { width, height } = container.getBoundingClientRect();
      setViewport((old) => (old.width === width && old.height === height ? old : { width, height }));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const attachVideo = useCallback(
    (element: HTMLVideoElement | null) => {
      videoRef.current = element;
      if (element) {
        element.volume = 0.5;
        void element.play().catch(() => {
          // Autoplay may be blocked; native controls still allow starting playback.
        });
      }
    },
    [videoRef],
  );
  const readDimensions = useCallback(() => {
    const element = videoRef.current;
    if (element) setMedia({ width: element.videoWidth, height: element.videoHeight });
  }, [videoRef]);
  const preventContextMenu = useCallback((event: MouseEvent<HTMLVideoElement>) => event.preventDefault(), []);

  return (
    <div ref={containerRef} className={layout.wrap}>
      <video
        ref={attachVideo}
        src={mediaUrl(path)}
        className={styles.video}
        onLoadedMetadata={readDimensions}
        onResize={readDimensions}
        loop
        controls
        playsInline
        controlsList="noremoteplayback nopictureinpicture"
        disablePictureInPicture
        disableRemotePlayback
        onContextMenu={preventContextMenu}
      />
    </div>
  );
}
