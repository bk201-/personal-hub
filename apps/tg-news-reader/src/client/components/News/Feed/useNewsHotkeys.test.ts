import type { NewsItem } from '@shared/types';
import { renderHook } from '@testing-library/react';
import type { Mock } from 'vitest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useNewsHotkeys } from './useNewsHotkeys';

function makeItem(id: number, overrides: Partial<NewsItem> = {}): NewsItem {
  return {
    id,
    channelId: 1,
    telegramMsgId: id * 10,
    text: `item-${id}`,
    links: [],
    hashtags: [],
    isRead: 0,
    postedAt: 1700000000 + id,
    ...overrides,
  };
}

function fireKey(key: string, target?: HTMLElement) {
  const el = target ?? document.body;
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
  el.dispatchEvent(event);
}

describe('useNewsHotkeys', () => {
  const items = [makeItem(1), makeItem(2), makeItem(3)];
  let setSelectedNewsId: Mock<(id: number | null) => void>;
  let onSpaceKey: Mock<() => void>;

  beforeEach(() => {
    setSelectedNewsId = vi.fn();
    onSpaceKey = vi.fn();
  });

  it('ArrowDown selects first item when nothing is selected', () => {
    renderHook(() => useNewsHotkeys(items, null, setSelectedNewsId, onSpaceKey));
    fireKey('ArrowDown');
    expect(setSelectedNewsId).toHaveBeenCalledWith(1);
  });

  it('ArrowUp selects first item when nothing is selected', () => {
    renderHook(() => useNewsHotkeys(items, null, setSelectedNewsId, onSpaceKey));
    fireKey('ArrowUp');
    expect(setSelectedNewsId).toHaveBeenCalledWith(1);
  });

  it('ArrowDown moves to next item', () => {
    renderHook(() => useNewsHotkeys(items, 1, setSelectedNewsId, onSpaceKey));
    fireKey('ArrowDown');
    expect(setSelectedNewsId).toHaveBeenCalledWith(2);
  });

  it('ArrowUp moves to previous item', () => {
    renderHook(() => useNewsHotkeys(items, 2, setSelectedNewsId, onSpaceKey));
    fireKey('ArrowUp');
    expect(setSelectedNewsId).toHaveBeenCalledWith(1);
  });

  it('ArrowDown does not go past last item', () => {
    renderHook(() => useNewsHotkeys(items, 3, setSelectedNewsId, onSpaceKey));
    fireKey('ArrowDown');
    expect(setSelectedNewsId).not.toHaveBeenCalled();
  });

  it('ArrowUp does not go before first item', () => {
    renderHook(() => useNewsHotkeys(items, 1, setSelectedNewsId, onSpaceKey));
    fireKey('ArrowUp');
    expect(setSelectedNewsId).not.toHaveBeenCalled();
  });

  it('does nothing on empty list', () => {
    renderHook(() => useNewsHotkeys([], null, setSelectedNewsId, onSpaceKey));
    fireKey('ArrowDown');
    expect(setSelectedNewsId).not.toHaveBeenCalled();
  });

  it('Space calls onSpaceKey with selected item', () => {
    renderHook(() => useNewsHotkeys(items, 2, setSelectedNewsId, onSpaceKey));
    fireKey(' ');
    expect(onSpaceKey).toHaveBeenCalledWith(items[1]);
  });

  it('Space does nothing when no item selected', () => {
    renderHook(() => useNewsHotkeys(items, null, setSelectedNewsId, onSpaceKey));
    fireKey(' ');
    expect(onSpaceKey).not.toHaveBeenCalled();
  });

  it('ignores events from input elements', () => {
    renderHook(() => useNewsHotkeys(items, 1, setSelectedNewsId, onSpaceKey));
    const input = document.createElement('input');
    document.body.appendChild(input);
    fireKey('ArrowDown', input);
    document.body.removeChild(input);
    expect(setSelectedNewsId).not.toHaveBeenCalled();
  });

  it('ignores events from textarea elements', () => {
    renderHook(() => useNewsHotkeys(items, 1, setSelectedNewsId, onSpaceKey));
    const textarea = document.createElement('textarea');
    document.body.appendChild(textarea);
    fireKey('ArrowDown', textarea);
    document.body.removeChild(textarea);
    expect(setSelectedNewsId).not.toHaveBeenCalled();
  });

  it('ignores events from button elements', () => {
    renderHook(() => useNewsHotkeys(items, 1, setSelectedNewsId, onSpaceKey));
    const button = document.createElement('button');
    document.body.appendChild(button);
    fireKey('ArrowDown', button);
    document.body.removeChild(button);
    expect(setSelectedNewsId).not.toHaveBeenCalled();
  });

  it('ignores events from anchor elements', () => {
    renderHook(() => useNewsHotkeys(items, 1, setSelectedNewsId, onSpaceKey));
    const anchor = document.createElement('a');
    document.body.appendChild(anchor);
    fireKey('ArrowDown', anchor);
    document.body.removeChild(anchor);
    expect(setSelectedNewsId).not.toHaveBeenCalled();
  });

  it('ignores events from contentEditable elements', () => {
    renderHook(() => useNewsHotkeys(items, 1, setSelectedNewsId, onSpaceKey));
    const div = document.createElement('div');
    div.contentEditable = 'true';
    // jsdom may not fully implement isContentEditable — force it
    Object.defineProperty(div, 'isContentEditable', { value: true });
    document.body.appendChild(div);
    fireKey('ArrowDown', div);
    document.body.removeChild(div);
    expect(setSelectedNewsId).not.toHaveBeenCalled();
  });
});
