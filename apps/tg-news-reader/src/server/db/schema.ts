import { sql } from 'drizzle-orm';
import { integer, primaryKey, sqliteTable, text, unique } from 'drizzle-orm/sqlite-core';
import { jsonNumberArray, jsonStringArray } from './customTypes.js';

export const groups = sqliteTable('groups', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  color: text('color').notNull().default('#1677ff'),
  pinHash: text('pin_hash'),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: integer('created_at')
    .notNull()
    .default(sql`(unixepoch())`),
});

export const channels = sqliteTable('channels', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  telegramId: text('telegram_id').notNull().unique(),
  name: text('name').notNull(),
  description: text('description'),
  channelType: text('channel_type', { enum: ['news', 'news_link', 'media', 'blog'] })
    .notNull()
    .default('news'),
  groupId: integer('group_id').references(() => groups.id, { onDelete: 'set null' }),
  sortOrder: integer('sort_order').notNull().default(0),
  filterForwards: integer('filter_forwards').notNull().default(0),
  lastFetchedAt: integer('last_fetched_at'),
  lastReadAt: integer('last_read_at'),
  unreadCount: integer('unread_count').notNull().default(0),
  totalNewsCount: integer('total_news_count').notNull().default(0),
  isUnavailable: integer('is_unavailable').notNull().default(0),
  createdAt: integer('created_at')
    .notNull()
    .default(sql`(unixepoch())`),
});

export const news = sqliteTable(
  'news',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    channelId: integer('channel_id')
      .notNull()
      .references(() => channels.id, { onDelete: 'cascade' }),
    telegramMsgId: integer('telegram_msg_id').notNull(),
    text: text('text').notNull().default(''),
    links: jsonStringArray('links')
      .notNull()
      .default(sql`('[]')`),
    hashtags: jsonStringArray('hashtags')
      .notNull()
      .default(sql`('[]')`),
    mediaType: text('media_type'),
    isRead: integer('is_read').notNull().default(0),
    postedAt: integer('posted_at').notNull(),
    fullContent: text('full_content'),
    localMediaPath: text('local_media_path'),
    localMediaPaths: jsonStringArray('local_media_paths'), // album: all downloaded paths, e.g. ["ch/101.jpg","ch/102.jpg"]
    albumMsgIds: jsonNumberArray('album_msg_ids'), // album: full list of Telegram msg IDs, e.g. [101,102,103]
    mediaSize: integer('media_size'),
    isFiltered: integer('is_filtered').notNull().default(0),
    textInPanel: integer('text_in_panel').notNull().default(0),
    canLoadArticle: integer('can_load_article').notNull().default(0),
    fullContentFormat: text('full_content_format', { enum: ['text', 'markdown'] })
      .notNull()
      .default('text'),
    forwardFromName: text('forward_from_name'),
  },
  (table) => [unique().on(table.channelId, table.telegramMsgId)],
);

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  totpSecret: text('totp_secret'), // null = 2FA disabled
  role: text('role').notNull().default('admin'),
  createdAt: integer('created_at')
    .notNull()
    .default(sql`(unixepoch())`),
});

export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(), // UUID v4
  userId: integer('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  refreshTokenHash: text('refresh_token_hash').notNull(),
  expiresAt: integer('expires_at').notNull(), // unixepoch
  unlockedGroupIds: text('unlocked_group_ids').notNull().default('[]'), // JSON array
  userAgent: text('user_agent'),
  ip: text('ip'),
  createdAt: integer('created_at')
    .notNull()
    .default(sql`(unixepoch())`),
});

export const downloads = sqliteTable(
  'downloads',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    newsId: integer('news_id')
      .notNull()
      .references(() => news.id, { onDelete: 'cascade' }),
    type: text('type', { enum: ['media', 'article', 'image'] }).notNull(),
    url: text('url'),
    priority: integer('priority').notNull().default(0),
    status: text('status', { enum: ['pending', 'processing', 'done', 'failed'] })
      .notNull()
      .default('pending'),
    error: text('error'),
    createdAt: integer('created_at')
      .notNull()
      .default(sql`(unixepoch())`),
    processedAt: integer('processed_at'),
  },
  (table) => [unique().on(table.newsId, table.type)],
);

export const filters = sqliteTable('filters', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  channelId: integer('channel_id')
    .notNull()
    .references(() => channels.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  type: text('type', { enum: ['tag', 'keyword'] }).notNull(),
  value: text('value').notNull(),
  isActive: integer('is_active').notNull().default(1),
  createdAt: integer('created_at')
    .notNull()
    .default(sql`(unixepoch())`),
});

export const filterStats = sqliteTable(
  'filter_stats',
  {
    filterId: integer('filter_id')
      .notNull()
      .references(() => filters.id, { onDelete: 'cascade' }),
    date: text('date').notNull(), // 'YYYY-MM-DD'
    hitCount: integer('hit_count').notNull().default(0),
  },
  (table) => [primaryKey({ columns: [table.filterId, table.date] })],
);

/**
 * Cache for AI-generated TTS audio (Read Aloud feature).
 * Keyed by SHA-256 hash of `text + voice + model` so identical re-reads are instant.
 * Files live at `data/tts/{contentHash}/{idx}.mp3` (one MP3 per chunk).
 * Rows + files expire via periodic cleanup once `lastAccessedAt` is older
 * than TTS_CACHE_TTL_SEC.
 */
export const ttsCache = sqliteTable('tts_cache', {
  contentHash: text('content_hash').primaryKey(), // SHA-256 of `${text}|${voice}|${model}`
  voice: text('voice').notNull(),
  model: text('model').notNull(),
  charCount: integer('char_count').notNull(),
  status: text('status', { enum: ['pending', 'processing', 'done', 'failed'] })
    .notNull()
    .default('pending'),
  chunksTotal: integer('chunks_total').notNull().default(0),
  chunksDone: integer('chunks_done').notNull().default(0),
  error: text('error'),
  createdAt: integer('created_at')
    .notNull()
    .default(sql`(unixepoch())`),
  lastAccessedAt: integer('last_accessed_at')
    .notNull()
    .default(sql`(unixepoch())`),
});
