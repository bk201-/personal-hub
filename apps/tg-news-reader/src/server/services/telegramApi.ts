/**
 * Telegram API — public functions: fetch messages, channel info, read history, download media.
 */

import { existsSync } from 'fs';
import { join } from 'path';
import type { Api } from 'telegram';
import { MAX_IMG_DOC_SIZE_BYTES, MAX_PHOTO_SIZE_BYTES, MAX_VIDEO_SIZE_BYTES } from '../config.js';
import { logger } from '../logger.js';
import { downloadMediaFile } from './downloadMediaFile.js';
import { isUnavailableTelegramChannelError } from './telegramChannelErrors.js';
import { telegramCircuit } from './telegramCircuitBreaker.js';
import { ensureAndGetApi, getTelegramClient } from './telegramClient.js';
import { extractInstantViewPage, parseMessageFields } from './telegramParser.js';
import type { TelegramMessage } from './telegramParser.js';

const BATCH_SIZE = 100;

/**
 * Fetch full Instant View page via messages.getWebPage when the cached page was partial.
 * Mutates `msg.instantViewContent` in-place if the full page has more content.
 */
async function resolvePartialInstantView(msg: TelegramMessage): Promise<void> {
  if (!msg.instantViewPartial || !msg.instantViewUrl) return;
  try {
    const _Api = await ensureAndGetApi();
    const tg = await getTelegramClient();
    const result = await tg.invoke(new _Api.messages.GetWebPage({ url: msg.instantViewUrl, hash: 0 }));
    const wp = result.webpage;
    if (wp instanceof _Api.WebPage && wp.cachedPage instanceof _Api.Page) {
      const { text: fullText, images } = extractInstantViewPage(wp.cachedPage);
      if (fullText && fullText.length > (msg.instantViewContent?.length ?? 0)) {
        // Replace content and its image placeholders together so `iv://N` tokens stay in sync
        msg.instantViewContent = fullText;
        msg.instantViewImages = images.length ? images : undefined;
      }
      // Even if the page is still partial, we've done our best
      msg.instantViewPartial = false;
    }
  } catch (err) {
    logger.warn({ module: 'telegram', url: msg.instantViewUrl, err }, 'Failed to fetch full Instant View page');
    // Keep whatever partial content we already have
  }
}

/**
 * Download Instant View images referenced by `iv://N` placeholders and rewrite the
 * markdown to point at local /api/media paths. Failed/leftover placeholders are stripped.
 * `channelTelegramId` is the numeric channel id used as the media directory name.
 */
export async function resolveInstantViewImages(msg: TelegramMessage, channelTelegramId: string): Promise<void> {
  if (!msg.instantViewImages?.length || !msg.instantViewContent) return;

  const dir = join(process.cwd(), 'data', channelTelegramId);

  let content = msg.instantViewContent;
  const _Api = await ensureAndGetApi();

  for (let i = 0; i < msg.instantViewImages.length; i++) {
    const img = msg.instantViewImages[i];
    const filename = `iv_${msg.id}_${i}.jpg`;
    const filepath = join(dir, filename);
    const rel = `${channelTelegramId}/${filename}`;
    // downloadMedia needs a MessageMedia wrapper, not a bare Photo/Document.
    const media =
      img.media instanceof _Api.Photo
        ? new _Api.MessageMediaPhoto({ photo: img.media })
        : new _Api.MessageMediaDocument({ document: img.media as Api.TypeDocument });
    try {
      if (!existsSync(filepath)) {
        const saved = await telegramCircuit.execute(async () => {
          const tg = await getTelegramClient();
          return downloadMediaFile(filepath, 0, (writer) => tg.downloadMedia(media, { outputFile: writer }));
        }, 'downloadInstantViewImage');
        if (!saved) continue;
      }
      // Replace the placeholder inside the markdown image target: (iv://N) → (rel)
      content = content.split(`(${img.placeholder})`).join(`(${rel})`);
    } catch (err) {
      logger.warn(
        { module: 'telegram', channelTelegramId, msgId: msg.id, err },
        'Failed to download Instant View image',
      );
      // Leave the placeholder — the cleanup below strips unresolved images.
    }
  }

  // Strip any image whose placeholder was never resolved (download failed / missing).
  content = content.replace(/!\[[^\]]*\]\(iv:\/\/\d+\)\n*/g, '');
  msg.instantViewContent = content;
  msg.instantViewImages = undefined;
}

export async function fetchChannelMessages(
  channelUsername: string,
  options: { sinceDate?: Date; limit?: number; offsetId?: number } = {},
): Promise<TelegramMessage[]> {
  return telegramCircuit.execute(() => _fetchChannelMessages(channelUsername, options), 'fetchChannelMessages');
}

async function _fetchChannelMessages(
  channelUsername: string,
  options: { sinceDate?: Date; limit?: number; offsetId?: number } = {},
): Promise<TelegramMessage[]> {
  const _Api = await ensureAndGetApi();
  const tg = await getTelegramClient();
  // `limit === undefined` means "no cap" — keep paging until sinceDate / empty result.
  // This is used when the user explicitly asks for a date range via the Fetch-period UI:
  // they want EVERYTHING since that date, not just the first N messages.
  const { sinceDate, limit } = options;
  const allMessages: TelegramMessage[] = [];
  let offsetId = options.offsetId ?? 0;

  try {
    while (true) {
      const result = await tg.getMessages(channelUsername, {
        limit: BATCH_SIZE,
        ...(offsetId ? { offsetId } : {}),
      });

      if (!result || result.length === 0) break;
      let reachedSinceDate = false;

      for (const msg of result) {
        if (!(msg instanceof _Api.Message)) continue;
        const msgDate = new Date((msg.date || 0) * 1000);
        if (sinceDate && msgDate <= sinceDate) {
          reachedSinceDate = true;
          break;
        }
        const parsed = parseMessageFields(msg, channelUsername);
        if (parsed) allMessages.push(parsed);
      }

      if (reachedSinceDate) break;
      if (result.length < BATCH_SIZE) break;
      if (limit !== undefined && allMessages.length >= limit) break;

      const lastMsg = result[result.length - 1];
      if (lastMsg instanceof _Api.Message) {
        offsetId = lastMsg.id;
      } else {
        break;
      }
    }
  } catch (err) {
    logger.error({ module: 'telegram', channelUsername, err }, 'Error fetching Telegram messages');
    throw err;
  }

  // ── Resolve partial Instant View pages ──────────────────────────────────────
  const partialIVMessages = allMessages.filter((m) => m.instantViewPartial);
  if (partialIVMessages.length > 0) {
    logger.info(
      { module: 'telegram', channelUsername, count: partialIVMessages.length },
      'Resolving partial Instant View pages',
    );
    for (const msg of partialIVMessages) {
      await resolvePartialInstantView(msg);
    }
  }

  // Image downloads are deferred to channelFetchService, after filtering.

  // ── Resolve forward source channel names (entity cache lookup) ───────────
  // After getHistory, gramjs caches all entities from the response,
  // so PeerChannel lookups here are cache hits — no extra network calls.
  // Build a deduped map from stringified channelId → PeerChannel peer
  const channelForwardPeers = [
    ...new Map(
      allMessages
        .filter((m) => !m.forwardFromName && m.forwardFromPeer instanceof _Api.PeerChannel)
        .map((m) => [String((m.forwardFromPeer as Api.PeerChannel).channelId), m.forwardFromPeer as Api.TypePeer]),
    ).values(),
  ];

  if (channelForwardPeers.length > 0) {
    const entityResults = await Promise.all(channelForwardPeers.map((peer) => tg.getEntity(peer).catch(() => null)));
    const nameMap = new Map<string, string>();
    channelForwardPeers.forEach((peer, i) => {
      const entity = entityResults[i];
      if (entity && 'title' in entity && typeof (entity as { title?: unknown }).title === 'string') {
        nameMap.set(String((peer as Api.PeerChannel).channelId), (entity as { title: string }).title);
      }
    });
    for (const msg of allMessages) {
      if (!msg.forwardFromName && msg.forwardFromPeer instanceof _Api.PeerChannel) {
        const name = nameMap.get(String(msg.forwardFromPeer.channelId));
        if (name) msg.forwardFromName = name;
      }
    }
  }

  // ── Album grouping ──────────────────────────────────────────────────────────
  const groupMap = new Map<string, TelegramMessage[]>();
  const singles: TelegramMessage[] = [];

  for (const msg of allMessages) {
    if (msg.groupedId) {
      const bucket = groupMap.get(msg.groupedId) ?? [];
      bucket.push(msg);
      groupMap.set(msg.groupedId, bucket);
    } else {
      singles.push(msg);
    }
  }

  const albumPrimaries: TelegramMessage[] = [];
  for (const group of groupMap.values()) {
    group.sort((a, b) => a.id - b.id);
    const primary = group[0];
    const rawMediaItems = group.map((g) => g.rawMedia).filter((m): m is Api.TypeMessageMedia => m !== undefined);
    const totalSize = group.reduce((sum, g) => sum + (g.mediaSizeBytes ?? 0), 0);
    albumPrimaries.push({
      ...primary,
      rawMediaItems: rawMediaItems.length > 1 ? rawMediaItems : undefined,
      albumTelegramIds: group.length > 1 ? group.map((g) => g.id) : undefined,
      mediaSizeBytes: totalSize > 0 ? totalSize : primary.mediaSizeBytes,
    });
  }

  return [...singles, ...albumPrimaries].sort((a, b) => a.date - b.date || a.id - b.id);
}

export interface ChannelInfo {
  name: string;
  username: string | null;
  description: string | null;
}

export async function getChannelInfo(username: string): Promise<ChannelInfo> {
  return telegramCircuit.execute(async () => {
    const _Api = await ensureAndGetApi();
    const tg = await getTelegramClient();
    const entity = await tg.getEntity(username);
    let name = 'Unknown';
    let resolvedUsername: string | null = null;
    let description: string | null = null;

    if (entity instanceof _Api.Channel || entity instanceof _Api.Chat) {
      name = (entity as Api.Channel).title ?? name;
      resolvedUsername = (entity as Api.Channel).username ?? null;
      try {
        const full = await tg.invoke(new _Api.channels.GetFullChannel({ channel: entity as Api.Channel }));
        description = (full.fullChat as Api.ChannelFull).about || null;
      } catch {
        // description not critical
      }
    } else if (entity instanceof _Api.User) {
      name = [entity.firstName, entity.lastName].filter(Boolean).join(' ') || name;
      resolvedUsername = entity.username ?? null;
    }

    return { name, username: resolvedUsername, description };
  }, 'getChannelInfo');
}

export async function getReadInboxMaxId(channelUsername: string): Promise<number | null> {
  try {
    return await telegramCircuit.execute(async () => {
      const _Api = await ensureAndGetApi();
      const tg = await getTelegramClient();
      const inputPeer = await tg.getInputEntity(channelUsername);
      const result = await tg.invoke(
        new _Api.messages.GetPeerDialogs({
          peers: [new _Api.InputDialogPeer({ peer: inputPeer })],
        }),
      );
      const dialog = result.dialogs[0];
      if (!dialog || !('readInboxMaxId' in dialog)) return null;
      const maxId = dialog.readInboxMaxId;
      return maxId > 0 ? maxId : null;
    }, 'getReadInboxMaxId');
  } catch (err) {
    logger.warn({ module: 'telegram', channelUsername, err }, 'Failed to get readInboxMaxId from Telegram');
    if (isUnavailableTelegramChannelError(err)) throw err;
    return null;
  }
}

export async function readChannelHistory(channelUsername: string, maxId: number): Promise<void> {
  await telegramCircuit.execute(async () => {
    const _Api = await ensureAndGetApi();
    const tg = await getTelegramClient();
    const entity = await tg.getEntity(channelUsername);
    await tg.invoke(new _Api.channels.ReadHistory({ channel: entity, maxId }));
  }, 'readChannelHistory');
}

export async function downloadMessageMedia(
  msg: TelegramMessage,
  channelTelegramId: string,
  options: { ignoreLimit?: boolean; imagesOnly?: boolean } = {},
): Promise<string | null> {
  const _Api = await ensureAndGetApi();
  if (!msg.rawMedia) return null;

  let ext: string;
  let expectedBytes = msg.mediaSizeBytes ?? 0;
  const ignoreLimit = options.ignoreLimit && !options.imagesOnly;

  if (msg.rawMedia instanceof _Api.MessageMediaPhoto) {
    ext = 'jpg';
    const photo = msg.rawMedia.photo;
    if (photo instanceof _Api.Photo) {
      for (const size of photo.sizes) {
        if (size instanceof _Api.PhotoSize) expectedBytes = Math.max(expectedBytes, size.size);
        else if (size instanceof _Api.PhotoSizeProgressive) expectedBytes = Math.max(expectedBytes, ...size.sizes);
        else if (size instanceof _Api.PhotoCachedSize) expectedBytes = Math.max(expectedBytes, size.bytes.length);
      }
    }
    if (!ignoreLimit && expectedBytes > MAX_PHOTO_SIZE_BYTES) return null;
  } else if (msg.rawMedia instanceof _Api.MessageMediaDocument) {
    const doc = msg.rawMedia.document;
    if (!(doc instanceof _Api.Document)) return null;
    const sizeNum = Number(doc.size ?? 0);
    expectedBytes = sizeNum;
    const mime = doc.mimeType ?? '';
    // Enforce on raw Telegram media, not parsed mediaType (albums can mix images and videos).
    if (options.imagesOnly && !mime.startsWith('image/')) return null;
    if (mime === 'image/jpeg') ext = 'jpg';
    else if (mime === 'image/png') ext = 'png';
    else if (mime === 'image/gif') ext = 'gif';
    else if (mime === 'image/webp') ext = 'webp';
    else if (mime === 'video/mp4') ext = 'mp4';
    else if (mime === 'video/webm') ext = 'webm';
    else if (mime === 'video/quicktime') ext = 'mov';
    else if (mime === 'audio/ogg' || mime === 'application/ogg') ext = 'ogg';
    else if (mime === 'audio/mpeg') ext = 'mp3';
    else if (mime === 'audio/mp4' || mime === 'audio/m4a' || mime === 'audio/x-m4a') ext = 'm4a';
    else if (mime === 'audio/flac' || mime === 'audio/x-flac') ext = 'flac';
    else if (mime === 'audio/wav' || mime === 'audio/x-wav' || mime === 'audio/wave') ext = 'wav';
    else return null;

    const isAudio = mime.startsWith('audio/') || mime === 'application/ogg';
    if (!ignoreLimit) {
      if (isAudio) return null;
      const isVideo = ext === 'mp4' || ext === 'webm' || ext === 'mov';
      const limit = isVideo ? MAX_VIDEO_SIZE_BYTES : MAX_IMG_DOC_SIZE_BYTES;
      if (sizeNum > limit) return null;
    }
  } else {
    return null;
  }

  const dir = join(process.cwd(), 'data', channelTelegramId);

  const filename = `${msg.id}.${ext!}`;
  const filepath = join(dir, filename);

  if (existsSync(filepath)) return `${channelTelegramId}/${filename}`;

  return telegramCircuit.execute(async () => {
    const tg = await getTelegramClient();
    const saved = await downloadMediaFile(filepath, expectedBytes, (writer) =>
      tg.downloadMedia(msg.rawMedia!, { outputFile: writer }),
    );
    return saved ? `${channelTelegramId}/${filename}` : null;
  }, 'downloadMessageMedia');
}

export async function fetchMessageById(
  channelUsername: string,
  msgId: number,
  options: { downloadImages?: boolean } = {},
): Promise<TelegramMessage | null> {
  try {
    return await telegramCircuit.execute(async () => {
      const _Api = await ensureAndGetApi();
      const tg = await getTelegramClient();
      const result = await tg.getMessages(channelUsername, { ids: [msgId] });
      const msg = result[0];
      if (!(msg instanceof _Api.Message)) return null;
      const parsed = parseMessageFields(msg, channelUsername);
      if (parsed) {
        await resolvePartialInstantView(parsed);
        if (options.downloadImages !== false && parsed.instantViewImages?.length) {
          await resolveInstantViewImages(parsed, channelUsername);
        }
      }
      return parsed;
    }, 'fetchMessageById');
  } catch (err) {
    logger.warn({ module: 'telegram', channelUsername, msgId, err }, 'error fetching message by ID');
    return null;
  }
}
