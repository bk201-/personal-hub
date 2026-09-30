import type { NewsItem } from '@shared/types.ts';

/** Full title from first line of text, no truncation (for accordion header).
 *  Pass a translated `fallback` string when the item has no text (e.g. t('news.list.message_fallback', { id })). */
export function getNewsTitle(item: NewsItem, fallback?: string): string {
  const text = item.text || '';
  const firstLine = text.split('\n')[0]?.trim() || '';
  return firstLine || fallback || `Message #${item.telegramMsgId}`;
}

/** Extract a short readable label from a URL (domain without www).
 *  Pass a translated `fallback` string for the error case (e.g. t('news.detail.link_fallback', { n: index + 1 })). */
export function getLinkLabel(url: string, index: number, fallback?: string): string {
  try {
    const { hostname, pathname } = new URL(url);
    const host = hostname.replace(/^www\./, '');
    if (host === 't.me' && pathname.length > 1) return `t.me${pathname.split('/').slice(0, 2).join('/')}`;
    return host;
  } catch {
    return fallback ?? `Link ${index + 1}`;
  }
}

export function isYouTubeUrl(url: string): boolean {
  return /youtu\.be\/|youtube\.com\/(watch|shorts|embed)/i.test(url);
}

/** Extract YouTube video ID from any YouTube URL variant. Returns null if not a valid YT URL. */
export function getYouTubeEmbedId(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname === 'youtu.be') {
      const id = u.pathname.slice(1).split('?')[0];
      return id || null;
    }
    if (u.hostname.includes('youtube.com')) {
      if (u.pathname.startsWith('/shorts/')) return u.pathname.split('/')[2] || null;
      if (u.pathname.startsWith('/embed/')) return u.pathname.split('/')[2] || null;
      return u.searchParams.get('v');
    }
    return null;
  } catch {
    return null;
  }
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1024 ** 4) return `${(bytes / 1024 ** 4).toFixed(1)} TB`;
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${(bytes / 1024).toFixed(0)} KB`;
}
