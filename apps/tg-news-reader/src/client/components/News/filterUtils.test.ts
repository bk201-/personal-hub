import type { Filter, NewsItem } from '@shared/types.ts';
import { describe, expect, it } from 'vitest';
import { applyFilters } from './filterUtils';

function makeItem(id: number, overrides: Partial<NewsItem> = {}): NewsItem {
  return {
    id,
    channelId: 1,
    telegramMsgId: id,
    text: overrides.text ?? '',
    links: [],
    hashtags: overrides.hashtags ?? [],
    isRead: 0,
    postedAt: Date.now(),
    ...overrides,
  };
}

function makeFilter(id: number, overrides: Partial<Filter> = {}): Filter {
  return {
    id,
    channelId: 1,
    name: `filter-${id}`,
    type: overrides.type ?? 'tag',
    value: overrides.value ?? '',
    isActive: overrides.isActive ?? 1,
    createdAt: Date.now(),
    ...overrides,
  };
}

describe('applyFilters', () => {
  it('returns all IDs when no active filters', () => {
    const items = [makeItem(1), makeItem(2)];
    const result = applyFilters(items, []);
    expect(result).toEqual(new Set([1, 2]));
  });

  it('returns all IDs when all filters are inactive', () => {
    const items = [makeItem(1, { hashtags: ['#crypto'] })];
    const filters = [makeFilter(1, { type: 'tag', value: 'crypto', isActive: 0 })];
    const result = applyFilters(items, filters);
    expect(result).toEqual(new Set([1]));
  });

  it('excludes items matching a tag filter', () => {
    const items = [makeItem(1, { hashtags: ['#crypto'] }), makeItem(2, { hashtags: ['#sports'] })];
    const filters = [makeFilter(1, { type: 'tag', value: 'crypto' })];
    const result = applyFilters(items, filters);
    expect(result).toEqual(new Set([2]));
  });

  it('tag filter is case-insensitive', () => {
    const items = [makeItem(1, { hashtags: ['#CRYPTO'] })];
    const filters = [makeFilter(1, { type: 'tag', value: 'crypto' })];
    expect(applyFilters(items, filters).size).toBe(0);
  });

  it('tag filter works with # prefix in filter value', () => {
    const items = [makeItem(1, { hashtags: ['crypto'] })];
    const filters = [makeFilter(1, { type: 'tag', value: '#crypto' })];
    expect(applyFilters(items, filters).size).toBe(0);
  });

  it('excludes items matching a keyword filter', () => {
    const items = [makeItem(1, { text: 'Buy Bitcoin now!' }), makeItem(2, { text: 'Nice weather today' })];
    const filters = [makeFilter(1, { type: 'keyword', value: 'bitcoin' })];
    const result = applyFilters(items, filters);
    expect(result).toEqual(new Set([2]));
  });

  it('keyword filter is case-insensitive', () => {
    const items = [makeItem(1, { text: 'BREAKING NEWS about Bitcoin' })];
    const filters = [makeFilter(1, { type: 'keyword', value: 'bitcoin' })];
    expect(applyFilters(items, filters).size).toBe(0);
  });

  it('combines tag and keyword filters (OR — any match excludes)', () => {
    const items = [
      makeItem(1, { text: 'Hello', hashtags: ['#crypto'] }), // excluded by tag
      makeItem(2, { text: 'Buy Bitcoin now!' }), // excluded by keyword
      makeItem(3, { text: 'Nice day' }), // passes both
    ];
    const filters = [
      makeFilter(1, { type: 'tag', value: 'crypto' }),
      makeFilter(2, { type: 'keyword', value: 'bitcoin' }),
    ];
    const result = applyFilters(items, filters);
    expect(result).toEqual(new Set([3]));
  });

  it('handles items with no hashtags gracefully', () => {
    const items = [makeItem(1, { text: 'hello', hashtags: [] })];
    const filters = [makeFilter(1, { type: 'tag', value: 'crypto' })];
    const result = applyFilters(items, filters);
    expect(result).toEqual(new Set([1]));
  });
});
