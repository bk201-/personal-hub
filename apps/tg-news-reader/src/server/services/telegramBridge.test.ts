import type { Worker } from 'worker_threads';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), fatal: vi.fn(), debug: vi.fn() },
}));

vi.mock('./telegram.js', () => ({
  fetchMessageById: vi.fn(),
  downloadMessageMedia: vi.fn(),
}));

import { fetchMessageById, downloadMessageMedia } from './telegram.js';
import { handleBridgeMessage, isBridgeMessage } from './telegramBridge.js';
import type { TgDownloadMediaMsg, TgResultMsg, TgErrorMsg } from './telegramBridge.js';

const mockFetchMessageById = vi.mocked(fetchMessageById);
const mockDownloadMessageMedia = vi.mocked(downloadMessageMedia);

function createFakeWorker() {
  return {
    postMessage: vi.fn(),
    on: vi.fn(),
    emit: vi.fn(),
    terminate: vi.fn(),
  } as unknown as Worker & { postMessage: ReturnType<typeof vi.fn> };
}

function createDownloadMsg(overrides: Partial<TgDownloadMediaMsg> = {}): TgDownloadMediaMsg {
  return {
    type: 'tg:downloadMedia',
    reqId: 1,
    channelTelegramId: 'test_channel',
    msgId: 100,
    ignoreLimit: false,
    ...overrides,
  };
}

describe('telegramBridge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── isBridgeMessage ────────────────────────────────────────────────────

  describe('isBridgeMessage', () => {
    it('returns true for tg: prefixed messages', () => {
      expect(isBridgeMessage({ type: 'tg:downloadMedia' })).toBe(true);
      expect(isBridgeMessage({ type: 'tg:result' })).toBe(true);
      expect(isBridgeMessage({ type: 'tg:error' })).toBe(true);
    });

    it('returns false for non-bridge messages', () => {
      expect(isBridgeMessage({ type: 'done' })).toBe(false);
      expect(isBridgeMessage({ type: 'error' })).toBe(false);
      expect(isBridgeMessage({ type: 'task' })).toBe(false);
    });
  });

  // ── handleBridgeMessage ────────────────────────────────────────────────

  describe('handleBridgeMessage — tg:downloadMedia', () => {
    it('passes image-only intent while forcing size limits at the Telegram boundary', async () => {
      mockFetchMessageById.mockResolvedValueOnce({ rawMedia: {} } as any);
      mockDownloadMessageMedia.mockResolvedValueOnce(null);
      const worker = createFakeWorker();
      handleBridgeMessage(worker, createDownloadMsg({ imagesOnly: true, ignoreLimit: true }), 0);
      await vi.waitFor(() => expect(worker.postMessage).toHaveBeenCalled());
      expect(mockDownloadMessageMedia).toHaveBeenCalledWith(expect.anything(), 'test_channel', {
        imagesOnly: true,
        ignoreLimit: false,
      });
      expect(worker.postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'tg:result', result: null }));
    });

    it('downloads media and posts result back to worker', async () => {
      mockFetchMessageById.mockResolvedValueOnce({ rawMedia: {} } as any);
      mockDownloadMessageMedia.mockResolvedValueOnce('data/channel/file.jpg');

      const worker = createFakeWorker();
      const msg = createDownloadMsg();

      handleBridgeMessage(worker, msg, 0);
      await vi.waitFor(() => expect(worker.postMessage).toHaveBeenCalled());

      const reply: TgResultMsg = worker.postMessage.mock.calls[0][0];
      expect(reply.type).toBe('tg:result');
      expect(reply.reqId).toBe(1);
      expect(reply.result).toBe('data/channel/file.jpg');
      expect(reply.reason).toBeUndefined();
      expect(mockFetchMessageById).toHaveBeenCalledWith('test_channel', 100, { downloadImages: false });
    });

    it('replies with no_media when message has no rawMedia', async () => {
      mockFetchMessageById.mockResolvedValueOnce({ rawMedia: null } as any);

      const worker = createFakeWorker();
      handleBridgeMessage(worker, createDownloadMsg(), 0);
      await vi.waitFor(() => expect(worker.postMessage).toHaveBeenCalled());

      const reply: TgResultMsg = worker.postMessage.mock.calls[0][0];
      expect(reply.type).toBe('tg:result');
      expect(reply.result).toBeNull();
      expect(reply.reason).toBe('no_media');
    });

    it('replies with no_media when message is null', async () => {
      mockFetchMessageById.mockResolvedValueOnce(null as any);

      const worker = createFakeWorker();
      handleBridgeMessage(worker, createDownloadMsg(), 0);
      await vi.waitFor(() => expect(worker.postMessage).toHaveBeenCalled());

      const reply: TgResultMsg = worker.postMessage.mock.calls[0][0];
      expect(reply.reason).toBe('no_media');
    });

    it('replies with size_limit when downloadMessageMedia returns null', async () => {
      mockFetchMessageById.mockResolvedValueOnce({ rawMedia: {} } as any);
      mockDownloadMessageMedia.mockResolvedValueOnce(null);

      const worker = createFakeWorker();
      handleBridgeMessage(worker, createDownloadMsg(), 0);
      await vi.waitFor(() => expect(worker.postMessage).toHaveBeenCalled());

      const reply: TgResultMsg = worker.postMessage.mock.calls[0][0];
      expect(reply.type).toBe('tg:result');
      expect(reply.result).toBeNull();
      expect(reply.reason).toBe('size_limit');
    });

    it('passes ignoreLimit to downloadMessageMedia', async () => {
      mockFetchMessageById.mockResolvedValueOnce({ rawMedia: {} } as any);
      mockDownloadMessageMedia.mockResolvedValueOnce('path.jpg');

      const worker = createFakeWorker();
      handleBridgeMessage(worker, createDownloadMsg({ ignoreLimit: true }), 0);
      await vi.waitFor(() => expect(mockDownloadMessageMedia).toHaveBeenCalled());

      expect(mockDownloadMessageMedia).toHaveBeenCalledWith(expect.anything(), 'test_channel', { ignoreLimit: true });
    });

    it('replies with tg:error when fetchMessageById throws', async () => {
      mockFetchMessageById.mockRejectedValueOnce(new Error('connection lost'));

      const worker = createFakeWorker();
      handleBridgeMessage(worker, createDownloadMsg(), 0);
      await vi.waitFor(() => expect(worker.postMessage).toHaveBeenCalled());

      const reply: TgErrorMsg = worker.postMessage.mock.calls[0][0];
      expect(reply.type).toBe('tg:error');
      expect(reply.reqId).toBe(1);
      expect(reply.message).toBe('connection lost');
    });

    it('replies with tg:error when downloadMessageMedia throws', async () => {
      mockFetchMessageById.mockResolvedValueOnce({ rawMedia: {} } as any);
      mockDownloadMessageMedia.mockRejectedValueOnce(new Error('disk full'));

      const worker = createFakeWorker();
      handleBridgeMessage(worker, createDownloadMsg(), 0);
      await vi.waitFor(() => expect(worker.postMessage).toHaveBeenCalled());

      const reply: TgErrorMsg = worker.postMessage.mock.calls[0][0];
      expect(reply.type).toBe('tg:error');
      expect(reply.message).toBe('disk full');
    });

    it('preserves reqId in error responses', async () => {
      mockFetchMessageById.mockRejectedValueOnce(new Error('fail'));

      const worker = createFakeWorker();
      handleBridgeMessage(worker, createDownloadMsg({ reqId: 42 }), 0);
      await vi.waitFor(() => expect(worker.postMessage).toHaveBeenCalled());

      expect(worker.postMessage.mock.calls[0][0].reqId).toBe(42);
    });

    it('preserves storage error codes across the worker bridge', async () => {
      mockFetchMessageById.mockResolvedValueOnce({ rawMedia: {} } as any);
      mockDownloadMessageMedia.mockRejectedValueOnce(Object.assign(new Error('write failed'), { code: 'EDQUOT' }));
      const worker = createFakeWorker();
      handleBridgeMessage(worker, createDownloadMsg(), 0);
      await vi.waitFor(() => expect(worker.postMessage).toHaveBeenCalled());
      expect(worker.postMessage).toHaveBeenCalledWith({
        type: 'tg:error',
        reqId: 1,
        message: 'write failed',
        code: 'EDQUOT',
      });
    });
  });
});
