import type { NewsItem } from '@shared/types.ts';
import { useQueryClient } from '@tanstack/react-query';
import type { InfiniteData } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { createReconnectingEventSource } from '../services/reconnectingEventSource';
import { useAuthStore } from '../store/authStore';
import { tryRefresh } from './client';
import { updatePaginatedItems } from './news';
import type { NewsResponse } from './news';

interface MediaProgressEvent {
  type: 'item' | 'complete';
  newsId?: number;
  localMediaPath?: string;
  done: number;
  total: number;
}

export function useMediaProgressSSE(
  channelId: number | null,
  key: number,
  onProgress?: (done: number, total: number) => void,
  onComplete?: () => void,
) {
  const qc = useQueryClient();
  const accessToken = useAuthStore((s) => s.accessToken);
  const onProgressRef = useRef(onProgress);
  const onCompleteRef = useRef(onComplete);
  useEffect(() => {
    onProgressRef.current = onProgress;
  });
  useEffect(() => {
    onCompleteRef.current = onComplete;
  });

  useEffect(() => {
    if (!channelId) return;

    const getUrl = () => {
      const token = useAuthStore.getState().accessToken;
      return `/api/channels/${channelId}/media-progress${token ? `?token=${encodeURIComponent(token)}` : ''}`;
    };

    const rec = createReconnectingEventSource({
      getUrl,
      onBeforeReconnect: async () => {
        await tryRefresh();
      },
      module: 'mediaProgress',
      onConnect: (es) => {
        es.addEventListener('item', (e: MessageEvent) => {
          const data = JSON.parse(e.data as string) as MediaProgressEvent;
          if (!data.newsId || !data.localMediaPath) return;

          qc.setQueriesData<InfiniteData<NewsResponse>>({ queryKey: ['news', channelId] }, (old) =>
            updatePaginatedItems(old, (items) =>
              items.map((item: NewsItem) =>
                item.id === data.newsId ? { ...item, localMediaPath: data.localMediaPath } : item,
              ),
            ),
          );

          onProgressRef.current?.(data.done, data.total);
        });

        es.addEventListener('complete', (e: MessageEvent) => {
          const data = JSON.parse(e.data as string) as MediaProgressEvent;
          rec.close(); // Done — no reconnect needed
          onProgressRef.current?.(data.done, data.total);
          onCompleteRef.current?.();
        });

        es.addEventListener('aborted', () => {
          rec.close(); // Server aborted — no reconnect needed
        });
      },
    });

    return () => rec.close();
  }, [channelId, key, qc, accessToken]); // key forces reconnect on each fetch
}
