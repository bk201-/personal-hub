import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Mocks (must be before any imports that touch them) ─────────────────────

vi.mock('../config.js', () => ({
  OPENAI_TTS_MODEL: 'gpt-4o-mini-tts',
  OPENAI_TTS_VOICE_DEFAULT: 'nova',
  OPENAI_TTS_VOICES: ['nova', 'alloy', 'echo'] as const,
  TTS_MAX_INPUT_CHARS: 100,
}));

vi.mock('../logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), fatal: vi.fn(), debug: vi.fn() },
}));

const isTtsConfiguredMock = vi.fn().mockReturnValue(true);
vi.mock('../services/openaiClient.js', () => ({
  isTtsConfigured: () => isTtsConfiguredMock(),
  createTtsClient: vi.fn(),
}));

const startOrGetTtsMock = vi.fn();
vi.mock('../services/ttsService.js', () => ({
  startOrGetTts: (...args: unknown[]) => startOrGetTtsMock(...args),
  getTtsStatus: vi.fn(),
  touchTts: vi.fn(),
  ttsChunkPath: vi.fn(),
}));

import { Hono } from 'hono';
import ttsRouter from './tts.js';

function createApp() {
  const app = new Hono();
  app.route('/api/tts', ttsRouter);
  return app;
}

describe('TTS routes (integration)', () => {
  let app: ReturnType<typeof createApp>;

  beforeAll(() => {
    app = createApp();
  });

  beforeEach(() => {
    isTtsConfiguredMock.mockReset();
    isTtsConfiguredMock.mockReturnValue(true);
    startOrGetTtsMock.mockReset();
  });

  // ── GET /api/tts/config ───────────────────────────────────────────────────

  describe('GET /api/tts/config', () => {
    it('returns the configured model, default voice, voices list and char limit', async () => {
      const res = await app.request('/api/tts/config');
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        enabled: boolean;
        defaultVoice: string;
        voices: string[];
        maxInputChars: number;
        model: string;
      };
      expect(body.enabled).toBe(true);
      expect(body.defaultVoice).toBe('nova');
      expect(body.voices).toEqual(['nova', 'alloy', 'echo']);
      expect(body.maxInputChars).toBe(100);
      expect(body.model).toBe('gpt-4o-mini-tts');
    });

    it('reflects isTtsConfigured() === false in the enabled flag', async () => {
      isTtsConfiguredMock.mockReturnValue(false);
      const res = await app.request('/api/tts/config');
      const body = (await res.json()) as { enabled: boolean };
      expect(body.enabled).toBe(false);
    });
  });

  // ── POST /api/tts ─────────────────────────────────────────────────────────

  describe('POST /api/tts', () => {
    it('returns 503 when TTS is not configured', async () => {
      isTtsConfiguredMock.mockReturnValue(false);
      const res = await app.request('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: 'hello' }),
      });
      expect(res.status).toBe(503);
      expect(startOrGetTtsMock).not.toHaveBeenCalled();
    });

    it('returns 413 when text exceeds TTS_MAX_INPUT_CHARS', async () => {
      const res = await app.request('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: 'a'.repeat(101) }),
      });
      expect(res.status).toBe(413);
      const body = (await res.json()) as { error: string; maxInputChars: number };
      expect(body.maxInputChars).toBe(100);
      expect(startOrGetTtsMock).not.toHaveBeenCalled();
    });

    it('returns 400 when an unknown voice is supplied', async () => {
      const res = await app.request('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: 'hello', voice: 'bogus-voice' }),
      });
      expect(res.status).toBe(400);
      const body = (await res.json()) as { error: string; voices: string[] };
      expect(body.error).toContain('bogus-voice');
      expect(body.voices).toEqual(['nova', 'alloy', 'echo']);
      expect(startOrGetTtsMock).not.toHaveBeenCalled();
    });

    it('accepts a known voice and forwards it to startOrGetTts', async () => {
      startOrGetTtsMock.mockResolvedValue({
        hash: 'a'.repeat(64),
        status: 'pending',
        chunksTotal: 1,
        chunksDone: 0,
        error: null,
        cached: false,
      });
      const res = await app.request('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: 'hello', voice: 'echo' }),
      });
      expect(res.status).toBe(200);
      expect(startOrGetTtsMock).toHaveBeenCalledWith('hello', 'echo');
    });

    it('omits the voice arg to startOrGetTts when none provided', async () => {
      startOrGetTtsMock.mockResolvedValue({
        hash: 'b'.repeat(64),
        status: 'done',
        chunksTotal: 1,
        chunksDone: 1,
        error: null,
        cached: true,
      });
      const res = await app.request('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: 'hello' }),
      });
      expect(res.status).toBe(200);
      expect(startOrGetTtsMock).toHaveBeenCalledWith('hello', undefined);
    });
  });
});
