import { EventEmitter } from 'events';

export interface MediaProgressEvent {
  type: 'item' | 'complete' | 'aborted';
  newsId?: number;
  localMediaPath?: string;
  done: number;
  total: number;
}

class MediaProgressEmitter extends EventEmitter {}

export const mediaProgressEmitter = new MediaProgressEmitter();
mediaProgressEmitter.setMaxListeners(20);

export function emitMediaProgress(channelId: number, event: MediaProgressEvent): void {
  mediaProgressEmitter.emit(`channel:${channelId}`, event);
}
