import { act, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LightboxVideo } from './LightboxVideo';

vi.unmock('antd-style');

describe('rotated video resizing', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('fits metadata dimensions and window changes without restarting the video', () => {
    let resize = () => {};
    const disconnect = vi.fn();
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: () => void) {
          resize = callback;
        }
        observe() {}
        disconnect = disconnect;
      },
    );
    let bounds = new DOMRect(0, 0, 1200, 600);
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => bounds);
    const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    const { container, unmount } = render(
      <LightboxVideo path="ch/video.mp4" angle={90} videoRef={{ current: null }} />,
    );
    const video = container.querySelector('video')!;
    Object.defineProperties(video, { videoWidth: { value: 1920 }, videoHeight: { value: 1080 } });
    fireEvent.loadedMetadata(video);
    expect(getComputedStyle(video).width).toBe('600px');
    expect(getComputedStyle(video).height).toBe('337.5px');
    bounds = new DOMRect(0, 0, 360, 640);
    act(() => resize());
    expect(getComputedStyle(video).width).toBe('640px');
    expect(getComputedStyle(video).height).toBe('360px');
    expect(play).toHaveBeenCalledTimes(1);
    unmount();
    expect(disconnect).toHaveBeenCalledOnce();
  });
});
