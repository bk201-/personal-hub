import type { CreateChannelInput, FetchChannelInput, UpdateChannelInput } from '@shared/schemas.ts';
import type { Channel } from '@shared/types.ts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App } from 'antd';
import { useTranslation } from 'react-i18next';
import { api } from './client';

export const channelKeys = { all: ['channels'] as const, fetch: ['channels', 'fetch'] as const };

export function useChannels() {
  return useQuery({ queryKey: channelKeys.all, queryFn: () => api.get<Channel[]>('/channels') });
}

export function useCreateChannel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateChannelInput) => api.post<Channel>('/channels', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: channelKeys.all }),
  });
}

export function useUpdateChannel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: UpdateChannelInput & { id: number }) => api.put<Channel>('/channels/' + id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: channelKeys.all }),
  });
}

export function useDeleteChannel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.delete('/channels/' + id),
    onSuccess: () => qc.invalidateQueries({ queryKey: channelKeys.all }),
  });
}

export function useFetchChannel() {
  const qc = useQueryClient();
  const { message } = App.useApp();
  const { t } = useTranslation();
  return useMutation({
    mutationKey: channelKeys.fetch,
    mutationFn: ({ id, since, limit }: FetchChannelInput & { id: number }) =>
      api.post<{
        inserted: number;
        total: number;
        mediaProcessing?: boolean;
        totalNewsCount: number;
        unreadCount: number;
      }>('/channels/' + id + '/fetch', {
        since,
        limit,
      }),
    onSuccess: (data, variables) => {
      // Update lastFetchedAt + counts from server (accurate after read-cleanup)
      const now = Math.floor(Date.now() / 1000);
      qc.setQueryData<Channel[]>(channelKeys.all, (old) =>
        old
          ? old.map((ch) =>
              ch.id === variables.id
                ? {
                    ...ch,
                    isUnavailable: 0,
                    lastFetchedAt: now,
                    unreadCount: data.unreadCount ?? ch.unreadCount + (data.inserted ?? 0),
                    totalNewsCount: data.totalNewsCount ?? ch.totalNewsCount + (data.inserted ?? 0),
                  }
                : ch,
            )
          : old,
      );
    },
    onError: (error) => {
      void message.error(t('channels.refresh_failed', { error: error.message }));
    },
    onSettled: (_data, _error, variables) =>
      Promise.all([
        qc.invalidateQueries({ queryKey: channelKeys.all }),
        qc.invalidateQueries({ queryKey: ['news', variables.id] }),
      ]),
  });
}

export function useReorderChannels() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (items: { id: number; sortOrder: number }[]) =>
      api.patch<{ ok: boolean }>('/channels/reorder', { items }),
    onSuccess: () => qc.invalidateQueries({ queryKey: channelKeys.all }),
  });
}

export function useMarkReadAndFetch() {
  const qc = useQueryClient();
  const { message } = App.useApp();
  const { t } = useTranslation();
  return useMutation({
    mutationKey: channelKeys.fetch,
    mutationFn: (id: number) =>
      api.post<{
        inserted: number;
        total: number;
        mediaProcessing?: boolean;
        totalNewsCount: number;
        unreadCount: number;
      }>('/channels/' + id + '/mark-read-and-fetch', {}),
    onSuccess: (data, channelId) => {
      const now = Math.floor(Date.now() / 1000);
      qc.setQueryData<Channel[]>(channelKeys.all, (old) =>
        old
          ? old.map((ch) =>
              ch.id === channelId
                ? {
                    ...ch,
                    isUnavailable: 0,
                    lastFetchedAt: now,
                    unreadCount: data.unreadCount ?? data.inserted ?? 0,
                    totalNewsCount: data.totalNewsCount ?? ch.totalNewsCount + (data.inserted ?? 0),
                  }
                : ch,
            )
          : old,
      );
    },
    onError: (error) => {
      void message.error(t('channels.refresh_failed', { error: error.message }));
    },
    onSettled: (_data, _error, channelId) =>
      Promise.all([
        qc.invalidateQueries({ queryKey: channelKeys.all }),
        qc.invalidateQueries({ queryKey: ['news', channelId] }),
      ]),
  });
}

export interface ChannelLookupResult {
  name: string;
  username: string | null;
  description: string | null;
}

export function useChannelLookup() {
  return useMutation({
    mutationFn: (username: string) =>
      api.get<ChannelLookupResult>('/channels/lookup?username=' + encodeURIComponent(username)),
  });
}
