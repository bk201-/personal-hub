import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useUIStore } from '../../../store/uiStore';
import { useHashTagSync } from './useHashTagSync';

describe('useHashTagSync', () => {
  let replaceStateSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    useUIStore.setState({ hashTagFilter: null });
    replaceStateSpy = vi.spyOn(history, 'replaceState');
    // Reset URL hash
    window.location.hash = '';
  });

  it('resets hashTagFilter when channelId changes', () => {
    useUIStore.setState({ hashTagFilter: 'sometag' });
    const { rerender } = renderHook(({ channelId }) => useHashTagSync(channelId), {
      initialProps: { channelId: 1 },
    });
    expect(useUIStore.getState().hashTagFilter).toBeNull();

    useUIStore.setState({ hashTagFilter: 'anothertag' });
    rerender({ channelId: 2 });
    expect(useUIStore.getState().hashTagFilter).toBeNull();
  });

  it('writes hashtag to URL when hashTagFilter is set', () => {
    renderHook(() => useHashTagSync(1));
    act(() => {
      useUIStore.setState({ hashTagFilter: 'tech' });
    });
    expect(replaceStateSpy).toHaveBeenCalledWith(null, '', expect.stringContaining('#tag=tech'));
  });

  it('clears URL hash when hashTagFilter is null', () => {
    useUIStore.setState({ hashTagFilter: 'tech' });
    renderHook(() => useHashTagSync(1));
    // hashTagFilter was reset by the channel effect
    expect(replaceStateSpy).toHaveBeenCalledWith(null, '', expect.not.stringContaining('#tag='));
  });

  it('reads hashtag from hashchange event', () => {
    renderHook(() => useHashTagSync(1));
    act(() => {
      Object.defineProperty(window, 'location', {
        value: { ...window.location, hash: '#tag=news' },
        writable: true,
        configurable: true,
      });
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    expect(useUIStore.getState().hashTagFilter).toBe('news');
  });

  it('returns hashTagFilter and setHashTagFilter', () => {
    const { result } = renderHook(() => useHashTagSync(1));
    expect(result.current.hashTagFilter).toBeNull();
    expect(typeof result.current.setHashTagFilter).toBe('function');
  });
});
