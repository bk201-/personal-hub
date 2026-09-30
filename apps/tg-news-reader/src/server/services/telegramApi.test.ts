import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TelegramMessage } from './telegramParser.js';

// ─── Hoisted mocks (available before vi.mock factories) ──────────────────────

const {
  mockInvoke,
  mockGetMessages,
  mockGetInputEntity,
  mockParseMessageFields,
  mockExtractInstantViewPage,
  mockApi,
  MockMessage,
  MockWebPage,
  MockPage,
} = vi.hoisted(() => {
  class _MockMessage {
    id: number;
    message: string;
    date: number;
    entities?: unknown[];
    media?: unknown;
    groupedId?: unknown;
    constructor(o: { id: number; message: string; date: number; media?: unknown }) {
      this.id = o.id;
      this.message = o.message;
      this.date = o.date;
      this.media = o.media;
    }
  }

  class _MockWebPage {
    cachedPage: unknown;
    url: string;
    constructor(cachedPage?: unknown, url = '') {
      this.cachedPage = cachedPage;
      this.url = url;
    }
  }

  class _MockPage {
    blocks: unknown[];
    part: boolean;
    constructor(blocks: unknown[], part = false) {
      this.blocks = blocks;
      this.part = part;
    }
  }

  const _mockInvoke = vi.fn();
  const _mockGetMessages = vi.fn();
  const _mockParseMessageFields = vi.fn();
  const _mockExtractInstantViewPage = vi.fn();

  class _MockPeerChannel {
    channelId: bigint;
    constructor(channelId: bigint) {
      this.channelId = channelId;
    }
  }

  const _mockApi = {
    Photo: class {},
    MessageMediaPhoto: class {},
    Message: _MockMessage,
    WebPage: _MockWebPage,
    Page: _MockPage,
    PeerChannel: _MockPeerChannel,
    messages: {
      GetWebPage: class {
        url: string;
        hash: number;
        constructor(o: { url: string; hash: number }) {
          this.url = o.url;
          this.hash = o.hash;
        }
      },
    },
  };

  return {
    mockInvoke: _mockInvoke,
    mockGetMessages: _mockGetMessages,
    mockGetInputEntity: vi.fn(),
    mockParseMessageFields: _mockParseMessageFields,
    mockExtractInstantViewPage: _mockExtractInstantViewPage,
    mockApi: _mockApi,
    MockMessage: _MockMessage,
    MockWebPage: _MockWebPage,
    MockPage: _MockPage,
  };
});

// ─── Module mocks ────────────────────────────────────────────────────────────

vi.mock('../logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('../config.js', () => ({
  MAX_PHOTO_SIZE_BYTES: 5 * 1024 * 1024,
  MAX_VIDEO_SIZE_BYTES: 75 * 1024 * 1024,
  MAX_IMG_DOC_SIZE_BYTES: 5 * 1024 * 1024,
  DOWNLOAD_STORAGE_RESERVE_BYTES: 1024 ** 3,
}));

vi.mock('./telegramClient.js', () => ({
  getTelegramClient: vi.fn(() => ({
    invoke: mockInvoke,
    getMessages: mockGetMessages,
    getInputEntity: mockGetInputEntity,
  })),
  ensureAndGetApi: vi.fn(() => mockApi),
}));

vi.mock('./telegramCircuitBreaker.js', () => ({
  telegramCircuit: {
    execute: vi.fn(async (fn: () => Promise<unknown>) => fn()),
  },
}));

vi.mock('./telegramParser.js', () => ({
  parseMessageFields: (...args: unknown[]) => mockParseMessageFields(...args),
  extractInstantViewPage: (...args: unknown[]) => mockExtractInstantViewPage(...args),
}));
vi.mock('./downloadMediaFile.js', () => ({ downloadMediaFile: vi.fn().mockResolvedValue(true) }));

import { logger } from '../logger.js';
import { downloadMediaFile } from './downloadMediaFile.js';
import { fetchChannelMessages, fetchMessageById, getReadInboxMaxId, resolveInstantViewImages } from './telegramApi.js';

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('telegramApi — resolvePartialInstantView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function makeParsedMsg(overrides: Partial<TelegramMessage> = {}): TelegramMessage {
    return {
      id: 1,
      message: 'hello',
      date: 1700000000,
      links: [],
      hashtags: [],
      ...overrides,
    };
  }

  it('propagates a missing channel from the read-watermark lookup', async () => {
    const error = new Error('No user has "deleted_channel" as username');
    mockGetInputEntity.mockRejectedValueOnce(error);
    await expect(getReadInboxMaxId('deleted_channel')).rejects.toBe(error);
  });

  it('keeps a transient read-watermark lookup failure best-effort', async () => {
    mockGetInputEntity.mockRejectedValueOnce(new Error('Network error'));
    await expect(getReadInboxMaxId('channel')).resolves.toBeNull();
  });

  describe('fetchChannelMessages', () => {
    it('leaves Instant View images unresolved until channel filters have been applied', async () => {
      mockGetMessages.mockResolvedValueOnce([new MockMessage({ id: 1, message: 'text', date: 1700000000 })]);
      mockParseMessageFields.mockReturnValueOnce(
        makeParsedMsg({
          instantViewContent: '![photo](iv://0)',
          instantViewImages: [{ placeholder: 'iv://0', media: new mockApi.Photo() as never }],
        }),
      );

      const [result] = await fetchChannelMessages('test_channel');

      expect(downloadMediaFile).not.toHaveBeenCalled();
      expect(result.instantViewImages).toHaveLength(1);

      await resolveInstantViewImages(result, 'test_channel');

      expect(downloadMediaFile).toHaveBeenCalledOnce();
      expect(result.instantViewContent).toBe('![photo](test_channel/iv_1_0.jpg)');
    });

    it('resolves partial IV pages via messages.getWebPage', async () => {
      const msg = new MockMessage({ id: 1, message: 'text', date: 1700000000 });
      mockGetMessages.mockResolvedValueOnce([msg]);

      mockParseMessageFields.mockReturnValueOnce(
        makeParsedMsg({
          instantViewContent: 'Short partial',
          instantViewPartial: true,
          instantViewUrl: 'https://example.com/article',
        }),
      );

      // messages.getWebPage returns full page
      const fullPage = new MockPage([{ text: 'full blocks' }], false);
      const fullWp = new MockWebPage(fullPage, 'https://example.com/article');
      mockInvoke.mockResolvedValueOnce({ webpage: fullWp });
      mockExtractInstantViewPage.mockReturnValueOnce({
        text: 'Full article text that is much longer than the partial',
        images: [],
      });

      const results = await fetchChannelMessages('test_channel', { limit: 10 });

      expect(results).toHaveLength(1);
      expect(results[0].instantViewContent).toBe('Full article text that is much longer than the partial');
      expect(results[0].instantViewPartial).toBe(false);
      expect(mockInvoke).toHaveBeenCalledOnce();
    });

    it('keeps partial content when full page text is shorter', async () => {
      const msg = new MockMessage({ id: 1, message: 'text', date: 1700000000 });
      mockGetMessages.mockResolvedValueOnce([msg]);

      mockParseMessageFields.mockReturnValueOnce(
        makeParsedMsg({
          instantViewContent: 'Longer partial content here',
          instantViewPartial: true,
          instantViewUrl: 'https://example.com/article',
        }),
      );

      const fullPage = new MockPage([], false);
      const fullWp = new MockWebPage(fullPage, 'https://example.com/article');
      mockInvoke.mockResolvedValueOnce({ webpage: fullWp });
      mockExtractInstantViewPage.mockReturnValueOnce({ text: 'Short', images: [] });

      const results = await fetchChannelMessages('test_channel', { limit: 10 });

      expect(results[0].instantViewContent).toBe('Longer partial content here');
      expect(mockInvoke).toHaveBeenCalledOnce();
    });

    it('skips resolution when no messages have partial IV', async () => {
      const msg = new MockMessage({ id: 1, message: 'text', date: 1700000000 });
      mockGetMessages.mockResolvedValueOnce([msg]);

      mockParseMessageFields.mockReturnValueOnce(makeParsedMsg({ instantViewContent: 'Full content' }));

      const results = await fetchChannelMessages('test_channel', { limit: 10 });

      expect(results).toHaveLength(1);
      expect(mockInvoke).not.toHaveBeenCalled();
    });

    it('keeps partial content on getWebPage failure', async () => {
      const msg = new MockMessage({ id: 1, message: 'text', date: 1700000000 });
      mockGetMessages.mockResolvedValueOnce([msg]);

      mockParseMessageFields.mockReturnValueOnce(
        makeParsedMsg({
          instantViewContent: 'Partial fallback',
          instantViewPartial: true,
          instantViewUrl: 'https://example.com/article',
        }),
      );

      mockInvoke.mockRejectedValueOnce(new Error('Telegram API error'));

      const results = await fetchChannelMessages('test_channel', { limit: 10 });

      expect(results[0].instantViewContent).toBe('Partial fallback');
      expect(results[0].instantViewPartial).toBe(true);
      expect(vi.mocked(logger.warn)).toHaveBeenCalledWith(
        expect.objectContaining({ module: 'telegram', url: 'https://example.com/article' }),
        'Failed to fetch full Instant View page',
      );
    });

    it('resolves multiple partial IV pages in one batch', async () => {
      const msg1 = new MockMessage({ id: 1, message: 'text1', date: 1700000000 });
      const msg2 = new MockMessage({ id: 2, message: 'text2', date: 1700000001 });
      mockGetMessages.mockResolvedValueOnce([msg1, msg2]);

      mockParseMessageFields
        .mockReturnValueOnce(
          makeParsedMsg({
            id: 1,
            instantViewContent: 'Partial 1',
            instantViewPartial: true,
            instantViewUrl: 'https://example.com/a1',
          }),
        )
        .mockReturnValueOnce(
          makeParsedMsg({
            id: 2,
            instantViewContent: 'Partial 2',
            instantViewPartial: true,
            instantViewUrl: 'https://example.com/a2',
          }),
        );

      const fullPage1 = new MockPage([], false);
      const fullWp1 = new MockWebPage(fullPage1, 'https://example.com/a1');
      mockInvoke.mockResolvedValueOnce({ webpage: fullWp1 });
      mockExtractInstantViewPage.mockReturnValueOnce({ text: 'Full article 1 with a lot of text', images: [] });

      const fullPage2 = new MockPage([], false);
      const fullWp2 = new MockWebPage(fullPage2, 'https://example.com/a2');
      mockInvoke.mockResolvedValueOnce({ webpage: fullWp2 });
      mockExtractInstantViewPage.mockReturnValueOnce({ text: 'Full article 2 with a lot of text', images: [] });

      const results = await fetchChannelMessages('test_channel', { limit: 10 });

      expect(results).toHaveLength(2);
      expect(mockInvoke).toHaveBeenCalledTimes(2);
      expect(results.find((r) => r.id === 1)!.instantViewContent).toBe('Full article 1 with a lot of text');
      expect(results.find((r) => r.id === 2)!.instantViewContent).toBe('Full article 2 with a lot of text');
    });
  });

  describe('fetchMessageById', () => {
    it('does not download IV images for metadata-only callers', async () => {
      mockGetMessages.mockResolvedValueOnce([new MockMessage({ id: 42, message: 'text', date: 1700000000 })]);
      mockParseMessageFields.mockReturnValueOnce(
        makeParsedMsg({
          id: 42,
          instantViewContent: '![photo](iv://0)',
          instantViewImages: [{ placeholder: 'iv://0', media: new mockApi.Photo() as never }],
        }),
      );

      const result = await fetchMessageById('test_channel', 42, { downloadImages: false });

      expect(result?.instantViewImages).toHaveLength(1);
      expect(downloadMediaFile).not.toHaveBeenCalled();
    });

    it('resolves partial IV for a single message', async () => {
      const msg = new MockMessage({ id: 42, message: 'text', date: 1700000000 });
      mockGetMessages.mockResolvedValueOnce([msg]);

      const parsed = makeParsedMsg({
        id: 42,
        instantViewContent: 'Partial',
        instantViewPartial: true,
        instantViewUrl: 'https://example.com/article',
      });
      mockParseMessageFields.mockReturnValueOnce(parsed);

      const fullPage = new MockPage([], false);
      const fullWp = new MockWebPage(fullPage, 'https://example.com/article');
      mockInvoke.mockResolvedValueOnce({ webpage: fullWp });
      mockExtractInstantViewPage.mockReturnValueOnce({
        text: 'Full article content that is longer than partial',
        images: [],
      });

      const result = await fetchMessageById('test_channel', 42);

      expect(result).not.toBeNull();
      expect(result!.instantViewContent).toBe('Full article content that is longer than partial');
      expect(result!.instantViewPartial).toBe(false);
    });

    it('returns message with partial content on resolution failure', async () => {
      const msg = new MockMessage({ id: 42, message: 'text', date: 1700000000 });
      mockGetMessages.mockResolvedValueOnce([msg]);

      const parsed = makeParsedMsg({
        id: 42,
        instantViewContent: 'Partial fallback',
        instantViewPartial: true,
        instantViewUrl: 'https://example.com/article',
      });
      mockParseMessageFields.mockReturnValueOnce(parsed);

      mockInvoke.mockRejectedValueOnce(new Error('Network error'));

      const result = await fetchMessageById('test_channel', 42);

      expect(result).not.toBeNull();
      expect(result!.instantViewContent).toBe('Partial fallback');
    });

    it('does not invoke getWebPage when IV is not partial', async () => {
      const msg = new MockMessage({ id: 42, message: 'text', date: 1700000000 });
      mockGetMessages.mockResolvedValueOnce([msg]);

      mockParseMessageFields.mockReturnValueOnce(makeParsedMsg({ id: 42, instantViewContent: 'Full content' }));

      const result = await fetchMessageById('test_channel', 42);

      expect(result).not.toBeNull();
      expect(result!.instantViewContent).toBe('Full content');
      expect(mockInvoke).not.toHaveBeenCalled();
    });
  });

  // ── Regression: fetch-loop pagination respect for limit / sinceDate ─────────
  describe('fetchChannelMessages pagination cap', () => {
    // `vi.clearAllMocks()` in the outer beforeEach does NOT drain the
    // `mockResolvedValueOnce` queue — any unconsumed entries from previous
    // tests leak into the next test's getMessages calls. Reset explicitly.
    beforeEach(() => {
      mockGetMessages.mockReset();
      mockParseMessageFields.mockReset();
    });

    // Build a batch of N MockMessage objects, all dated NOW (well after any sinceDate).
    function buildBatch(startId: number, count: number, date = 1700000000): InstanceType<typeof MockMessage>[] {
      return Array.from({ length: count }, (_, i) => new MockMessage({ id: startId + i, message: 't', date }));
    }

    it('stops at `limit` when limit is provided', async () => {
      // 3 full batches of 100 = 300 messages available, limit = 150 → should stop after batch 2.
      mockGetMessages
        .mockResolvedValueOnce(buildBatch(300, 100))
        .mockResolvedValueOnce(buildBatch(200, 100))
        .mockResolvedValueOnce(buildBatch(100, 100));

      mockParseMessageFields.mockImplementation((m: { id: number; date: number }) => ({
        id: m.id,
        message: 't',
        date: m.date,
        links: [],
        hashtags: [],
      }));

      const results = await fetchChannelMessages('test_channel', { limit: 150 });

      expect(results).toHaveLength(200); // two full batches accumulated, loop exits AFTER second
      expect(mockGetMessages).toHaveBeenCalledTimes(2);
    });

    // Regression for issue 2: when the user explicitly requests a sinceDate and passes
    // no `limit`, the loop must keep paging until sinceDate is reached, NOT stop at
    // the old hard-coded 500-message default.
    it('does not stop at the old 500-default when limit is undefined', async () => {
      // 6 batches of 100 = 600 messages, all newer than sinceDate. Without the fix,
      // the loop would stop after batch 5 (500 messages). With the fix, it keeps going
      // until getMessages returns < BATCH_SIZE (the 7th call returns empty).
      mockGetMessages
        .mockResolvedValueOnce(buildBatch(600, 100))
        .mockResolvedValueOnce(buildBatch(500, 100))
        .mockResolvedValueOnce(buildBatch(400, 100))
        .mockResolvedValueOnce(buildBatch(300, 100))
        .mockResolvedValueOnce(buildBatch(200, 100))
        .mockResolvedValueOnce(buildBatch(100, 100))
        .mockResolvedValueOnce([]); // end of channel

      mockParseMessageFields.mockImplementation((m: { id: number; date: number }) => ({
        id: m.id,
        message: 't',
        date: m.date,
        links: [],
        hashtags: [],
      }));

      const sinceDate = new Date(1600000000 * 1000); // far in the past — never reached
      const results = await fetchChannelMessages('test_channel', { sinceDate });

      expect(results).toHaveLength(600);
      expect(mockGetMessages).toHaveBeenCalledTimes(7);
    });

    it('stops at sinceDate boundary regardless of limit', async () => {
      // First batch: 50 newer + 50 older than sinceDate. Should stop mid-batch.
      const sinceTs = 1700000500;
      const newerMsgs = Array.from(
        { length: 50 },
        (_, i) => new MockMessage({ id: 200 - i, message: 't', date: sinceTs + 10 }),
      );
      const olderMsgs = Array.from(
        { length: 50 },
        (_, i) => new MockMessage({ id: 150 - i, message: 't', date: sinceTs - 10 }),
      );
      mockGetMessages.mockResolvedValueOnce([...newerMsgs, ...olderMsgs]);

      mockParseMessageFields.mockImplementation((m: { id: number; date: number }) => ({
        id: m.id,
        message: 't',
        date: m.date,
        links: [],
        hashtags: [],
      }));

      const results = await fetchChannelMessages('test_channel', { sinceDate: new Date(sinceTs * 1000) });

      expect(results).toHaveLength(50); // only the newer half
      expect(mockGetMessages).toHaveBeenCalledTimes(1);
    });
  });
});
