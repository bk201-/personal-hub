import { describe, expect, it } from 'vitest';
import { buildFullContent, parseHtml } from './readability.js';
import type { ExtractedContent } from './readability.js';

function makeExtracted(partial: Partial<ExtractedContent> = {}): ExtractedContent {
  return {
    content: partial.content ?? 'cleaned content',
    textContent: partial.textContent ?? 'plain text content',
    ...partial,
  };
}

describe('buildFullContent', () => {
  // ── Markdown path (rawHtml present) ─────────────────────────────────

  it('converts rawHtml to markdown', () => {
    const result = buildFullContent(makeExtracted({ rawHtml: '<p>Hello <strong>world</strong></p>' }));
    expect(result.format).toBe('markdown');
    expect(result.content).toContain('**world**');
  });

  it('prepends title to markdown when not already in content', () => {
    const result = buildFullContent(
      makeExtracted({
        title: 'Breaking News',
        rawHtml: '<p>Some article body text here</p>',
      }),
    );
    expect(result.format).toBe('markdown');
    expect(result.content).toMatch(/^# Breaking News/);
  });

  it('does not prepend title when already in first 300 chars', () => {
    const result = buildFullContent(
      makeExtracted({
        title: 'Hello',
        rawHtml: '<h1>Hello</h1><p>World</p>',
      }),
    );
    expect(result.format).toBe('markdown');
    // Title should NOT appear twice
    const count = (result.content.match(/Hello/gi) || []).length;
    expect(count).toBe(1);
  });

  it('falls through to text when rawHtml produces empty markdown', () => {
    const result = buildFullContent(
      makeExtracted({
        rawHtml: '   ', // whitespace-only
        textContent: 'fallback text',
      }),
    );
    expect(result.format).toBe('text');
    expect(result.content).toBe('fallback text');
  });

  // ── Plain text path ─────────────────────────────────────────────────

  it('returns plain text when no rawHtml', () => {
    const result = buildFullContent(makeExtracted({ textContent: 'plain text' }));
    expect(result.format).toBe('text');
    expect(result.content).toBe('plain text');
  });

  it('prepends title to plain text when not in first 300 chars', () => {
    const result = buildFullContent(makeExtracted({ title: 'Big Title', textContent: 'body text here' }));
    expect(result.format).toBe('text');
    expect(result.content).toMatch(/^Big Title\n\nbody text here$/);
  });

  it('does not prepend title when already present in text', () => {
    const result = buildFullContent(makeExtracted({ title: 'body', textContent: 'body text here' }));
    expect(result.format).toBe('text');
    expect(result.content).toBe('body text here');
  });

  it('uses content as fallback when textContent is empty', () => {
    const result = buildFullContent(makeExtracted({ textContent: '', content: 'fallback content' }));
    expect(result.content).toBe('fallback content');
  });

  // ── Figure handling ─────────────��─────────────────────────────────────

  it('preserves text content from figure elements (no img)', () => {
    const result = buildFullContent(
      makeExtracted({
        rawHtml: '<p>Before</p><figure><p>Caption text</p></figure><p>After</p>',
      }),
    );
    expect(result.format).toBe('markdown');
    expect(result.content).toContain('Before');
    expect(result.content).toContain('Caption text');
    expect(result.content).toContain('After');
  });

  it('strips figure with img but keeps surrounding text', () => {
    const result = buildFullContent(
      makeExtracted({
        rawHtml: '<p>Before</p><figure><img src="x.jpg"><figcaption>cap</figcaption></figure><p>After</p>',
      }),
    );
    expect(result.format).toBe('markdown');
    expect(result.content).toContain('Before');
    expect(result.content).toContain('After');
  });
});

describe('parseHtml', { timeout: 30_000 }, () => {
  it('extracts article content from well-structured HTML', async () => {
    const html = `
      <html><head><title>Test Article</title></head><body>
        <article>
          <h1>Test Article</h1>
          <p>This is the first paragraph of the article with enough text to be recognized by readability as meaningful content that should be extracted and returned in the result object.</p>
          <p>Second paragraph with more text to ensure the parser identifies this as the main article body content that needs to be preserved.</p>
          <p>Third paragraph adding yet more content to make the article long enough for readability to parse it correctly and extract it properly.</p>
        </article>
      </body></html>
    `;
    const result = await parseHtml(html, 'https://example.com/article');
    expect(result.title).toBe('Test Article');
    expect(result.textContent).toContain('first paragraph');
    expect(result.rawHtml).toBeDefined();
  });

  it('returns body text fallback when no article is detected', async () => {
    // Very short HTML that Readability can't parse as an article
    const html = `<html><body>x</body></html>`;
    const result = await parseHtml(html, 'https://example.com');
    // When Readability fails, parseHtml returns body text in textContent
    expect(result.textContent).toBeDefined();
  });

  it('cleans HTML tags and entities from content', async () => {
    const html = `
      <html><head><title>Title</title></head><body>
        <article>
          <h1>Title</h1>
          <p>Text with <strong>bold</strong> and &amp; entities.</p>
          <p>More text in the article body to make readability actually parse this as a real article with proper content extraction working.</p>
          <p>Even more text to pad the article length. Readability needs a minimum amount of text to consider something an article.</p>
        </article>
      </body></html>
    `;
    const result = await parseHtml(html, 'https://example.com/test');
    // textContent should be cleaned plain text
    expect(result.textContent).not.toContain('<strong>');
    expect(result.textContent).not.toContain('&amp;');
  });
});
