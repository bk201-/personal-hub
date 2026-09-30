import type { BatchFiltersInput, CreateFilterInput, UpdateFilterInput } from '@shared/schemas.ts';
import type { Filter, FilterStat } from '@shared/types.ts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';

export const filterKeys = {
  byChannel: (channelId: number) => ['filters', channelId] as const,
  stats: (channelId: number) => ['filter-stats', channelId] as const,
};

export function useFilters(channelId: number) {
  return useQuery({
    queryKey: filterKeys.byChannel(channelId),
    queryFn: () => api.get<Filter[]>(`/channels/${channelId}/filters`),
    enabled: !!channelId,
  });
}

export function useFilterStats(channelId: number) {
  return useQuery({
    queryKey: filterKeys.stats(channelId),
    queryFn: () => api.get<FilterStat[]>(`/channels/${channelId}/filters/stats`),
    enabled: !!channelId,
  });
}

export function useCreateFilter(channelId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateFilterInput) => api.post<Filter>(`/channels/${channelId}/filters`, data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: filterKeys.byChannel(channelId) });
      void qc.invalidateQueries({ queryKey: ['news', channelId] });
    },
  });
}

export function useUpdateFilter(channelId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: UpdateFilterInput & { id: number }) =>
      api.put<Filter>(`/channels/${channelId}/filters/${id}`, data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: filterKeys.byChannel(channelId) });
      void qc.invalidateQueries({ queryKey: ['news', channelId] });
    },
  });
}

export function useDeleteFilter(channelId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.delete(`/channels/${channelId}/filters/${id}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: filterKeys.byChannel(channelId) });
      void qc.invalidateQueries({ queryKey: ['news', channelId] });
    },
  });
}

/** Single request that adds and deletes multiple tag filters at once. */
export function useBatchFilters(channelId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: BatchFiltersInput) =>
      api.post<{ added: Filter[]; deleted: number }>(`/channels/${channelId}/filters/batch`, data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: filterKeys.byChannel(channelId) });
      void qc.invalidateQueries({ queryKey: ['news', channelId] });
    },
  });
}
