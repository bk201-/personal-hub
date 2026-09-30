import type { NewsItem } from '@shared/types';
import { act, fireEvent, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useNewsHotkeys } from '../Feed/useNewsHotkeys';
import { useNewsDetailHotkeys } from './useNewsDetailHotkeys';

const item: NewsItem = {
  id: 1,
  channelId: 1,
  telegramMsgId: 10,
  text: '',
  links: [],
  hashtags: [],
  isRead: 0,
  postedAt: 1700000000,
};

function setup(albumLength: number, albumExpectedLength: number, mediaPending = false) {
  const onSpace = vi.fn();
  const select = vi.fn();
  const hook = renderHook(
    ({ available, pending }) => {
      useNewsHotkeys([item], item.id, select, onSpace);
      return useNewsDetailHotkeys({
        item,
        openUrl: 'https://example.com',
        articleQueued: false,
        isAlbum: available > 1,
        albumLength: available,
        albumExpectedLength,
        mediaPending: pending,
        onRefresh: vi.fn(),
        onExtractArticle: vi.fn(),
        onShare: vi.fn(),
      });
    },
    { initialProps: { available: albumLength, pending: mediaPending } },
  );
  return { ...hook, onSpace, select };
}

function space() {
  act(() => {
    fireEvent.keyDown(document.body, { key: ' ', code: 'Space' });
  });
}

describe('Space navigation through detail and feed listeners', () => {
  it.each([0, 1, 2])(
    'allows marking read after all %i available media when the Telegram album has missing media',
    (available) => {
      const { onSpace, result } = setup(available, 4);
      for (let i = 1; i < available; i++) {
        space();
        expect(onSpace).not.toHaveBeenCalled();
        expect(result.current.albumIndex).toBe(i);
      }
      space();
      expect(onSpace).toHaveBeenCalledExactlyOnceWith(item);
    },
  );

  it('visits every available album image before marking read', () => {
    const { onSpace, result } = setup(3, 3);
    space();
    expect(result.current.albumIndex).toBe(1);
    expect(onSpace).not.toHaveBeenCalled();
    space();
    expect(result.current.albumIndex).toBe(2);
    expect(onSpace).not.toHaveBeenCalled();
    space();
    expect(onSpace).toHaveBeenCalledExactlyOnceWith(item);
  });

  it('waits during an active download, then resumes when missing media cannot be downloaded', () => {
    const { onSpace, rerender } = setup(1, 4, true);
    space();
    expect(onSpace).not.toHaveBeenCalled();
    rerender({ available: 1, pending: false });
    space();
    expect(onSpace).toHaveBeenCalledExactlyOnceWith(item);
  });

  it('includes newly downloaded images in Space navigation', () => {
    const { onSpace, result, rerender } = setup(1, 3, true);
    space();
    expect(onSpace).not.toHaveBeenCalled();
    rerender({ available: 3, pending: false });
    space();
    expect(result.current.albumIndex).toBe(1);
    space();
    expect(result.current.albumIndex).toBe(2);
    expect(onSpace).not.toHaveBeenCalled();
    space();
    expect(onSpace).toHaveBeenCalledExactlyOnceWith(item);
  });

  it('leaves video playback and volume keys to the focused video', () => {
    const { onSpace, select, result } = setup(3, 3);
    const video = document.createElement('video');
    video.controls = true;
    document.body.appendChild(video);
    try {
      for (const [key, code] of [
        [' ', 'Space'],
        ['ArrowDown', 'ArrowDown'],
        ['ArrowRight', 'ArrowRight'],
      ]) {
        const event = new KeyboardEvent('keydown', { key, code, bubbles: true, cancelable: true });
        act(() => video.dispatchEvent(event));
        expect(event.defaultPrevented).toBe(false);
      }
      expect(result.current.albumIndex).toBe(0);
      expect(onSpace).not.toHaveBeenCalled();
      expect(select).not.toHaveBeenCalled();
    } finally {
      video.remove();
    }
  });
});
