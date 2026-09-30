/**
 * Channel Fetch Service — encapsulates the entire fetch-news-for-channel workflow.
 *
 * Extracted from routes/channels.ts to keep the route handler thin and
 * make the business logic framework-agnostic (no Hono dependency).
 */

import { and, eq, inArray, sql } from 'drizzle-orm';
import type { ChannelType } from '../../shared/types.js';
import { NEWS_DEFAULT_FETCH_DAYS, NEWS_FETCH_LIMIT } from '../config.js';
import { db } from '../db/index.js';
import { channels, news } from '../db/schema.js';
import { logger } from '../logger.js';
import { deleteAllMediaFiles } from '../utils/mediaFiles.js';
import { getChannelStrategy } from './channelStrategies.js';
import type { PostProcessArgs } from './channelStrategies.js';
import { downloadProgressEmitter } from './downloadProgress.js';
import { applyFiltersToInserted } from './filterEngine.js';
import { fetchChannelMessages, fetchMessageById, getReadInboxMaxId, resolveInstantViewImages } from './telegram.js';
import type { TelegramMessage } from './telegram.js';
import { ChannelUnavailableError, isUnavailableTelegramChannelError } from './telegramChannelErrors.js';

// ─── Public types ─────────────────────────────────────────────────────────────

export interface FetchChannelOpts {
  since?: string; // ISO date string
  limit?: number;
}

export interface FetchChannelResult {
  inserted: number;
  total: number;
  mediaProcessing: boolean;
  totalNewsCount: number;
  unreadCount: number;
}

// ─── Private helpers ──────────────────────────────────────────────────────────

type ChannelRow = typeof channels.$inferSelect;

/**
 * Compute the "since" date for fetching messages.
 *
 * Three branches:
 * 1. Explicit `since` from the caller (period dropdown) → use as-is
 * 2. First-ever fetch (no lastFetchedAt) → sync Telegram read position
 * 3. Subsequent fetch → use lastFetchedAt as boundary
 */
async function computeSinceDate(channel: ChannelRow, since?: string): Promise<Date> {
  if (since) {
    return new Date(since);
  }

  if (!channel.lastFetchedAt) {
    // First-ever fetch — sync read position from Telegram so we only show
    // messages the user hasn't read yet (avoids loading the entire channel history).
    const readMaxId = await getReadInboxMaxId(channel.telegramId);
    if (readMaxId) {
      const readMsg = await fetchMessageById(channel.telegramId, readMaxId, { downloadImages: false });
      if (readMsg) {
        await db.update(channels).set({ lastReadAt: readMsg.date }).where(eq(channels.id, channel.id));
        return new Date(readMsg.date * 1000);
      }
    }
    // Fallback: configured days ago
    return new Date(Date.now() - NEWS_DEFAULT_FETCH_DAYS * 24 * 60 * 60 * 1000);
  }

  // Subsequent fetches: the boundary must be the newest content we've already
  // accounted for — NOT the wall-clock lastFetchedAt. lastFetchedAt is always later
  // than every real post, so using it excludes all not-yet-fetched history and, once
  // read items are cleaned up (deleteReadNewsMedia), permanently empties the channel:
  // Telegram returns nothing newer than "now" and the channel can never refill.
  //
  // Watermark = max(read position, newest stored post). Fall back to the default
  // look-back window when the channel holds nothing and was never read (e.g. after
  // every item was read + deleted) so a re-fetch repopulates recent posts.
  const [row] = await db
    .select({ maxPostedAt: sql<number | null>`MAX(${news.postedAt})` })
    .from(news)
    .where(eq(news.channelId, channel.id));
  const boundary = Math.max(channel.lastReadAt ?? 0, row?.maxPostedAt ?? 0);
  if (boundary > 0) {
    return new Date(boundary * 1000);
  }
  return new Date(Date.now() - NEWS_DEFAULT_FETCH_DAYS * 24 * 60 * 60 * 1000);
}

// ─── Read-item cleanup ────────────────────────────────────────────────────────

/**
 * Delete all read news for a channel and remove their media files from disk.
 * Download tasks are removed atomically by ON DELETE CASCADE.
 */
async function deleteReadNewsMedia(channelId: number): Promise<{ deletedCount: number; lastReadAt: number | null }> {
  const { deleted, lastReadAt } = await db.transaction(async (tx) => {
    const deleted = await tx
      .delete(news)
      .where(and(eq(news.channelId, channelId), eq(news.isRead, 1)))
      .returning({
        id: news.id,
        postedAt: news.postedAt,
        localMediaPath: news.localMediaPath,
        localMediaPaths: news.localMediaPaths,
      });

    let lastReadAt: number | null = null;
    if (deleted.length > 0) {
      // Telegram read-sync is asynchronous. Preserve the local watermark before
      // discarding the rows, otherwise refresh may immediately fetch them again.
      const latest = deleted.reduce((max, row) => Math.max(max, row.postedAt), 0);
      const [countRow] = await tx
        .select({ count: sql<number>`COUNT(*)` })
        .from(news)
        .where(eq(news.channelId, channelId));
      const [channel] = await tx
        .update(channels)
        .set({
          lastReadAt: sql`MAX(COALESCE(${channels.lastReadAt}, 0), ${latest})`,
          totalNewsCount: countRow.count,
        })
        .where(eq(channels.id, channelId))
        .returning({ lastReadAt: channels.lastReadAt });
      lastReadAt = channel.lastReadAt;
    }
    return { deleted, lastReadAt };
  });

  if (deleted.length > 0) {
    downloadProgressEmitter.emit(
      'tasks_removed',
      deleted.map((row) => row.id),
    );
  }

  for (const row of deleted) {
    deleteAllMediaFiles(row.localMediaPath, row.localMediaPaths);
  }

  return { deletedCount: deleted.length, lastReadAt };
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Fetch news for a channel: clean up read items, pull from Telegram,
 * upsert into DB, apply filters, and kick off background post-processing.
 *
 * @throws Error with message 'Channel not found' if channelId doesn't exist.
 * @throws Re-throws any Telegram / DB error for the caller to handle.
 */
export async function fetchChannelNews(channelId: number, opts: FetchChannelOpts = {}): Promise<FetchChannelResult> {
  const [channel] = await db.select().from(channels).where(eq(channels.id, channelId));
  if (!channel) throw new Error('Channel not found');

  // Clean up read news (and their media files) before fetching new ones.
  const { deletedCount, lastReadAt } = await deleteReadNewsMedia(channelId);
  if (deletedCount > 0) {
    logger.info({ module: 'channels', channelId, deletedCount }, 'deleted read news before fetch');
  }

  // When the user explicitly requests a date range (rare: Fetch-period dropdown),
  // honour it fully — no message-count cap. Otherwise apply NEWS_FETCH_LIMIT
  // to bound the routine "give me what's new" auto-fetch.
  const fetchLimit = opts.limit ?? (opts.since ? undefined : NEWS_FETCH_LIMIT);

  let messages: TelegramMessage[];
  try {
    const sinceDate = await computeSinceDate({ ...channel, lastReadAt: lastReadAt ?? channel.lastReadAt }, opts.since);
    messages = await fetchChannelMessages(channel.telegramId, { sinceDate, limit: fetchLimit });
  } catch (error) {
    if (!isUnavailableTelegramChannelError(error)) throw error;
    await db.update(channels).set({ isUnavailable: 1 }).where(eq(channels.id, channelId));
    throw new ChannelUnavailableError(error);
  }

  const strategy = getChannelStrategy(channel.channelType as ChannelType);

  // Build rows to insert (filter via strategy, derive flags)
  const valuesToInsert = messages
    .filter((msg) => !strategy.shouldSkipMessage(msg))
    .map((msg) => {
      const flags = strategy.getItemFlags(msg);
      return {
        channelId,
        telegramMsgId: msg.id,
        text: msg.message,
        links: msg.links,
        hashtags: msg.hashtags,
        mediaType: msg.mediaType,
        postedAt: msg.date,
        mediaSize: msg.mediaSizeBytes,
        albumMsgIds: msg.albumTelegramIds ?? null,
        ...(msg.instantViewContent
          ? { fullContent: msg.instantViewContent, fullContentFormat: 'markdown' as const }
          : {}),
        textInPanel: flags.textInPanel ? 1 : 0,
        canLoadArticle: flags.canLoadArticle ? 1 : 0,
        forwardFromName: msg.forwardFromName ?? null,
      };
    });

  // ── Batch upsert ──────────────────────────────────────────────────────────
  // Pre-split into new vs existing rows so we never need the `excluded`
  // pseudo-table (avoids WebStorm SQL injection false positives).
  const BATCH_SIZE = 50;

  const allMsgIds = valuesToInsert.map((v) => v.telegramMsgId);
  const existingMsgIds = new Set(
    allMsgIds.length
      ? (
          await db
            .select({ telegramMsgId: news.telegramMsgId })
            .from(news)
            .where(and(eq(news.channelId, channelId), inArray(news.telegramMsgId, allMsgIds)))
        ).map((r) => r.telegramMsgId)
      : [],
  );

  const toInsertValues = valuesToInsert.filter((v) => !existingMsgIds.has(v.telegramMsgId));
  const toUpdateValues = valuesToInsert.filter((v) => existingMsgIds.has(v.telegramMsgId));

  const insertedMap = new Map<number, number>(); // telegramMsgId → news.id
  let updatedCount = 0;

  await db.transaction(async (tx) => {
    // INSERT new rows in chunks
    for (let i = 0; i < toInsertValues.length; i += BATCH_SIZE) {
      const chunk = toInsertValues.slice(i, i + BATCH_SIZE);

      const rows = await tx.insert(news).values(chunk).returning({ id: news.id, telegramMsgId: news.telegramMsgId });
      for (const row of rows) {
        insertedMap.set(row.telegramMsgId, row.id);
      }
    }

    // UPDATE mutable content fields for existing rows (edited Telegram messages)
    // Batched: single UPDATE with CASE WHEN per field to avoid N+1 round-trips.
    for (let i = 0; i < toUpdateValues.length; i += BATCH_SIZE) {
      const chunk = toUpdateValues.slice(i, i + BATCH_SIZE);
      const msgIds = chunk.map((v) => v.telegramMsgId);

      // Build CASE expressions for each mutable field
      const textCase = sql.join(
        chunk.map((v) => sql`WHEN ${news.telegramMsgId} = ${v.telegramMsgId} THEN ${v.text}`),
        sql` `,
      );
      const linksCase = sql.join(
        chunk.map((v) => sql`WHEN ${news.telegramMsgId} = ${v.telegramMsgId} THEN ${JSON.stringify(v.links)}`),
        sql` `,
      );
      const hashtagsCase = sql.join(
        chunk.map((v) => sql`WHEN ${news.telegramMsgId} = ${v.telegramMsgId} THEN ${JSON.stringify(v.hashtags)}`),
        sql` `,
      );

      await tx
        .update(news)
        .set({
          text: sql`CASE ${textCase} ELSE ${news.text} END`,
          links: sql`CASE ${linksCase} ELSE ${news.links} END`,
          hashtags: sql`CASE ${hashtagsCase} ELSE ${news.hashtags} END`,
        })
        .where(and(eq(news.channelId, channelId), inArray(news.telegramMsgId, msgIds)));
      updatedCount += chunk.length;
    }
  });

  const inserted = insertedMap.size;
  const updated = updatedCount;

  // ── Post-upsert bookkeeping ───────────────────────────────────────────────

  const now = Math.floor(Date.now() / 1000);

  // Recalculate totalNewsCount from actual row count (deleteReadNewsMedia may have removed rows)
  const [countRow] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(news)
    .where(eq(news.channelId, channelId));
  const actualTotal = countRow?.count ?? 0;

  // Recalculate unreadCount from actual unread rows
  const [unreadRow] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(news)
    .where(and(eq(news.channelId, channelId), eq(news.isRead, 0)));
  const actualUnread = unreadRow?.count ?? 0;

  await db
    .update(channels)
    .set({ lastFetchedAt: now, totalNewsCount: actualTotal, unreadCount: actualUnread, isUnavailable: 0 })
    .where(eq(channels.id, channelId));

  // Apply user-defined filters to newly inserted items (sets is_filtered + records stats)
  const insertedItems = messages
    .filter((msg) => insertedMap.has(msg.id))
    .map((msg) => ({
      newsId: insertedMap.get(msg.id)!,
      text: msg.message,
      hashtags: msg.hashtags,
      forwardFromName: msg.forwardFromName ?? null,
    }));
  await applyFiltersToInserted(channelId, insertedItems);

  const visibleRows = allMsgIds.length
    ? await db
        .select({ id: news.id, telegramMsgId: news.telegramMsgId })
        .from(news)
        .where(and(eq(news.channelId, channelId), inArray(news.telegramMsgId, allMsgIds), eq(news.isFiltered, 0)))
    : [];
  const visibleMap = new Map(visibleRows.map((row) => [row.telegramMsgId, row.id]));
  const visibleMessages = messages.filter((msg) => visibleMap.has(msg.id));

  for (const msg of visibleMessages) {
    if (!msg.instantViewImages?.length || !msg.instantViewContent) continue;
    await resolveInstantViewImages(msg, channel.telegramId);
    await db
      .update(news)
      .set({ fullContent: msg.instantViewContent, fullContentFormat: 'markdown' })
      .where(eq(news.id, visibleMap.get(msg.id)!));
  }

  const mediaProcessing = strategy.requiresMediaProcessing(visibleMessages.filter((msg) => insertedMap.has(msg.id)));

  const args: PostProcessArgs = {
    channelId,
    channelTelegramId: channel.telegramId,
    messages: visibleMessages,
    insertedMap,
  };

  // Only queue here; downloads themselves run in the worker pool.
  await strategy.postProcess(args);

  logger.info(
    { module: 'channels', channelId, inserted, updated, total: messages.length, mediaProcessing },
    `fetch done: ${inserted} inserted, ${updated} updated / ${messages.length} total`,
  );

  return { inserted, total: messages.length, mediaProcessing, totalNewsCount: actualTotal, unreadCount: actualUnread };
}
