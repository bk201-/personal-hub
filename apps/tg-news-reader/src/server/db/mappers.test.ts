import { describe, expect, it } from 'vitest';
import { toNewsItem } from './mappers.js';

/** Minimal valid row — all required fields set, optional fields null */
function makeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    channelId: 10,
    telegramMsgId: 100,
    text: 'hello',
    links: ['https://example.com'],
    hashtags: ['#news'],
    isRead: 0,
    postedAt: 1700000000,
    mediaType: null,
    fullContent: null,
    localMediaPath: null,
    localMediaPaths: null,
    albumMsgIds: null,
    mediaSize: null,
    isFiltered: 0,
    textInPanel: 0,
    canLoadArticle: 0,
    fullContentFormat: 'text' as const,
    forwardFromName: null,
    ...overrides,
  };
}

describe('toNewsItem', () => {
  it('maps required fields directly', () => {
    const row = makeRow();
    const item = toNewsItem(row);
    expect(item.id).toBe(1);
    expect(item.channelId).toBe(10);
    expect(item.telegramMsgId).toBe(100);
    expect(item.text).toBe('hello');
    expect(item.links).toEqual(['https://example.com']);
    expect(item.hashtags).toEqual(['#news']);
    expect(item.isRead).toBe(0);
    expect(item.postedAt).toBe(1700000000);
  });

  it('coerces null optional fields to undefined', () => {
    const item = toNewsItem(makeRow());
    expect(item.mediaType).toBeUndefined();
    expect(item.fullContent).toBeUndefined();
    expect(item.localMediaPath).toBeUndefined();
    expect(item.localMediaPaths).toBeUndefined();
    expect(item.albumMsgIds).toBeUndefined();
    expect(item.mediaSize).toBeUndefined();
  });

  it('passes through non-null optional fields', () => {
    const item = toNewsItem(
      makeRow({
        mediaType: 'photo',
        fullContent: '<p>article</p>',
        localMediaPath: 'ch/1.jpg',
        localMediaPaths: ['ch/1.jpg', 'ch/2.jpg'],
        albumMsgIds: [100, 101],
        mediaSize: 12345,
      }),
    );
    expect(item.mediaType).toBe('photo');
    expect(item.fullContent).toBe('<p>article</p>');
    expect(item.localMediaPath).toBe('ch/1.jpg');
    expect(item.localMediaPaths).toEqual(['ch/1.jpg', 'ch/2.jpg']);
    expect(item.albumMsgIds).toEqual([100, 101]);
    expect(item.mediaSize).toBe(12345);
  });

  it('defaults textInPanel=0, canLoadArticle=0, fullContentFormat=text when null', () => {
    const item = toNewsItem(makeRow({ textInPanel: null, canLoadArticle: null, fullContentFormat: null }));
    expect(item.textInPanel).toBe(0);
    expect(item.canLoadArticle).toBe(0);
    expect(item.fullContentFormat).toBe('text');
  });

  it('preserves explicit values for textInPanel, canLoadArticle, fullContentFormat', () => {
    const item = toNewsItem(makeRow({ textInPanel: 1, canLoadArticle: 1, fullContentFormat: 'markdown' }));
    expect(item.textInPanel).toBe(1);
    expect(item.canLoadArticle).toBe(1);
    expect(item.fullContentFormat).toBe('markdown');
  });

  it('coerces empty string mediaType to undefined (falsy)', () => {
    const item = toNewsItem(makeRow({ mediaType: '' }));
    expect(item.mediaType).toBeUndefined();
  });
});
