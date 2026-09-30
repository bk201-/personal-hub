import type { NewsItem } from '@shared/types';
import { act, renderHook } from '@testing-library/react';
import type { Mock } from 'vitest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useNewsDetailHotkeys } from './useNewsDetailHotkeys';

function makeItem(overrides: Partial<NewsItem> = {}): NewsItem {
  return {
    id: 1,
    channelId: 1,
    telegramMsgId: 10,
    text: 'some text',
    links: ['https://example.com'],
    hashtags: [],
    isRead: 0,
    postedAt: 1700000000,
    ...overrides,
  };
}

function fireKey(code: string, opts: Partial<KeyboardEvent> = {}) {
  const event = new KeyboardEvent('keydown', { code, bubbles: true, cancelable: true, ...opts });
  document.body.dispatchEvent(event);
  return event;
}

function fireKeyWithTarget(code: string, target: HTMLElement) {
  const event = new KeyboardEvent('keydown', { code, bubbles: true, cancelable: true });
  target.dispatchEvent(event);
}

describe('useNewsDetailHotkeys', () => {
  let onRefresh: Mock<() => void>;
  let onExtractArticle: Mock<() => void>;
  let onShare: Mock<() => void>;
  let windowOpenSpy: ReturnType<typeof vi.spyOn>;

  const defaultOpts = () => ({
    item: makeItem(),
    openUrl: 'https://example.com',
    articleQueued: false,
    isAlbum: false,
    albumLength: 0,
    albumExpectedLength: 0,
    mediaPending: false,
    onRefresh,
    onExtractArticle,
    onShare,
  });

  beforeEach(() => {
    onRefresh = vi.fn();
    onExtractArticle = vi.fn();
    onShare = vi.fn();
    windowOpenSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
  });

  it('R key calls onRefresh', () => {
    renderHook(() => useNewsDetailHotkeys(defaultOpts()));
    fireKey('KeyR');
    expect(onRefresh).toHaveBeenCalled();
  });

  it('L key toggles links panel', () => {
    const { result } = renderHook(() => useNewsDetailHotkeys(defaultOpts()));
    expect(result.current.topPanel).toBeNull();
    act(() => {
      fireKey('KeyL');
    });
    expect(result.current.topPanel).toBe('links');
    act(() => {
      fireKey('KeyL');
    });
    expect(result.current.topPanel).toBeNull();
  });

  it('L key does nothing when no links', () => {
    const opts = { ...defaultOpts(), item: makeItem({ links: [] }) };
    const { result } = renderHook(() => useNewsDetailHotkeys(opts));
    act(() => {
      fireKey('KeyL');
    });
    expect(result.current.topPanel).toBeNull();
  });

  it('T key toggles text panel', () => {
    const { result } = renderHook(() => useNewsDetailHotkeys(defaultOpts()));
    act(() => {
      fireKey('KeyT');
    });
    expect(result.current.topPanel).toBe('text');
    act(() => {
      fireKey('KeyT');
    });
    expect(result.current.topPanel).toBeNull();
  });

  it('T key does nothing when no text', () => {
    const opts = { ...defaultOpts(), item: makeItem({ text: '' }) };
    const { result } = renderHook(() => useNewsDetailHotkeys(opts));
    act(() => {
      fireKey('KeyT');
    });
    expect(result.current.topPanel).toBeNull();
  });

  it('S key calls onShare', () => {
    renderHook(() => useNewsDetailHotkeys(defaultOpts()));
    fireKey('KeyS');
    expect(onShare).toHaveBeenCalled();
  });

  it('Enter opens URL in new tab', () => {
    renderHook(() => useNewsDetailHotkeys(defaultOpts()));
    fireKey('Enter');
    expect(windowOpenSpy).toHaveBeenCalledWith('https://example.com', '_blank', 'noopener,noreferrer');
  });

  it('Escape closes top panel', () => {
    const { result } = renderHook(() => useNewsDetailHotkeys(defaultOpts()));
    act(() => {
      fireKey('KeyL');
    });
    expect(result.current.topPanel).toBe('links');
    act(() => {
      fireKey('Escape');
    });
    expect(result.current.topPanel).toBeNull();
  });

  it('Escape does nothing when no panel open', () => {
    const { result } = renderHook(() => useNewsDetailHotkeys(defaultOpts()));
    act(() => {
      fireKey('Escape');
    });
    expect(result.current.topPanel).toBeNull();
  });

  it('F key with single non-YT link calls onExtractArticle', () => {
    const item = makeItem({
      links: ['https://example.com/article'],
      canLoadArticle: 1,
      fullContent: undefined,
    });
    const opts = { ...defaultOpts(), item };
    renderHook(() => useNewsDetailHotkeys(opts));
    fireKey('KeyF');
    expect(onExtractArticle).toHaveBeenCalledWith('https://example.com/article');
  });

  it('F key with multiple non-YT links opens link modal', () => {
    const item = makeItem({
      links: ['https://a.com', 'https://b.com'],
      canLoadArticle: 1,
      fullContent: undefined,
    });
    const opts = { ...defaultOpts(), item };
    const { result } = renderHook(() => useNewsDetailHotkeys(opts));
    act(() => {
      fireKey('KeyF');
    });
    expect(result.current.linkModalOpen).toBe(true);
    expect(result.current.selectedUrl).toBe('https://a.com');
  });

  it('F key does nothing when articleQueued', () => {
    const item = makeItem({ links: ['https://example.com'], canLoadArticle: 1 });
    const opts = { ...defaultOpts(), item, articleQueued: true };
    renderHook(() => useNewsDetailHotkeys(opts));
    fireKey('KeyF');
    expect(onExtractArticle).not.toHaveBeenCalled();
  });

  it('F key does nothing when canLoadArticle is 0', () => {
    const item = makeItem({ links: ['https://example.com'], canLoadArticle: 0 });
    const opts = { ...defaultOpts(), item };
    renderHook(() => useNewsDetailHotkeys(opts));
    fireKey('KeyF');
    expect(onExtractArticle).not.toHaveBeenCalled();
  });

  // Arrow keys for album navigation
  it('ArrowRight advances album index', () => {
    const opts = { ...defaultOpts(), isAlbum: true, albumLength: 3, albumExpectedLength: 3 };
    const { result } = renderHook(() => useNewsDetailHotkeys(opts));
    expect(result.current.albumIndex).toBe(0);
    act(() => {
      fireKey('ArrowRight');
    });
    expect(result.current.albumIndex).toBe(1);
  });

  it('ArrowLeft decreases album index', () => {
    const opts = { ...defaultOpts(), isAlbum: true, albumLength: 3, albumExpectedLength: 3 };
    const { result } = renderHook(() => useNewsDetailHotkeys(opts));
    act(() => {
      fireKey('ArrowRight');
    });
    expect(result.current.albumIndex).toBe(1);
    act(() => {
      fireKey('ArrowLeft');
    });
    expect(result.current.albumIndex).toBe(0);
  });

  it('ArrowLeft does not go below 0', () => {
    const opts = { ...defaultOpts(), isAlbum: true, albumLength: 3, albumExpectedLength: 3 };
    const { result } = renderHook(() => useNewsDetailHotkeys(opts));
    act(() => {
      fireKey('ArrowLeft');
    });
    expect(result.current.albumIndex).toBe(0);
  });

  it('ArrowRight does not exceed albumLength - 1', () => {
    const opts = { ...defaultOpts(), isAlbum: true, albumLength: 2, albumExpectedLength: 2 };
    const { result } = renderHook(() => useNewsDetailHotkeys(opts));
    act(() => {
      fireKey('ArrowRight');
    });
    act(() => {
      fireKey('ArrowRight');
    });
    expect(result.current.albumIndex).toBe(1);
  });

  it('Space blocks mark-as-read when album has unseen images', () => {
    const opts = { ...defaultOpts(), isAlbum: true, albumLength: 3, albumExpectedLength: 3 };
    const { result } = renderHook(() => useNewsDetailHotkeys(opts));
    // albumIndex = 0, expected = 3 → should advance within album
    act(() => {
      fireKey('Space');
    });
    expect(result.current.albumIndex).toBe(1);
  });

  it('Space does not block when at last image', () => {
    const opts = { ...defaultOpts(), isAlbum: true, albumLength: 2, albumExpectedLength: 2 };
    const { result } = renderHook(() => useNewsDetailHotkeys(opts));
    act(() => {
      fireKey('ArrowRight');
    });
    expect(result.current.albumIndex).toBe(1);
    // Now at last image — Space should not advance further
    act(() => {
      fireKey('Space');
    });
    expect(result.current.albumIndex).toBe(1);
  });

  // Modifier key guards
  it('ignores keys with metaKey', () => {
    renderHook(() => useNewsDetailHotkeys(defaultOpts()));
    fireKey('KeyR', { metaKey: true });
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it('ignores keys with ctrlKey', () => {
    renderHook(() => useNewsDetailHotkeys(defaultOpts()));
    fireKey('KeyR', { ctrlKey: true });
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it('ignores keys with altKey', () => {
    renderHook(() => useNewsDetailHotkeys(defaultOpts()));
    fireKey('KeyR', { altKey: true });
    expect(onRefresh).not.toHaveBeenCalled();
  });

  // Input element exclusion
  it('ignores events from input elements', () => {
    renderHook(() => useNewsDetailHotkeys(defaultOpts()));
    const input = document.createElement('input');
    fireKeyWithTarget('KeyR', input);
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it('ignores events from textarea elements', () => {
    renderHook(() => useNewsDetailHotkeys(defaultOpts()));
    const textarea = document.createElement('textarea');
    fireKeyWithTarget('KeyR', textarea);
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it('ignores events from contentEditable elements', () => {
    renderHook(() => useNewsDetailHotkeys(defaultOpts()));
    const div = document.createElement('div');
    div.contentEditable = 'true';
    fireKeyWithTarget('KeyR', div);
    expect(onRefresh).not.toHaveBeenCalled();
  });
});
