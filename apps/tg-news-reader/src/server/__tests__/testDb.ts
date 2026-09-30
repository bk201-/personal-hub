/**
 * Test DB helper — creates an in-memory SQLite client + Drizzle instance
 * and runs the full migration so all tables/indexes exist.
 */

import { createClient } from '@libsql/client';
import type { Client } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import { migrateDownloadsImageType } from '../db/downloadsMigration.js';
import * as schema from '../db/schema.js';

export interface TestDb {
  client: Client;
  db: LibSQLDatabase<typeof schema>;
}

/**
 * Create a fresh SQLite database with all tables.
 *
 * Defaults to an isolated in-memory DB — safe for parallel test suites.
 * Pass a `file:` URL when the code under test uses interactive `db.transaction()`:
 * libsql opens a separate connection per transaction, and every `:memory:`
 * connection is its own empty database, so transactional writes/reads would hit
 * a table-less connection. A file-backed DB shares state across connections.
 */
export async function createTestDb(url = ':memory:'): Promise<TestDb> {
  const client = createClient({ url });

  await client.executeMultiple('PRAGMA foreign_keys = ON;');

  // Inline migration (mirrors migrate.ts CREATE TABLE blocks + ALTER columns)
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
      channel_type TEXT NOT NULL DEFAULT 'news',
      group_id INTEGER REFERENCES groups(id) ON DELETE SET NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      filter_forwards INTEGER NOT NULL DEFAULT 0,
      last_fetched_at INTEGER,
      last_read_at INTEGER,
      unread_count INTEGER NOT NULL DEFAULT 0,
      total_news_count INTEGER NOT NULL DEFAULT 0,
      is_unavailable INTEGER NOT NULL DEFAULT 0,
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
      local_media_paths TEXT,
      album_msg_ids TEXT,
      media_size INTEGER,
      is_filtered INTEGER NOT NULL DEFAULT 0,
      text_in_panel INTEGER NOT NULL DEFAULT 0,
      can_load_article INTEGER NOT NULL DEFAULT 0,
      full_content_format TEXT NOT NULL DEFAULT 'text',
      forward_from_name TEXT,
      UNIQUE(channel_id, telegram_msg_id)
    );
    CREATE INDEX IF NOT EXISTS idx_news_channel_id ON news(channel_id);
    CREATE INDEX IF NOT EXISTS idx_news_is_read ON news(is_read);
    CREATE INDEX IF NOT EXISTS idx_news_posted_at ON news(posted_at);
    CREATE INDEX IF NOT EXISTS idx_news_channel_is_read ON news(channel_id, is_read);
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
      unlocked_group_ids TEXT NOT NULL DEFAULT '[]',
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
    CREATE TABLE IF NOT EXISTS filters (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      channel_id INTEGER REFERENCES channels(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('tag', 'keyword')),
      value TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE TABLE IF NOT EXISTS filter_stats (
      filter_id INTEGER NOT NULL REFERENCES filters(id) ON DELETE CASCADE,
      date TEXT NOT NULL,
      hit_count INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (filter_id, date)
    );
  `);

  await migrateDownloadsImageType(client);

  const db = drizzle(client, { schema });
  return { client, db };
}
