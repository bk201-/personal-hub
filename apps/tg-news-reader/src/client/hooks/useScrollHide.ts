import { useEffect, useRef } from 'react';
import { useUIStore } from '../store/uiStore';

const HIDE_DELTA = 10; // px scrolled down before header hides
const SHOW_DELTA = 5; // px scrolled up before header shows
const TOP_THRESHOLD = 60; // px from top — always show header

/**
 * Watches scroll events on the given element ref.
 * Sets `headerHidden` in uiStore based on scroll direction.
 * Only active when `enabled` is true (i.e., on mobile accordion view).
 * Automatically resets headerHidden to false on cleanup.
 */
export function useScrollHide(scrollRef: React.RefObject<HTMLElement | null>, enabled: boolean): void {
  const lastScrollTop = useRef(0);
  const setHeaderHidden = useUIStore((s) => s.setHeaderHidden);

  useEffect(() => {
    if (!enabled) {
      setHeaderHidden(false);
      return;
    }

    const el = scrollRef.current;
    if (!el) return;

    const onScroll = () => {
      const st = el.scrollTop;

      // Always show header when near the top
      if (st < TOP_THRESHOLD) {
        setHeaderHidden(false);
        lastScrollTop.current = st;
        return;
      }

      const delta = st - lastScrollTop.current;
      if (delta > HIDE_DELTA) {
        setHeaderHidden(true);
        lastScrollTop.current = st;
      } else if (delta < -SHOW_DELTA) {
        setHeaderHidden(false);
        lastScrollTop.current = st;
      }
    };

    el.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      el.removeEventListener('scroll', onScroll);
      setHeaderHidden(false);
    };
  }, [enabled, scrollRef, setHeaderHidden]);
}
