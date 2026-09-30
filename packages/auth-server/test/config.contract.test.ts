import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv('NODE_ENV', 'test');
  vi.stubEnv('JWT_SECRET', undefined);
  vi.stubEnv('DOWNLOAD_STORAGE_RESERVE_MB', '1024');
});
afterEach(() => vi.unstubAllEnvs());

describe('app-owned JWT configuration', () => {
  it('uses different development secrets without requiring environment files', async () => {
    const news = await import('../../../apps/tg-news-reader/src/server/config.js');
    const czech = await import('../../../apps/czech-learning/src/server/config.js');
    expect(news.JWT_SECRET).not.toBe(czech.JWT_SECRET);
  });

  it.each([undefined, 'dev-secret-change-in-production'])(
    'still refuses missing or legacy development secrets in production (%s)',
    async (secret) => {
      vi.stubEnv('NODE_ENV', 'production');
      vi.stubEnv('JWT_SECRET', secret);
      await expect(import('../../../apps/tg-news-reader/src/server/config.js')).rejects.toThrow('JWT_SECRET');
      await expect(import('../../../apps/czech-learning/src/server/config.js')).rejects.toThrow('JWT_SECRET');
    },
  );
});
