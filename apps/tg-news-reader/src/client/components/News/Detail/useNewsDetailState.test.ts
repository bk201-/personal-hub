import type { DownloadStatus, NewsItem } from '@shared/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHookWithProviders } from '../../../__tests__/renderWithProviders';

// ── Mocks ──────────────────────────────────────────────────────────────
const mockRefreshMutate = vi.fn();
let mockMarkReadIsPending = false;
let mockMediaStatus: DownloadStatus | undefined;

vi.mock('../../../api/news', () => ({
  useMarkRead: () => ({ mutate: vi.fn(), isPending: mockMarkReadIsPending }),
  useExtractContent: () => ({ mutate: vi.fn(), isPending: false }),
  useDownloadMedia: () => ({ mutate: vi.fn(), isPending: false }),
  useRefreshNewsItem: () => ({ mutate: mockRefreshMutate, isPending: false }),
}));

vi.mock('../../../api/downloads', () => ({
  useNewsDownloadTask: (_id: number, type: string) =>
    type === 'media' && mockMediaStatus ? { status: mockMediaStatus } : null,
}));

vi.mock('./useNewsDetailHotkeys', () => ({
  useNewsDetailHotkeys: vi.fn((_opts: { item: NewsItem }) => ({
    albumIndex: 0,
    setAlbumIndex: vi.fn(),
    topPanel: null,
    setTopPanel: vi.fn(),
    linkModalOpen: false,
    setLinkModalOpen: vi.fn(),
    selectedUrl: '',
    setSelectedUrl: vi.fn(),
  })),
}));

import { useNewsDetailHotkeys } from './useNewsDetailHotkeys';
import { useNewsDetailState } from './useNewsDetailState';

function makeItem(overrides: Partial<NewsItem> = {}): NewsItem {
  return {
    id: 1,
    channelId: 1,
    telegramMsgId: 10,
    text: 'some text',
    links: [],
    hashtags: [],
    isRead: 0,
    postedAt: 1700000000,
    ...overrides,
  };
}

describe('useNewsDetailState', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMarkReadIsPending = false;
    mockMediaStatus = undefined;
  });

  it.each(['pending', 'processing', 'done', 'failed', undefined] as const)(
    'passes download status %s to the album Space guard',
    (status) => {
      mockMediaStatus = status;
      renderHookWithProviders(() =>
        useNewsDetailState({
          item: makeItem({ localMediaPaths: ['a.jpg'], albumMsgIds: [1, 2, 3] }),
          channelTelegramId: 'ch',
          variant: 'panel',
        }),
      );
      expect(useNewsDetailHotkeys).toHaveBeenLastCalledWith(
        expect.objectContaining({
          mediaPending: status === 'pending' || status === 'processing',
          albumLength: 1,
          albumExpectedLength: 3,
        }),
      );
    },
  );

  it('openUrl falls back to t.me when no links', () => {
    const { result } = renderHookWithProviders(() =>
      useNewsDetailState({
        item: makeItem({ links: [] }),
        channelTelegramId: 'testchannel',
        variant: 'panel',
      }),
    );
    expect(result.current.openUrl).toBe('https://t.me/testchannel/10');
    expect(result.current.isExternalLink).toBe(false);
  });

  it('openUrl uses first link when available', () => {
    const { result } = renderHookWithProviders(() =>
      useNewsDetailState({
        item: makeItem({ links: ['https://example.com'] }),
        channelTelegramId: 'testchannel',
        variant: 'panel',
      }),
    );
    expect(result.current.openUrl).toBe('https://example.com');
    expect(result.current.isExternalLink).toBe(true);
  });

  it('shareUrl is always t.me link', () => {
    const { result } = renderHookWithProviders(() =>
      useNewsDetailState({
        item: makeItem({ links: ['https://example.com'] }),
        channelTelegramId: 'mychannel',
        variant: 'panel',
      }),
    );
    expect(result.current.shareUrl).toBe('https://t.me/mychannel/10');
  });

  it('isAlbum is true when multiple media paths', () => {
    const { result } = renderHookWithProviders(() =>
      useNewsDetailState({
        item: makeItem({ localMediaPaths: ['a.jpg', 'b.jpg', 'c.jpg'] }),
        channelTelegramId: 'ch',
        variant: 'panel',
      }),
    );
    expect(result.current.isAlbum).toBe(true);
    expect(result.current.albumLength).toBe(3);
  });

  it('isAlbum is false with single or no media', () => {
    const { result } = renderHookWithProviders(() =>
      useNewsDetailState({
        item: makeItem({ localMediaPaths: ['a.jpg'] }),
        channelTelegramId: 'ch',
        variant: 'panel',
      }),
    );
    expect(result.current.isAlbum).toBe(false);
  });

  it('isVideo detects video extensions', () => {
    const { result } = renderHookWithProviders(() =>
      useNewsDetailState({
        item: makeItem({ localMediaPath: 'video.mp4', localMediaPaths: ['video.mp4'] }),
        channelTelegramId: 'ch',
        variant: 'panel',
      }),
    );
    expect(result.current.isVideo).toBe(true);
  });

  it('isAudio detects audio mediaType', () => {
    const { result } = renderHookWithProviders(() =>
      useNewsDetailState({
        item: makeItem({ mediaType: 'audio' }),
        channelTelegramId: 'ch',
        variant: 'panel',
      }),
    );
    expect(result.current.isAudio).toBe(true);
  });

  it('isRead is true when item.isRead === 1', () => {
    const { result } = renderHookWithProviders(() =>
      useNewsDetailState({
        item: makeItem({ isRead: 1 }),
        channelTelegramId: 'ch',
        variant: 'panel',
      }),
    );
    expect(result.current.isRead).toBe(true);
  });

  it('title is set for inline variant', () => {
    const { result } = renderHookWithProviders(() =>
      useNewsDetailState({
        item: makeItem({ text: 'Hello world\nsecond line' }),
        channelTelegramId: 'ch',
        variant: 'inline',
      }),
    );
    expect(result.current.title).toBe('Hello world');
  });

  it('title is undefined for panel variant', () => {
    const { result } = renderHookWithProviders(() =>
      useNewsDetailState({
        item: makeItem({ text: 'Hello world' }),
        channelTelegramId: 'ch',
        variant: 'panel',
      }),
    );
    expect(result.current.title).toBeUndefined();
  });

  it('albumExpectedLength uses albumMsgIds when available', () => {
    const { result } = renderHookWithProviders(() =>
      useNewsDetailState({
        item: makeItem({ localMediaPaths: ['a.jpg'], albumMsgIds: [1, 2, 3, 4] }),
        channelTelegramId: 'ch',
        variant: 'panel',
      }),
    );
    expect(result.current.albumExpectedLength).toBe(4);
  });

  it('handleRefresh is blocked while markRead is pending', () => {
    mockMarkReadIsPending = true;
    const { result } = renderHookWithProviders(() =>
      useNewsDetailState({
        item: makeItem(),
        channelTelegramId: 'ch',
        variant: 'panel',
      }),
    );

    result.current.handleRefresh();
    expect(mockRefreshMutate).not.toHaveBeenCalled();
  });

  it('handleRefresh fires when markRead is not pending', () => {
    mockMarkReadIsPending = false;
    const { result } = renderHookWithProviders(() =>
      useNewsDetailState({
        item: makeItem(),
        channelTelegramId: 'ch',
        variant: 'panel',
      }),
    );

    result.current.handleRefresh();
    expect(mockRefreshMutate).toHaveBeenCalledWith(1);
  });

  it('refreshPending is true when markRead is pending', () => {
    mockMarkReadIsPending = true;
    const { result } = renderHookWithProviders(() =>
      useNewsDetailState({
        item: makeItem(),
        channelTelegramId: 'ch',
        variant: 'panel',
      }),
    );
    expect(result.current.refreshPending).toBe(true);
  });
});
