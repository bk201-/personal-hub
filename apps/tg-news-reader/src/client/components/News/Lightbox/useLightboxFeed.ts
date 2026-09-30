import { useQueryClient } from '@tanstack/react-query';
import type { InfiniteData } from '@tanstack/react-query';
import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { flattenPaginatedItems } from '../../../api/news';
import type { NewsResponse } from '../../../api/news';
import { useUIStore } from '../../../store/uiStore';

/** Observe the active feed cache without mounting a refetching query observer. */
export function useLightboxFeed(channelId: number) {
  const qc = useQueryClient();
  const mode = useUIStore((s) => s.newsFilterMode);
  const tag = useUIStore((s) => s.hashTagFilter);
  const subscribe = useCallback((notify: () => void) => qc.getQueryCache().subscribe(notify), [qc]);
  const snapshot = useCallback(
    () => qc.getQueryData<InfiniteData<NewsResponse>>(['news', channelId, mode]),
    [qc, channelId, mode],
  );
  const data = useSyncExternalStore(subscribe, snapshot);
  return useMemo(() => {
    const items = flattenPaginatedItems(data);
    const normalized = tag?.toLowerCase().replace(/^#/, '');
    return {
      items: normalized
        ? items.filter((item) => item.hashtags.some((h) => h.toLowerCase().replace(/^#/, '') === normalized))
        : items,
      pageKey: JSON.stringify([channelId, mode, tag, data?.pageParams, data?.pages.at(-1)?.nextCursor]),
    };
  }, [data, tag, channelId, mode]);
}
