/**
 * Media file cleanup helpers — shared between routes and services.
 */

import { existsSync, unlinkSync } from 'fs';
import { join } from 'path';
import { logger } from '../logger.js';
import { downloadProgressEmitter } from '../services/downloadProgress.js';

function deleteMediaFile(localMediaPath: string | null): boolean {
  if (!localMediaPath) return false;
  const filepath = join(process.cwd(), 'data', localMediaPath);
  if (existsSync(filepath)) {
    try {
      unlinkSync(filepath);
      return true;
    } catch (err) {
      logger.warn({ module: 'download', err }, 'could not delete media file');
    }
  }
  return false;
}

/** Delete all media files for a news row (handles both single and album). */
export function deleteAllMediaFiles(localMediaPath: string | null, localMediaPaths: string[] | null) {
  let freed = false;
  for (const path of localMediaPaths ?? [localMediaPath]) {
    if (deleteMediaFile(path)) freed = true;
  }
  if (freed) downloadProgressEmitter.emit('storage_freed');
}
