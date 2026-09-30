import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useAuthStore } from '../store/authStore';
import { api } from './client';
import type { ApiError } from './client';

export interface TtsConfigDto {
  enabled: boolean;
  defaultVoice: string;
  /** All voices supported by the configured TTS model (e.g. `gpt-4o-mini-tts`). */
  voices: string[];
  maxInputChars: number;
  model: string;
}

export interface TtsJobStatusDto {
  hash: string;
  status: 'pending' | 'processing' | 'done' | 'failed';
  chunksTotal: number;
  chunksDone: number;
  error: string | null;
}

export interface TtsStartResultDto extends TtsJobStatusDto {
  cached: boolean;
}

export interface GenerateTtsBody {
  text: string;
  voice?: string;
}

/** Server-side TTS configuration (enabled?, default voice, char limit). */
export function useTtsConfig() {
  return useQuery<TtsConfigDto, ApiError>({
    queryKey: ['tts', 'config'],
    queryFn: () => api.get<TtsConfigDto>('/tts/config'),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
}

/** Kicks off (or finds cached) TTS generation. Returns `{ hash, status, cached, ... }`. */
export function useGenerateTts() {
  return useMutation<TtsStartResultDto, ApiError, GenerateTtsBody>({
    mutationFn: (body) => api.post<TtsStartResultDto>('/tts', body),
    retry: false,
  });
}

/**
 * Polls `/api/tts/:hash/status` every 1s while `status` is pending/processing.
 * Pass `null` as `hash` to disable.
 */
export function useTtsStatus(hash: string | null) {
  return useQuery<TtsJobStatusDto, ApiError>({
    queryKey: ['tts', 'status', hash],
    queryFn: () => api.get<TtsJobStatusDto>(`/tts/${hash}/status`),
    enabled: !!hash,
    refetchInterval: (q) => {
      const s = q.state.data?.status;
      return s === 'pending' || s === 'processing' ? 1000 : false;
    },
    retry: false,
  });
}

/**
 * Returns an authenticated URL for a single TTS chunk MP3.
 * The query-param token pattern is required because <audio> cannot send Authorization headers.
 *
 * Reactive: re-reads the token from the auth store via a subscription so the URL refreshes
 * after a token rotation. (Useful for long-lived <audio> elements.)
 *
 * Pass `null` for hash to disable. `idx` defaults to 0 for the first chunk.
 */
export function useTtsAudioUrl(hash: string | null, idx = 0): string | null {
  const [token, setToken] = useState(() => useAuthStore.getState().accessToken);
  useEffect(() => {
    return useAuthStore.subscribe((s) => setToken(s.accessToken));
  }, []);
  if (!hash) return null;
  const base = `/api/tts/${hash}/${idx}.mp3`;
  return token ? `${base}?token=${encodeURIComponent(token)}` : base;
}
