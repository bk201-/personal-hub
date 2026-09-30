import { useEffect } from 'react';
import { useUIStore } from '../../../store/uiStore';

/**
 * Syncs the hashTagFilter in uiStore ↔ URL hash (#tag=...).
 * Also resets the filter when channelId changes.
 */
export function useHashTagSync(channelId: number) {
  const { hashTagFilter, setHashTagFilter } = useUIStore();

  // Reset when switching channels
  useEffect(() => {
    setHashTagFilter(null);
  }, [channelId, setHashTagFilter]);

  // Write to URL
  useEffect(() => {
    if (hashTagFilter) {
      history.replaceState(
        null,
        '',
        `${window.location.pathname}${window.location.search}#tag=${encodeURIComponent(hashTagFilter)}`,
      );
    } else {
      history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
    }
  }, [hashTagFilter]);

  // Read from URL (back/forward navigation)
  useEffect(() => {
    const onHashChange = () => {
      const hash = window.location.hash;
      if (!hash || hash === '#') setHashTagFilter(null);
      else if (hash.startsWith('#tag=')) setHashTagFilter(decodeURIComponent(hash.slice(5)));
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, [setHashTagFilter]);

  return { hashTagFilter, setHashTagFilter };
}
