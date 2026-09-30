import { useCallback, useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';

/**
 * Tracks scroll progress of an element relative to the viewport.
 * Returns a value from 0 to 1:
 *  - 0 = the element just started scrolling (top is at/below stickyOffset)
 *  - 1 = the bottom of the element is visible in the viewport
 *
 * @param containerRef - ref to the scrollable element whose progress to track
 * @param stickyOffset - px from viewport top where sticky header ends (content starts)
 * @param enabled - only track when true (e.g. variant === 'inline')
 */
export function useScrollProgress(
  containerRef: RefObject<HTMLElement | null>,
  stickyOffset: number,
  enabled: boolean,
): number {
  const [progress, setProgress] = useState(0);
  const rafRef = useRef(0);

  const calculate = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;

    const rect = el.getBoundingClientRect();
    const viewportHeight = window.innerHeight;

    // Total scrollable distance: from when the element top hits stickyOffset
    // to when the element bottom reaches the viewport bottom.
    // scrollableDistance = elementHeight - (viewportHeight - stickyOffset)
    const visibleArea = viewportHeight - stickyOffset;
    const scrollableDistance = rect.height - visibleArea;

    if (scrollableDistance <= 0) {
      // Element fits entirely in the visible area — always 100%
      setProgress(1);
      return;
    }

    // How far we've scrolled: stickyOffset - rect.top
    // (rect.top decreases as we scroll down)
    const scrolled = stickyOffset - rect.top;

    const p = Math.min(1, Math.max(0, scrolled / scrollableDistance));
    setProgress(p);
  }, [containerRef, stickyOffset]);

  useEffect(() => {
    if (!enabled) {
      setProgress(0);
      return;
    }

    const onScroll = () => {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(calculate);
    };

    // Initial calculation
    calculate();

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [enabled, calculate]);

  return progress;
}
