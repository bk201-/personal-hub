import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Mocks ──────────────────────────────────────────────────────────────────

vi.mock('../config.js', () => ({
  JWT_SECRET: 'test-secret-key',
  JWT_ACCESS_EXPIRES_SEC: 900,
  REFRESH_EXPIRES_DAYS: 7,
  DIGEST_MAX_ITEMS: 200,
  DIGEST_ARTICLE_CONTENT_LIMIT: 1500,
  DIGEST_ARTICLE_PREFETCH_TIMEOUT_MS: 100, // very short for tests
  DIGEST_MAX_PREFETCH: 20,
}));

vi.mock('../logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), fatal: vi.fn(), debug: vi.fn() },
}));

vi.mock('../services/openaiClient.js', () => ({
  isAiConfigured: vi.fn(),
  createOpenAiClient: vi.fn(),
  DIGEST_DEPLOYMENT: 'gpt-4o-mini',
}));

vi.mock('../services/downloadManager.js', () => ({
  enqueueTask: vi.fn(),
}));

import { Hono } from 'hono';
import { createTestUser, authHeaders } from '../__tests__/auth.js';
import { seedChannel, seedNews } from '../__tests__/seed.js';
import { createTestDb } from '../__tests__/testDb.js';
import type { TestDb } from '../__tests__/testDb.js';

let testDb: TestDb;

vi.mock('../db/index.js', () => ({
  get client() {
    return testDb.client;
  },
  get db() {
    return testDb.db;
  },
}));

import { authMiddleware } from '../middleware/auth.js';
import { isAiConfigured, createOpenAiClient } from '../services/openaiClient.js';
import digestRouter from './digest.js';

function createApp() {
  const app = new Hono();
  app.use('/api/*', authMiddleware);
  app.route('/api/digest', digestRouter);
  return app;
}

/** Parse SSE text into array of { event, data } */
function parseSSE(text: string): Array<{ event: string; data: string }> {
  const events: Array<{ event: string; data: string }> = [];
  const blocks = text.split('\n\n').filter(Boolean);
  for (const block of blocks) {
    const lines = block.split('\n');
    let event = '';
    let data = '';
    for (const line of lines) {
      if (line.startsWith('event:')) event = line.slice(6).trim();
      if (line.startsWith('data:')) data = line.slice(5).trim();
    }
    if (event) events.push({ event, data });
  }
  return events;
}

describe('Digest routes (integration)', () => {
  let app: ReturnType<typeof createApp>;
  let headers: Record<string, string>;

  beforeAll(async () => {
    testDb = await createTestDb();
    const user = await createTestUser(testDb.db);
    headers = await authHeaders(user.id);
  });

  beforeEach(async () => {
    await testDb.client.execute('DELETE FROM news');
    await testDb.client.execute('DELETE FROM channels');
    await testDb.client.execute('DELETE FROM groups');
    app = createApp();
    vi.clearAllMocks();
  });

  // ── POST /api/digest ──────────────────────────────────────────────────────

  describe('POST /', () => {
    it('returns 401 without auth', async () => {
      const res = await app.request('/api/digest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(401);
    });

    it('returns 503 when AI is not configured', async () => {
      vi.mocked(isAiConfigured).mockReturnValue(false);

      const res = await app.request('/api/digest', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(503);
      const body = await res.json();
      expect(body.error).toBe('AI provider not configured');
    });

    it('returns 404 when no news items match', async () => {
      vi.mocked(isAiConfigured).mockReturnValue(true);

      const res = await app.request('/api/digest', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelIds: [9999] }),
      });

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toContain('No news items');
    });

    it('returns 404 when group has no channels', async () => {
      vi.mocked(isAiConfigured).mockReturnValue(true);

      const res = await app.request('/api/digest', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ groupId: 9999 }),
      });

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toContain('No channels');
    });

    it('streams SSE digest for valid news items', async () => {
      vi.mocked(isAiConfigured).mockReturnValue(true);

      const ch = await seedChannel(testDb.db);
      await seedNews(testDb.db, ch.id, { text: 'News item 1', postedAt: Math.floor(Date.now() / 1000) });
      await seedNews(testDb.db, ch.id, { text: 'News item 2', postedAt: Math.floor(Date.now() / 1000) - 60 });

      // Mock the OpenAI streaming response
      const mockChunks = [
        { choices: [{ delta: { content: '## Digest\n' } }] },
        { choices: [{ delta: { content: '- Item 1 summary [1]\n' } }] },
        { choices: [{ delta: { content: '- Item 2 summary [2]' } }] },
      ];

      vi.mocked(createOpenAiClient).mockReturnValue({
        chat: {
          completions: {
            create: vi.fn().mockResolvedValue({
              [Symbol.asyncIterator]: async function* () {
                for (const chunk of mockChunks) yield chunk;
              },
            }),
          },
        },
      } as unknown as ReturnType<typeof createOpenAiClient>);

      const res = await app.request('/api/digest', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelIds: [ch.id] }),
      });

      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Type')).toContain('text/event-stream');

      const text = await res.text();
      const events = parseSSE(text);

      // Should have ref_map, chunk events, and done
      const eventTypes = events.map((e) => e.event);
      expect(eventTypes).toContain('ref_map');
      expect(eventTypes).toContain('chunk');
      expect(eventTypes).toContain('done');
    });

    it('streams error event when OpenAI call fails', async () => {
      vi.mocked(isAiConfigured).mockReturnValue(true);

      const ch = await seedChannel(testDb.db);
      await seedNews(testDb.db, ch.id, { text: 'Some news', postedAt: Math.floor(Date.now() / 1000) });

      vi.mocked(createOpenAiClient).mockReturnValue({
        chat: {
          completions: {
            create: vi.fn().mockRejectedValue(new Error('OpenAI rate limit')),
          },
        },
      } as unknown as ReturnType<typeof createOpenAiClient>);

      const res = await app.request('/api/digest', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelIds: [ch.id] }),
      });

      expect(res.status).toBe(200); // SSE always starts 200
      const text = await res.text();
      const events = parseSSE(text);

      const errorEvent = events.find((e) => e.event === 'error');
      expect(errorEvent).toBeDefined();
      expect(JSON.parse(errorEvent!.data).message).toBe('OpenAI rate limit');
    });
  });
});
