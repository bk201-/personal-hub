import { describe, expect, it } from 'vitest';
import { splitSentences } from './splitSentences';

describe('splitSentences', () => {
  it('returns empty array for empty input', () => {
    expect(splitSentences('')).toEqual([]);
    expect(splitSentences('   \n  ')).toEqual([]);
  });

  it('splits a single paragraph into sentences', () => {
    expect(splitSentences('Hello. World! How are you?')).toEqual(['Hello.', 'World!', 'How are you?']);
  });

  it('keeps a sentence with no terminator as a single chunk', () => {
    expect(splitSentences('Just a fragment')).toEqual(['Just a fragment']);
  });

  it('splits paragraphs separated by newlines', () => {
    const text = 'First paragraph.\n\nSecond paragraph here.';
    expect(splitSentences(text)).toEqual(['First paragraph.', 'Second paragraph here.']);
  });

  it('handles paragraphs without sentence terminators', () => {
    expect(splitSentences('No period here\nAnother line')).toEqual(['No period here', 'Another line']);
  });

  it('strips markdown link syntax and keeps label', () => {
    const text = 'Check [this article](https://example.com/page) out.';
    expect(splitSentences(text)).toEqual(['Check this article out.']);
  });

  it('strips markdown image syntax', () => {
    const text = '![alt text](https://example.com/img.png) Caption here.';
    expect(splitSentences(text)).toEqual(['alt text Caption here.']);
  });

  it('strips fenced code blocks', () => {
    const text = 'Before.\n```js\nconst x = 1;\n```\nAfter.';
    const result = splitSentences(text);
    // Code block removed; "Before." and "After." remain (whitespace between them is just spaces)
    expect(result).toContain('Before.');
    expect(result).toContain('After.');
    expect(result.join(' ')).not.toContain('const x = 1');
  });

  it('strips inline code backticks but keeps the content', () => {
    // Note: the period inside `console.log` becomes a sentence boundary after stripping —
    // that's an accepted limitation of sentence-level splitting (TTS just pauses briefly).
    const result = splitSentences('Use `console.log` here.');
    const joined = result.join(' ');
    expect(joined).toContain('console');
    expect(joined).toContain('log');
    expect(joined).not.toContain('`');
  });

  it('removes markdown emphasis chars', () => {
    expect(splitSentences('This is *bold* and _italic_ text.')).toEqual(['This is bold and italic text.']);
  });

  it('handles multiple terminators in a row (e.g. "..." or "!?")', () => {
    const result = splitSentences('Wait... Really?! Yes.');
    expect(result).toEqual(['Wait...', 'Really?!', 'Yes.']);
  });

  it('handles unicode ellipsis (…)', () => {
    expect(splitSentences('Hmm… okay.')).toEqual(['Hmm…', 'okay.']);
  });

  it('does not produce empty entries', () => {
    expect(splitSentences('A. B. C.')).toEqual(['A.', 'B.', 'C.']);
  });

  it('trims surrounding whitespace from each sentence', () => {
    const result = splitSentences('  Padded.    Another one.  ');
    expect(result).toEqual(['Padded.', 'Another one.']);
  });
});
