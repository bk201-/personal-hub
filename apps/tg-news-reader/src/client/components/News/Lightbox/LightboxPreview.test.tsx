import type { Channel, DownloadTask, NewsItem } from '@shared/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { InfiniteData } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../../api/client';
import type { NewsResponse } from '../../../api/news';
import { useUIStore } from '../../../store/uiStore';
import { LightboxOverlay } from './LightboxOverlay';

vi.mock('../../../api/client', () => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn() },
}));
vi.mock('../../../api/channels', () => ({
  useChannels: () => ({ data: [{ id: 1, name: 'Media', telegramId: 'media', channelType: 'media' }] }),
}));
vi.mock('../../../api/markReadBatcher', () => ({
  MARK_READ_BATCHING_ENABLED: false,
  markReadBatcher: { enqueue: vi.fn() },
}));
vi.mock('./LightboxToolbar', () => ({ LightboxToolbar: () => null }));

function item(id: number, extra: Partial<NewsItem> = {}): NewsItem {
  return {
    id,
    channelId: 1,
    telegramMsgId: id,
    text: '',
    links: [],
    hashtags: [],
    isRead: 0,
    postedAt: id,
    mediaType: 'photo',
    ...extra,
  };
}

function data(items: NewsItem[]): InfiniteData<NewsResponse> {
  return { pages: [{ items, hasMore: false, nextCursor: null, filteredOut: 0 }], pageParams: [undefined] };
}

function setup(items: NewsItem[], tasks: Partial<DownloadTask>[] = []) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  qc.setQueryData(['news', 1, 'hidden'], data(items));
  qc.setQueryData(['channels'], [{ id: 1, unreadCount: items.length }]);
  vi.mocked(api.get).mockImplementation(async (url) =>
    url === '/downloads' ? tasks : items.find((entry) => url === `/news/${entry.id}`),
  );
  useUIStore.getState().openLightbox(items[0].id, 0, 1);
  render(
    <QueryClientProvider client={qc}>
      <LightboxOverlay fetchNextPage={vi.fn()} hasNextPage={false} />
    </QueryClientProvider>,
  );
  return qc;
}

describe('image-only lightbox previews', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(api.post).mockResolvedValue({ success: true });
    vi.mocked(api.patch).mockResolvedValue({});
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    useUIStore.setState({ lightbox: null, newsFilterMode: 'hidden', hashTagFilter: null });
  });

  it('automatically requests a hidden photo once and displays its cache update without navigation', async () => {
    const qc = setup([item(1), item(2)], [{ newsId: 1, type: 'image', status: 'processing' }]);
    qc.setQueryData(['news', 1, 'all'], data([item(99, { localMediaPath: 'media/wrong.jpg' })]));
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/downloads', { newsId: 1, type: 'image', priority: 10 }),
    );
    expect(api.patch).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: /download/i })).not.toBeInTheDocument();
    act(() => qc.setQueryData(['news', 1, 'hidden'], data([item(1, { localMediaPath: 'media/1.jpg' }), item(2)])));
    await waitFor(() => expect(document.querySelector('img')?.getAttribute('src')).toContain('media/1.jpg'));
    await waitFor(() => expect(qc.getQueryData<Channel[]>(['channels'])![0].unreadCount).toBe(1));
    expect(api.post).toHaveBeenCalledTimes(1);
    expect(api.patch).toHaveBeenCalledTimes(1);
  });

  it('skips an unavailable video on opening and navigation, without downloading or marking it read', async () => {
    setup([
      item(1, { mediaType: 'video' }),
      item(2, { localMediaPath: 'media/2.jpg' }),
      item(3, { mediaType: 'video' }),
      item(4, { mediaType: 'video', localMediaPath: 'media/4.mp4' }),
    ]);
    await waitFor(() => expect(useUIStore.getState().lightbox?.newsId).toBe(2));
    fireEvent.click(screen.getByTitle('lightbox.next'));
    await waitFor(() => expect(useUIStore.getState().lightbox?.newsId).toBe(4));
    expect(document.querySelector('video')?.getAttribute('src')).toContain('media/4.mp4');
    expect(api.post).not.toHaveBeenCalled();
    expect(vi.mocked(api.patch).mock.calls.map(([url]) => url)).toEqual(['/news/2/read', '/news/4/read']);
  });

  it.each(['done', 'removed'] as const)(
    'recovers a %s image task through REST when the SSE update was missed',
    async (status) => {
      const original = item(1);
      const qc = setup([original], [{ newsId: 1, type: 'image', status: 'done' }]);
      vi.mocked(api.get).mockImplementation(async (url) =>
        url === '/downloads'
          ? status === 'done'
            ? [{ newsId: 1, type: 'image', status: 'done' }]
            : []
          : { ...original, localMediaPath: 'media/recovered.jpg', isRead: 0 },
      );
      await waitFor(() => expect(document.querySelector('img')?.getAttribute('src')).toContain('recovered.jpg'));
      expect(qc.getQueryData<InfiniteData<NewsResponse>>(['news', 1, 'hidden'])!.pages[0].items[0].isRead).toBe(1);
    },
  );

  it('skips documents that the image-only worker cannot preview and does not requeue on wraparound', async () => {
    setup(
      [item(1, { mediaType: 'document' }), item(2, { localMediaPath: 'media/2.jpg' })],
      [{ newsId: 1, type: 'image', status: 'done' }],
    );
    await waitFor(() => expect(useUIStore.getState().lightbox?.newsId).toBe(2));
    fireEvent.click(screen.getByTitle('lightbox.next'));
    expect(useUIStore.getState().lightbox?.newsId).toBe(2);
    expect(api.post).toHaveBeenCalledTimes(1);
    expect(vi.mocked(api.patch).mock.calls.map(([url]) => url)).toEqual(['/news/2/read']);
  });

  it('shows a failed preview explicitly without manual download or an automatic retry loop', async () => {
    vi.mocked(api.post).mockRejectedValue(new Error('Offline'));
    setup([item(1)]);
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('lightbox.load_failed'));
    fireEvent.click(screen.getByTitle('lightbox.next'));
    expect(api.post).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: /download/i })).not.toBeInTheDocument();
    expect(api.patch).not.toHaveBeenCalled();
  });

  it('shows an empty state when only undownloaded videos are available', () => {
    setup([item(1, { mediaType: 'video' })]);
    expect(screen.getByRole('status')).toHaveTextContent('lightbox.no_media');
    expect(api.post).not.toHaveBeenCalled();
    expect(api.patch).not.toHaveBeenCalled();
  });

  it('surfaces a worker failure and allows navigation to continue', async () => {
    setup(
      [item(1), item(2, { localMediaPath: 'media/2.jpg' })],
      [{ newsId: 1, type: 'image', status: 'failed', error: 'Download failed' }],
    );
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('lightbox.load_failed'));
    fireEvent.click(screen.getByTitle('lightbox.next'));
    expect(useUIStore.getState().lightbox?.newsId).toBe(2);
    expect(api.post).toHaveBeenCalledTimes(1);
  });

  it('keeps backward navigation direction when an unknown document has no preview', async () => {
    setup(
      [
        item(1, { localMediaPath: 'media/1.jpg' }),
        item(2, { localMediaPath: 'media/2.jpg' }),
        item(3, { mediaType: 'document' }),
        item(4, { localMediaPath: 'media/4.jpg' }),
      ],
      [{ newsId: 3, type: 'image', status: 'done' }],
    );
    fireEvent.click(screen.getByTitle('lightbox.prev'));
    expect(useUIStore.getState().lightbox?.newsId).toBe(4);
    fireEvent.click(screen.getByTitle('lightbox.prev'));
    await waitFor(() => expect(useUIStore.getState().lightbox?.newsId).toBe(2));
    expect(api.post).toHaveBeenCalledWith('/downloads', { newsId: 3, type: 'image', priority: 10 });
  });
});
