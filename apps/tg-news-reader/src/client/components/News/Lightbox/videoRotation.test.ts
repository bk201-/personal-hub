import { describe, expect, it } from 'vitest';
import { fitRotatedVideo } from './videoRotation';

describe('fitting a rotated video into the viewer', () => {
  it('fits landscape video after a quarter turn without clipping', () => {
    expect(fitRotatedVideo(1920, 1080, 1200, 600, 90)).toEqual({ width: 600, height: 337.5 });
  });

  it('fits portrait video rotated left in a narrow viewport', () => {
    expect(fitRotatedVideo(1080, 1920, 360, 640, 270)).toEqual({ width: 202.5, height: 360 });
  });

  it('preserves fitting at zero and half turns', () => {
    expect(fitRotatedVideo(1920, 1080, 1200, 600, 0)).toEqual({ width: 1066.6666666666667, height: 600 });
    expect(fitRotatedVideo(1920, 1080, 1200, 600, 180)).toEqual({ width: 1066.6666666666667, height: 600 });
  });
});
