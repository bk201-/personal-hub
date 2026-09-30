import type { NewsItem } from '@shared/types.ts';
import { useEffect } from 'react';

/**
 * Binds ↑/↓ navigation and Space key for the news list.
 * Space logic (mark-read vs advance) is delegated to `onSpaceKey`
 * so the hook stays decoupled from mutations.
 */
export function useNewsHotkeys(
  displayItems: NewsItem[],
  selectedNewsId: number | null,
  setSelectedNewsId: (id: number | null) => void,
  onSpaceKey: (item: NewsItem) => void,
) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName.toLowerCase();
      if (
        tag === 'input' ||
        tag === 'textarea' ||
        tag === 'button' ||
        tag === 'a' ||
        tag === 'video' ||
        (e.target as HTMLElement).isContentEditable
      )
        return;

      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (displayItems.length === 0) return;
        if (!selectedNewsId) {
          setSelectedNewsId(displayItems[0].id);
          return;
        }
        const idx = displayItems.findIndex((n) => n.id === selectedNewsId);
        if (e.key === 'ArrowDown' && idx < displayItems.length - 1) setSelectedNewsId(displayItems[idx + 1].id);
        if (e.key === 'ArrowUp' && idx > 0) setSelectedNewsId(displayItems[idx - 1].id);
        return;
      }

      if (e.key === ' ' && selectedNewsId) {
        e.preventDefault();
        const item = displayItems.find((n) => n.id === selectedNewsId);
        if (item) onSpaceKey(item);
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [displayItems, selectedNewsId, setSelectedNewsId, onSpaceKey]);
}
