import { createHash } from 'node:crypto';
import { and, asc, eq, gt, inArray, max, notInArray, or, sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import { Hono } from 'hono';
import type { ChannelType, NewsItem } from '../../shared/types.js';
import { db } from '../db/index.js';
import { toNewsItem } from '../db/mappers.js';
import { channels, downloads, news } from '../db/schema.js';
import { logger } from '../logger.js';
import { getChannelStrategy, MEDIA_VISIBLE_TYPES } from '../services/channelStrategies.js';
import { fetchMessageById, readChannelHistory } from '../services/telegram.js';
import { deleteAllMediaFiles } from '../utils/mediaFiles.js';
import { markReadSchema, parseOptionalBody, readAllNewsSchema, readBatchNewsSchema } from './schemas.js';

const router = new Hono();

// POST /api/news/read-all
//
// Body (all optional):
//   - channelId: scope to a single channel (default: all channels)
//   - newsIds:   scope to specific news IDs (overrides channelId selection)
//   - isRead:    target state (1 = mark read [default, backwards-compatible],
//                              0 = mark unread, used by the toolbar undo-toggle)
//
// Response: { success: true, affectedIds: number[] }
//   affectedIds = IDs of rows that were actually flipped (those already in the
//   target state are NOT included). The client uses this for the toggle:
//   capture the IDs on the first click, send them back with isRead=0 on the second.
//
// `isRead === 0` is local-only — Telegram has no "mark unread" API and `lastReadAt`
// is left untouched so the next fetch boundary stays where it was.
router.post('/read-all', async (c) => {
  const body = await parseOptionalBody(c, readAllNewsSchema, {});
  const targetIsRead: 0 | 1 = body.isRead ?? 1;
  const sourceIsRead = targetIsRead === 1 ? 0 : 1;

  // ── Scoped: only specific news IDs (e.g. tag-filtered view, undo-toggle) ───
  if (body.newsIds && body.newsIds.length > 0) {
    const toFlip = await db
      .select({ id: news.id, channelId: news.channelId })
      .from(news)
      .where(and(inArray(news.id, body.newsIds), eq(news.isRead, sourceIsRead)));

    if (toFlip.length === 0) {
      return c.json({ success: true, affectedIds: [] as number[] });
    }

    const flippedIds = toFlip.map((r) => r.id);
    await db.update(news).set({ isRead: targetIsRead }).where(inArray(news.id, flippedIds));

    // Recount unread per affected channel
    const affectedChannelIds = [...new Set(toFlip.map((r) => r.channelId))];
    for (const chId of affectedChannelIds) {
      const [result] = await db
        .select({ count: sql<number>`count(*)` })
        .from(news)
        .where(and(eq(news.channelId, chId), eq(news.isRead, 0)));

      await db
        .update(channels)
        .set({ unreadCount: result?.count ?? 0 })
        .where(eq(channels.id, chId));
    }
    return c.json({ success: true, affectedIds: flippedIds });
  }

  // ── Full channel / global flip ────────────────────────────────────────────
  // Capture affected IDs BEFORE the UPDATE so the client can store them for undo.
  const baseConditions = [eq(news.isRead, sourceIsRead)];
  if (body.channelId) baseConditions.push(eq(news.channelId, body.channelId));

  const toFlip = await db
    .select({ id: news.id })
    .from(news)
    .where(and(...baseConditions));
  const flippedIds = toFlip.map((r) => r.id);

  if (flippedIds.length === 0) {
    return c.json({ success: true, affectedIds: [] as number[] });
  }

  await db
    .update(news)
    .set({ isRead: targetIsRead })
    .where(and(...baseConditions));

  // Update denormalized unread_count for the affected channel(s).
  // For the unread→read path we can use the previous fast path (set to 0); for the
  // read→unread path we recount from the news table to avoid drift.
  if (targetIsRead === 1) {
    if (body.channelId) {
      await db.update(channels).set({ unreadCount: 0 }).where(eq(channels.id, body.channelId));
    } else {
      await db.update(channels).set({ unreadCount: 0 });
    }
  } else {
    // Read → unread: recount per affected channel.
    const affectedChannelIds = body.channelId
      ? [body.channelId]
      : [
          ...new Set(
            (await db.select({ channelId: news.channelId }).from(news).where(inArray(news.id, flippedIds))).map(
              (r) => r.channelId,
            ),
          ),
        ];
    for (const chId of affectedChannelIds) {
      const [result] = await db
        .select({ count: sql<number>`count(*)` })
        .from(news)
        .where(and(eq(news.channelId, chId), eq(news.isRead, 0)));

      await db
        .update(channels)
        .set({ unreadCount: result?.count ?? 0 })
        .where(eq(channels.id, chId));
    }
  }

  // Sync read state to Telegram only on read direction (Telegram has no "mark unread").
  if (targetIsRead === 1 && body.channelId) {
    const [channel] = await db.select().from(channels).where(eq(channels.id, body.channelId));
    if (channel) {
      const [result] = await db
        .select({ maxMsgId: max(news.telegramMsgId), maxPostedAt: max(news.postedAt) })
        .from(news)
        .where(eq(news.channelId, body.channelId));

      // Advance the read watermark FIRST — it's local bookkeeping (the incremental-fetch
      // boundary) and must not depend on the Telegram round-trip succeeding. Losing it
      // can empty the channel on the next fetch once read items are cleaned up.
      if (result?.maxPostedAt) {
        await db.update(channels).set({ lastReadAt: result.maxPostedAt }).where(eq(channels.id, body.channelId));
      }

      // Best-effort mirror of the read position to Telegram.
      if (result?.maxMsgId) {
        try {
          await readChannelHistory(channel.telegramId, result.maxMsgId);
        } catch (err) {
          // Non-critical: local state already updated, Telegram sync failed
          logger.warn({ module: 'news', channelId: body.channelId, err }, 'failed to sync read state to Telegram');
        }
      }
    }
  }

  return c.json({ success: true, affectedIds: flippedIds });
});

// POST /api/news/read-batch
//
// Batched mark-read/unread — the client accumulates individual per-item toggles
// and flushes them here as one deferred request (see client markReadBatcher).
//
// Body (both optional, either or both may be present):
//   - readIds:   IDs to flip unread→read   (synced to Telegram, updates lastReadAt)
//   - unreadIds: IDs to flip read→unread   (local-only; Telegram has no "mark unread")
//
// Response: { success: true, readAffected: number[], unreadAffected: number[] }
//   *Affected arrays contain only rows that were actually flipped (already in the
//   target state are excluded).
router.post('/read-batch', async (c) => {
  const body = await parseOptionalBody(c, readBatchNewsSchema, {});
  const readIds = body.readIds ?? [];
  const unreadIds = body.unreadIds ?? [];

  const affectedChannelIds = new Set<number>();

  // ── read → unread (local only) ──────────────────────────────────────────────
  let unreadAffected: number[] = [];
  if (unreadIds.length > 0) {
    const toFlip = await db
      .select({ id: news.id, channelId: news.channelId })
      .from(news)
      .where(and(inArray(news.id, unreadIds), eq(news.isRead, 1)));
    unreadAffected = toFlip.map((r) => r.id);
    if (unreadAffected.length > 0) {
      await db.update(news).set({ isRead: 0 }).where(inArray(news.id, unreadAffected));
      for (const r of toFlip) affectedChannelIds.add(r.channelId);
    }
  }

  // ── unread → read (+ Telegram sync per channel) ─────────────────────────────
  let readAffected: number[] = [];
  const readChannelIds = new Set<number>();
  if (readIds.length > 0) {
    const toFlip = await db
      .select({ id: news.id, channelId: news.channelId })
      .from(news)
      .where(and(inArray(news.id, readIds), eq(news.isRead, 0)));
    readAffected = toFlip.map((r) => r.id);
    if (readAffected.length > 0) {
      await db.update(news).set({ isRead: 1 }).where(inArray(news.id, readAffected));
      for (const r of toFlip) {
        affectedChannelIds.add(r.channelId);
        readChannelIds.add(r.channelId);
      }
    }
  }

  // ── Recount denormalized unread_count for every touched channel ─────────────
  for (const chId of affectedChannelIds) {
    const [result] = await db
      .select({ count: sql<number>`count(*)` })
      .from(news)
      .where(and(eq(news.channelId, chId), eq(news.isRead, 0)));
    await db
      .update(channels)
      .set({ unreadCount: result?.count ?? 0 })
      .where(eq(channels.id, chId));
  }

  // ── Sync read state to Telegram for channels that gained read items ─────────
  for (const chId of readChannelIds) {
    const [channel] = await db.select().from(channels).where(eq(channels.id, chId));
    if (!channel) continue;
    // Only consider the items we just flipped in this channel for the read boundary.
    const [result] = await db
      .select({ maxMsgId: max(news.telegramMsgId), maxPostedAt: max(news.postedAt) })
      .from(news)
      .where(and(eq(news.channelId, chId), inArray(news.id, readAffected)));

    // Advance the read watermark FIRST — must not depend on the Telegram sync
    // (it's the incremental-fetch boundary).
    if (result?.maxPostedAt && (!channel.lastReadAt || result.maxPostedAt > channel.lastReadAt)) {
      await db.update(channels).set({ lastReadAt: result.maxPostedAt }).where(eq(channels.id, chId));
    }

    // Best-effort mirror of the read position to Telegram.
    if (result?.maxMsgId) {
      try {
        await readChannelHistory(channel.telegramId, result.maxMsgId);
      } catch (err) {
        // Non-critical: local state already updated, Telegram sync failed
        logger.warn({ module: 'news', channelId: chId, err }, 'failed to sync batch read state to Telegram');
      }
    }
  }

  return c.json({ success: true, readAffected, unreadAffected });
});

// DELETE /api/news/read - delete all read news (excluding items with active downloads)
router.delete('/read', async (c) => {
  const body = await parseOptionalBody(c, readAllNewsSchema, {});

  // Find news IDs with active (pending/processing) download tasks — protect them from deletion
  const activeDownloadNewsIds = await db
    .select({ newsId: downloads.newsId })
    .from(downloads)
    .where(sql`${downloads.status} IN ('pending', 'processing')`);
  const protectedIds = activeDownloadNewsIds.map((r) => r.newsId);

  const conditions = [eq(news.isRead, 1)];
  if (body.channelId) conditions.push(eq(news.channelId, body.channelId));
  if (protectedIds.length > 0) conditions.push(notInArray(news.id, protectedIds));
  const deleted = await db
    .delete(news)
    .where(and(...conditions))
    .returning({
      channelId: news.channelId,
      localMediaPath: news.localMediaPath,
      localMediaPaths: news.localMediaPaths,
    });
  deleted.forEach((r) => deleteAllMediaFiles(r.localMediaPath, r.localMediaPaths));

  // Decrement totalNewsCount per channel
  const countsByChannel = new Map<number, number>();
  for (const r of deleted) {
    countsByChannel.set(r.channelId, (countsByChannel.get(r.channelId) ?? 0) + 1);
  }
  for (const [chId, count] of countsByChannel) {
    await db
      .update(channels)
      .set({ totalNewsCount: sql`max(0, ${channels.totalNewsCount} - ${count})` })
      .where(eq(channels.id, chId));
  }

  return c.json({ deleted: deleted.length });
});

// GET /api/news?channelId=&isRead=&view=filtered|all|hidden&limit=&cursor=
//   - view=filtered (or legacy filtered=1): excludes items flagged as hidden by filters
//   - view=hidden: returns ONLY items flagged as hidden by filters
//   - view=all (default): no filter applied
// Response: { items: NewsItem[], filteredOut: number, nextCursor: number | null, hasMore: boolean }
router.get('/', async (c) => {
  const channelId = c.req.query('channelId') ? parseInt(c.req.query('channelId')!, 10) : undefined;
  const isReadParam = c.req.query('isRead');
  // ── View mode (with back-compat: filtered=1 → view=filtered) ─────────────
  const rawView = c.req.query('view');
  const legacyFilteredParam = c.req.query('filtered') === '1';
  let view: 'filtered' | 'all' | 'hidden' = 'all';
  if (rawView === 'filtered' || rawView === 'hidden' || rawView === 'all') {
    view = rawView;
  } else if (legacyFilteredParam) {
    view = 'filtered';
  }
  const limit = c.req.query('limit') ? parseInt(c.req.query('limit')!, 10) : 50;
  const cursor = c.req.query('cursor') ? parseInt(c.req.query('cursor')!, 10) : undefined;

  // Base conditions (channelId + isRead) — used for total-count query
  const baseConditions: SQL[] = [];
  if (channelId !== undefined) baseConditions.push(eq(news.channelId, channelId));
  if (isReadParam !== undefined) baseConditions.push(eq(news.isRead, parseInt(isReadParam, 10)));

  // Full conditions = base + view-specific exclusions
  const conditions: SQL[] = [...baseConditions];

  // For media_content channels, "hidden" auto-includes non-media items too,
  // and "filtered" auto-excludes them. Resolve channel type once.
  let isMediaChannel = false;
  if (channelId !== undefined && view !== 'all') {
    const [channelRow] = await db
      .select({ channelType: channels.channelType })
      .from(channels)
      .where(eq(channels.id, channelId));
    isMediaChannel = channelRow?.channelType === 'media';
  }

  if (view === 'filtered' && channelId !== undefined) {
    conditions.push(eq(news.isFiltered, 0));
    if (isMediaChannel) {
      conditions.push(inArray(news.mediaType, [...MEDIA_VISIBLE_TYPES]));
    }
  } else if (view === 'hidden' && channelId !== undefined) {
    // Inverse of 'filtered': anything that would be excluded from the filtered view.
    if (isMediaChannel) {
      conditions.push(or(eq(news.isFiltered, 1), notInArray(news.mediaType, [...MEDIA_VISIBLE_TYPES]))!);
    } else {
      conditions.push(eq(news.isFiltered, 1));
    }
  }

  // Cursor condition: fetch items after the cursor (posted_at > cursor)
  if (cursor !== undefined) {
    conditions.push(gt(news.postedAt, cursor));
  }

  // Fetch limit+1 to detect if there are more items
  const rows = await db
    .select()
    .from(news)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(asc(news.postedAt))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;

  // filteredOut = count of items that WOULD be excluded from the 'filtered' view.
  // Always computed on the first page when channelId is provided, regardless of
  // the current view, so the toolbar can show "Hidden: N" in any mode.
  let filteredOut = 0;
  if (!cursor && channelId !== undefined) {
    const isMedia = isMediaChannel || (await isChannelMedia(channelId));
    const hiddenCondition = isMedia
      ? or(eq(news.isFiltered, 1), notInArray(news.mediaType, [...MEDIA_VISIBLE_TYPES]))!
      : eq(news.isFiltered, 1);
    const [result] = await db
      .select({ count: sql<number>`count(*)` })
      .from(news)
      .where(and(...baseConditions, hiddenCondition));
    filteredOut = result?.count ?? 0;
  }

  const items: NewsItem[] = pageRows.map(toNewsItem);
  const nextCursor = hasMore && pageRows.length > 0 ? pageRows[pageRows.length - 1].postedAt : null;

  // Hash the representation, not counts: adding videos to an image-only album
  // changes its contents without changing the number of posts with media.
  const response = { items, filteredOut, nextCursor, hasMore };
  const etag = `"${createHash('sha256').update(JSON.stringify(response)).digest('hex')}"`;

  const ifNoneMatch = c.req.header('If-None-Match');
  if (ifNoneMatch === etag) {
    c.header('Cache-Control', 'no-cache, must-revalidate, private');
    c.header('ETag', etag);
    return c.body(null, 304);
  }

  // Cache-Control lets the browser store the response in its HTTP cache but
  // forces revalidation (If-None-Match) on every request. must-revalidate
  // explicitly permits caching responses to requests with Authorization header.
  // The browser handles ETag/304 transparently — JS fetch() sees a normal 200.
  c.header('Cache-Control', 'no-cache, must-revalidate, private');
  c.header('ETag', etag);
  return c.json(response);
});

// Helper for the filteredOut count path that needs channel type when not
// already resolved above (view=all branch).
async function isChannelMedia(channelId: number): Promise<boolean> {
  const [row] = await db.select({ channelType: channels.channelType }).from(channels).where(eq(channels.id, channelId));
  return row?.channelType === 'media';
}

// GET /api/news/:id
router.get('/:id', async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  const [row] = await db.select().from(news).where(eq(news.id, id));
  if (!row) return c.json({ error: 'News not found' }, 404);
  return c.json(toNewsItem(row));
});

// PATCH /api/news/:id/read
router.patch('/:id/read', async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  const body = await parseOptionalBody(c, markReadSchema, { isRead: 1 });
  const isRead = body.isRead ?? 1;

  const [updated] = await db.update(news).set({ isRead }).where(eq(news.id, id)).returning();
  if (!updated) return c.json({ error: 'News not found' }, 404);

  // Update denormalized unread_count: +1 if marking unread, -1 if marking read
  const delta = isRead === 1 ? -1 : 1;
  await db
    .update(channels)
    .set({ unreadCount: sql`max(0, ${channels.unreadCount} + ${delta})` })
    .where(eq(channels.id, updated.channelId));

  // When marking as read — sync to Telegram and update lastReadAt in DB
  if (isRead === 1) {
    const [channel] = await db.select().from(channels).where(eq(channels.id, updated.channelId));
    if (channel) {
      // Fire and forget — don't block the response
      void (async () => {
        try {
          await readChannelHistory(channel.telegramId, updated.telegramMsgId);
        } catch (err) {
          logger.warn({ module: 'news', newsId: updated.id, err }, 'failed to sync read state to Telegram');
        }
        // Update lastReadAt only if this message is newer than what we have
        if (!channel.lastReadAt || updated.postedAt > channel.lastReadAt) {
          await db.update(channels).set({ lastReadAt: updated.postedAt }).where(eq(channels.id, updated.channelId));
        }
      })();
    }
  }

  return c.json(toNewsItem(updated));
});

// POST /api/news/:id/refresh — re-fetch single news item from Telegram, re-process, update DB
router.post('/:id/refresh', async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  const [row] = await db.select().from(news).where(eq(news.id, id));
  if (!row) return c.json({ error: 'News not found' }, 404);

  const [channel] = await db.select().from(channels).where(eq(channels.id, row.channelId));
  if (!channel) return c.json({ error: 'Channel not found' }, 404);

  const msg = await fetchMessageById(channel.telegramId, row.telegramMsgId);
  if (!msg) return c.json({ error: 'Message not found on Telegram' }, 404);

  const strategy = getChannelStrategy(channel.channelType as ChannelType);
  const flags = strategy.getItemFlags(msg);

  const [updated] = await db
    .update(news)
    .set({
      text: msg.message,
      links: msg.links,
      hashtags: msg.hashtags,
      mediaType: msg.mediaType,
      mediaSize: msg.mediaSizeBytes,
      albumMsgIds: msg.albumTelegramIds ?? null,
      ...(msg.instantViewContent
        ? { fullContent: msg.instantViewContent, fullContentFormat: 'markdown' as const }
        : {}),
      textInPanel: flags.textInPanel ? 1 : 0,
      canLoadArticle: flags.canLoadArticle ? 1 : 0,
    })
    .where(eq(news.id, id))
    .returning();

  logger.info({ module: 'news', newsId: id, channelId: channel.id }, 'news item refreshed from Telegram');
  return c.json(toNewsItem(updated));
});

export default router;
