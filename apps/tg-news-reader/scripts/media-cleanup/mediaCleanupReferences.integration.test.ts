import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { seedChannel, seedNews } from '../../src/server/__tests__/seed.js';
import { createTestDb } from '../../src/server/__tests__/testDb.js';
import type { TestDb } from '../../src/server/__tests__/testDb.js';

let testDb: TestDb;
vi.mock('../../src/server/db/index.js', () => ({
  get db() {
    return testDb.db;
  },
}));

import { loadMediaCleanupReferences } from './mediaCleanupReferences.js';

describe('media cleanup references', () => {
  beforeEach(async () => {
    testDb = await createTestDb();
  });
  afterEach(() => {
    testDb.client.close();
  });

  it('retains single/album paths and relative, API, encoded and HTML article images, even in read/filtered news', async () => {
    const { id: channelId } = await seedChannel(testDb.db);
    const { id } = await seedNews(testDb.db, channelId);
    await testDb.client.execute({
      sql: `UPDATE news SET is_read=1, is_filtered=1, local_media_path=?, local_media_paths=?, full_content=?, text=? WHERE id=?`,
      args: [
        'channel/1.jpg',
        JSON.stringify(['channel/2.mp4', 'channel\\3.png']),
        '![a](channel/iv_4_0.jpg) ![b](/api/media/channel/iv_4_1.jpg?token=x) ' +
          '![c](channel%2Fiv_4_2.jpg) <img src="/api/media/channel/iv_4_3.jpg"> malformed %FF',
        '![photo](channel/5.jpg)',
        id,
      ],
    });
    const references = await loadMediaCleanupReferences();
    expect([...references].sort()).toEqual([
      'channel/1.jpg',
      'channel/2.mp4',
      'channel/3.png',
      'channel/5.jpg',
      'channel/iv_4_0.jpg',
      'channel/iv_4_1.jpg',
      'channel/iv_4_2.jpg',
      'channel/iv_4_3.jpg',
    ]);
  });

  it('loads more than a single database page', async () => {
    const { id: channelId } = await seedChannel(testDb.db);
    await testDb.client.execute({
      sql: `WITH RECURSIVE ids(id) AS (VALUES(1) UNION ALL SELECT id+1 FROM ids WHERE id<501)
        INSERT INTO news (channel_id, telegram_msg_id, posted_at, local_media_path)
        SELECT ?, id, 1, 'channel/' || id || '.jpg' FROM ids`,
      args: [channelId],
    });
    const references = await loadMediaCleanupReferences();
    expect(references.size).toBe(501);
    expect(references.has('channel/501.jpg')).toBe(true);
  });

  it.each(['not json', '{}', '["channel/1.jpg", 7]'])(
    'fails closed for corrupt album references: %s',
    async (value) => {
      const { id: channelId } = await seedChannel(testDb.db);
      const { id } = await seedNews(testDb.db, channelId);
      await testDb.client.execute({ sql: 'UPDATE news SET local_media_paths=? WHERE id=?', args: [value, id] });
      await expect(loadMediaCleanupReferences()).rejects.toThrow();
    },
  );

  it('returns no references for an empty database', async () => {
    expect((await loadMediaCleanupReferences()).size).toBe(0);
  });
});
