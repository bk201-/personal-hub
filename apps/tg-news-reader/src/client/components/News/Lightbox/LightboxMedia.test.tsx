import { act, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LightboxMedia } from './LightboxMedia';

describe('LightboxMedia', () => {
  beforeEach(() => {
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
  });
  afterEach(() => vi.useRealTimers());

  it('shows an image error after bounded browser retries, without a manual download button', () => {
    vi.useFakeTimers();
    const { container } = render(
      <LightboxMedia
        path="channel/photo.jpg"
        isAlbum={false}
        albumIndex={0}
        albumPaths={undefined}
        videoRef={{ current: null }}
      />,
    );
    for (let attempt = 0; attempt < 2; attempt++) {
      fireEvent.error(container.querySelector('img')!);
      act(() => vi.advanceTimersByTime(1500));
    }
    fireEvent.error(container.querySelector('img')!);
    expect(screen.getByRole('status')).toHaveTextContent('lightbox.load_failed');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('allows native video download while keeping PiP, remote playback and the context menu disabled', () => {
    render(
      <LightboxMedia
        path="channel/video.mp4"
        isAlbum={false}
        albumIndex={0}
        albumPaths={undefined}
        videoRef={{ current: null }}
      />,
    );

    const mediaEl = document.querySelector('video');
    expect(mediaEl).not.toBeNull();
    if (!mediaEl) return;

    expect(mediaEl.hasAttribute('disablePictureInPicture')).toBe(true);
    expect(mediaEl.hasAttribute('disableRemotePlayback')).toBe(true);
    expect(mediaEl.getAttribute('controlsList')).toContain('nopictureinpicture');
    expect(mediaEl.getAttribute('controlsList')).toContain('noremoteplayback');
    expect(mediaEl.getAttribute('controlsList')).not.toContain('nodownload');

    const dispatched = fireEvent.contextMenu(mediaEl);
    expect(dispatched).toBe(false);
  });
});
