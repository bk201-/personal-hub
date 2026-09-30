import { beforeEach, describe, expect, it } from 'vitest';
import { useUIStore } from './uiStore';

describe('uiStore', () => {
  beforeEach(() => {
    // Reset store state between tests
    useUIStore.setState({
      selectedChannelId: null,
      selectedNewsId: null,
      selectedGroupId: null,
      newsFilterMode: 'filtered',
      filterPanelOpen: false,
      hashTagFilter: null,
      sidebarDrawerOpen: false,
      headerHidden: false,
      lightbox: null,
      openAddChannel: false,
      pendingAutoSelectFirst: false,
    });
  });

  it('setSelectedChannelId clears selectedNewsId and hashTagFilter', () => {
    useUIStore.setState({ selectedNewsId: 42, hashTagFilter: '#test' });
    useUIStore.getState().setSelectedChannelId(10);

    const state = useUIStore.getState();
    expect(state.selectedChannelId).toBe(10);
    expect(state.selectedNewsId).toBeNull();
    expect(state.hashTagFilter).toBeNull();
  });

  it('setSelectedChannelId closes sidebar drawer', () => {
    useUIStore.setState({ sidebarDrawerOpen: true });
    useUIStore.getState().setSelectedChannelId(1);
    expect(useUIStore.getState().sidebarDrawerOpen).toBe(false);
  });

  it('setSelectedGroupId clears channel and news selection', () => {
    useUIStore.setState({ selectedChannelId: 5, selectedNewsId: 42 });
    useUIStore.getState().setSelectedGroupId(3);

    const state = useUIStore.getState();
    expect(state.selectedGroupId).toBe(3);
    expect(state.selectedChannelId).toBeNull();
    expect(state.selectedNewsId).toBeNull();
  });

  it('toggleTheme flips isDarkTheme and persists to localStorage', () => {
    const initial = useUIStore.getState().isDarkTheme;
    useUIStore.getState().toggleTheme();
    expect(useUIStore.getState().isDarkTheme).toBe(!initial);
    expect(localStorage.getItem('theme')).toBe(!initial ? 'dark' : 'light');
  });

  it('setNewsViewMode persists to localStorage', () => {
    useUIStore.getState().setNewsViewMode('accordion');
    expect(useUIStore.getState().newsViewMode).toBe('accordion');
    expect(localStorage.getItem('newsViewMode')).toBe('accordion');
  });

  it('toggleDownloadsPanelPin toggles and persists', () => {
    expect(useUIStore.getState().downloadsPanelPinned).toBe(false);
    useUIStore.getState().toggleDownloadsPanelPin();
    expect(useUIStore.getState().downloadsPanelPinned).toBe(true);
    expect(localStorage.getItem('downloadsPanelPinned')).toBe('true');
  });

  it('toggleAutoAdvance toggles and persists', () => {
    expect(useUIStore.getState().autoAdvance).toBe(false);
    useUIStore.getState().toggleAutoAdvance();
    expect(useUIStore.getState().autoAdvance).toBe(true);
    expect(localStorage.getItem('autoAdvance')).toBe('true');
  });

  it('request/consumeAutoSelectFirst toggles the pending flag', () => {
    expect(useUIStore.getState().pendingAutoSelectFirst).toBe(false);
    useUIStore.getState().requestAutoSelectFirst();
    expect(useUIStore.getState().pendingAutoSelectFirst).toBe(true);
    useUIStore.getState().consumeAutoSelectFirst();
    expect(useUIStore.getState().pendingAutoSelectFirst).toBe(false);
  });

  it('openLightbox / closeLightbox / setLightboxAlbumIndex', () => {
    useUIStore.getState().openLightbox(1, 0, 10);
    expect(useUIStore.getState().lightbox).toEqual({ newsId: 1, albumIndex: 0, channelId: 10 });

    useUIStore.getState().setLightboxAlbumIndex(2);
    expect(useUIStore.getState().lightbox!.albumIndex).toBe(2);

    useUIStore.getState().closeLightbox();
    expect(useUIStore.getState().lightbox).toBeNull();
  });

  it('setLightboxAlbumIndex is no-op when lightbox is null', () => {
    useUIStore.getState().setLightboxAlbumIndex(5);
    expect(useUIStore.getState().lightbox).toBeNull();
  });

  it('setSelectedNewsId sets the selected news id', () => {
    useUIStore.getState().setSelectedNewsId(42);
    expect(useUIStore.getState().selectedNewsId).toBe(42);
  });

  it('setNewsFilterMode sets the filter mode', () => {
    useUIStore.getState().setNewsFilterMode('all');
    expect(useUIStore.getState().newsFilterMode).toBe('all');
    useUIStore.getState().setNewsFilterMode('hidden');
    expect(useUIStore.getState().newsFilterMode).toBe('hidden');
    useUIStore.getState().setNewsFilterMode('filtered');
    expect(useUIStore.getState().newsFilterMode).toBe('filtered');
  });

  it('cycleNewsFilterMode cycles filtered → all → hidden → filtered', () => {
    // Start at default 'filtered'
    expect(useUIStore.getState().newsFilterMode).toBe('filtered');
    useUIStore.getState().cycleNewsFilterMode();
    expect(useUIStore.getState().newsFilterMode).toBe('all');
    useUIStore.getState().cycleNewsFilterMode();
    expect(useUIStore.getState().newsFilterMode).toBe('hidden');
    useUIStore.getState().cycleNewsFilterMode();
    expect(useUIStore.getState().newsFilterMode).toBe('filtered');
  });

  it('setFilterPanelOpen toggles filterPanelOpen', () => {
    useUIStore.getState().setFilterPanelOpen(true);
    expect(useUIStore.getState().filterPanelOpen).toBe(true);
    useUIStore.getState().setFilterPanelOpen(false);
    expect(useUIStore.getState().filterPanelOpen).toBe(false);
  });

  it('setHashTagFilter sets hashTagFilter', () => {
    useUIStore.getState().setHashTagFilter('#test');
    expect(useUIStore.getState().hashTagFilter).toBe('#test');
    useUIStore.getState().setHashTagFilter(null);
    expect(useUIStore.getState().hashTagFilter).toBeNull();
  });

  it('setSidebarDrawerOpen sets sidebarDrawerOpen', () => {
    useUIStore.getState().setSidebarDrawerOpen(true);
    expect(useUIStore.getState().sidebarDrawerOpen).toBe(true);
  });

  it('setHeaderHidden sets headerHidden', () => {
    useUIStore.getState().setHeaderHidden(true);
    expect(useUIStore.getState().headerHidden).toBe(true);
  });

  it('setOpenAddChannel sets openAddChannel', () => {
    useUIStore.getState().setOpenAddChannel(true);
    expect(useUIStore.getState().openAddChannel).toBe(true);
  });
});
