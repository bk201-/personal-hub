import { existsSync, rmSync } from 'fs';
import { join } from 'path';
import { zValidator } from '@hono/zod-validator';
import { and, eq, max } from 'drizzle-orm';
import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { db } from '../db/index.js';
import { channels, groups, news, sessions } from '../db/schema.js';
import { logger } from '../logger.js';
import { fetchChannelNews } from '../services/channelFetchService.js';
import { channelStorage } from '../services/channelStorage.js';
import { reprocessChannelFilters } from '../services/filterEngine.js';
import { mediaProgressEmitter } from '../services/mediaProgress.js';
import type { MediaProgressEvent } from '../services/mediaProgress.js';
import { getChannelInfo, readChannelHistory } from '../services/telegram.js';
import { ChannelUnavailableError } from '../services/telegramChannelErrors.js';
import {
  createChannelSchema,
  fetchChannelSchema,
  parseOptionalBody,
  reorderItemsSchema,
  updateChannelSchema,
} from './schemas.js';

const router = new Hono<{ Variables: { userId: number; sessionId: string } }>();

// GET /api/channels/lookup?username=durov  — fetch channel title+description from Telegram
router.get('/lookup', async (c) => {
  const raw = c.req.query('username') ?? '';
  const username = raw
    .trim()
    .replace(/^https?:\/\/t\.me\//i, '')
    .replace(/^@/, '')
    .split('/')[0];
  if (!username) return c.json({ error: 'username is required' }, 400);
  try {
    const info = await getChannelInfo(username);
    return c.json(info);
  } catch {
    return c.json({ error: 'Channel not found or inaccessible' }, 404);
  }
});

// GET /api/channels
router.get('/', async (c) => {
  const result = await db.select().from(channels).orderBy(channels.sortOrder, channels.createdAt);

  return c.json(
    result.map((r) => ({
      id: r.id,
      telegramId: r.telegramId,
      name: r.name,
      description: r.description,
      channelType: r.channelType,
      groupId: r.groupId,
      sortOrder: r.sortOrder,
      filterForwards: r.filterForwards,
      lastFetchedAt: r.lastFetchedAt,
      lastReadAt: r.lastReadAt,
      isUnavailable: r.isUnavailable,
      createdAt: r.createdAt,
      unreadCount: r.unreadCount,
      totalNewsCount: r.totalNewsCount,
      supportsDigest: r.channelType !== 'media',
    })),
  );
});

// GET /api/channels/:id/storage — authorize before consulting even the stats cache.
router.get('/:id/storage', async (c) => {
  const userId = c.get('userId');
  if (!userId) return c.json({ error: 'Unauthorized' }, 401);
  const rawId = c.req.param('id');
  const id = Number(rawId);
  if (!/^[1-9]\d*$/.test(rawId) || !Number.isSafeInteger(id)) {
    return c.json({ error: 'Invalid channel ID' }, 400);
  }
  c.header('Cache-Control', 'no-store');
  const [channel] = await db
    .select({ telegramId: channels.telegramId, groupId: channels.groupId, pinHash: groups.pinHash })
    .from(channels)
    .leftJoin(groups, eq(channels.groupId, groups.id))
    .where(eq(channels.id, id));
  if (!channel) return c.json({ error: 'Channel not found' }, 404);
  if (channel.pinHash) {
    const sessionId = c.get('sessionId');
    const [session] = sessionId ? await db.select().from(sessions).where(eq(sessions.id, sessionId)) : [];
    let unlocked: unknown = [];
    try {
      unlocked = JSON.parse(session?.unlockedGroupIds ?? '[]');
    } catch {
      // Invalid persisted state must fail closed.
    }
    if (
      !session ||
      session.userId !== userId ||
      session.expiresAt <= Math.floor(Date.now() / 1000) ||
      !Array.isArray(unlocked) ||
      !unlocked.includes(channel.groupId)
    ) {
      return c.json({ error: 'Group is locked' }, 403);
    }
  }
  try {
    return c.json(await channelStorage.getStats(channel.telegramId));
  } catch {
    return c.json({ error: 'Channel storage unavailable' }, 503);
  }
});

// POST /api/channels
router.post('/', zValidator('json', createChannelSchema), async (c) => {
  const body = c.req.valid('json');

  const telegramId = body.telegramId
    .trim()
    .replace(/^https?:\/\/t\.me\//i, '')
    .replace(/^@/, '')
    .split('/')[0];

  try {
    const [created] = await db
      .insert(channels)
      .values({
        telegramId,
        name: body.name.trim(),
        description: body.description?.trim(),
        channelType: body.channelType ?? 'news',
        groupId: body.groupId ?? null,
      })
      .returning();
    return c.json(created, 201);
  } catch (err: unknown) {
    const error = err as { message?: string; cause?: { message?: string } };
    if (error.message?.includes('UNIQUE') || error.cause?.message?.includes('UNIQUE')) {
      return c.json({ error: 'Channel with this Telegram ID already exists' }, 409);
    }
    throw err;
  }
});

// PATCH /api/channels/reorder
router.patch('/reorder', zValidator('json', reorderItemsSchema), async (c) => {
  const body = c.req.valid('json');
  for (const item of body.items) {
    await db.update(channels).set({ sortOrder: item.sortOrder }).where(eq(channels.id, item.id));
  }
  return c.json({ ok: true });
});

// PUT /api/channels/:id
router.put('/:id', zValidator('json', updateChannelSchema), async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  const body = c.req.valid('json');

  const [updated] = await db
    .update(channels)
    .set({
      ...(body.name && { name: body.name.trim() }),
      ...(body.description !== undefined && { description: body.description }),
      ...(body.channelType !== undefined && { channelType: body.channelType }),
      ...(body.groupId !== undefined && { groupId: body.groupId }),
      ...(body.filterForwards !== undefined && { filterForwards: body.filterForwards }),
      ...(body.lastFetchedAt !== undefined && { lastFetchedAt: body.lastFetchedAt }),
    })
    .where(eq(channels.id, id))
    .returning();

  if (!updated) return c.json({ error: 'Channel not found' }, 404);

  // Toggling the "filter forwards" option changes which existing news are hidden —
  // recompute is_filtered across the whole channel.
  if (body.filterForwards !== undefined) {
    await reprocessChannelFilters(id);
  }

  return c.json(updated);
});

// DELETE /api/channels/:id
router.delete('/:id', async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  const [deleted] = await db.delete(channels).where(eq(channels.id, id)).returning();
  if (!deleted) return c.json({ error: 'Channel not found' }, 404);

  // Remove media files from disk
  const mediaDir = join(process.cwd(), 'data', deleted.telegramId);
  if (existsSync(mediaDir)) {
    try {
      rmSync(mediaDir, { recursive: true, force: true });
    } catch (err) {
      logger.warn(
        { module: 'channels', channelId: id, err },
        `Failed to remove media folder for channel ${deleted.telegramId}`,
      );
    }
  }

  return c.json({ success: true });
});

// GET /api/channels/:id/media-progress — SSE stream for media download progress
router.get('/:id/media-progress', (c) => {
  const channelId = parseInt(c.req.param('id'), 10);
  const abortSignal = c.req.raw.signal;

  return streamSSE(c, async (stream) => {
    const cleanupFns: Array<() => void> = [];

    await new Promise<void>((resolve) => {
      const onEvent = (event: MediaProgressEvent) => {
        void stream.writeSSE({ event: event.type, data: JSON.stringify(event) });
        if (event.type === 'complete' || event.type === 'aborted') resolve();
      };

      mediaProgressEmitter.on(`channel:${channelId}`, onEvent);
      const timeout = setTimeout(resolve, 5 * 60 * 1000);

      cleanupFns.push(() => {
        mediaProgressEmitter.off(`channel:${channelId}`, onEvent);
        clearTimeout(timeout);
      });

      abortSignal.addEventListener('abort', () => resolve());
    });

    cleanupFns.forEach((fn) => fn());
  });
});

// POST /api/channels/:id/fetch
router.post('/:id/fetch', async (c) => {
  const channelId = parseInt(c.req.param('id'), 10);
  const body = await parseOptionalBody(c, fetchChannelSchema, {});

  try {
    const result = await fetchChannelNews(channelId, body);
    return c.json(result);
  } catch (err: unknown) {
    const error = err as { message?: string };
    if (error.message === 'Channel not found') {
      return c.json({ error: 'Channel not found' }, 404);
    }
    logger.error({ module: 'channels', channelId, err }, 'Fetch error');
    return c.json(
      { error: error.message || 'Failed to fetch messages' },
      err instanceof ChannelUnavailableError ? 422 : 500,
    );
  }
});

// POST /api/channels/:id/mark-read-and-fetch — bulk mark-read + fetch in one round-trip
router.post('/:id/mark-read-and-fetch', async (c) => {
  const channelId = parseInt(c.req.param('id'), 10);

  const [channel] = await db.select().from(channels).where(eq(channels.id, channelId));
  if (!channel) return c.json({ error: 'Channel not found' }, 404);

  // 1. Mark all unread as read
  await db
    .update(news)
    .set({ isRead: 1 })
    .where(and(eq(news.channelId, channelId), eq(news.isRead, 0)));

  // Reset unread_count to 0
  await db.update(channels).set({ unreadCount: 0 }).where(eq(channels.id, channelId));

  // 2. Sync read state to Telegram
  const [result] = await db
    .select({ maxMsgId: max(news.telegramMsgId), maxPostedAt: max(news.postedAt) })
    .from(news)
    .where(eq(news.channelId, channelId));

  // Advance the read watermark FIRST — local bookkeeping (the incremental-fetch
  // boundary) that must survive a failed Telegram sync.
  if (result?.maxPostedAt) {
    await db.update(channels).set({ lastReadAt: result.maxPostedAt }).where(eq(channels.id, channelId));
  }

  // Best-effort mirror of the read position to Telegram.
  if (result?.maxMsgId) {
    try {
      await readChannelHistory(channel.telegramId, result.maxMsgId);
    } catch (err) {
      logger.warn({ module: 'channels', channelId, err }, 'failed to sync read state to Telegram');
    }
  }

  // 3. Fetch new messages
  try {
    const fetchResult = await fetchChannelNews(channelId);
    return c.json(fetchResult);
  } catch (err: unknown) {
    const error = err as { message?: string };
    logger.error({ module: 'channels', channelId, err }, 'Fetch error after mark-read');
    return c.json(
      { error: error.message || 'Failed to fetch messages' },
      err instanceof ChannelUnavailableError ? 422 : 500,
    );
  }
});

export default router;
