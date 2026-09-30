import { useEffect } from 'react';

interface NewsFeedHotkeysOptions {
  onFetch: () => void;
  onCycleFilterMode: () => void;
  onMarkAllRead: () => void;
  onOpenFilters: () => void;
}

/**
 * Global hotkeys for the news feed toolbar actions.
 * Uses e.code so they work regardless of keyboard layout (Russian, Czech, etc.).
 *
 * U — fetch / update channel from Telegram  (↻ button)
 * A — cycle filter mode: filtered → all → hidden → filtered
 * M — mark all as read
 * P — open filter panel
 */
export function useNewsFeedHotkeys({
  onFetch,
  onCycleFilterMode,
  onMarkAllRead,
  onOpenFilters,
}: NewsFeedHotkeysOptions) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const tag = (e.target as HTMLElement).tagName.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || (e.target as HTMLElement).isContentEditable) return;

      switch (e.code) {
        case 'KeyU':
          e.preventDefault();
          onFetch();
          break;
        case 'KeyA':
          e.preventDefault();
          onCycleFilterMode();
          break;
        case 'KeyM':
          e.preventDefault();
          onMarkAllRead();
          break;
        case 'KeyP':
          e.preventDefault();
          onOpenFilters();
          break;
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onFetch, onCycleFilterMode, onMarkAllRead, onOpenFilters]);
}
