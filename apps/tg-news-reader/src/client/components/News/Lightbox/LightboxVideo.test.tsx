import { act, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LightboxMedia } from './LightboxMedia';
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

  it.each([false, true])('keeps native controls responsive across video navigation (album: %s)', (isAlbum) => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 1200, 800));
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    const videoRef = { current: null };
    const albumPaths = isAlbum ? ['ch/portrait.mp4', 'ch/landscape.mp4'] : undefined;
    const { container, rerender } = render(
      <LightboxMedia
        path="ch/portrait.mp4"
        isAlbum={isAlbum}
        albumPaths={albumPaths}
        albumIndex={0}
        videoRef={videoRef}
      />,
    );
    const portrait = container.querySelector('video')!;
    Object.defineProperties(portrait, { videoWidth: { value: 360 }, videoHeight: { value: 640 } });
    fireEvent.loadedMetadata(portrait);
    expect(getComputedStyle(portrait).width).toBe('450px');

    rerender(
      <LightboxMedia
        path="ch/landscape.mp4"
        isAlbum={isAlbum}
        albumPaths={albumPaths}
        albumIndex={isAlbum ? 1 : 0}
        videoRef={videoRef}
      />,
    );
    const landscape = container.querySelector('video')!;
    Object.defineProperties(landscape, { videoWidth: { value: 1280 }, videoHeight: { value: 720 } });
    fireEvent.loadedMetadata(landscape);
    expect(getComputedStyle(landscape).width).toBe('1200px');
    expect(landscape.controls).toBe(true);

    // jsdom has no native controls; guard the CSS contract verified in Edge's UA shadow DOM.
    const controlsRule = Array.from(document.styleSheets)
      .flatMap((sheet) => Array.from(sheet.cssRules))
      .find(
        (rule): rule is CSSStyleRule =>
          rule instanceof CSSStyleRule &&
          Array.from(landscape.classList).some(
            (className) => rule.selectorText === `.${className}::-webkit-media-controls`,
          ),
      );
    expect(controlsRule?.style.getPropertyValue('width')).toBe('100%');
  });
});
