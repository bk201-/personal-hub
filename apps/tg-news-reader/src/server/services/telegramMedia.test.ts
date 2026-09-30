import fs from 'node:fs';
import { open, statfs } from 'node:fs/promises';
import { Writable } from 'node:stream';
import bigInt from 'big-integer';
import { Api } from 'telegram';
import type { TelegramClient } from 'telegram';
import { _downloadPhoto } from 'telegram/client/downloads.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { downloadMediaFile } from './downloadMediaFile.js';
import type * as storageModule from './downloadStorage.js';
import { downloadMessageMedia } from './telegramApi.js';

const mocks = vi.hoisted(() => ({
  write: vi.fn(),
  close: vi.fn().mockResolvedValue(undefined),
  rename: vi.fn().mockResolvedValue(undefined),
  rm: vi.fn().mockResolvedValue(undefined),
  escapedErrors: [] as unknown[],
}));

vi.mock('../logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('./alertBot.js', () => ({ sendAlert: vi.fn().mockResolvedValue(undefined) }));
vi.mock('./telegramCircuitBreaker.js', () => ({
  telegramCircuit: { execute: (fn: () => Promise<unknown>) => fn() },
}));
vi.mock('fs', async (importOriginal) => ({
  ...(await importOriginal<typeof fs>()),
  existsSync: () => false,
  mkdirSync: vi.fn(),
}));
vi.mock('node:fs/promises', () => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
  statfs: vi.fn().mockResolvedValue({ bavail: 10 * 1024 * 1024, bsize: 4096 }),
  open: vi.fn().mockResolvedValue({ writeFile: mocks.write, close: mocks.close }),
  rename: mocks.rename,
  rm: mocks.rm,
}));
vi.mock('./downloadStorage.js', async (importOriginal) => ({
  ...(await importOriginal<typeof storageModule>()),
  get downloadStorage() {
    return storage;
  },
}));

import { DownloadStorage } from './downloadStorage.js';
let storage: DownloadStorage;
vi.mock('./telegramClient.js', () => ({
  ensureAndGetApi: async () => Api,
  getTelegramClient: async () => ({
    downloadMedia: (media: Api.MessageMediaPhoto, { outputFile }: { outputFile: string }) =>
      _downloadPhoto({} as TelegramClient, media, outputFile),
  }),
}));

describe('Telegram media disk writes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storage = new DownloadStorage();
    mocks.escapedErrors.length = 0;
    mocks.write.mockResolvedValue(undefined);
  });

  it('propagates ENOSPC from the GramJS writer without an uncaught stream error', async () => {
    const error = Object.assign(new Error('disk full'), { code: 'ENOSPC' });
    const spy = vi.spyOn(fs, 'createWriteStream').mockImplementation(() => {
      const stream = new Writable({
        write(_chunk, _encoding, callback) {
          callback(error);
        },
      });
      // Observe the error that would otherwise escape to uncaughtException.
      stream.on('error', (err) => {
        if (stream.listenerCount('error') === 1) mocks.escapedErrors.push(err);
      });
      return stream as fs.WriteStream;
    });
    mocks.write.mockRejectedValueOnce(error);
    const rawMedia = new Api.MessageMediaPhoto({
      photo: new Api.Photo({
        id: bigInt(1),
        accessHash: bigInt(1),
        fileReference: Buffer.alloc(0),
        date: 1,
        dcId: 1,
        sizes: [new Api.PhotoCachedSize({ type: 'x', w: 1, h: 1, bytes: Buffer.from('photo') })],
      }),
    });
    const download = downloadMessageMedia(
      { id: 1, message: '', date: 1, links: [], hashtags: [], rawMedia },
      'storage-test',
    );

    try {
      await expect(download).rejects.toMatchObject({ code: 'ENOSPC' });
    } finally {
      spy.mockRestore();
    }
    expect(mocks.escapedErrors).toEqual([]);
    expect(mocks.rename).not.toHaveBeenCalled();
    expect(mocks.close).toHaveBeenCalled();
    expect(mocks.rm).toHaveBeenCalled();
  });

  it('publishes a file only after all writes and close complete, regardless of the GramJS return value', async () => {
    const result = await downloadMediaFile('test.jpg', 10, async (writer) => {
      await writer.write(Buffer.from('one'));
      await writer.write(Buffer.from('two'));
      expect(mocks.rename).not.toHaveBeenCalled();
      return undefined;
    });
    expect(result).toBe(true);
    expect(mocks.write).toHaveBeenCalledTimes(2);
    expect(mocks.close.mock.invocationCallOrder[0]).toBeLessThan(mocks.rename.mock.invocationCallOrder[0]);
    expect(mocks.rename).toHaveBeenCalledWith(expect.stringMatching(/\.part$/), 'test.jpg');
  });

  it('does not publish empty downloads', async () => {
    await expect(downloadMediaFile('test.jpg', 0, async () => undefined)).resolves.toBe(false);
    expect(mocks.rename).not.toHaveBeenCalled();
    expect(mocks.close).toHaveBeenCalled();
    expect(mocks.rm).toHaveBeenCalled();
  });

  it('removes a partial file when the download fails after writing a chunk', async () => {
    await expect(
      downloadMediaFile('test.jpg', 10, async (writer) => {
        await writer.write(Buffer.from('one'));
        throw new Error('network disconnected');
      }),
    ).rejects.toThrow('network disconnected');
    expect(mocks.rename).not.toHaveBeenCalled();
    expect(mocks.close).toHaveBeenCalled();
    expect(mocks.rm).toHaveBeenCalled();
    expect(storage.status.paused).toBe(false);
  });

  it('pauses on a close-time quota failure and never publishes the file', async () => {
    mocks.close.mockRejectedValueOnce(Object.assign(new Error('quota exceeded'), { code: 'EDQUOT' }));
    await expect(
      downloadMediaFile('test.jpg', 10, async (writer) => {
        await writer.write(Buffer.from('one'));
      }),
    ).rejects.toMatchObject({ code: 'EDQUOT' });
    expect(storage.status.paused).toBe(true);
    expect(mocks.rename).not.toHaveBeenCalled();
    expect(mocks.rm).toHaveBeenCalled();
  });

  it('does not open a file or start Telegram when the download would breach the reserve', async () => {
    vi.mocked(statfs).mockResolvedValueOnce({ bavail: 1024 ** 3 + 5, bsize: 1 } as Awaited<ReturnType<typeof statfs>>);
    const download = vi.fn();
    await expect(downloadMediaFile('test.jpg', 10, download)).rejects.toMatchObject({ code: 'STORAGE_PAUSED' });
    expect(download).not.toHaveBeenCalled();
    expect(open).not.toHaveBeenCalled();
  });
});
