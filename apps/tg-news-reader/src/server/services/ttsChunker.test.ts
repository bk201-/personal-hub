import { describe, expect, it } from 'vitest';
import { chunkTextForTts, computeTtsHash } from './ttsChunker.js';

describe('computeTtsHash', () => {
  it('returns a 64-char hex string', () => {
    const hash = computeTtsHash('hello', 'nova', 'gpt-4o-mini-tts');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is deterministic — identical inputs map to the same hash', () => {
    const a = computeTtsHash('hello world', 'nova', 'gpt-4o-mini-tts');
    const b = computeTtsHash('hello world', 'nova', 'gpt-4o-mini-tts');
    expect(a).toBe(b);
  });

  it('differs when voice changes', () => {
    const a = computeTtsHash('hello', 'nova', 'gpt-4o-mini-tts');
    const b = computeTtsHash('hello', 'alloy', 'gpt-4o-mini-tts');
    expect(a).not.toBe(b);
  });

  it('differs when model changes', () => {
    const a = computeTtsHash('hello', 'nova', 'gpt-4o-mini-tts');
    const b = computeTtsHash('hello', 'nova', 'tts-1');
    expect(a).not.toBe(b);
  });

  it('differs when text changes', () => {
    const a = computeTtsHash('hello', 'nova', 'gpt-4o-mini-tts');
    const b = computeTtsHash('hello!', 'nova', 'gpt-4o-mini-tts');
    expect(a).not.toBe(b);
  });
});

describe('chunkTextForTts', () => {
  it('returns empty array for empty input', () => {
    expect(chunkTextForTts('', 100)).toEqual([]);
    expect(chunkTextForTts('   ', 100)).toEqual([]);
  });

  it('returns single chunk for short input', () => {
    const result = chunkTextForTts('Short text.', 100);
    expect(result).toEqual(['Short text.']);
  });

  it('splits at sentence boundaries when input exceeds limit', () => {
    const text = 'First sentence here. Second sentence here. Third sentence here.';
    const chunks = chunkTextForTts(text, 40);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(40);
  });

  it('packs multiple short sentences into a single chunk', () => {
    const chunks = chunkTextForTts('A. B. C. D. E.', 100);
    // All fit in one chunk
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toContain('A.');
    expect(chunks[0]).toContain('E.');
  });

  it('handles a single long sentence by word-level splitting', () => {
    const text = 'word '.repeat(200).trim(); // 999 chars, no terminators
    const chunks = chunkTextForTts(text, 100);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) {
      expect(c.length).toBeLessThanOrEqual(100);
      expect(c.length).toBeGreaterThan(0);
    }
  });

  it('never produces a chunk longer than the limit', () => {
    const text = 'Test sentence number ' + Array.from({ length: 500 }, (_, i) => `phrase ${i}.`).join(' ');
    const chunks = chunkTextForTts(text, 200);
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(200);
  });

  it('never produces an empty chunk', () => {
    const text = 'A. '.repeat(100);
    const chunks = chunkTextForTts(text, 50);
    for (const c of chunks) expect(c.length).toBeGreaterThan(0);
  });

  it('handles Cyrillic text', () => {
    const text = 'Привет мир. Как дела? Хорошо!';
    const chunks = chunkTextForTts(text, 100);
    expect(chunks.length).toBe(1);
    expect(chunks[0]).toContain('Привет');
  });

  it('preserves all sentence content (smoke check via concatenated length)', () => {
    const text = 'One. Two. Three. Four. Five. Six. Seven. Eight. Nine. Ten.';
    const chunks = chunkTextForTts(text, 20);
    const joined = chunks.join(' ');
    for (const word of ['One', 'Five', 'Ten']) {
      expect(joined).toContain(word);
    }
  });
});
