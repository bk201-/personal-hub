import type { ChannelStorageStats } from '@shared/types.ts';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '../store/authStore';
import { api } from './client';

export function useChannelStorage(channelId: number, enabled: boolean) {
  const userId = useAuthStore((s) => s.user?.id);
  const accessToken = useAuthStore((s) => s.accessToken);
  const unlockedGroups = useAuthStore((s) => s.unlockedGroupIds.join(','));
  return useQuery({
    queryKey: ['channelStorage', userId, unlockedGroups, channelId],
    queryFn: () => api.get<ChannelStorageStats>(`/channels/${channelId}/storage`),
    enabled: enabled && !!accessToken,
    staleTime: 60_000,
    gcTime: 60_000,
    retry: false,
    refetchOnWindowFocus: false,
  });
}
