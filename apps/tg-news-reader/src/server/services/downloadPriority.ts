import { asc, desc, sql } from 'drizzle-orm';
import { downloads, news } from '../db/schema.js';
import type { TelegramMessage } from './telegram.js';

const IMAGE_PRIORITY = 5;

export function getMediaDownloadPriority(msg: TelegramMessage): number {
  if (msg.mediaType === 'photo') return IMAGE_PRIORITY;
  const media = msg.rawMedia;
  if (
    msg.mediaType === 'document' &&
    media &&
    'document' in media &&
    media.document &&
    'mimeType' in media.document &&
    media.document.mimeType.startsWith('image/')
  ) {
    return IMAGE_PRIORITY;
  }
  return 0;
}

// The photo fallback also prioritizes tasks queued before image priorities existed.
// Explicit user priorities (>= 10) always win; image documents carry priority 5.
export const downloadPriority = sql<number>`CASE
  WHEN ${downloads.type} = 'media' AND ${news.mediaType} = 'photo'
    THEN MAX(${downloads.priority}, ${IMAGE_PRIORITY})
  ELSE ${downloads.priority}
END`;

export const downloadOrderBy = [desc(downloadPriority), asc(downloads.createdAt), asc(downloads.id)];
