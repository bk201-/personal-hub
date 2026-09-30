import { useEffect } from 'react';
import type { RefObject } from 'react';
import type { LightboxState } from '../../../store/uiStore';
import type { UseLightboxNavResult } from './useLightboxNav';

export function useLightboxInput(
  lightbox: LightboxState | null,
  nav: UseLightboxNavResult,
  closeLightbox: () => void,
  overlayRef: RefObject<HTMLDivElement | null>,
  videoRef: RefObject<HTMLVideoElement | null>,
) {
  useEffect(() => {
    if (lightbox) overlayRef.current?.focus();
  }, [lightbox, overlayRef]);

  useEffect(() => {
    if (!lightbox) return;
    const onKey = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'Escape':
          e.preventDefault();
          e.stopImmediatePropagation();
          closeLightbox();
          break;
        case 'ArrowUp':
          e.preventDefault();
          e.stopImmediatePropagation();
          nav.go(-1);
          break;
        case 'ArrowDown':
          e.preventDefault();
          e.stopImmediatePropagation();
          nav.go(1);
          break;
        case 'ArrowLeft':
          e.preventDefault();
          e.stopImmediatePropagation();
          if (nav.isVideo) {
            if (videoRef.current) videoRef.current.currentTime = Math.max(0, videoRef.current.currentTime - 10);
          } else if (nav.isAlbum) nav.goToAlbumImage(-1);
          else nav.go(-1);
          break;
        case 'ArrowRight':
          e.preventDefault();
          e.stopImmediatePropagation();
          if (nav.isVideo) {
            if (videoRef.current)
              videoRef.current.currentTime = Math.min(
                videoRef.current.duration || Infinity,
                videoRef.current.currentTime + 10,
              );
          } else if (nav.isAlbum) nav.goToAlbumImage(1);
          else nav.go(1);
          break;
        case ' ':
          e.preventDefault();
          e.stopImmediatePropagation();
          if (nav.isVideo) {
            if (videoRef.current) {
              if (videoRef.current.paused) void videoRef.current.play();
              else videoRef.current.pause();
            }
          } else nav.go(1);
          break;
      }
    };
    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true });
  }, [lightbox, closeLightbox, nav, videoRef]);

  useEffect(() => {
    if (!lightbox) return;
    const THRESHOLD = 80;
    const RESET_DELAY = 150;
    let accumulated = 0;
    let resetTimer: ReturnType<typeof setTimeout> | null = null;
    let navigated = false;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      accumulated += e.deltaY;
      if (resetTimer) clearTimeout(resetTimer);
      resetTimer = setTimeout(() => {
        accumulated = 0;
        navigated = false;
      }, RESET_DELAY);
      if (navigated) return;
      if (accumulated > THRESHOLD) {
        navigated = true;
        nav.go(1);
      } else if (accumulated < -THRESHOLD) {
        navigated = true;
        nav.go(-1);
      }
    };
    window.addEventListener('wheel', onWheel, { capture: true, passive: false });
    return () => {
      window.removeEventListener('wheel', onWheel, { capture: true });
      if (resetTimer) clearTimeout(resetTimer);
    };
  }, [lightbox, nav]);

  useEffect(() => {
    if (!lightbox) return;
    const SWIPE_THRESHOLD = 50;
    let startX = 0;
    let startY = 0;
    const onTouchStart = (e: TouchEvent) => {
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
    };
    const onTouchEnd = (e: TouchEvent) => {
      const dx = e.changedTouches[0].clientX - startX;
      const dy = e.changedTouches[0].clientY - startY;
      if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > SWIPE_THRESHOLD) {
        if (nav.isAlbum) nav.goToAlbumImage(dx < 0 ? 1 : -1);
        else nav.go(dx < 0 ? 1 : -1);
      } else if (Math.abs(dy) > SWIPE_THRESHOLD && Math.abs(dy) > Math.abs(dx)) {
        nav.go(dy < 0 ? 1 : -1);
      }
    };
    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchend', onTouchEnd, { passive: true });
    return () => {
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchend', onTouchEnd);
    };
  }, [lightbox, nav]);
}
