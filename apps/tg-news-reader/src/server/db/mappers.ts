import type { NewsItem } from '../../shared/types.js';
import type { news } from './schema.js';

/** DB row type returned by `db.select().from(news)`. */
type NewsRow = typeof news.$inferSelect;

/**
 * Map a raw Drizzle `news` row to the shared `NewsItem` type.
 *
 * - JSON columns (`links`, `hashtags`, `localMediaPaths`, `albumMsgIds`) are already
 *   auto-parsed by the `jsonStringArray`/`jsonNumberArray` custom column types.
 * - Null → undefined coercion for optional fields.
 * - Defaults for `textInPanel`, `canLoadArticle`, `fullContentFormat`.
 */
export function toNewsItem(row: NewsRow): NewsItem {
  return {
    id: row.id,
    channelId: row.channelId,
    telegramMsgId: row.telegramMsgId,
    text: row.text,
    links: row.links,
    hashtags: row.hashtags,
    isRead: row.isRead,
    postedAt: row.postedAt,
    mediaType: row.mediaType || undefined,
    fullContent: row.fullContent || undefined,
    localMediaPath: row.localMediaPath || undefined,
    localMediaPaths: row.localMediaPaths || undefined,
    albumMsgIds: row.albumMsgIds || undefined,
    mediaSize: row.mediaSize ?? undefined,
    textInPanel: row.textInPanel ?? 0,
    canLoadArticle: row.canLoadArticle ?? 0,
    fullContentFormat: row.fullContentFormat ?? 'text',
    forwardFromName: row.forwardFromName || undefined,
  };
}
