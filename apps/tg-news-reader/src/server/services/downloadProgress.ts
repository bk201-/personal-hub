import { EventEmitter } from 'events';
import type { DownloadTask } from '../../shared/types.js';

class DownloadProgressEmitter extends EventEmitter {}

export const downloadProgressEmitter = new DownloadProgressEmitter();
downloadProgressEmitter.setMaxListeners(100);

export function emitTaskUpdate(task: DownloadTask): void {
  downloadProgressEmitter.emit('task_update', task);
}
