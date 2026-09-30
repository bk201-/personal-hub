/**
 * Seed helpers — insert test data rows with sensible defaults.
 */

import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import type * as schema from '../db/schema.js';
import { channels, downloads, groups, news } from '../db/schema.js';

let _channelSeq = 0;
let _newsSeq = 0;

/**
 * Insert a channel and return the row.
 */
export async function seedChannel(
  db: LibSQLDatabase<typeof schema>,
  overrides: Partial<typeof channels.$inferInsert> = {},
) {
  _channelSeq++;
  const [row] = await db
    .insert(channels)
    .values({
      telegramId: overrides.telegramId ?? `test_channel_${_channelSeq}`,
      name: overrides.name ?? `Test Channel ${_channelSeq}`,
      channelType: overrides.channelType ?? 'news',
      ...overrides,
    })
    .returning();
  return row;
}

/**
 * Insert a news item and return the row.
 */
export async function seedNews(
  db: LibSQLDatabase<typeof schema>,
  channelId: number,
  overrides: Partial<typeof news.$inferInsert> = {},
) {
  _newsSeq++;
  const [row] = await db
    .insert(news)
    .values({
      channelId,
      telegramMsgId: overrides.telegramMsgId ?? _newsSeq * 100,
      text: overrides.text ?? `News text ${_newsSeq}`,
      postedAt: overrides.postedAt ?? Math.floor(Date.now() / 1000) - _newsSeq,
      ...overrides,
    })
    .returning();
  return row;
}

/**
 * Insert a download task and return the row.
 */
export async function seedDownload(
  db: LibSQLDatabase<typeof schema>,
  newsId: number,
  overrides: Partial<typeof downloads.$inferInsert> = {},
) {
  const [row] = await db
    .insert(downloads)
    .values({
      newsId,
      type: overrides.type ?? 'media',
      ...overrides,
    })
    .returning();
  return row;
}

/**
 * Insert a group and return the row.
 */
export async function seedGroup(
  db: LibSQLDatabase<typeof schema>,
  overrides: Partial<typeof groups.$inferInsert> = {},
) {
  const [row] = await db
    .insert(groups)
    .values({
      name: overrides.name ?? 'Test Group',
      ...overrides,
    })
    .returning();
  return row;
}
