import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Mocks ──────────────────────────────────────────────────────────────────

vi.mock('../config.js', () => ({
  JWT_SECRET: 'test-secret-key',
  JWT_ACCESS_EXPIRES_SEC: 900,
  REFRESH_EXPIRES_DAYS: 7,
}));

vi.mock('../logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), fatal: vi.fn(), debug: vi.fn() },
}));

vi.mock('../services/readability.js', () => ({
  extractContentFromUrl: vi.fn(),
  buildFullContent: vi.fn(),
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
import { extractContentFromUrl, buildFullContent } from '../services/readability.js';
import contentRouter from './content.js';

function createApp() {
  const app = new Hono();
  app.use('/api/*', authMiddleware);
  app.route('/api/content', contentRouter);
  return app;
}

describe('Content routes (integration)', () => {
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
    app = createApp();
    vi.clearAllMocks();
  });

  // ── GET /api/content?url=... ────────────────────────────────────────────

  describe('GET /', () => {
    it('returns 400 when url param is missing', async () => {
      const res = await app.request('/api/content', { headers });
      expect(res.status).toBe(400);
    });

    it('returns extracted content from URL', async () => {
      const mockExtracted = { content: 'Article text', textContent: 'Article text', title: 'Title' };
      vi.mocked(extractContentFromUrl).mockResolvedValueOnce(mockExtracted);

      const res = await app.request('/api/content?url=https://example.com/article', { headers });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.title).toBe('Title');
      expect(extractContentFromUrl).toHaveBeenCalledWith('https://example.com/article');
    });

    it('returns 500 when extraction fails', async () => {
      vi.mocked(extractContentFromUrl).mockRejectedValueOnce(new Error('Network error'));

      const res = await app.request('/api/content?url=https://fail.com', { headers });
      expect(res.status).toBe(500);
      expect((await res.json()).error).toBe('Network error');
    });
  });

  // ── POST /api/content/news/:id ──────────────────────────────────────────

  describe('POST /news/:id', () => {
    it('returns 404 for missing news item', async () => {
      const res = await app.request('/api/content/news/99999', {
        method: 'POST',
        headers,
      });
      expect(res.status).toBe(404);
    });

    it('returns 400 when news has no links', async () => {
      const ch = await seedChannel(testDb.db);
      const n = await seedNews(testDb.db, ch.id, { text: 'no links', links: [] });

      const res = await app.request(`/api/content/news/${n.id}`, {
        method: 'POST',
        headers,
      });
      expect(res.status).toBe(400);
      expect((await res.json()).error).toContain('No links');
    });

    it('extracts content and saves to DB', async () => {
      const ch = await seedChannel(testDb.db);
      const n = await seedNews(testDb.db, ch.id, {
        text: 'check this out',
        links: ['https://example.com/article'],
      });

      const mockExtracted = { content: 'Full article', textContent: 'Full article', title: 'Title' };
      vi.mocked(extractContentFromUrl).mockResolvedValueOnce(mockExtracted);
      vi.mocked(buildFullContent).mockReturnValueOnce({ content: '# Title\n\nFull article', format: 'markdown' });

      const res = await app.request(`/api/content/news/${n.id}`, {
        method: 'POST',
        headers,
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.fullContent).toBe('# Title\n\nFull article');
      expect(body.fullContentFormat).toBe('markdown');
      expect(extractContentFromUrl).toHaveBeenCalledWith('https://example.com/article');
    });

    it('returns 500 when extraction fails', async () => {
      const ch = await seedChannel(testDb.db);
      const n = await seedNews(testDb.db, ch.id, {
        links: ['https://fail.com'],
      });

      vi.mocked(extractContentFromUrl).mockRejectedValueOnce(new Error('Timeout'));

      const res = await app.request(`/api/content/news/${n.id}`, {
        method: 'POST',
        headers,
      });
      expect(res.status).toBe(500);
    });
  });
});
