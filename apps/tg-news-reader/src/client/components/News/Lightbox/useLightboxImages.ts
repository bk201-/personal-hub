import type { DownloadTask, NewsItem } from '@shared/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { InfiniteData } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { api } from '../../../api/client';
import { downloadsKeys } from '../../../api/downloads';
import { updatePaginatedItems } from '../../../api/news';
import type { NewsResponse } from '../../../api/news';
import { lightboxMediaPaths, needsImagePreview } from './lightboxMediaPaths';
import { useLightboxFeed } from './useLightboxFeed';

/** One automatic image-only request per post during a lightbox session. */
export function useLightboxImages(channelId: number, newsId: number) {
  const qc = useQueryClient();
  const { items } = useLightboxFeed(channelId);
  const item = items.find((entry) => entry.id === newsId);
  const requested = useRef(new Set<number>());
  const [queued, setQueued] = useState(new Set<number>());
  const [skippedIds, setSkippedIds] = useState(new Set<number>());
  const [failedIds, setFailedIds] = useState(new Set<number>());
  const needsPreview = !!item && needsImagePreview(item);
  const { mutate } = useMutation({
    mutationFn: (id: number) => api.post('/downloads', { newsId: id, type: 'image', priority: 10 }),
    onSuccess: (_data, id) => {
      setQueued((old) => new Set(old).add(id));
      void qc.invalidateQueries({ queryKey: downloadsKeys.all });
    },
    onError: (_error, id) => setFailedIds((old) => new Set(old).add(id)),
  });

  useEffect(() => {
    if (!needsPreview || requested.current.has(newsId)) return;
    requested.current.add(newsId);
    mutate(newsId);
  }, [needsPreview, newsId, mutate]);

  // SSE normally delivers the result immediately. Poll only while waiting for a
  // preview, so a dropped stream / completed-and-cleaned task cannot strand it.
  const result = useQuery({
    queryKey: ['lightbox-preview', newsId],
    enabled: needsPreview && queued.has(newsId) && !skippedIds.has(newsId) && !failedIds.has(newsId),
    queryFn: async () => {
      const tasks = await api.get<DownloadTask[]>('/downloads');
      const task = tasks.find((entry) => entry.newsId === newsId && entry.type === 'image');
      const updated = await api.get<NewsItem>(`/news/${newsId}`);
      qc.setQueriesData<InfiniteData<NewsResponse>>({ queryKey: ['news', channelId] }, (old) =>
        updatePaginatedItems(old, (cached) =>
          cached.map((entry) =>
            entry.id === updated.id
              ? {
                  ...entry,
                  localMediaPath: updated.localMediaPath ?? entry.localMediaPath,
                  localMediaPaths: updated.localMediaPaths ?? entry.localMediaPaths,
                }
              : entry,
          ),
        ),
      );
      return { task, hasMedia: lightboxMediaPaths(updated).length > 0 };
    },
    refetchInterval: (query) =>
      query.state.error || !query.state.data?.task || ['done', 'failed'].includes(query.state.data.task.status)
        ? false
        : 2000,
    retry: false,
    gcTime: 0,
  });

  useEffect(() => {
    if (!queued.has(newsId) || !result.data) return;
    if (result.data.task?.status === 'failed') {
      setFailedIds((old) => (old.has(newsId) ? old : new Set(old).add(newsId)));
    } else if (!result.data.hasMedia && (!result.data.task || result.data.task.status === 'done')) {
      setSkippedIds((old) => (old.has(newsId) ? old : new Set(old).add(newsId)));
    }
  }, [newsId, queued, result.data]);

  return { skippedIds, failed: failedIds.has(newsId) || result.isError };
}
