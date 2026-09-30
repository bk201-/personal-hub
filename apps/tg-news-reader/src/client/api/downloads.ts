import type { CreateDownloadInput } from '@shared/schemas.ts';
import type { DownloadTask, DownloadType, NewsItem } from '@shared/types.ts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { InfiniteData, QueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { createReconnectingEventSource } from '../services/reconnectingEventSource';
import { useAuthStore } from '../store/authStore';
import { api, tryRefresh } from './client';
import { updatePaginatedItems } from './news';
import type { NewsResponse } from './news';

export const downloadsKeys = {
  all: ['downloads'] as const,
};

function patchMediaPaths(qc: QueryClient, task: DownloadTask) {
  if (!task.channelId) return;
  qc.setQueriesData<InfiniteData<NewsResponse>>({ queryKey: ['news', task.channelId] }, (old) =>
    updatePaginatedItems(old, (items) =>
      items.map((item) =>
        item.id === task.newsId
          ? {
              ...item,
              localMediaPath: task.localMediaPath ?? item.localMediaPath,
              localMediaPaths: task.localMediaPaths ?? item.localMediaPaths,
            }
          : item,
      ),
    ),
  );
}

function reconcileImageTasks(qc: QueryClient, tasks: DownloadTask[]) {
  for (const task of tasks) {
    if (task.type === 'image' && task.status === 'done') patchMediaPaths(qc, task);
  }
}

export function useDownloads() {
  const qc = useQueryClient();
  return useQuery({
    queryKey: downloadsKeys.all,
    queryFn: async () => {
      const tasks = await api.get<DownloadTask[]>('/downloads');
      reconcileImageTasks(qc, tasks);
      return tasks;
    },
    // SSE (useDownloadsSSE) keeps this data up-to-date via push events —
    // no polling needed.
    refetchOnWindowFocus: false,
    staleTime: Infinity,
  });
}

export function useCreateDownload() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: CreateDownloadInput) => api.post<{ success: boolean }>('/downloads', args),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: downloadsKeys.all });
    },
  });
}

export function usePrioritizeDownload() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.patch<{ success: boolean }>(`/downloads/${id}/prioritize`, {}),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: downloadsKeys.all });
    },
  });
}

export function useCancelDownload() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.delete<{ success: boolean }>(`/downloads/${id}`),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: downloadsKeys.all });
    },
  });
}

/** Find existing task for a specific news item + type */
export function useNewsDownloadTask(newsId: number, type: DownloadType): DownloadTask | null {
  const { data: tasks = [] } = useDownloads();
  return tasks.find((t) => t.newsId === newsId && t.type === type) ?? null;
}

/**
 * Connects to the SSE stream for real-time download updates.
 * Mount once at app level (inside DownloadsPanel).
 */
export function useDownloadsSSE() {
  const qc = useQueryClient();
  // Re-subscribe if access token changes (e.g. after token refresh)
  const accessToken = useAuthStore((s) => s.accessToken);

  useEffect(() => {
    // No token = not authenticated — don't connect
    if (!accessToken) return;

    // EventSource cannot send custom headers — pass JWT as ?token= query param
    const getUrl = () => {
      const token = useAuthStore.getState().accessToken;
      return `/api/downloads/stream?token=${encodeURIComponent(token ?? '')}`;
    };

    const rec = createReconnectingEventSource({
      getUrl,
      onBeforeReconnect: async () => {
        await tryRefresh();
      },
      pauseWhenHidden: true,
      module: 'downloads',
      onConnect: (es) => {
        es.addEventListener('init', (e: MessageEvent) => {
          const tasks = JSON.parse(e.data as string) as DownloadTask[];
          reconcileImageTasks(qc, tasks);
          qc.setQueryData(downloadsKeys.all, tasks);
        });

        es.addEventListener('tasks_removed', (e: MessageEvent) => {
          const { newsIds } = JSON.parse(e.data as string) as { newsIds: number[] };
          const removed = new Set(newsIds);
          qc.setQueryData<DownloadTask[]>(downloadsKeys.all, (old = []) =>
            old.filter((task) => !removed.has(task.newsId)),
          );
        });

        es.addEventListener('task_removed', (e: MessageEvent) => {
          const { taskId } = JSON.parse(e.data as string) as { taskId: number };
          qc.setQueryData<DownloadTask[]>(downloadsKeys.all, (old = []) => old.filter((task) => task.id !== taskId));
        });

        es.addEventListener('queue_changed', () => {
          void qc.invalidateQueries({ queryKey: downloadsKeys.all });
        });

        es.addEventListener('task_update', (e: MessageEvent) => {
          const task = JSON.parse(e.data as string) as DownloadTask;

          if (task.status === 'done') {
            if ((task.type === 'media' || task.type === 'image') && task.channelId) {
              patchMediaPaths(qc, task);
              // Keep image terminal states until task_removed, including done-without-path results.
              if (task.type === 'media') {
                qc.setQueryData<DownloadTask[]>(downloadsKeys.all, (old = []) =>
                  (old ?? []).filter((t) => t.id !== task.id),
                );
                return;
              }
            }

            if (task.type === 'article' && task.channelId) {
              // Article done — fetch the single updated news item and patch it in cache.
              // Avoids refetching the entire channel's news list (which races with markRead).
              // Preserve client-side isRead to avoid overwriting optimistic mark-read updates.
              void api.get<NewsItem>(`/news/${task.newsId}`).then((updated) => {
                qc.setQueriesData<InfiniteData<NewsResponse>>({ queryKey: ['news', task.channelId] }, (old) =>
                  updatePaginatedItems(old, (items) =>
                    items.map((item) => (item.id === updated.id ? { ...item, ...updated, isRead: item.isRead } : item)),
                  ),
                );
                qc.setQueryData<DownloadTask[]>(downloadsKeys.all, (old = []) =>
                  (old ?? []).filter((t) => t.id !== task.id),
                );
              });
              return;
            }
          }

          qc.setQueryData<DownloadTask[]>(downloadsKeys.all, (old = []) => {
            const idx = old.findIndex((t) => t.id === task.id);
            if (idx >= 0) {
              const updated = [...old];
              updated[idx] = task;
              return updated;
            }
            return [...old, task];
          });
        });
      },
    });

    return () => rec.close();
  }, [qc, accessToken]);
}
