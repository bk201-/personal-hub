import type { CreateDigestInput } from '@shared/schemas.ts';
import { useAuthStore } from '../store/authStore';

export type DigestParams = CreateDigestInput;

export type DigestEvent =
  | { type: 'chunk'; content: string }
  | { type: 'ref_map'; map: Record<number, number> }
  | { type: 'prefetch_progress'; done: number; total: number; errors: number };

/**
 * Streams a digest from POST /api/digest.
 * Returns an async generator that yields DigestEvents (chunk or ref_map).
 * Caller is responsible for aborting via AbortController.
 * @yields {DigestEvent} Streamed digest events from the server SSE response.
 */
export async function* streamDigest(
  params: DigestParams,
  signal: AbortSignal,
): AsyncGenerator<DigestEvent, void, unknown> {
  const token = useAuthStore.getState().accessToken;

  const response = await fetch('/api/digest', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(params),
    signal,
  });

  if (!response.ok) {
    const err = (await response.json().catch(() => ({ error: 'Unknown error' }))) as { error?: string };
    throw new Error(err.error ?? `HTTP ${response.status}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error('No response body');

  const decoder = new TextDecoder();
  let buffer = '';
  let currentEvent = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    // Parse SSE lines from buffer
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      if (line.startsWith('event: ')) {
        currentEvent = line.slice(7).trim();
        continue;
      }
      if (line === '') {
        currentEvent = '';
        continue;
      }
      if (line.startsWith('data: ')) {
        const rawData = line.slice(6).trim();
        if (!rawData) continue;

        // Skip malformed JSON lines; other exceptions propagate to the caller
        let parsed: Record<string, unknown>;
        try {
          parsed = JSON.parse(rawData) as Record<string, unknown>;
        } catch {
          continue;
        }

        if (currentEvent === 'ref_map') {
          const map: Record<number, number> = {};
          for (const [k, v] of Object.entries(parsed)) {
            map[parseInt(k, 10)] = v as number;
          }
          yield { type: 'ref_map', map };
        } else if (currentEvent === 'prefetch_progress') {
          yield {
            type: 'prefetch_progress',
            done: parsed.done as number,
            total: parsed.total as number,
            errors: parsed.errors as number,
          };
        } else if (typeof parsed.content === 'string') {
          yield { type: 'chunk', content: parsed.content };
        } else if (typeof parsed.message === 'string') {
          throw new Error(parsed.message);
        }
        currentEvent = '';
      }
    }
  }
}
