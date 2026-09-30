import { asc, gt } from 'drizzle-orm';
import { db } from '../../src/server/db/index.js';
import { news } from '../../src/server/db/schema.js';
import { mediaReferenceKey } from './orphanMediaCleanup.js';

/** Includes read/filtered news and article-only Instant View images, not just media columns. */
export async function loadMediaCleanupReferences(): Promise<ReadonlySet<string>> {
  const references = new Set<string>();
  let afterId = 0;
  while (true) {
    const rows = await db
      .select({
        id: news.id,
        localMediaPath: news.localMediaPath,
        localMediaPaths: news.localMediaPaths,
        fullContent: news.fullContent,
        text: news.text,
      })
      .from(news)
      .where(gt(news.id, afterId))
      .orderBy(asc(news.id))
      .limit(500);
    if (rows.length === 0) return references;
    for (const row of rows) {
      if (row.localMediaPath) references.add(mediaReferenceKey(row.localMediaPath));
      if (row.localMediaPaths !== null) {
        if (!Array.isArray(row.localMediaPaths) || row.localMediaPaths.some((path) => typeof path !== 'string')) {
          throw new Error(`Invalid media paths for news ${row.id}; cleanup aborted`);
        }
        for (const path of row.localMediaPaths) references.add(mediaReferenceKey(path));
      }
      for (const content of [row.fullContent, row.text]) {
        if (!content) continue;
        // Retain both relative Markdown targets and /api/media URLs, including URL-encoded targets.
        const decoded = content.replace(/(?:%[0-9a-f]{2})+/gi, (encoded) => {
          try {
            return decodeURIComponent(encoded);
          } catch (err) {
            if (err instanceof URIError) return encoded;
            throw err;
          }
        });
        for (const match of decoded.matchAll(/(@?[a-zA-Z0-9_-]+)[/\\]((?:iv_\d+_\d+|\d+)\.[a-z0-9]+)\b/gi)) {
          references.add(mediaReferenceKey(`${match[1]}/${match[2]}`));
        }
      }
    }
    afterId = rows[rows.length - 1].id;
  }
}
