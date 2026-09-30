import { describe, expect, it } from 'vitest';
import { sanitizeForTts } from './sanitizeForTts';

describe('sanitizeForTts', () => {
  it('returns empty string for empty input', () => {
    expect(sanitizeForTts('')).toBe('');
  });

  it('keeps plain text unchanged', () => {
    expect(sanitizeForTts('Hello world.')).toBe('Hello world.');
  });

  it('strips https URLs', () => {
    expect(sanitizeForTts('See https://example.com/path/page for details.')).toBe('See for details.');
  });

  it('strips http URLs (case-insensitive)', () => {
    expect(sanitizeForTts('Visit HTTP://example.com today.')).toBe('Visit today.');
  });

  it('strips www. URLs without scheme', () => {
    expect(sanitizeForTts('Visit www.example.com daily.')).toBe('Visit daily.');
  });

  it('strips t.me Telegram links', () => {
    expect(sanitizeForTts('Channel at t.me/somechannel today.')).toBe('Channel at today.');
  });

  it('replaces markdown link with its label', () => {
    expect(sanitizeForTts('Read [this article](https://example.com/a/b) now.')).toBe('Read this article now.');
  });

  it('replaces markdown image with its alt text', () => {
    expect(sanitizeForTts('![sunset photo](https://cdn.example.com/x.jpg) is nice.')).toBe('sunset photo is nice.');
  });

  it('strips a bare URL at the start of a line without leaving leading whitespace', () => {
    expect(sanitizeForTts('https://example.com/foo Hello.')).toBe('Hello.');
  });

  it('preserves newlines between paragraphs', () => {
    const input = 'First paragraph.\n\nSecond, see https://example.com here.';
    const out = sanitizeForTts(input);
    expect(out).toContain('First paragraph.');
    expect(out).toContain('Second, see here.');
    expect(out).toContain('\n\n');
  });

  it('handles multiple URLs in one sentence', () => {
    const input = 'Compare https://a.com/x and https://b.com/y now.';
    expect(sanitizeForTts(input)).toBe('Compare and now.');
  });

  it('does not strip the @mention or hashtag', () => {
    expect(sanitizeForTts('Thanks @user for #news.')).toBe('Thanks @user for #news.');
  });

  it('handles a URL with query string and fragment', () => {
    const input = 'Open https://example.com/page?id=42&x=1#section to view.';
    expect(sanitizeForTts(input)).toBe('Open to view.');
  });

  it('handles markdown link whose label itself contains text', () => {
    expect(sanitizeForTts('Check [latest update](https://example.com/post/123).')).toBe('Check latest update.');
  });
});
