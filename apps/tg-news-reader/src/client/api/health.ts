import { useQuery } from '@tanstack/react-query';
import { api } from './client';

export interface HealthStatus {
  status: 'ok' | 'degraded';
  timestamp: number;
  uptime: number;
  db: 'ok' | 'error';
  telegram: {
    circuit: 'closed' | 'open' | 'half-open';
    sessionExpired: boolean;
  };
}

/** Polls /api/health every 5 min to detect Telegram session expiry. Lightweight public endpoint. */
export function useHealthStatus() {
  return useQuery<HealthStatus>({
    queryKey: ['health'],
    queryFn: () => api.get<HealthStatus>('/health'),
    refetchInterval: 5 * 60_000, // 5 min — session expiry is not time-critical
    staleTime: 60_000,
    retry: false,
  });
}
