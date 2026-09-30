import { client } from './index.js';
import { logger } from '../logger.js';

export async function runMigration(): Promise<void> {
  await client.execute('PRAGMA foreign_keys = ON');

  // ─── Core tables (Phase 1) ───────────────────────────────────────────────────
  await client.executeMultiple(`
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
  `);

  // ─── Words table (Phase 2) ───────────────────────────────────────────────────
  // If the table exists but is missing the 'pos' column (old schema),
  // drop and recreate — safe at this stage because there is no production data yet.
  const wordsCols = await client.execute('PRAGMA table_info(words)');
  const existingCols = wordsCols.rows.map((r) => r[1] as string);
  if (existingCols.length > 0 && !existingCols.includes('pos')) {
    logger.warn({ module: 'db' }, 'Old words schema detected — recreating table with POS support');
    await client.execute('DROP TABLE IF EXISTS words');
  }

  await client.executeMultiple(`
    CREATE TABLE IF NOT EXISTS words (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      czech TEXT NOT NULL,
      russian TEXT NOT NULL,
      english TEXT,
      pos TEXT CHECK(pos IN ('noun','verb','adjective','adverb','pronoun','numeral','preposition','conjunction','interjection','phrase')),
      gender TEXT CHECK(gender IN ('ma','mi','f','n')),
      number_type TEXT CHECK(number_type IN ('singular','plural')),
      aspect TEXT CHECK(aspect IN ('perfective','imperfective')),
      verb_pair TEXT,
      notes TEXT,
      lesson INTEGER,
      source TEXT CHECK(source IN ('textbook','manual')),
      seznam_url TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE INDEX IF NOT EXISTS idx_words_lesson ON words(lesson);
    CREATE INDEX IF NOT EXISTS idx_words_gender ON words(gender);
    CREATE INDEX IF NOT EXISTS idx_words_pos ON words(pos);
  `);

  logger.info({ module: 'db' }, '✅ Database migrated successfully');
}
