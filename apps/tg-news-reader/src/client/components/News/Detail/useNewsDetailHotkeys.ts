import type { NewsItem } from '@shared/types.ts';
import { useEffect, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { useUIStore } from '../../../store/uiStore';
import { isYouTubeUrl } from '../newsUtils';

interface UseNewsDetailHotkeysOptions {
  item: NewsItem;
  openUrl: string;
  articleQueued: boolean;
  isAlbum: boolean;
  albumLength: number;
  albumExpectedLength: number;
  mediaPending: boolean;
  /** Called on R — refresh news list */
  onRefresh: () => void;
  /** Called on F (single non-YT link) — queue article extraction */
  onExtractArticle: (url: string) => void;
  /** Called on S — share / copy link */
  onShare: () => void;
}

export interface UseNewsDetailHotkeysResult {
  albumIndex: number;
  setAlbumIndex: Dispatch<SetStateAction<number>>;
  topPanel: 'links' | 'text' | null;
  setTopPanel: Dispatch<SetStateAction<'links' | 'text' | null>>;
  linkModalOpen: boolean;
  setLinkModalOpen: Dispatch<SetStateAction<boolean>>;
  selectedUrl: string;
  setSelectedUrl: Dispatch<SetStateAction<string>>;
}

/**
 * Manages keyboard hotkeys for the news detail view (capture phase so it fires
 * before useNewsHotkeys which listens in the bubble phase).
 *
 * Also owns the UI state driven by those hotkeys so NewsDetail stays lean.
 * State is reset automatically when the viewed item changes (item.id).
 *
 * R             — refresh news list
 * L             — toggle links panel
 * T             — toggle text panel
 * F             — fetch/queue article (link_continuation channels)
 * S             — share / copy link
 * Enter         — open URL in new tab
 * Escape        — close top panel
 * ArrowLeft/Right — navigate album images
 * Space         — advance album (blocks mark-as-read while album has unseen images)
 *
 * All letter keys use e.code so they work regardless of keyboard layout
 * (Russian, Czech, etc.).
 */
export function useNewsDetailHotkeys({
  item,
  openUrl,
  articleQueued,
  isAlbum,
  albumLength,
  albumExpectedLength,
  mediaPending,
  onRefresh,
  onExtractArticle,
  onShare,
}: UseNewsDetailHotkeysOptions): UseNewsDetailHotkeysResult {
  const [topPanel, setTopPanel] = useState<'links' | 'text' | null>(null);
  const [albumIndex, setAlbumIndex] = useState(0);
  const [linkModalOpen, setLinkModalOpen] = useState(false);
  const [selectedUrl, setSelectedUrl] = useState('');

  // Note: no reset effect needed.
  // In list mode NewsDetail gets key={item.id} and remounts on item change.
  // In accordion mode each item renders its own NewsDetail instance, so
  // the item prop never changes for a given component instance.

  useEffect(() => {
    // Derive links inside the effect so the stable item.links reference
    // is used as the dependency (avoids a new [] on every render).
    const links = item.links || [];
    const onKey = (e: KeyboardEvent) => {
      if (useUIStore.getState().lightbox) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
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

      // Use e.code for letter keys so hotkeys work regardless of keyboard layout
      // (Russian, Czech, etc. produce different e.key values for the same physical key).
      // e.code always reflects physical key position: 'KeyR', 'KeyL', 'KeyT', 'KeyF'.
      // Arrow keys, Space, Enter, Escape are layout-independent — e.key is fine there.
      switch (e.code) {
        case 'KeyR':
          e.preventDefault();
          onRefresh();
          break;
        case 'KeyL':
          if (links.length > 0) {
            e.preventDefault();
            setTopPanel((p) => (p === 'links' ? null : 'links'));
          }
          break;
        case 'KeyT':
          if (item.text) {
            e.preventDefault();
            setTopPanel((p) => (p === 'text' ? null : 'text'));
          }
          break;
        case 'KeyF': {
          const nonYt = links.filter((l) => !isYouTubeUrl(l));
          if (item.canLoadArticle === 1 && !item.fullContent && nonYt.length > 0 && !articleQueued) {
            e.preventDefault();
            if (nonYt.length === 1) {
              onExtractArticle(nonYt[0]);
            } else {
              setSelectedUrl(nonYt[0]);
              setLinkModalOpen(true);
            }
          }
          break;
        }
        case 'KeyS':
          e.preventDefault();
          onShare();
          break;
        case 'Enter':
          e.preventDefault();
          window.open(openUrl, '_blank', 'noopener,noreferrer');
          break;
        case 'Escape':
          if (topPanel) {
            e.preventDefault();
            setTopPanel(null);
          }
          break;
        case 'ArrowLeft':
          if (isAlbum && albumIndex > 0) {
            e.preventDefault();
            e.stopImmediatePropagation();
            setAlbumIndex((i) => i - 1);
          }
          break;
        case 'ArrowRight':
          if (isAlbum && albumIndex < albumLength - 1) {
            e.preventDefault();
            e.stopImmediatePropagation();
            setAlbumIndex((i) => i + 1);
          }
          break;
        case 'Space':
          // Wait for missing media only while a download can still deliver it.
          if (albumIndex < albumLength - 1 || (mediaPending && albumIndex < albumExpectedLength - 1)) {
            e.preventDefault();
            e.stopImmediatePropagation();
            // Navigate only within already-downloaded images
            if (albumIndex < albumLength - 1) setAlbumIndex((i) => i + 1);
          }
          break;
      }
    };

    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true });
  }, [
    item.links,
    item.text,
    item.fullContent,
    item.canLoadArticle,
    openUrl,
    topPanel,
    articleQueued,
    isAlbum,
    albumIndex,
    albumLength,
    albumExpectedLength,
    mediaPending,
    onRefresh,
    onExtractArticle,
    onShare,
  ]);

  return {
    albumIndex,
    setAlbumIndex,
    topPanel,
    setTopPanel,
    linkModalOpen,
    setLinkModalOpen,
    selectedUrl,
    setSelectedUrl,
  };
}
