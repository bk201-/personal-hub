import { statfs } from 'node:fs/promises';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DownloadStorage, isStorageCapacityError } from './downloadStorage.js';

vi.mock('node:fs/promises', () => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
  statfs: vi.fn(),
}));
vi.mock('../logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn() },
}));
vi.mock('./alertBot.js', () => ({ sendAlert: vi.fn().mockResolvedValue(undefined) }));

const GiB = 1024 ** 3;
function free(bytes: number) {
  vi.mocked(statfs).mockResolvedValue({ bavail: bytes, bsize: 1 } as Awaited<ReturnType<typeof statfs>>);
}

describe('DownloadStorage', () => {
  let storage: DownloadStorage;
  beforeEach(() => {
    vi.clearAllMocks();
    storage = new DownloadStorage();
    free(4 * GiB);
  });
  afterEach(() => vi.useRealTimers());

  it('checks the media filesystem and admits a download with enough headroom', async () => {
    await storage.check(GiB);
    expect(statfs).toHaveBeenCalledWith(expect.stringMatching(/[\\/]data$/));
    expect(storage.status).toMatchObject({ paused: false, freeBytes: 4 * GiB, reserveBytes: GiB });
  });

  it('blocks a file that would consume the reserve even with free space remaining', async () => {
    await expect(storage.check(3 * GiB)).rejects.toMatchObject({ code: 'STORAGE_PAUSED' });
    expect(storage.status.paused).toBe(true);
  });

  it('serializes concurrent writes so they cannot both spend the same free space', async () => {
    free(GiB + 100);
    const write = vi.fn(async () => {
      free(GiB + 40);
    });
    const outcomes = await Promise.allSettled([storage.write(60, write), storage.write(60, write)]);
    expect(outcomes.map((r) => r.status)).toEqual(['fulfilled', 'rejected']);
    expect(write).toHaveBeenCalledTimes(1);
    expect(storage.status.paused).toBe(true);
  });

  it.each(['ENOSPC', 'EDQUOT'])(
    'pauses all subsequent writes on %s and only resumes after space grows',
    async (code) => {
      vi.useFakeTimers();
      const error = Object.assign(new Error('write failed'), { code });
      await expect(
        storage.write(10, async () => {
          throw error;
        }),
      ).rejects.toBe(error);
      const write = vi.fn();
      await expect(storage.write(10, write)).rejects.toMatchObject({ code: 'STORAGE_PAUSED' });
      expect(write).not.toHaveBeenCalled();
      vi.advanceTimersByTime(60_000);
      await expect(storage.check()).rejects.toMatchObject({ code: 'STORAGE_PAUSED' });
      free(5 * GiB);
      vi.advanceTimersByTime(60_000);
      await storage.check();
      expect(storage.status.paused).toBe(false);
    },
  );

  it('waits before probing again and resumes low-space downloads after cleanup', async () => {
    vi.useFakeTimers();
    free(GiB - 1);
    await expect(storage.check()).rejects.toThrow('Insufficient free storage');
    free(2 * GiB);
    await expect(storage.check()).rejects.toThrow('Insufficient free storage');
    expect(statfs).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(60_000);
    await storage.check();
    expect(storage.status.paused).toBe(false);
  });

  it('rechecks immediately after cleanup without bypassing the storage reserve', async () => {
    vi.useFakeTimers();
    free(GiB - 1);
    await expect(storage.check()).rejects.toMatchObject({ code: 'STORAGE_PAUSED' });

    await storage.notifySpaceFreed();
    await expect(storage.check()).rejects.toMatchObject({ code: 'STORAGE_PAUSED' });
    expect(storage.status.paused).toBe(true);

    free(2 * GiB);
    await storage.notifySpaceFreed();
    await storage.check();
    expect(storage.status.paused).toBe(false);
    expect(statfs).toHaveBeenCalledTimes(3);
  });

  it('does not retain a deleted large task size as the minimum for the remaining queue', async () => {
    free(2 * GiB);
    await expect(storage.check(3 * GiB)).rejects.toMatchObject({ code: 'STORAGE_PAUSED' });
    await storage.notifySpaceFreed();

    await storage.check(1024);

    expect(storage.status.paused).toBe(false);
    await expect(storage.check(3 * GiB)).rejects.toMatchObject({ code: 'STORAGE_PAUSED' });
  });

  it('fails closed when capacity cannot be read, then recovers', async () => {
    vi.useFakeTimers();
    vi.mocked(statfs).mockRejectedValueOnce(new Error('mount unavailable'));
    await expect(storage.check()).rejects.toThrow('Cannot check');
    expect(storage.status.paused).toBe(true);
    vi.advanceTimersByTime(60_000);
    await storage.check();
    expect(storage.status.paused).toBe(false);
  });

  it('propagates ordinary write errors without pausing the whole queue', async () => {
    const error = Object.assign(new Error('permission denied'), { code: 'EACCES' });
    await expect(
      storage.write(1, async () => {
        throw error;
      }),
    ).rejects.toBe(error);
    expect(storage.status.paused).toBe(false);
  });

  it('recognizes capacity errors across IPC and wrapped database errors', () => {
    expect(isStorageCapacityError({ code: 'EDQUOT' })).toBe(true);
    expect(isStorageCapacityError(new Error('ENOSPC: write failed'))).toBe(true);
    expect(isStorageCapacityError(new Error('query failed', { cause: { code: 'SQLITE_FULL' } }))).toBe(true);
    expect(isStorageCapacityError(new Error('network timeout'))).toBe(false);
    expect(isStorageCapacityError(null)).toBe(false);
  });
});
