import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '../store/authStore';

vi.mock('../store/authStore', async () => {
  const { create } = await import('zustand');
  const store = create(() => ({ accessToken: null as string | null }));
  return { useAuthStore: store };
});

describe('streamDigest', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    (useAuthStore as any).setState({ accessToken: 'test-jwt' });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  function makeSSEStream(lines: string[]): ReadableStream<Uint8Array> {
    const text = lines.join('\n') + '\n';
    const encoder = new TextEncoder();
    return new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(text));
        controller.close();
      },
    });
  }

  it('yields chunk events from data lines', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      body: makeSSEStream(['data: {"content":"Hello"}', '', 'data: {"content":" world"}', '']),
    });

    const { streamDigest } = await import('./digest');
    const events = [];
    for await (const event of streamDigest({ channelIds: [1] }, new AbortController().signal)) {
      events.push(event);
    }
    expect(events).toEqual([
      { type: 'chunk', content: 'Hello' },
      { type: 'chunk', content: ' world' },
    ]);
  });

  it('yields ref_map events', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      body: makeSSEStream(['event: ref_map', 'data: {"1":100,"2":200}', '']),
    });

    const { streamDigest } = await import('./digest');
    const events = [];
    for await (const event of streamDigest({}, new AbortController().signal)) {
      events.push(event);
    }
    expect(events).toEqual([{ type: 'ref_map', map: { 1: 100, 2: 200 } }]);
  });

  it('yields prefetch_progress events', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      body: makeSSEStream(['event: prefetch_progress', 'data: {"done":3,"total":10,"errors":1}', '']),
    });

    const { streamDigest } = await import('./digest');
    const events = [];
    for await (const event of streamDigest({}, new AbortController().signal)) {
      events.push(event);
    }
    expect(events).toEqual([{ type: 'prefetch_progress', done: 3, total: 10, errors: 1 }]);
  });

  it('throws on error message from server', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      body: makeSSEStream(['data: {"message":"Something failed"}', '']),
    });

    const { streamDigest } = await import('./digest');
    await expect(async () => {
      for await (const _event of streamDigest({}, new AbortController().signal)) {
        // consume
      }
    }).rejects.toThrow('Something failed');
  });

  it('throws on non-ok HTTP response', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ error: 'Internal error' }),
    });

    const { streamDigest } = await import('./digest');
    await expect(async () => {
      for await (const _event of streamDigest({}, new AbortController().signal)) {
        // consume
      }
    }).rejects.toThrow('Internal error');
  });

  it('throws when response body is missing', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      body: null,
    });

    const { streamDigest } = await import('./digest');
    await expect(async () => {
      for await (const _event of streamDigest({}, new AbortController().signal)) {
        // consume
      }
    }).rejects.toThrow('No response body');
  });

  it('skips malformed JSON lines', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      body: makeSSEStream(['data: not-json', 'data: {"content":"ok"}', '']),
    });

    const { streamDigest } = await import('./digest');
    const events = [];
    for await (const event of streamDigest({}, new AbortController().signal)) {
      events.push(event);
    }
    expect(events).toEqual([{ type: 'chunk', content: 'ok' }]);
  });
});
