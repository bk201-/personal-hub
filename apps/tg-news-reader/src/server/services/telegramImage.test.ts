import bigInt from 'big-integer';
import { Api } from 'telegram';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { downloadMediaFile } from './downloadMediaFile.js';
import { downloadMessageMedia } from './telegramApi.js';
import { getTelegramClient } from './telegramClient.js';
import type { TelegramMessage } from './telegramParser.js';

vi.mock('../config.js', () => ({
  MAX_PHOTO_SIZE_BYTES: 100,
  MAX_IMG_DOC_SIZE_BYTES: 200,
  MAX_VIDEO_SIZE_BYTES: 1000,
}));
vi.mock('../logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('fs', () => ({ existsSync: vi.fn(() => false) }));
vi.mock('./telegramCircuitBreaker.js', () => ({
  telegramCircuit: { execute: (fn: () => Promise<unknown>) => fn() },
}));
vi.mock('./telegramClient.js', () => ({
  ensureAndGetApi: async () => Api,
  getTelegramClient: vi.fn(async () => ({ downloadMedia: vi.fn() })),
}));
vi.mock('./downloadMediaFile.js', () => ({ downloadMediaFile: vi.fn(async () => true) }));

function document(mimeType: string, size = 10): TelegramMessage {
  return {
    id: 1,
    message: '',
    date: 1,
    links: [],
    hashtags: [],
    rawMedia: new Api.MessageMediaDocument({
      document: new Api.Document({
        id: bigInt(1),
        accessHash: bigInt(1),
        fileReference: Buffer.alloc(0),
        date: 1,
        mimeType,
        size: bigInt(size),
        dcId: 1,
        attributes: [],
      }),
    }),
  };
}

function photo(size: number, progressive = false): TelegramMessage {
  return {
    id: 1,
    message: '',
    date: 1,
    links: [],
    hashtags: [],
    rawMedia: new Api.MessageMediaPhoto({
      photo: new Api.Photo({
        id: bigInt(1),
        accessHash: bigInt(1),
        fileReference: Buffer.alloc(0),
        date: 1,
        dcId: 1,
        sizes: [
          progressive
            ? new Api.PhotoSizeProgressive({ type: 'y', w: 10, h: 10, sizes: [10, size] })
            : new Api.PhotoSize({ type: 'x', w: 10, h: 10, size }),
        ],
      }),
    }),
  };
}

describe('Telegram image-only boundary', () => {
  beforeEach(() => vi.clearAllMocks());

  it.each(['video/mp4', 'video/webm', 'video/quicktime', 'audio/mpeg', 'application/pdf'])(
    'never downloads %s, even with ignoreLimit requested and misleading parsed mediaType',
    async (mime) => {
      await expect(
        downloadMessageMedia({ ...document(mime), mediaType: 'photo' }, 'channel', {
          imagesOnly: true,
          ignoreLimit: true,
        }),
      ).resolves.toBeNull();
      expect(downloadMediaFile).not.toHaveBeenCalled();
      expect(getTelegramClient).not.toHaveBeenCalled();
    },
  );

  it.each(['image/jpeg', 'image/png', 'image/gif', 'image/webp'])('allows %s documents within limits', async (mime) => {
    await expect(downloadMessageMedia(document(mime), 'channel', { imagesOnly: true })).resolves.toMatch(
      /^channel\/1\./,
    );
    expect(downloadMediaFile).toHaveBeenCalledOnce();
  });

  it('keeps image-document size limits even with ignoreLimit true', async () => {
    await expect(
      downloadMessageMedia(document('image/png', 201), 'channel', {
        imagesOnly: true,
        ignoreLimit: true,
      }),
    ).resolves.toBeNull();
    expect(downloadMediaFile).not.toHaveBeenCalled();
  });

  it.each([false, true])('uses raw photo size limits without parsed metadata (progressive=%s)', async (progressive) => {
    await expect(
      downloadMessageMedia(photo(101, progressive), 'channel', {
        imagesOnly: true,
        ignoreLimit: true,
      }),
    ).resolves.toBeNull();
    expect(downloadMediaFile).not.toHaveBeenCalled();
  });

  it('downloads a photo at the limit', async () => {
    await expect(downloadMessageMedia(photo(100), 'channel', { imagesOnly: true })).resolves.toBe('channel/1.jpg');
    expect(downloadMediaFile).toHaveBeenCalledWith(expect.any(String), 100, expect.any(Function));
  });

  it('still lets explicit normal media download a video and oversized image', async () => {
    await expect(downloadMessageMedia(document('video/mp4'), 'channel', { ignoreLimit: true })).resolves.toBe(
      'channel/1.mp4',
    );
    await expect(downloadMessageMedia(document('image/png', 201), 'channel', { ignoreLimit: true })).resolves.toBe(
      'channel/1.png',
    );
  });
});
