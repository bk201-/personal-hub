import { useQuery } from '@tanstack/react-query';
import { api } from './client';

export interface ServerLogEntry {
  time: number;
  level: number;
  module?: string;
  msg: string;
  [key: string]: unknown;
}

export interface ServerLogsResponse {
  entries: ServerLogEntry[];
  total: number;
  bufferSize: number;
  sinceMs: number;
  minLevel: number;
}

export const LOG_LEVEL_OPTIONS = [
  { value: 'debug', label: 'Debug+', num: 20 },
  { value: 'info', label: 'Info+', num: 30 },
  { value: 'warn', label: 'Warn+', num: 40 },
  { value: 'error', label: 'Error+', num: 50 },
] as const;

export const HOURS_OPTIONS = [
  { value: 0.5, label: '30 min' },
  { value: 1, label: '1 h' },
  { value: 2, label: '2 h' },
  { value: 6, label: '6 h' },
  { value: 24, label: '24 h' },
] as const;

export function useServerLogs(hours: number, level: string, enabled: boolean) {
  return useQuery<ServerLogsResponse>({
    queryKey: ['server-logs', hours, level],
    queryFn: () => api.get<ServerLogsResponse>(`/logs?hours=${hours}&level=${level}`),
    enabled,
    refetchInterval: enabled ? 30_000 : false,
    staleTime: 15_000,
  });
}
