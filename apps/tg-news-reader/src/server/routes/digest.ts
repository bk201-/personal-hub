import { zValidator } from '@hono/zod-validator';
import { and, desc, eq, gt, inArray, isNotNull, isNull, lte, or } from 'drizzle-orm';
import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import {
  DIGEST_ARTICLE_CONTENT_LIMIT,
  DIGEST_ARTICLE_PREFETCH_TIMEOUT_MS,
  DIGEST_MAX_ITEMS,
  DIGEST_MAX_PREFETCH,
} from '../config.js';
import { db } from '../db/index.js';
import { channels, downloads, news } from '../db/schema.js';
import { logger } from '../logger.js';
import { enqueueTask } from '../services/downloadManager.js';
import { createOpenAiClient, DIGEST_DEPLOYMENT, isAiConfigured } from '../services/openaiClient.js';
import { createDigestSchema } from './schemas.js';

const router = new Hono();

router.post('/', zValidator('json', createDigestSchema), async (c) => {
  if (!isAiConfigured()) {
    return c.json({ error: 'AI provider not configured' }, 503);
  }

  const body = c.req.valid('json');

  // ── Fetch news items from DB ─────────────────────────────────────────────
  const conditions = [];

  if (body.newsIds?.length) {
    // Tag-filtered view: digest only these specific items
    conditions.push(inArray(news.id, body.newsIds));
  } else if (body.channelIds?.length) {
    conditions.push(inArray(news.channelId, body.channelIds));
  } else if (body.groupId !== undefined) {
    const groupChannels = await db
      .select({ id: channels.id })
      .from(channels)
      .where(body.groupId === null ? isNull(channels.groupId) : eq(channels.groupId, body.groupId));
    const ids = groupChannels.map((ch) => ch.id);
    if (ids.length === 0) {
      return c.json({ error: 'No channels in this group' }, 404);
    }
    conditions.push(inArray(news.channelId, ids));
  }

  if (body.since) {
    const sinceTs = Math.floor(new Date(body.since).getTime() / 1000);
    conditions.push(gt(news.postedAt, sinceTs));
  }
  if (body.until) {
    const untilTs = Math.floor(new Date(body.until).getTime() / 1000);
    conditions.push(lte(news.postedAt, untilTs));
  }

  const rows = await db
    .select({
      id: news.id,
      text: news.text,
      postedAt: news.postedAt,
      channelId: news.channelId,
      fullContent: news.fullContent,
      links: news.links,
      canLoadArticle: news.canLoadArticle,
      channelType: channels.channelType,
    })
    .from(news)
    .innerJoin(channels, eq(news.channelId, channels.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(news.postedAt))
    .limit(DIGEST_MAX_ITEMS);

  if (rows.length === 0) {
    return c.json({ error: 'No news items found for digest' }, 404);
  }

  // Newest-first already — reverse to chronological for the prompt
  const items = [...rows].reverse();

  // ── Identify prefetch set ────────────────────────────────────────────────
  // news_link items that have no fullContent yet but have a link to fetch.
  // Capped at DIGEST_MAX_PREFETCH to avoid saturating the download worker pool.
  const prefetchItems = items
    .filter((item) => item.channelType === 'news_link' && item.fullContent === null && item.canLoadArticle === 1)
    .slice(0, DIGEST_MAX_PREFETCH);

  // Build citation index → newsId mapping (sent to client before streaming starts)
  const refMap: Record<string, number> = {};
  items.forEach((item, i) => {
    refMap[String(i + 1)] = item.id;
  });

  // ── Stream SSE response ───────────────────────────────────────────────────
  return streamSSE(c, async (stream) => {
    /** IDs enqueued during Phase 1 — need cleanup on stream close */
    let enqueuedPrefetchIds: number[] = [];
    try {
      // ── Phase 1: prefetch articles ──────────────────────────────────────
      if (prefetchItems.length > 0) {
        const prefetchIds = prefetchItems.map((item) => item.id);
        enqueuedPrefetchIds = prefetchIds;
        const total = prefetchIds.length;

        // Enqueue article downloads at priority=10 (user-initiated; no size limits)
        for (const item of prefetchItems) {
          const links = item.links;
          if (links[0]) {
            await enqueueTask(item.id, 'article', links[0], 10);
          }
        }

        logger.info({ module: 'digest', prefetchCount: total, totalItems: items.length }, 'prefetch phase started');

        const deadline = Date.now() + DIGEST_ARTICLE_PREFETCH_TIMEOUT_MS;

        // Emit initial tick so the client renders the circle immediately
        await stream.writeSSE({
          event: 'prefetch_progress',
          data: JSON.stringify({ done: 0, total, errors: 0 }),
        });

        let timedOut = false;
        while (Date.now() < deadline) {
          await new Promise<void>((resolve) => setTimeout(resolve, 1_000));

          const [doneRows, failedRows, activeRows] = await Promise.all([
            // Items that now have fullContent written
            db
              .select({ id: news.id })
              .from(news)
              .where(and(inArray(news.id, prefetchIds), isNotNull(news.fullContent))),
            // Tasks that permanently failed
            db
              .select({ newsId: downloads.newsId })
              .from(downloads)
              .where(
                and(
                  inArray(downloads.newsId, prefetchIds),
                  eq(downloads.type, 'article'),
                  eq(downloads.status, 'failed'),
                ),
              ),
            // Tasks still in flight
            db
              .select({ newsId: downloads.newsId })
              .from(downloads)
              .where(
                and(
                  inArray(downloads.newsId, prefetchIds),
                  eq(downloads.type, 'article'),
                  or(eq(downloads.status, 'pending'), eq(downloads.status, 'processing')),
                ),
              ),
          ]);

          const done = doneRows.length;
          const errors = failedRows.length;
          const remaining = activeRows.length;

          await stream.writeSSE({
            event: 'prefetch_progress',
            data: JSON.stringify({ done, total, errors }),
          });

          if (remaining === 0) {
            logger.info({ module: 'digest', done, errors, total }, 'prefetch phase completed');
            break;
          }
        }

        if (Date.now() >= deadline) {
          timedOut = true;
          logger.warn(
            { module: 'digest', timeoutSec: DIGEST_ARTICLE_PREFETCH_TIMEOUT_MS / 1000 },
            'prefetch phase timed out — proceeding with partial data',
          );
        }

        // Re-fetch fullContent for all prefetch items after Phase 1 settles
        if (!timedOut || prefetchIds.length > 0) {
          const freshRows = await db
            .select({ id: news.id, fullContent: news.fullContent })
            .from(news)
            .where(inArray(news.id, prefetchIds));

          const freshMap = new Map(freshRows.map((r) => [r.id, r.fullContent]));
          for (const item of items) {
            if (freshMap.has(item.id)) {
              item.fullContent = freshMap.get(item.id) ?? null;
            }
          }
        }
      }

      // ── Phase 2: AI generation ──────────────────────────────────────────
      const newsText = items
        .map((item, i) => {
          const date = new Date(item.postedAt * 1000).toLocaleDateString('ru-RU');
          const content = item.fullContent
            ? item.fullContent.trim().slice(0, DIGEST_ARTICLE_CONTENT_LIMIT)
            : item.text.trim().slice(0, 500);
          return `${i + 1}. [${date}] ${content}`;
        })
        .join('\n');

      const systemPrompt = `You are a news digest assistant for a personal Telegram news reader.
Summarize the provided news items into a structured digest.
- Group related topics together
- Highlight the most important events
- Write in the same language as the majority of the news content
- Use markdown formatting: headers (##), bullet points, bold for key terms
- Be concise but informative
- At the end add a "📌 Key takeaways" section with 3-5 bullet points
- When citing a specific news item, append the citation immediately after the relevant fact using the format [N], where N is the item's sequential number from the list
- Use exactly one integer per bracket: write [1][2] to cite items 1 and 2 — never write [1,2] or [1, 2]
- Only valid citation format is [N] with a single integer, nothing else inside the brackets
- Not every sentence needs a citation — only cite when referring to a concrete fact from a specific item
- Place citations inside bullet points or sentences, not on a separate line`;

      const userPrompt = `Here are ${items.length} news items (newest last):\n\n${newsText}\n\nPlease create a digest.`;

      // Send ref_map first so the client can render chips as chunks arrive
      await stream.writeSSE({ event: 'ref_map', data: JSON.stringify(refMap) });

      const client = createOpenAiClient();
      const completion = await client.chat.completions.create({
        model: DIGEST_DEPLOYMENT,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        stream: true,
        max_tokens: 2000,
        temperature: 0.7,
      });

      for await (const chunk of completion) {
        const delta = chunk.choices[0]?.delta?.content;
        if (delta) {
          await stream.writeSSE({ event: 'chunk', data: JSON.stringify({ content: delta }) });
        }
      }

      await stream.writeSSE({ event: 'done', data: '{}' });
      logger.info({ module: 'digest', items: items.length }, 'digest completed');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error({ module: 'digest', err }, 'digest error');
      await stream.writeSSE({ event: 'error', data: JSON.stringify({ message: msg }) });
    } finally {
      // Cancel any prefetch tasks that are still pending (not yet picked up by a worker).
      // This prevents the worker pool from being saturated after the digest stream closes.
      if (enqueuedPrefetchIds.length > 0) {
        try {
          const cancelled = await db
            .delete(downloads)
            .where(
              and(
                inArray(downloads.newsId, enqueuedPrefetchIds),
                eq(downloads.type, 'article'),
                eq(downloads.status, 'pending'),
              ),
            )
            .returning({ id: downloads.id });
          if (cancelled.length > 0) {
            logger.info(
              { module: 'digest', cancelled: cancelled.length },
              'cancelled pending prefetch tasks after digest stream closed',
            );
          }
        } catch (cleanupErr) {
          logger.warn({ module: 'digest', err: cleanupErr }, 'failed to cancel pending prefetch tasks');
        }
      }
    }
  });
});

export default router;
