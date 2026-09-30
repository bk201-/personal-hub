import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../config.js', () => ({
  JWT_SECRET: 'test-secret-key',
}));

vi.mock('../logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), fatal: vi.fn(), debug: vi.fn() },
}));

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

import { eq } from 'drizzle-orm';
import { channels, filters, news } from '../db/schema.js';
import { applyFiltersToInserted, reprocessChannelFilters } from './filterEngine.js';

describe('filterEngine (integration)', () => {
  beforeAll(async () => {
    testDb = await createTestDb();
  });

  beforeEach(async () => {
    await testDb.client.execute('DELETE FROM filter_stats');
    await testDb.client.execute('DELETE FROM filters');
    await testDb.client.execute('DELETE FROM news');
    await testDb.client.execute('DELETE FROM channels');
  });

  describe('applyFiltersToInserted', () => {
    it('does nothing when insertedItems is empty', async () => {
      const ch = await seedChannel(testDb.db);
      await expect(applyFiltersToInserted(ch.id, [])).resolves.toBeUndefined();
    });

    it('does nothing when no active filters exist', async () => {
      const ch = await seedChannel(testDb.db);
      const n = await seedNews(testDb.db, ch.id, { text: 'crypto news' });

      await applyFiltersToInserted(ch.id, [{ newsId: n.id, text: 'crypto news', hashtags: [] }]);

      // News should NOT be filtered (no filters defined)
      const [row] = await testDb.db.select().from(news).where(eq(news.id, n.id));
      expect(row.isFiltered).toBe(0);
    });

    it('marks matching news as filtered and records stats', async () => {
      const ch = await seedChannel(testDb.db);
      const n1 = await seedNews(testDb.db, ch.id, { text: 'bitcoin pump', telegramMsgId: 1 });
      const n2 = await seedNews(testDb.db, ch.id, { text: 'nice weather', telegramMsgId: 2 });

      // Create a keyword filter
      await testDb.db.insert(filters).values({ channelId: ch.id, name: 'Crypto', type: 'keyword', value: 'bitcoin' });

      await applyFiltersToInserted(ch.id, [
        { newsId: n1.id, text: 'bitcoin pump', hashtags: [] },
        { newsId: n2.id, text: 'nice weather', hashtags: [] },
      ]);

      const [row1] = await testDb.db.select().from(news).where(eq(news.id, n1.id));
      const [row2] = await testDb.db.select().from(news).where(eq(news.id, n2.id));
      expect(row1.isFiltered).toBe(1);
      expect(row2.isFiltered).toBe(0);
    });

    it('matches tag filters on hashtags', async () => {
      const ch = await seedChannel(testDb.db);
      const n = await seedNews(testDb.db, ch.id, { text: 'wow' });

      await testDb.db.insert(filters).values({ channelId: ch.id, name: 'Ad', type: 'tag', value: 'ad' });

      await applyFiltersToInserted(ch.id, [{ newsId: n.id, text: 'wow', hashtags: ['#ad'] }]);

      const [row] = await testDb.db.select().from(news).where(eq(news.id, n.id));
      expect(row.isFiltered).toBe(1);
    });

    it('hides forwarded news when filterForwards is enabled', async () => {
      const ch = await seedChannel(testDb.db, { filterForwards: 1 });
      const fwd = await seedNews(testDb.db, ch.id, { text: 'repost', telegramMsgId: 1 });
      const own = await seedNews(testDb.db, ch.id, { text: 'original', telegramMsgId: 2 });

      await applyFiltersToInserted(ch.id, [
        { newsId: fwd.id, text: 'repost', hashtags: [], forwardFromName: 'Other Channel' },
        { newsId: own.id, text: 'original', hashtags: [], forwardFromName: null },
      ]);

      const [rowFwd] = await testDb.db.select().from(news).where(eq(news.id, fwd.id));
      const [rowOwn] = await testDb.db.select().from(news).where(eq(news.id, own.id));
      expect(rowFwd.isFiltered).toBe(1);
      expect(rowOwn.isFiltered).toBe(0);
    });

    it('does NOT hide forwarded news when filterForwards is disabled', async () => {
      const ch = await seedChannel(testDb.db, { filterForwards: 0 });
      const fwd = await seedNews(testDb.db, ch.id, { text: 'repost', telegramMsgId: 1 });

      await applyFiltersToInserted(ch.id, [
        { newsId: fwd.id, text: 'repost', hashtags: [], forwardFromName: 'Other Channel' },
      ]);

      const [rowFwd] = await testDb.db.select().from(news).where(eq(news.id, fwd.id));
      expect(rowFwd.isFiltered).toBe(0);
    });
  });

  describe('reprocessChannelFilters', () => {
    it('sets isFiltered=1 on matching and isFiltered=0 on non-matching', async () => {
      const ch = await seedChannel(testDb.db);
      const n1 = await seedNews(testDb.db, ch.id, { text: 'crypto news', telegramMsgId: 1 });
      const n2 = await seedNews(testDb.db, ch.id, { text: 'sports news', telegramMsgId: 2 });

      await testDb.db.insert(filters).values({ channelId: ch.id, name: 'Crypto', type: 'keyword', value: 'crypto' });

      await reprocessChannelFilters(ch.id);

      const [row1] = await testDb.db.select().from(news).where(eq(news.id, n1.id));
      const [row2] = await testDb.db.select().from(news).where(eq(news.id, n2.id));
      expect(row1.isFiltered).toBe(1);
      expect(row2.isFiltered).toBe(0);
    });

    it('unfilters previously filtered items when filter is removed', async () => {
      const ch = await seedChannel(testDb.db);
      const n = await seedNews(testDb.db, ch.id, { text: 'old news', isFiltered: 1 });

      // No active filters → should unfilter everything
      await reprocessChannelFilters(ch.id);

      const [row] = await testDb.db.select().from(news).where(eq(news.id, n.id));
      expect(row.isFiltered).toBe(0);
    });

    it('filters/unfilters forwarded news as filterForwards toggles', async () => {
      const ch = await seedChannel(testDb.db, { filterForwards: 0 });
      const fwd = await seedNews(testDb.db, ch.id, {
        text: 'repost',
        telegramMsgId: 1,
        forwardFromName: 'Other Channel',
      });

      // Disabled → not filtered
      await reprocessChannelFilters(ch.id);
      let [row] = await testDb.db.select().from(news).where(eq(news.id, fwd.id));
      expect(row.isFiltered).toBe(0);

      // Enable filterForwards → forwarded news becomes hidden
      await testDb.db.update(channels).set({ filterForwards: 1 }).where(eq(channels.id, ch.id));
      await reprocessChannelFilters(ch.id);
      [row] = await testDb.db.select().from(news).where(eq(news.id, fwd.id));
      expect(row.isFiltered).toBe(1);

      // Disable again → forwarded news is shown again
      await testDb.db.update(channels).set({ filterForwards: 0 }).where(eq(channels.id, ch.id));
      await reprocessChannelFilters(ch.id);
      [row] = await testDb.db.select().from(news).where(eq(news.id, fwd.id));
      expect(row.isFiltered).toBe(0);
    });
  });
});
