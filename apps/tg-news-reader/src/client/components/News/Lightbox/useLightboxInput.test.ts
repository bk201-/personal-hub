import { act, fireEvent, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LightboxState } from '../../../store/uiStore';
import { useLightboxInput } from './useLightboxInput';
import type { UseLightboxNavResult } from './useLightboxNav';

function setup(overrides: Partial<UseLightboxNavResult> = {}) {
  const nav: UseLightboxNavResult = {
    entries: [],
    cursor: 0,
    currentEntry: null,
    isVideo: false,
    isAlbum: false,
    albumLength: 0,
    albumExpectedLength: 0,
    firstMediaPath: undefined,
    go: vi.fn(),
    goToAlbumImage: vi.fn(),
    totalCount: 0,
    positionLabel: '',
    ...overrides,
  };
  const close = vi.fn();
  const overlayRef = { current: document.createElement('div') };
  const videoRef = { current: document.createElement('video') };
  const initialProps: { state: LightboxState | null } = { state: { newsId: 1, channelId: 1, albumIndex: 0 } };
  const hook = renderHook(
    ({ state }: { state: LightboxState | null }) => useLightboxInput(state, nav, close, overlayRef, videoRef),
    { initialProps },
  );
  return { ...hook, nav, close, video: videoRef.current };
}

function swipe(dx: number, dy: number) {
  fireEvent.touchStart(window, { touches: [{ clientX: 100, clientY: 100 }] });
  fireEvent.touchEnd(window, { changedTouches: [{ clientX: 100 + dx, clientY: 100 + dy }] });
}

describe('useLightboxInput', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('captures navigation keys before feed listeners and ignores unrelated keys', () => {
    const { nav, close } = setup();
    const feedKey = vi.fn();
    window.addEventListener('keydown', feedKey);
    try {
      for (const key of ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ', 'Escape']) {
        const event = new KeyboardEvent('keydown', { key, cancelable: true });
        fireEvent(window, event);
        expect(event.defaultPrevented).toBe(true);
      }
      expect(nav.go).toHaveBeenCalledTimes(5);
      expect(vi.mocked(nav.go).mock.calls).toEqual([[-1], [1], [-1], [1], [1]]);
      expect(close).toHaveBeenCalledTimes(1);
      expect(feedKey).not.toHaveBeenCalled();
      const event = new KeyboardEvent('keydown', { key: 'a', cancelable: true });
      fireEvent(window, event);
      expect(event.defaultPrevented).toBe(false);
      expect(feedKey).toHaveBeenCalledTimes(1);
    } finally {
      window.removeEventListener('keydown', feedKey);
    }
  });

  it('routes horizontal album arrows separately from Space and vertical arrows', () => {
    const { nav } = setup({ isAlbum: true });
    for (const key of ['ArrowLeft', 'ArrowRight', ' ', 'ArrowUp', 'ArrowDown']) {
      fireEvent.keyDown(window, { key });
    }
    expect(vi.mocked(nav.goToAlbumImage).mock.calls).toEqual([[-1], [1]]);
    expect(vi.mocked(nav.go).mock.calls).toEqual([[1], [-1], [1]]);
  });

  it('seeks videos within bounds and toggles playback without navigating', () => {
    const { video, nav } = setup({ isVideo: true });
    Object.defineProperty(video, 'duration', { configurable: true, value: 25 });
    video.currentTime = 5;
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(video.currentTime).toBe(0);
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(video.currentTime).toBe(10);
    video.currentTime = 20;
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(video.currentTime).toBe(25);
    Object.defineProperty(video, 'duration', { value: NaN });
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(video.currentTime).toBe(35);
    const play = vi.spyOn(video, 'play').mockResolvedValue();
    const pause = vi.spyOn(video, 'pause').mockImplementation(() => {});
    fireEvent.keyDown(window, { key: ' ' });
    expect(play).toHaveBeenCalledTimes(1);
    Object.defineProperty(video, 'paused', { value: false });
    fireEvent.keyDown(window, { key: ' ' });
    expect(pause).toHaveBeenCalledTimes(1);
    expect(nav.go).not.toHaveBeenCalled();
    expect(nav.goToAlbumImage).not.toHaveBeenCalled();
  });

  it('accumulates wheel deltas, resets after idle, and clears pending timers on unmount', () => {
    vi.useFakeTimers();
    const { nav, unmount } = setup();
    const wheel = (deltaY: number) => fireEvent.wheel(window, { deltaY });
    wheel(40);
    wheel(40);
    expect(nav.go).not.toHaveBeenCalled();
    wheel(1);
    wheel(100);
    expect(nav.go).toHaveBeenCalledExactlyOnceWith(1);
    act(() => vi.advanceTimersByTime(150));
    wheel(-80);
    expect(nav.go).toHaveBeenCalledTimes(1);
    wheel(-1);
    expect(nav.go).toHaveBeenLastCalledWith(-1);
    act(() => vi.advanceTimersByTime(150));
    wheel(40);
    act(() => vi.advanceTimersByTime(150));
    wheel(41);
    expect(nav.go).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(1);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
    wheel(100);
    expect(nav.go).toHaveBeenCalledTimes(2);
  });

  it.each([false, true])('routes dominant-axis swipes with album=%s and ignores small/diagonal gestures', (isAlbum) => {
    const { nav } = setup({ isAlbum });
    swipe(50, 0);
    swipe(0, -50);
    swipe(60, 60);
    expect(nav.go).not.toHaveBeenCalled();
    expect(nav.goToAlbumImage).not.toHaveBeenCalled();
    swipe(-60, 10);
    swipe(60, -10);
    swipe(10, -60);
    swipe(-10, 60);
    expect(vi.mocked(nav.go).mock.calls).toEqual(isAlbum ? [[1], [-1]] : [[1], [-1], [1], [-1]]);
    expect(vi.mocked(nav.goToAlbumImage).mock.calls).toEqual(isAlbum ? [[1], [-1]] : []);
  });

  it('removes all input listeners when closed', () => {
    const { nav, close, rerender } = setup();
    rerender({ state: null });
    const wheel = new WheelEvent('wheel', { deltaY: 100, cancelable: true });
    const key = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true });
    fireEvent(window, wheel);
    fireEvent(window, key);
    swipe(-60, 0);
    expect(wheel.defaultPrevented).toBe(false);
    expect(key.defaultPrevented).toBe(false);
    expect(nav.go).not.toHaveBeenCalled();
    expect(nav.goToAlbumImage).not.toHaveBeenCalled();
    expect(close).not.toHaveBeenCalled();
  });
});
