import { randomUUID } from 'node:crypto';
import { mkdir, open, rename, rm } from 'node:fs/promises';
import { dirname } from 'node:path';
import { logger } from '../logger.js';
import { downloadStorage, isStorageCapacityError } from './downloadStorage.js';

interface MediaWriter {
  write(chunk: Buffer): Promise<void>;
}

/** GramJS awaits writer.write(), but does not await a stream's flush or close. */
export async function downloadMediaFile(
  filepath: string,
  expectedBytes: number,
  download: (writer: MediaWriter) => Promise<unknown>,
): Promise<boolean> {
  const partialPath = `${filepath}.${randomUUID()}.part`;
  let bytesWritten = 0;
  try {
    await downloadStorage.check(expectedBytes);
    await mkdir(dirname(filepath), { recursive: true });
    const file = await open(partialPath, 'wx');
    try {
      await download({
        async write(chunk) {
          await downloadStorage.write(chunk.length, () => file.writeFile(chunk));
          bytesWritten += chunk.length;
        },
      });
    } finally {
      await file.close();
    }
    if (bytesWritten === 0) return false;
    await rename(partialPath, filepath);
    return true;
  } catch (err) {
    if (isStorageCapacityError(err)) downloadStorage.pause(err);
    throw err;
  } finally {
    await rm(partialPath, { force: true }).catch((err: unknown) => {
      logger.warn({ module: 'download', err }, 'could not remove partial media file');
    });
  }
}
