import { describe, expect, it } from 'vitest';
import { checkFilterMatch } from './filterEngine.js';

describe('checkFilterMatch', () => {
  // ── Tag filter ──────────────────────────────────────────────────────

  it('matches tag filter (no # prefix in filter or hashtag)', () => {
    expect(checkFilterMatch({ id: 1, type: 'tag', value: 'crypto' }, { text: '', hashtags: ['crypto'] })).toBe(true);
  });

  it('matches tag filter with # prefix in filter value', () => {
    expect(checkFilterMatch({ id: 1, type: 'tag', value: '#crypto' }, { text: '', hashtags: ['crypto'] })).toBe(true);
  });

  it('matches tag filter with # prefix in hashtag', () => {
    expect(checkFilterMatch({ id: 1, type: 'tag', value: 'crypto' }, { text: '', hashtags: ['#crypto'] })).toBe(true);
  });

  it('matches tag filter case-insensitively', () => {
    expect(checkFilterMatch({ id: 1, type: 'tag', value: 'Crypto' }, { text: '', hashtags: ['#CRYPTO'] })).toBe(true);
  });

  it('does not match when tag is absent', () => {
    expect(checkFilterMatch({ id: 1, type: 'tag', value: 'crypto' }, { text: 'crypto', hashtags: [] })).toBe(false);
  });

  // ── Keyword filter ──────────────────────────────────────────────────

  it('matches keyword as substring of text', () => {
    expect(
      checkFilterMatch({ id: 2, type: 'keyword', value: 'bitcoin' }, { text: 'Buy Bitcoin now!', hashtags: [] }),
    ).toBe(true);
  });

  it('matches keyword case-insensitively', () => {
    expect(
      checkFilterMatch({ id: 2, type: 'keyword', value: 'BITCOIN' }, { text: 'buy bitcoin now', hashtags: [] }),
    ).toBe(true);
  });

  it('does not match keyword when absent', () => {
    expect(
      checkFilterMatch({ id: 2, type: 'keyword', value: 'ethereum' }, { text: 'Buy Bitcoin now!', hashtags: [] }),
    ).toBe(false);
  });
});
