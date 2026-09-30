import { mkdir, statfs } from 'node:fs/promises';
import { join } from 'node:path';
import { DOWNLOAD_STORAGE_RESERVE_BYTES } from '../config.js';
import { logger } from '../logger.js';
import { isStorageCapacityError, StoragePausedError } from '../utils/storageErrors.js';
import { sendAlert } from './alertBot.js';
export { isStorageCapacityError, StoragePausedError } from '../utils/storageErrors.js';

interface StoragePause {
  reason: string;
  requiredBytes: number;
  freeBytes: number | null;
  capacityError: boolean;
  retryAt: number;
}

/** Main-thread gate shared by the coordinator and every Telegram file writer. */
export class DownloadStorage {
  private tail: Promise<void> = Promise.resolve();
  private pauseState: StoragePause | null = null;
  private lastFreeBytes: number | null = null;
  private initialized = false;
  private readonly root = join(process.cwd(), 'data');

  get status(): { paused: boolean; reason: string | null; freeBytes: number | null; reserveBytes: number } {
    return {
      paused: this.pauseState !== null,
      reason: this.pauseState?.reason ?? null,
      freeBytes: this.lastFreeBytes,
      reserveBytes: DOWNLOAD_STORAGE_RESERVE_BYTES,
    };
  }

  pause(err: unknown, requiredBytes = 0, capacityError = isStorageCapacityError(err)): void {
    if (this.pauseState) return;
    const reason = err instanceof Error ? err.message : String(err);
    this.pauseState = {
      reason,
      requiredBytes,
      freeBytes: this.lastFreeBytes,
      capacityError,
      retryAt: Date.now() + 60_000,
    };
    logger.warn({ module: 'download', reason, freeBytes: this.lastFreeBytes }, 'downloads paused: storage unavailable');
    void sendAlert(
      'Downloads paused: storage unavailable or insufficient free space. Website remains available.',
      'download-storage',
    );
  }

  async check(requiredBytes = 0): Promise<void> {
    await this.exclusive(() => this.ensureSpace(requiredBytes));
  }

  /** Retry current work after cleanup; every file still gets its own capacity check. */
  async notifySpaceFreed(): Promise<void> {
    await this.exclusive(async () => {
      if (this.pauseState) {
        this.pauseState.retryAt = 0;
        // Cleanup may have removed the large task that originally paused the queue.
        this.pauseState.requiredBytes = 0;
      }
    });
  }

  async write(bytes: number, write: () => Promise<void>): Promise<void> {
    await this.exclusive(async () => {
      await this.ensureSpace(bytes);
      try {
        await write();
      } catch (err) {
        if (isStorageCapacityError(err)) this.pause(err, bytes);
        throw err;
      }
    });
  }

  private async ensureSpace(requiredBytes: number): Promise<void> {
    const paused = this.pauseState;
    if (paused && Date.now() < paused.retryAt) throw new StoragePausedError(paused.reason);
    let freeBytes: number;
    try {
      if (!this.initialized) {
        await mkdir(this.root, { recursive: true });
        this.initialized = true;
      }
      const stats = await statfs(this.root);
      freeBytes = Number(stats.bavail) * Number(stats.bsize);
      if (!Number.isFinite(freeBytes) || freeBytes < 0) throw new Error('Invalid storage free-space reading');
      this.lastFreeBytes = freeBytes;
    } catch (err) {
      this.pause(err);
      if (this.pauseState) this.pauseState.retryAt = Date.now() + 60_000;
      throw new StoragePausedError('Cannot check download storage capacity');
    }

    const needed = Math.max(requiredBytes, paused?.requiredBytes ?? 0);
    // Some network mounts report more free space than the actual quota permits.
    // After ENOSPC/EDQUOT, require observed free-space growth before retrying.
    const quotaStillFull = paused?.capacityError && paused.freeBytes !== null && freeBytes <= paused.freeBytes;
    if (freeBytes <= DOWNLOAD_STORAGE_RESERVE_BYTES + needed || quotaStillFull) {
      this.pause(new Error('Insufficient free storage; preserving download reserve'), needed, false);
      this.pauseState!.retryAt = Date.now() + 60_000;
      throw new StoragePausedError(this.pauseState!.reason);
    }
    if (paused) {
      this.pauseState = null;
      logger.info({ module: 'download', freeBytes }, 'storage recovered: downloads resumed');
    }
  }

  private async exclusive<T>(operation: () => Promise<T>): Promise<T> {
    const previous = this.tail;
    let release!: () => void;
    this.tail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await operation();
    } finally {
      release();
    }
  }
}

export const downloadStorage = new DownloadStorage();
