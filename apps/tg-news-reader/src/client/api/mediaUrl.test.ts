import { beforeEach, describe, expect, it } from 'vitest';
import { useAuthStore } from '../store/authStore';
import { mediaUrl } from './mediaUrl';

describe('mediaUrl', () => {
  beforeEach(() => {
    useAuthStore.setState({ accessToken: null });
  });

  it('returns a stable same-origin URL while the access token rotates', () => {
    useAuthStore.setState({ accessToken: 'my-jwt-token' });
    const beforeRefresh = mediaUrl('channel123/video.mp4');
    useAuthStore.setState({ accessToken: 'rotated-jwt-token' });
    const afterRefresh = mediaUrl('channel123/video.mp4');

    expect(beforeRefresh).toBe('/api/media/channel123/video.mp4');
    expect(afterRefresh).toBe(beforeRefresh);
  });

  it('returns the same URL without an access token', () => {
    const url = mediaUrl('channel123/image.jpg');
    expect(url).toBe('/api/media/channel123/image.jpg');
  });
});
