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

vi.mock('fs', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    existsSync: vi.fn(),
    statSync: vi.fn(),
    createReadStream: vi.fn(),
  };
});

import { existsSync, statSync, createReadStream } from 'fs';
import { Readable } from 'stream';
import { Hono } from 'hono';
import { createTestSession, createTestUser, authHeaders, generateTestToken } from '../__tests__/auth.js';
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
import mediaRouter from './media.js';

function createApp() {
  const app = new Hono();
  app.use('/api/*', authMiddleware);
  app.route('/api/media', mediaRouter);
  return app;
}

function mockFileExists(size: number) {
  vi.mocked(existsSync).mockReturnValue(true);
  vi.mocked(statSync).mockReturnValue({ size } as ReturnType<typeof statSync>);
  const readable = Readable.from(Buffer.alloc(size, 'x'));
  vi.mocked(createReadStream).mockReturnValue(readable as ReturnType<typeof createReadStream>);
}

describe('Media routes (integration)', () => {
  let app: ReturnType<typeof createApp>;
  let headers: Record<string, string>;
  let mediaCookie: string;

  beforeAll(async () => {
    testDb = await createTestDb();
    const user = await createTestUser(testDb.db);
    headers = await authHeaders(user.id);
    const session = await createTestSession(testDb.db, user.id);
    const mediaToken = await generateTestToken(user.id, { sessionId: session.id });
    mediaCookie = `media_token=${mediaToken}`;
  });

  beforeEach(() => {
    app = createApp();
    vi.clearAllMocks();
  });

  // ── GET /api/media/:channel/:filename ──────────────────────────────────────

  describe('GET /:channel/:filename', () => {
    it('returns 401 without auth', async () => {
      const res = await app.request('/api/media/testChannel/photo.jpg');
      expect(res.status).toBe(401);
    });

    it('accepts a valid media cookie so the media URL stays stable across access-token rotation', async () => {
      mockFileExists(1024);

      const res = await app.request('/api/media/testChannel/video.mp4', {
        headers: { Cookie: mediaCookie },
      });

      expect(res.status).toBe(200);
    });

    it('returns 400 for path traversal in channel', async () => {
      const res = await app.request('/api/media/..%2F..%2Fetc/passwd', { headers });
      expect(res.status).toBe(400);
    });

    it('returns 400 for path traversal in filename', async () => {
      const res = await app.request('/api/media/testChannel/..%2Fsecret.txt', { headers });
      expect(res.status).toBe(400);
    });

    it('returns 404 when file does not exist', async () => {
      vi.mocked(existsSync).mockReturnValue(false);

      const res = await app.request('/api/media/testChannel/missing.jpg', { headers });
      expect(res.status).toBe(404);
    });

    it('serves a full file with correct content type for jpg', async () => {
      mockFileExists(1024);

      const res = await app.request('/api/media/testChannel/photo.jpg', { headers });
      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Type')).toBe('image/jpeg');
      expect(res.headers.get('Content-Length')).toBe('1024');
      expect(res.headers.get('Accept-Ranges')).toBe('bytes');
      expect(res.headers.get('Cache-Control')).toBe('public, max-age=86400');
    });

    it('serves correct MIME for png', async () => {
      mockFileExists(512);

      const res = await app.request('/api/media/testChannel/image.png', { headers });
      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Type')).toBe('image/png');
    });

    it('serves correct MIME for mp4 video', async () => {
      mockFileExists(10000);

      const res = await app.request('/api/media/testChannel/video.mp4', { headers });
      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Type')).toBe('video/mp4');
    });

    it('serves correct MIME for webm video', async () => {
      mockFileExists(5000);

      const res = await app.request('/api/media/testChannel/clip.webm', { headers });
      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Type')).toBe('video/webm');
    });

    it('serves correct MIME for gif', async () => {
      mockFileExists(300);

      const res = await app.request('/api/media/testChannel/anim.gif', { headers });
      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Type')).toBe('image/gif');
    });

    it('falls back to application/octet-stream for unknown extension', async () => {
      mockFileExists(100);

      const res = await app.request('/api/media/testChannel/file.xyz', { headers });
      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Type')).toBe('application/octet-stream');
    });

    // ── Range requests ────────────────────────────────────────────────────

    it('responds with 206 for valid range request', async () => {
      const fileSize = 10000;
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(statSync).mockReturnValue({ size: fileSize } as ReturnType<typeof statSync>);
      const readable = Readable.from(Buffer.alloc(500, 'x'));
      vi.mocked(createReadStream).mockReturnValue(readable as ReturnType<typeof createReadStream>);

      const res = await app.request('/api/media/testChannel/video.mp4', {
        headers: { ...headers, Range: 'bytes=0-499' },
      });

      expect(res.status).toBe(206);
      expect(res.headers.get('Content-Range')).toBe('bytes 0-499/10000');
      expect(res.headers.get('Content-Length')).toBe('500');
      expect(res.headers.get('Content-Type')).toBe('video/mp4');
    });

    it('returns 416 for invalid range format', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(statSync).mockReturnValue({ size: 1000 } as ReturnType<typeof statSync>);

      const res = await app.request('/api/media/testChannel/video.mp4', {
        headers: { ...headers, Range: 'invalid-range' },
      });

      expect(res.status).toBe(416);
    });

    it('returns 416 when start > end', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(statSync).mockReturnValue({ size: 1000 } as ReturnType<typeof statSync>);

      const res = await app.request('/api/media/testChannel/video.mp4', {
        headers: { ...headers, Range: 'bytes=500-100' },
      });

      expect(res.status).toBe(416);
    });

    it('clamps an explicit range end that exceeds the file size', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(statSync).mockReturnValue({ size: 1000 } as ReturnType<typeof statSync>);
      vi.mocked(createReadStream).mockReturnValue(
        Readable.from(Buffer.alloc(1000, 'x')) as ReturnType<typeof createReadStream>,
      );

      const res = await app.request('/api/media/testChannel/video.mp4', {
        headers: { ...headers, Range: 'bytes=0-1000' },
      });

      expect(res.status).toBe(206);
      expect(res.headers.get('Content-Range')).toBe('bytes 0-999/1000');
      expect(res.headers.get('Content-Length')).toBe('1000');
    });

    it('serves suffix ranges from the end of the file for mobile media metadata requests', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(statSync).mockReturnValue({ size: 1000 } as ReturnType<typeof statSync>);
      vi.mocked(createReadStream).mockReturnValue(
        Readable.from(Buffer.alloc(200, 'x')) as ReturnType<typeof createReadStream>,
      );

      const res = await app.request('/api/media/testChannel/video.mp4', {
        headers: { ...headers, Range: 'bytes=-200' },
      });

      expect(res.status).toBe(206);
      expect(res.headers.get('Content-Range')).toBe('bytes 800-999/1000');
      expect(res.headers.get('Content-Length')).toBe('200');
      expect(createReadStream).toHaveBeenCalledWith(expect.any(String), { start: 800, end: 999 });
    });
  });
});
