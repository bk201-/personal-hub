import { fireEvent, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useLightboxLifecycle } from './useLightboxLifecycle';

describe('useLightboxLifecycle', () => {
  afterEach(() => {
    document.body.style.overflow = '';
    vi.restoreAllMocks();
  });

  it('pushes once per open, restores history on close/unmount, and removes popstate listeners', () => {
    const push = vi.spyOn(history, 'pushState');
    const replace = vi.spyOn(history, 'replaceState');
    const close = vi.fn();
    const { rerender, unmount } = renderHook(({ open }) => useLightboxLifecycle(open, close), {
      initialProps: { open: false },
    });
    expect(push).not.toHaveBeenCalled();
    rerender({ open: true });
    expect(push).toHaveBeenCalledExactlyOnceWith({ _lightboxOpen: true }, '');
    rerender({ open: true });
    expect(push).toHaveBeenCalledTimes(1);
    rerender({ open: false });
    expect(replace).toHaveBeenCalledExactlyOnceWith(null, '', window.location.href);
    fireEvent.popState(window);
    expect(close).not.toHaveBeenCalled();
    rerender({ open: true });
    expect(push).toHaveBeenCalledTimes(2);
    unmount();
    expect(replace).toHaveBeenCalledTimes(2);
    fireEvent.popState(window);
    expect(close).not.toHaveBeenCalled();
  });

  it('does not replace history after Back and resets that flag on reopening', () => {
    const replace = vi.spyOn(history, 'replaceState');
    const close = vi.fn();
    const { rerender } = renderHook(({ open }) => useLightboxLifecycle(open, close), {
      initialProps: { open: true },
    });
    fireEvent.popState(window);
    expect(close).toHaveBeenCalledTimes(1);
    rerender({ open: false });
    expect(replace).not.toHaveBeenCalled();
    rerender({ open: true });
    rerender({ open: false });
    expect(replace).toHaveBeenCalledTimes(1);
  });

  it('locks scrolling except on video controls and restores the previous overflow on unmount', () => {
    document.body.style.overflow = 'scroll';
    const { unmount } = renderHook(() => useLightboxLifecycle(true, vi.fn()));
    expect(document.body.style.overflow).toBe('hidden');
    const touch = () => new Event('touchmove', { bubbles: true, cancelable: true });
    const blocked = touch();
    fireEvent(document.body, blocked);
    expect(blocked.defaultPrevented).toBe(true);
    const video = document.createElement('video');
    document.body.appendChild(video);
    try {
      const allowed = touch();
      fireEvent(video, allowed);
      expect(allowed.defaultPrevented).toBe(false);
    } finally {
      video.remove();
    }
    unmount();
    expect(document.body.style.overflow).toBe('scroll');
    const restored = touch();
    fireEvent(document.body, restored);
    expect(restored.defaultPrevented).toBe(false);
  });
});
