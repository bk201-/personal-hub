import { logger } from '../logger.js';
import { migrateDownloadsImageType } from './downloadsMigration.js';
import { client } from './index.js';

export async function runMigration(): Promise<void> {
  await client.execute('PRAGMA foreign_keys = ON');
  await client.executeMultiple(`
    CREATE TABLE IF NOT EXISTS groups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      color TEXT NOT NULL DEFAULT '#1677ff',
      pin_hash TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE TABLE IF NOT EXISTS channels (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      telegram_id TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      description TEXT,
      channel_type TEXT NOT NULL DEFAULT 'none',
      last_fetched_at INTEGER,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE TABLE IF NOT EXISTS news (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      channel_id INTEGER NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
      telegram_msg_id INTEGER NOT NULL,
      text TEXT NOT NULL DEFAULT '',
      links TEXT NOT NULL DEFAULT '[]',
      hashtags TEXT NOT NULL DEFAULT '[]',
      media_type TEXT,
      is_read INTEGER NOT NULL DEFAULT 0,
      posted_at INTEGER NOT NULL,
      full_content TEXT,
      local_media_path TEXT,
      UNIQUE(channel_id, telegram_msg_id)
    );
    CREATE INDEX IF NOT EXISTS idx_news_channel_id ON news(channel_id);
    CREATE INDEX IF NOT EXISTS idx_news_is_read ON news(is_read);
    CREATE INDEX IF NOT EXISTS idx_news_posted_at ON news(posted_at);
    CREATE INDEX IF NOT EXISTS idx_news_channel_is_read ON news(channel_id, is_read);
    CREATE TABLE IF NOT EXISTS filters (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('tag', 'keyword')),
      value TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      totp_secret TEXT,
      role TEXT NOT NULL DEFAULT 'admin',
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      refresh_token_hash TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      user_agent TEXT,
      ip TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
    CREATE TABLE IF NOT EXISTS downloads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      news_id INTEGER NOT NULL REFERENCES news(id) ON DELETE CASCADE,
      type TEXT NOT NULL CHECK(type IN ('media', 'article')),
      url TEXT,
      priority INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'processing', 'done', 'failed')),
      error TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      processed_at INTEGER,
      UNIQUE(news_id, type)
    );
    CREATE INDEX IF NOT EXISTS idx_downloads_queue ON downloads(status, priority DESC, created_at ASC);
  `);

  await migrateDownloadsImageType(client);

  const alterMigrations = [
    "ALTER TABLE channels ADD COLUMN channel_type TEXT NOT NULL DEFAULT 'none'",
    'ALTER TABLE news ADD COLUMN local_media_path TEXT',
    'ALTER TABLE news ADD COLUMN media_size INTEGER',
    'ALTER TABLE filters ADD COLUMN channel_id INTEGER REFERENCES channels(id) ON DELETE CASCADE',
    'ALTER TABLE channels ADD COLUMN last_read_at INTEGER',
    'ALTER TABLE channels ADD COLUMN group_id INTEGER REFERENCES groups(id) ON DELETE SET NULL',
    'ALTER TABLE channels ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0',
    "ALTER TABLE sessions ADD COLUMN unlocked_group_ids TEXT NOT NULL DEFAULT '[]'",
    'ALTER TABLE channels ADD COLUMN is_unavailable INTEGER NOT NULL DEFAULT 0',
    'ALTER TABLE news ADD COLUMN local_media_paths TEXT',
    'ALTER TABLE news ADD COLUMN album_msg_ids TEXT',
    'ALTER TABLE news ADD COLUMN is_filtered INTEGER NOT NULL DEFAULT 0',
    'ALTER TABLE news ADD COLUMN text_in_panel INTEGER NOT NULL DEFAULT 0',
    'ALTER TABLE news ADD COLUMN can_load_article INTEGER NOT NULL DEFAULT 0',
    "ALTER TABLE news ADD COLUMN full_content_format TEXT NOT NULL DEFAULT 'text'",
    'ALTER TABLE channels ADD COLUMN unread_count INTEGER NOT NULL DEFAULT 0',
    'ALTER TABLE channels ADD COLUMN total_news_count INTEGER NOT NULL DEFAULT 0',
    'ALTER TABLE news ADD COLUMN forward_from_name TEXT',
    'ALTER TABLE channels ADD COLUMN filter_forwards INTEGER NOT NULL DEFAULT 0',
  ];
  for (const sql of alterMigrations) {
    try {
      await client.execute(sql);
    } catch {
      // Column already exists — skip
    }
  }

  // One-time: bind filters that have no channel_id to the first channel
  await client.execute(
    `UPDATE filters SET channel_id = (SELECT id FROM channels ORDER BY id LIMIT 1)
     WHERE channel_id IS NULL AND EXISTS (SELECT 1 FROM channels)`,
  );

  // Rename old channel types → new names (idempotent)
  await client.execute(`UPDATE channels SET channel_type = 'news'      WHERE channel_type = 'none'`);
  await client.execute(`UPDATE channels SET channel_type = 'news_link' WHERE channel_type = 'link_continuation'`);
  await client.execute(`UPDATE channels SET channel_type = 'media'     WHERE channel_type = 'media_content'`);

  // Backfill flags on existing rows
  await client.execute(`
    UPDATE news SET can_load_article = 1
    WHERE can_load_article = 0
      AND links != '[]'
      AND full_content IS NULL
      AND channel_id IN (SELECT id FROM channels WHERE channel_type = 'news_link')
  `);
  await client.execute(`
    UPDATE news SET text_in_panel = 1
    WHERE text_in_panel = 0
      AND channel_id IN (SELECT id FROM channels WHERE channel_type = 'media')
  `);

  // filter_stats table (idempotent)
  await client.execute(`
    CREATE TABLE IF NOT EXISTS filter_stats (
      filter_id INTEGER NOT NULL REFERENCES filters(id) ON DELETE CASCADE,
      date TEXT NOT NULL,
      hit_count INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (filter_id, date)
    )
  `);
  await client.execute('CREATE INDEX IF NOT EXISTS idx_filter_stats ON filter_stats(filter_id, date)');

  // Composite index for the common "unread news for channel" query pattern
  await client.execute('CREATE INDEX IF NOT EXISTS idx_news_channel_is_read ON news(channel_id, is_read)');

  // Index for cursor-based pagination: efficient ORDER BY posted_at with channel filter
  await client.execute('CREATE INDEX IF NOT EXISTS idx_news_channel_posted_at ON news(channel_id, posted_at)');

  // Backfill unread_count from actual unread news counts
  await client.execute(`
    UPDATE channels SET unread_count = (
      SELECT count(*) FROM news WHERE news.channel_id = channels.id AND news.is_read = 0
    )
  `);

  // Backfill total_news_count from actual news counts
  await client.execute(`
    UPDATE channels SET total_news_count = (
      SELECT count(*) FROM news WHERE news.channel_id = channels.id
    )
  `);

  // TTS cache (idempotent)
  await client.execute(`
    CREATE TABLE IF NOT EXISTS tts_cache (
      content_hash TEXT PRIMARY KEY,
      voice TEXT NOT NULL,
      model TEXT NOT NULL,
      char_count INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'processing', 'done', 'failed')),
      chunks_total INTEGER NOT NULL DEFAULT 0,
      chunks_done INTEGER NOT NULL DEFAULT 0,
      error TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      last_accessed_at INTEGER NOT NULL DEFAULT (unixepoch())
    )
  `);
  await client.execute('CREATE INDEX IF NOT EXISTS idx_tts_cache_last_accessed ON tts_cache(last_accessed_at)');

  logger.info('✅ Database migrated successfully');
}
