import { and, eq, inArray } from 'drizzle-orm';
import type { ChannelType } from '../../shared/types.js';
import { db } from '../db/index.js';
import { news } from '../db/schema.js';
import { enqueueTask } from './downloadManager.js';
import { getMediaDownloadPriority } from './downloadPriority.js';
import type { TelegramMessage } from './telegram.js';

/** Media types eligible for auto-download by media strategies (photos + files + video). */
const DOWNLOADABLE_MEDIA_TYPES = new Set(['photo', 'document', 'video']);

/**
 * Media types a media channel treats as "real" content: kept on insert by
 * MediaStrategy and shown in the default ("filtered") news view. Anything else
 * (text-only, webpage-only) is dropped/hidden. Shared with the news route so the
 * insert whitelist and the display whitelist can never drift apart.
 */
export const MEDIA_VISIBLE_TYPES = ['photo', 'video', 'document', 'audio'] as const;
const MEDIA_KEEP_TYPES = new Set<string>(MEDIA_VISIBLE_TYPES);

export interface ItemFlags {
  /** When true, post text goes to collapsible top panel instead of inline body */
  textInPanel: boolean;
  /** When true, "Load article" button is shown for this item */
  canLoadArticle: boolean;
}

export interface PostProcessArgs {
  channelId: number;
  channelTelegramId: string;
  messages: TelegramMessage[];
  insertedMap: Map<number, number>; // telegramMsgId → news.id
}

export interface ChannelStrategy {
  /** Returns per-item flags to persist in the DB. */
  getItemFlags(msg: TelegramMessage): ItemFlags;
  /** Returns true if this message should be excluded from the DB entirely. */
  shouldSkipMessage(msg: TelegramMessage): boolean;
  /** Runs after insertion — e.g. queues background download tasks. */
  postProcess(args: PostProcessArgs): Promise<void>;
  /** Whether the client should open the media-progress SSE after fetch. */
  requiresMediaProcessing(messages: TelegramMessage[]): boolean;
}

// ─── News ─────────────────────────────────────────────────────────────────────
class NewsStrategy implements ChannelStrategy {
  getItemFlags(): ItemFlags {
    return { textInPanel: false, canLoadArticle: false };
  }
  shouldSkipMessage(): boolean {
    return false;
  }
  async postProcess(): Promise<void> {}
  requiresMediaProcessing(): boolean {
    return false;
  }
}

// ─── News with link ───────────────────────────────────────────────────────────
class NewsLinkStrategy implements ChannelStrategy {
  getItemFlags(msg: TelegramMessage): ItemFlags {
    return { textInPanel: false, canLoadArticle: msg.links.length > 0 };
  }
  shouldSkipMessage(): boolean {
    return false;
  }
  async postProcess(): Promise<void> {}
  requiresMediaProcessing(): boolean {
    return false;
  }
}

// ─── Base class for strategies that auto-download media ───────────────────────
abstract class MediaDownloadStrategy implements ChannelStrategy {
  abstract getItemFlags(msg: TelegramMessage): ItemFlags;
  abstract shouldSkipMessage(msg: TelegramMessage): boolean;

  async postProcess({ messages, insertedMap }: PostProcessArgs): Promise<void> {
    const toQueue = messages
      .filter((m) => DOWNLOADABLE_MEDIA_TYPES.has(m.mediaType ?? '') && insertedMap.has(m.id))
      .sort((a, b) => getMediaDownloadPriority(b) - getMediaDownloadPriority(a));
    if (toQueue.length === 0) return;

    // Filters suppress all automatic media downloads, including photos and albums.
    const insertedIds = toQueue.map((m) => insertedMap.get(m.id)!);
    const hiddenRows = await db
      .select({ id: news.id })
      .from(news)
      .where(and(inArray(news.id, insertedIds), eq(news.isFiltered, 1)));
    const hiddenIds = new Set(hiddenRows.map((r) => r.id));

    for (const msg of toQueue) {
      const newsId = insertedMap.get(msg.id)!;
      if (hiddenIds.has(newsId)) continue;
      await enqueueTask(newsId, 'media', undefined, getMediaDownloadPriority(msg));
    }
  }

  requiresMediaProcessing(messages: TelegramMessage[]): boolean {
    return messages.some((m) => DOWNLOADABLE_MEDIA_TYPES.has(m.mediaType ?? ''));
  }
}

// ─── Media ────────────────────────────────────────────────────────────────────
class MediaStrategy extends MediaDownloadStrategy {
  getItemFlags(): ItemFlags {
    return { textInPanel: true, canLoadArticle: false };
  }

  shouldSkipMessage(msg: TelegramMessage): boolean {
    // Keep photo, video, document (files), audio. Drop text-only and webpage-only.
    return !msg.rawMedia || !MEDIA_KEEP_TYPES.has(msg.mediaType ?? '');
  }
}

// ─── Blog ─────────────────────────────────────────────────────────────────────
class BlogStrategy extends MediaDownloadStrategy {
  getItemFlags(): ItemFlags {
    return { textInPanel: false, canLoadArticle: false };
  }
  shouldSkipMessage(): boolean {
    return false;
  }
}

// ─── Factory ──────────────────────────────────────────────────────────────────

const strategyMap: Record<ChannelType, ChannelStrategy> = {
  news: new NewsStrategy(),
  news_link: new NewsLinkStrategy(),
  media: new MediaStrategy(),
  blog: new BlogStrategy(),
};

export function getChannelStrategy(channelType: ChannelType): ChannelStrategy {
  return strategyMap[channelType] ?? strategyMap.news;
}
