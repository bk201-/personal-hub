import { useEffect, useRef } from 'react';

/** History state key pushed when the lightbox opens */
const HISTORY_KEY = '_lightboxOpen';

export function useLightboxLifecycle(isOpen: boolean, closeLightbox: () => void) {
  const closedByBackRef = useRef(false);
  const closeRef = useRef(closeLightbox);
  useEffect(() => {
    closeRef.current = closeLightbox;
  }, [closeLightbox]);

  useEffect(() => {
    if (!isOpen) return;
    closedByBackRef.current = false;
    history.pushState({ [HISTORY_KEY]: true }, '');

    const onPop = () => {
      closedByBackRef.current = true;
      closeRef.current();
    };
    window.addEventListener('popstate', onPop);
    return () => {
      window.removeEventListener('popstate', onPop);
      if (!closedByBackRef.current) {
        history.replaceState(null, '', window.location.href);
      }
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // iOS Safari ignores overflow:hidden on body — block touchmove at document level
    const preventScroll = (e: TouchEvent) => {
      // Allow touch on video controls
      if ((e.target as HTMLElement)?.closest?.('video')) return;
      e.preventDefault();
    };
    document.addEventListener('touchmove', preventScroll, { passive: false });

    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener('touchmove', preventScroll);
    };
  }, [isOpen]);
}
