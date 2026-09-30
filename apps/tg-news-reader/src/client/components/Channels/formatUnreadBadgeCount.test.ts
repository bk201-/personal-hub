import { describe, expect, it } from 'vitest';
import { formatUnreadBadgeCount } from './formatUnreadBadgeCount';

describe('formatUnreadBadgeCount', () => {
  it('returns exact count below 10000', () => {
    expect(formatUnreadBadgeCount(1)).toBe(1);
    expect(formatUnreadBadgeCount(9999)).toBe(9999);
  });

  it('formats 10000 and above as k+', () => {
    expect(formatUnreadBadgeCount(10000)).toBe('10k+');
    expect(formatUnreadBadgeCount(12999)).toBe('12k+');
  });

  it('returns 0 for non-positive values', () => {
    expect(formatUnreadBadgeCount(0)).toBe(0);
    expect(formatUnreadBadgeCount(-3)).toBe(0);
  });
});
