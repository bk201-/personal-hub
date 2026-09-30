/**
 * Returns a stable same-origin media URL.
 * The server authenticates browser-native media requests with the HttpOnly
 * media cookie, so access-token rotation cannot replace the src mid-playback.
 */
export function mediaUrl(localMediaPath: string): string {
  return `/api/media/${localMediaPath}`;
}
