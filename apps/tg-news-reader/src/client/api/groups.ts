import type { CreateGroupInput, UpdateGroupInput } from '@shared/schemas.ts';
import type { Group } from '@shared/types.ts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../store/authStore';
import { api } from './client';

export const groupKeys = { all: ['groups'] as const };

export function useGroups() {
  return useQuery({ queryKey: groupKeys.all, queryFn: () => api.get<Group[]>('/groups') });
}

export function useCreateGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateGroupInput) => api.post<Group>('/groups', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: groupKeys.all }),
  });
}

export function useUpdateGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: UpdateGroupInput & { id: number }) => api.put<Group>('/groups/' + id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: groupKeys.all }),
  });
}

export function useDeleteGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.delete('/groups/' + id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: groupKeys.all });
      // Also invalidate channels since group_id may have changed
      void qc.invalidateQueries({ queryKey: ['channels'] });
    },
  });
}

export function useVerifyGroupPIN() {
  const updateToken = useAuthStore((s) => s.updateToken);
  return useMutation({
    mutationFn: ({ id, pin }: { id: number; pin: string }) =>
      api.post<{ success: boolean; accessToken?: string; unlockedGroupIds?: number[] }>(
        '/groups/' + id + '/verify-pin',
        { pin },
      ),
    onSuccess: (data) => {
      if (data.accessToken) updateToken(data.accessToken);
    },
  });
}

export function useReorderGroups() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (items: { id: number; sortOrder: number }[]) =>
      api.patch<{ ok: boolean }>('/groups/reorder', { items }),
    onSuccess: () => qc.invalidateQueries({ queryKey: groupKeys.all }),
  });
}

export function useLockAllGroups() {
  const updateToken = useAuthStore((s) => s.updateToken);
  return useMutation({
    mutationFn: () => api.post<{ success: boolean; accessToken?: string }>('/groups/lock-all', {}),
    onSuccess: (data) => {
      // Refresh token so the new empty unlockedGroupIds is encoded and persisted
      if (data.accessToken) updateToken(data.accessToken);
    },
  });
}
