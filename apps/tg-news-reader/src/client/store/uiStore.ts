import { create } from 'zustand';
import { BP_XL } from '../hooks/breakpoints';

export type NewsViewMode = 'list' | 'accordion';

/**
 * Three-state filter mode for the news feed, cycled by a single toolbar button:
 *   'filtered' — only items that pass active filters (default; legacy showAll=false)
 *   'all'      — every loaded item, with filter-rejected ones dimmed (legacy showAll=true)
 *   'hidden'   — only items rejected by filters (NEW)
 *
 * Cycle order: filtered → all → hidden → filtered.
 */
export type NewsFilterMode = 'filtered' | 'all' | 'hidden';

export const NEWS_FILTER_MODE_CYCLE: NewsFilterMode[] = ['filtered', 'all', 'hidden'];

export function nextNewsFilterMode(mode: NewsFilterMode): NewsFilterMode {
  const idx = NEWS_FILTER_MODE_CYCLE.indexOf(mode);
  return NEWS_FILTER_MODE_CYCLE[(idx + 1) % NEWS_FILTER_MODE_CYCLE.length];
}

export interface LightboxState {
  newsId: number;
  albumIndex: number;
  channelId: number;
}

interface UIStore {
  selectedChannelId: number | null;
  setSelectedChannelId: (id: number | null) => void;
  selectedNewsId: number | null;
  setSelectedNewsId: (id: number | null) => void;
  // null = "Общее" (ungrouped channels), number = specific group id
  selectedGroupId: number | null;
  setSelectedGroupId: (id: number | null) => void;
  newsFilterMode: NewsFilterMode;
  setNewsFilterMode: (mode: NewsFilterMode) => void;
  cycleNewsFilterMode: () => void;
  filterPanelOpen: boolean;
  setFilterPanelOpen: (v: boolean) => void;
  hashTagFilter: string | null;
  setHashTagFilter: (tag: string | null) => void;
  isDarkTheme: boolean;
  toggleTheme: () => void;
  // Downloads panel — when pinned, renders as inline sidebar next to news feed
  downloadsPanelPinned: boolean;
  toggleDownloadsPanelPin: () => void;
  // Mobile sidebar drawer
  sidebarDrawerOpen: boolean;
  setSidebarDrawerOpen: (v: boolean) => void;
  // News view mode: 2-pane list or accordion
  newsViewMode: NewsViewMode;
  setNewsViewMode: (mode: NewsViewMode) => void;
  // Auto-advance to next channel after fetch with no new items
  autoAdvance: boolean;
  toggleAutoAdvance: () => void;
  // Set when auto-advance switches channel: the feed should select the first
  // news item once the new channel's list has loaded (if any). Consumed once.
  pendingAutoSelectFirst: boolean;
  requestAutoSelectFirst: () => void;
  consumeAutoSelectFirst: () => void;
  // Mobile header hide-on-scroll
  headerHidden: boolean;
  setHeaderHidden: (v: boolean) => void;
  // Lightbox
  lightbox: LightboxState | null;
  openLightbox: (newsId: number, albumIndex: number, channelId: number) => void;
  closeLightbox: () => void;
  setLightboxAlbumIndex: (index: number) => void;
  // Signal to ChannelSidebar to auto-open the create modal
  openAddChannel: boolean;
  setOpenAddChannel: (v: boolean) => void;
  // News body font size (100–200, step 10)
  newsFontSize: number;
  setNewsFontSize: (n: number) => void;
  /** Last-used AI TTS voice (persisted). `null` until the user picks one — UI falls back to server default. */
  ttsVoice: string | null;
  setTtsVoice: (v: string) => void;
}

export const useUIStore = create<UIStore>()((set) => ({
  selectedChannelId: null,
  setSelectedChannelId: (id) =>
    set({ selectedChannelId: id, selectedNewsId: null, hashTagFilter: null, sidebarDrawerOpen: false }),
  selectedNewsId: null,
  setSelectedNewsId: (id) => set({ selectedNewsId: id }),
  selectedGroupId: null,
  setSelectedGroupId: (id) => set({ selectedGroupId: id, selectedChannelId: null, selectedNewsId: null }),
  newsFilterMode: 'filtered',
  setNewsFilterMode: (mode) => set({ newsFilterMode: mode }),
  cycleNewsFilterMode: () => set((state) => ({ newsFilterMode: nextNewsFilterMode(state.newsFilterMode) })),
  filterPanelOpen: false,
  setFilterPanelOpen: (v) => set({ filterPanelOpen: v }),
  hashTagFilter: null,
  setHashTagFilter: (tag) => set({ hashTagFilter: tag }),
  isDarkTheme:
    localStorage.getItem('theme') !== null
      ? localStorage.getItem('theme') === 'dark'
      : window.matchMedia('(prefers-color-scheme: dark)').matches,
  toggleTheme: () =>
    set((state) => {
      const next = !state.isDarkTheme;
      localStorage.setItem('theme', next ? 'dark' : 'light');
      return { isDarkTheme: next };
    }),
  downloadsPanelPinned: localStorage.getItem('downloadsPanelPinned') === 'true',
  toggleDownloadsPanelPin: () =>
    set((state) => {
      const next = !state.downloadsPanelPinned;
      localStorage.setItem('downloadsPanelPinned', String(next));
      return { downloadsPanelPinned: next };
    }),
  sidebarDrawerOpen: false,
  setSidebarDrawerOpen: (v) => set({ sidebarDrawerOpen: v }),
  newsViewMode:
    (localStorage.getItem('newsViewMode') as NewsViewMode) || (window.innerWidth < BP_XL ? 'accordion' : 'list'),
  setNewsViewMode: (mode) => {
    localStorage.setItem('newsViewMode', mode);
    set({ newsViewMode: mode });
  },
  autoAdvance: localStorage.getItem('autoAdvance') === 'true',
  toggleAutoAdvance: () =>
    set((state) => {
      const next = !state.autoAdvance;
      localStorage.setItem('autoAdvance', String(next));
      return { autoAdvance: next };
    }),
  pendingAutoSelectFirst: false,
  requestAutoSelectFirst: () => set({ pendingAutoSelectFirst: true }),
  consumeAutoSelectFirst: () => set({ pendingAutoSelectFirst: false }),
  headerHidden: false,
  setHeaderHidden: (v) => set({ headerHidden: v }),
  // Lightbox
  lightbox: null,
  openLightbox: (newsId, albumIndex, channelId) => set({ lightbox: { newsId, albumIndex, channelId } }),
  closeLightbox: () => set({ lightbox: null }),
  setLightboxAlbumIndex: (index) =>
    set((state) => (state.lightbox ? { lightbox: { ...state.lightbox, albumIndex: index } } : {})),
  openAddChannel: false,
  setOpenAddChannel: (v) => set({ openAddChannel: v }),
  newsFontSize: Number(localStorage.getItem('newsFontSize')) || 100,
  setNewsFontSize: (n) => {
    const clamped = Math.max(100, Math.min(200, n));
    localStorage.setItem('newsFontSize', String(clamped));
    set({ newsFontSize: clamped });
  },
  ttsVoice: localStorage.getItem('ttsVoice'),
  setTtsVoice: (v) => {
    localStorage.setItem('ttsVoice', v);
    set({ ttsVoice: v });
  },
}));
