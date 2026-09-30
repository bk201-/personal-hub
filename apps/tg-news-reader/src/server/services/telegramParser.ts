/**
 * Telegram Parser — message field extraction, link/hashtag parsing, Instant View.
 */

import type { Api } from 'telegram';
import { getApi } from './telegramClient.js';

export interface TelegramMessage {
  id: number;
  message: string;
  date: number;
  links: string[];
  hashtags: string[];
  mediaType?: string;
  mediaSizeBytes?: number;
  rawMedia?: Api.TypeMessageMedia;
  // Album support
  groupedId?: string;
  rawMediaItems?: Api.TypeMessageMedia[];
  albumTelegramIds?: number[];
  // Telegram Instant View: full article text extracted from Page blocks at fetch time
  instantViewContent?: string;
  // Images referenced by the IV markdown via `iv://N` placeholders. telegramApi
  // downloads each and rewrites the placeholder to a local /api/media path.
  instantViewImages?: InstantViewImage[];
  // When cachedPage.part is true, only a subset of blocks was delivered —
  // store the URL so telegramApi can call messages.getWebPage for the full page
  instantViewUrl?: string;
  instantViewPartial?: boolean;
  // Forward info — set if this message was forwarded from another channel/user
  forwardFromName?: string;
  /** Raw peer reference for entity resolution in telegramApi.ts — not stored in DB */
  forwardFromPeer?: Api.TypePeer;
}

/** True when the message's media is a video document (mime `video/*`). */
export function isVideoMessage(msg: TelegramMessage): boolean {
  const _Api = getApi();
  if (!(msg.rawMedia instanceof _Api.MessageMediaDocument)) return false;
  const doc = msg.rawMedia.document;
  if (!(doc instanceof _Api.Document)) return false;
  return (doc.mimeType ?? '').startsWith('video/');
}

/** Reads the original file name from a document's attributes, if present. */
function getDocumentFileName(attrs: Api.TypeDocumentAttribute[]): string | undefined {
  const _Api = getApi();
  for (const a of attrs) {
    if (a instanceof _Api.DocumentAttributeFilename) return a.fileName;
  }
  return undefined;
}

/** True when the file name ends in a common video container extension. */
function hasVideoExtension(fileName?: string): boolean {
  return /\.(mp4|webm|mov|mkv|avi|m4v)$/i.test(fileName ?? '');
}

export function extractLinks(text: string, entities?: Api.TypeMessageEntity[]): string[] {
  const _Api = getApi();
  const links: string[] = [];
  if (entities) {
    for (const entity of entities) {
      if (entity instanceof _Api.MessageEntityUrl) {
        links.push(text.substring(entity.offset, entity.offset + entity.length));
      } else if (entity instanceof _Api.MessageEntityTextUrl) {
        links.push(entity.url);
      }
    }
  }
  const urlRegex = /https?:\/\/[^\s\]]+/g;
  for (const url of text.match(urlRegex) ?? []) {
    if (!links.includes(url)) links.push(url);
  }
  return links;
}

export function extractHashtags(text: string, entities?: Api.TypeMessageEntity[]): string[] {
  const _Api = getApi();
  const hashtags: string[] = [];
  if (entities) {
    for (const entity of entities) {
      if (entity instanceof _Api.MessageEntityHashtag) {
        hashtags.push(text.substring(entity.offset, entity.offset + entity.length).toLowerCase());
      }
    }
  }
  const tagRegex = /#[\wа-яА-Я]+/gu;
  for (const tag of text.match(tagRegex) ?? []) {
    const normalized = tag.toLowerCase();
    if (!hashtags.includes(normalized)) hashtags.push(normalized);
  }
  return hashtags;
}

// ─── Instant View helpers ─────────────────────────────────────────────────────

/** A photo/document referenced inside an Instant View page, keyed by a placeholder token. */
export interface InstantViewImage {
  /** Placeholder that appears in the extracted markdown, e.g. `iv://0`. */
  placeholder: string;
  /** Raw media object to hand to `client.downloadMedia`. */
  media: Api.TypePhoto | Api.TypeDocument;
}

/** Result of extracting a full Instant View page. */
export interface InstantViewResult {
  text: string;
  images: InstantViewImage[];
}

/** Walk context threaded through recursion — resolves photo/document IDs and collects images. */
interface IvWalkCtx {
  photos: Map<string, Api.Photo>;
  documents: Map<string, Api.Document>;
  images: InstantViewImage[];
}

/** Guarded instanceof — tolerant of gramjs version drift / partial mocks in tests. */
function is(obj: unknown, cls: unknown): boolean {
  return typeof cls === 'function' && obj instanceof (cls as new (...args: never[]) => unknown);
}

function emptyCtx(): IvWalkCtx {
  return { photos: new Map(), documents: new Map(), images: [] };
}

/**
 * Convert a Telegram RichText tree into inline Markdown, preserving semantics:
 * bold, italic, strikethrough, monospace, hyperlinks, emails and inline images.
 * Unknown wrapper nodes recurse into their `.text` child (plain-text fallback).
 */
function richTextToMarkdown(rt: Api.TypeRichText | undefined, ctx: IvWalkCtx): string {
  const _Api = getApi();
  if (!rt) return '';
  if (is(rt, _Api.TextEmpty)) return '';
  if (is(rt, _Api.TextPlain)) return (rt as Api.TextPlain).text ?? '';
  if (is(rt, _Api.TextConcat)) {
    return (rt as Api.TextConcat).texts.map((t) => richTextToMarkdown(t, ctx)).join('');
  }
  if (is(rt, _Api.TextBold)) return wrapInline('**', childMarkdown(rt, ctx));
  if (is(rt, _Api.TextItalic)) return wrapInline('_', childMarkdown(rt, ctx));
  if (is(rt, _Api.TextStrike)) return wrapInline('~~', childMarkdown(rt, ctx));
  if (is(rt, _Api.TextFixed)) {
    const inner = childMarkdown(rt, ctx).trim();
    return inner ? '`' + inner + '`' : '';
  }
  if (is(rt, _Api.TextUrl)) {
    const u = rt as Api.TextUrl;
    const label = richTextToMarkdown(u.text, ctx).trim();
    if (!u.url) return label;
    return `[${label || u.url}](${u.url})`;
  }
  if (is(rt, _Api.TextEmail)) {
    const e = rt as Api.TextEmail;
    const label = richTextToMarkdown(e.text, ctx).trim();
    if (!e.email) return label;
    return `[${label || e.email}](mailto:${e.email})`;
  }
  if (is(rt, _Api.TextImage)) {
    const im = rt as Api.TextImage;
    const doc = ctx.documents.get(String(im.documentId));
    if (doc) return pushImage(ctx, doc);
    return '';
  }
  // Fallback: TextUnderline / TextMarked / TextSubscript / TextSuperscript /
  // TextPhone / TextAnchor — no Markdown equivalent, keep the inner text.
  const wrapped = rt as unknown as { text?: Api.TypeRichText };
  return wrapped.text ? richTextToMarkdown(wrapped.text, ctx) : '';
}

function childMarkdown(rt: Api.TypeRichText, ctx: IvWalkCtx): string {
  return richTextToMarkdown((rt as unknown as { text?: Api.TypeRichText }).text, ctx);
}

/** Wrap trimmed inline content with a Markdown marker; no-op for empty content. */
function wrapInline(mark: string, content: string): string {
  const inner = content.trim();
  return inner ? `${mark}${inner}${mark}` : '';
}

/** Register an image and return its placeholder token (e.g. `iv://0`). */
function registerImage(ctx: IvWalkCtx, media: Api.TypePhoto | Api.TypeDocument): string {
  const placeholder = `iv://${ctx.images.length}`;
  ctx.images.push({ placeholder, media });
  return placeholder;
}

/** Register an image and return it as an inline Markdown image. */
function pushImage(ctx: IvWalkCtx, media: Api.TypePhoto | Api.TypeDocument): string {
  return `![](${registerImage(ctx, media)})`;
}

/** Convert a PageBlockTable into a GitHub-flavoured Markdown table. */
function tableToMarkdown(block: Api.PageBlockTable, ctx: IvWalkCtx): string {
  const rows = block.rows ?? [];
  const cellText = (cell: Api.PageTableCell): string =>
    richTextToMarkdown(cell.text, ctx).trim().replace(/\r?\n/g, ' ').replace(/\|/g, '\\|');
  const matrix = rows.map((r) => (r.cells ?? []).map(cellText));
  const cols = matrix.reduce((max, r) => Math.max(max, r.length), 0);
  if (cols === 0) return '';
  const pad = (r: string[]): string[] => {
    const c = [...r];
    while (c.length < cols) c.push('');
    return c;
  };
  const line = (cells: string[]): string => `| ${cells.join(' | ')} |`;
  const header = pad(matrix[0]);
  const separator = Array.from({ length: cols }, () => '---');
  const body = matrix.slice(1).map(pad);
  return [line(header), line(separator), ...body.map(line)].join('\n');
}

function walkBlocks(blocks: Api.TypePageBlock[], ctx: IvWalkCtx): string {
  const _Api = getApi();
  const parts: string[] = [];
  for (const block of blocks) {
    if (block instanceof _Api.PageBlockTitle) {
      const text = richTextToMarkdown(block.text, ctx);
      if (text.trim()) parts.push(`# ${text.trim()}`);
    } else if (block instanceof _Api.PageBlockSubtitle || block instanceof _Api.PageBlockKicker) {
      const text = richTextToMarkdown(block.text, ctx);
      if (text.trim()) parts.push(`_${text.trim()}_`);
    } else if (block instanceof _Api.PageBlockHeader) {
      const text = richTextToMarkdown(block.text, ctx);
      if (text.trim()) parts.push(`## ${text.trim()}`);
    } else if (block instanceof _Api.PageBlockSubheader) {
      const text = richTextToMarkdown(block.text, ctx);
      if (text.trim()) parts.push(`### ${text.trim()}`);
    } else if (block instanceof _Api.PageBlockParagraph || block instanceof _Api.PageBlockFooter) {
      const text = richTextToMarkdown(block.text, ctx);
      if (text.trim()) parts.push(text.trim());
    } else if (block instanceof _Api.PageBlockPreformatted) {
      const text = richTextToMarkdown(block.text, ctx);
      if (text.trim()) parts.push('```\n' + text.trim() + '\n```');
    } else if (block instanceof _Api.PageBlockDivider) {
      parts.push('---');
    } else if (block instanceof _Api.PageBlockBlockquote || block instanceof _Api.PageBlockPullquote) {
      const text = richTextToMarkdown(block.text, ctx);
      if (text.trim()) parts.push(`> ${text.trim()}`);
    } else if (block instanceof _Api.PageBlockList) {
      for (const item of block.items) {
        if (item instanceof _Api.PageListItemText) {
          const text = richTextToMarkdown(item.text, ctx);
          if (text.trim()) parts.push(`- ${text.trim()}`);
        } else if (item instanceof _Api.PageListItemBlocks) {
          const subText = walkBlocks(item.blocks, ctx);
          if (subText.trim()) parts.push(`- ${subText.trim()}`);
        }
      }
    } else if (block instanceof _Api.PageBlockOrderedList) {
      let idx = 1;
      for (const item of block.items) {
        if (item instanceof _Api.PageListOrderedItemText) {
          const text = richTextToMarkdown(item.text, ctx);
          if (text.trim()) parts.push(`${idx++}. ${text.trim()}`);
        } else if (item instanceof _Api.PageListOrderedItemBlocks) {
          const subText = walkBlocks(item.blocks, ctx);
          if (subText.trim()) parts.push(`${idx++}. ${subText.trim()}`);
        }
      }
    } else if (block instanceof _Api.PageBlockDetails) {
      const title = richTextToMarkdown(block.title, ctx);
      if (title.trim()) parts.push(`### ${title.trim()}`);
      const subText = walkBlocks(block.blocks, ctx);
      if (subText.trim()) parts.push(subText.trim());
    } else if (is(block, _Api.PageBlockPhoto)) {
      // Image block: reference the photo from the page's `photos` map.
      const photoBlock = block as Api.PageBlockPhoto;
      const caption = photoBlock.caption?.text ? richTextToMarkdown(photoBlock.caption.text, ctx).trim() : '';
      const photo = ctx.photos.get(String(photoBlock.photoId));
      if (photo) {
        const placeholder = registerImage(ctx, photo);
        parts.push(`![${caption.replace(/\r?\n/g, ' ')}](${placeholder})`);
      } else if (caption) {
        parts.push(caption);
      }
    } else if (is(block, _Api.PageBlockTable)) {
      const md = tableToMarkdown(block as Api.PageBlockTable, ctx);
      if (md) parts.push(md);
    } else if (is(block, _Api.PageBlockAuthorDate)) {
      const author = richTextToMarkdown((block as Api.PageBlockAuthorDate).author, ctx).trim();
      if (author) parts.push(`_${author}_`);
    } else if ('blocks' in block && Array.isArray((block as { blocks?: unknown[] }).blocks)) {
      // Fallback: any container block with nested .blocks (e.g. PageBlockCover,
      // PageBlockCollage, PageBlockSlideshow, PageBlockRelatedArticles, etc.)
      const subText = walkBlocks((block as { blocks: Api.TypePageBlock[] }).blocks, ctx);
      if (subText.trim()) parts.push(subText.trim());
    } else if ('text' in block && (block as { text?: unknown }).text) {
      // Fallback: any block with a .text property we haven't handled explicitly
      const text = richTextToMarkdown((block as { text: Api.TypeRichText }).text, ctx);
      if (text.trim()) parts.push(text.trim());
    } else if ('caption' in block && (block as { caption?: unknown }).caption) {
      // Blocks with captions (PageBlockEmbed, PageBlockVideo, PageBlockMap, etc.)
      const cap = (block as { caption: { text?: Api.TypeRichText } }).caption;
      if (cap.text) {
        const text = richTextToMarkdown(cap.text, ctx);
        if (text.trim()) parts.push(text.trim());
      }
    }
  }
  return parts.join('\n\n');
}

/**
 * Extract Markdown text from a list of page blocks (no image resolution).
 * Retained for backwards compatibility and unit testing.
 */
export function extractInstantViewText(blocks: Api.TypePageBlock[]): string {
  return walkBlocks(blocks, emptyCtx());
}

/**
 * Extract a full Instant View page into Markdown plus the list of referenced images.
 * Photos/documents are resolved from the page's `photos`/`documents` tables so that
 * `PageBlockPhoto` / inline `TextImage` become `iv://N` placeholders in the Markdown.
 */
export function extractInstantViewPage(page: Api.Page): InstantViewResult {
  const _Api = getApi();
  const photos = new Map<string, Api.Photo>();
  for (const p of page.photos ?? []) {
    if (is(p, _Api.Photo)) photos.set(String((p as Api.Photo).id), p as Api.Photo);
  }
  const documents = new Map<string, Api.Document>();
  for (const d of page.documents ?? []) {
    if (is(d, _Api.Document)) documents.set(String((d as Api.Document).id), d as Api.Document);
  }
  const ctx: IvWalkCtx = { photos, documents, images: [] };
  const text = walkBlocks(page.blocks, ctx);
  return { text, images: ctx.images };
}

export function parseMessageFields(msg: Api.Message, channelUsername: string): TelegramMessage | null {
  const _Api = getApi();
  void channelUsername;
  if (!msg.message && !msg.media) return null;

  const text = msg.message || '';
  const links = extractLinks(text, msg.entities);
  const hashtags = extractHashtags(text, msg.entities);

  let mediaType: string | undefined;
  let mediaSizeBytes: number | undefined;
  let instantViewContent: string | undefined;
  let instantViewImages: InstantViewImage[] | undefined;
  let instantViewUrl: string | undefined;
  let instantViewPartial: boolean | undefined;

  if (msg.media) {
    if (msg.media instanceof _Api.MessageMediaPhoto) {
      mediaType = 'photo';
      const photo = msg.media.photo;
      if (photo instanceof _Api.Photo) {
        const photoSizes = photo.sizes.filter((s) => s instanceof _Api.PhotoSize);
        const largest = photoSizes.sort((a, b) => b.size - a.size)[0];
        if (largest) mediaSizeBytes = largest.size;
      }
    } else if (msg.media instanceof _Api.MessageMediaDocument) {
      const doc = msg.media.document;
      if (doc instanceof _Api.Document) {
        mediaSizeBytes = Number(doc.size);
        const mime = doc.mimeType ?? '';
        const attrs = doc.attributes ?? [];
        const hasVideoAttr = attrs.some((a) => a instanceof _Api.DocumentAttributeVideo);
        const hasAudioAttr = attrs.some((a) => a instanceof _Api.DocumentAttributeAudio);
        // Prefer Telegram's explicit media attributes over the raw mime type:
        // some videos ship with a generic mime (e.g. application/octet-stream)
        // but always carry a DocumentAttributeVideo. Fall back to mime, then to
        // the filename extension for the rare case neither is set.
        if (mime.startsWith('audio/') || mime === 'application/ogg' || hasAudioAttr) mediaType = 'audio';
        else if (mime.startsWith('video/') || hasVideoAttr) mediaType = 'video';
        else if (hasVideoExtension(getDocumentFileName(attrs))) mediaType = 'video';
        else mediaType = 'document';
      } else {
        mediaType = 'document';
      }
    } else if (msg.media instanceof _Api.MessageMediaWebPage) {
      mediaType = 'webpage';
      const wp = msg.media.webpage;
      if (wp instanceof _Api.WebPage && wp.cachedPage instanceof _Api.Page) {
        const { text, images } = extractInstantViewPage(wp.cachedPage);
        if (text) instantViewContent = text;
        if (images.length) instantViewImages = images;
        // Telegram may return only a subset of blocks when part is true
        if (wp.cachedPage.part) {
          instantViewPartial = true;
          instantViewUrl = wp.url;
        }
      }
    } else {
      // Unsupported media types (poll, geo, contact, game, dice, giveaway, etc.)
      // — skip entirely, not useful in a news reader
      return null;
    }
  }

  return {
    id: msg.id,
    message: text,
    date: msg.date || 0,
    links,
    hashtags,
    mediaType,
    mediaSizeBytes,
    rawMedia: msg.media ?? undefined,
    groupedId: msg.groupedId !== null && msg.groupedId !== undefined ? String(msg.groupedId) : undefined,
    instantViewContent,
    instantViewImages,
    instantViewUrl,
    instantViewPartial,
    // Forward header: fromName is set for hidden-user forwards; fromId for channel/user forwards
    ...(msg.fwdFrom
      ? {
          forwardFromName: msg.fwdFrom.fromName ?? undefined,
          forwardFromPeer: msg.fwdFrom.fromId ?? undefined,
        }
      : {}),
  };
}
