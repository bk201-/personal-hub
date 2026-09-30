import type { NewsItem } from '@shared/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useUIStore } from '../../../store/uiStore';
import { LightboxOverlay } from './LightboxOverlay';
vi.unmock('antd-style');

vi.mock('../../../api/channels', () => ({
  useChannels: () => ({ data: [{ id: 1, name: 'Media', telegramId: 'media', channelType: 'media' }] }),
}));
vi.mock('../../../api/client', () => ({ api: { get: vi.fn(), post: vi.fn(), patch: vi.fn() } }));

function setup() {
  const items: NewsItem[] = ['a.mp4', 'b.jpg', 'c.mp4'].map((path, index) => ({
    id: index + 1,
    channelId: 1,
    telegramMsgId: index + 1,
    text: '',
    links: [],
    hashtags: [],
    isRead: 1,
    postedAt: index,
    mediaType: path.endsWith('mp4') ? 'video' : 'photo',
    localMediaPath: `ch/${path}`,
  }));
  const qc = new QueryClient();
  qc.setQueryData(['news', 1, 'all'], { pages: [{ items }], pageParams: [undefined] });
  useUIStore.getState().openLightbox(1, 0, 1);
  render(
    <QueryClientProvider client={qc}>
      <LightboxOverlay fetchNextPage={vi.fn()} hasNextPage={false} />
    </QueryClientProvider>,
  );
}

describe('lightbox video rotation controls', () => {
  beforeEach(() => {
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    useUIStore.setState({ lightbox: null, newsFilterMode: 'all', hashTagFilter: null });
  });

  it('turns both ways without restarting playback or changing the download source', () => {
    setup();
    const video = document.querySelector('video')!;
    const source = video.src;
    video.currentTime = 42;
    fireEvent.click(screen.getByRole('button', { name: 'lightbox.rotate_right' }));
    expect(getComputedStyle(video).transform).toBe('rotate(90deg)');
    fireEvent.click(screen.getByRole('button', { name: 'lightbox.rotate_left' }));
    expect(getComputedStyle(video).transform).toBe('rotate(0deg)');
    fireEvent.click(screen.getByRole('button', { name: 'lightbox.rotate_left' }));
    expect(getComputedStyle(video).transform).toBe('rotate(270deg)');
    expect(document.querySelector('video')).toBe(video);
    expect(video.currentTime).toBe(42);
    expect(video.src).toBe(source);
    expect(video.getAttribute('controlsList')).not.toContain('nodownload');
  });

  it('hides rotation on images and resets it when navigating to another video', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'lightbox.rotate_right' }));
    fireEvent.click(screen.getByTitle('lightbox.next'));
    expect(screen.queryByRole('button', { name: 'lightbox.rotate_right' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByTitle('lightbox.next'));
    expect(getComputedStyle(document.querySelector('video')!).transform).toBe('rotate(0deg)');
    fireEvent.click(screen.getByTitle('lightbox.next'));
    expect(getComputedStyle(document.querySelector('video')!).transform).toBe('rotate(0deg)');
  });
});
