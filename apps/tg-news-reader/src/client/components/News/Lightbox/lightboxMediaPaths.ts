import type { NewsItem } from '@shared/types';

export const isVideoPath = (path: string) => /\.(mp4|webm|mov|m4v|mkv|avi)$/i.test(path);
export const isImagePath = (path: string) => /\.(jpe?g|png|gif|webp|avif|bmp|svg)$/i.test(path);

export function lightboxMediaPaths(item: NewsItem): string[] {
  const paths = item.localMediaPaths?.length ? item.localMediaPaths : item.localMediaPath ? [item.localMediaPath] : [];
  return paths.filter((path) => isImagePath(path) || isVideoPath(path));
}

export function needsImagePreview(item: NewsItem): boolean {
  if (item.mediaType !== 'photo' && item.mediaType !== 'document') return false;
  const paths = lightboxMediaPaths(item);
  if (paths.length === 0 && (item.localMediaPath || item.localMediaPaths?.length)) return false;
  return paths.length === 0 || paths.length < (item.albumMsgIds?.length ?? 0);
}
