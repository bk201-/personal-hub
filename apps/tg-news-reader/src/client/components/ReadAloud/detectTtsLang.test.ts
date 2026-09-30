import { describe, expect, it } from 'vitest';
import { detectTtsLang } from './detectTtsLang';

describe('detectTtsLang', () => {
  it('returns ru-RU for plain Russian text', () => {
    expect(detectTtsLang('Привет, мир!')).toBe('ru-RU');
  });

  it('returns en-US for plain English text', () => {
    expect(detectTtsLang('Hello, world!')).toBe('en-US');
  });

  it('returns ru-RU when Cyrillic dominates over Latin', () => {
    expect(detectTtsLang('Купил iPhone в магазине Apple за 100000 рублей')).toBe('ru-RU');
  });

  it('returns en-US when Latin dominates', () => {
    expect(detectTtsLang('Bought an iPhone for 100 USD at Apple, отлично')).toBe('en-US');
  });

  it('handles ёЁ characters as Cyrillic', () => {
    expect(detectTtsLang('Ёжик в тумане')).toBe('ru-RU');
  });

  it('defaults to en-US for empty input', () => {
    expect(detectTtsLang('')).toBe('en-US');
  });

  it('defaults to en-US for punctuation/numbers only', () => {
    expect(detectTtsLang('12345 !@#$%')).toBe('en-US');
  });

  it('defaults to en-US on tie (no clear winner)', () => {
    // 2 Latin vs 2 Cyrillic — tie goes to en-US per spec
    expect(detectTtsLang('ab йц')).toBe('en-US');
  });
});
