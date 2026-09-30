import { describe, expect, it } from 'vitest';
import { renderErrorHtml } from './errorHtml.js';

describe('renderErrorHtml', () => {
  it('returns valid HTML with the status code', () => {
    const html = renderErrorHtml(404);
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('404');
    expect(html).toContain('Nothing here');
  });

  it('uses correct config for 403', () => {
    const html = renderErrorHtml(403);
    expect(html).toContain('No entry');
    expect(html).toContain('🔐');
  });

  it('uses correct config for 429', () => {
    const html = renderErrorHtml(429);
    expect(html).toContain('Slow down');
    expect(html).toContain('⏳');
  });

  it('uses correct config for 503', () => {
    const html = renderErrorHtml(503);
    expect(html).toContain('Server is resting');
  });

  it('uses correct config for generic 500', () => {
    const html = renderErrorHtml(500);
    expect(html).toContain('Server hiccupped');
    expect(html).toContain('💥');
  });

  it('uses fallback config for unknown status', () => {
    const html = renderErrorHtml(418);
    expect(html).toContain('Request failed');
    expect(html).toContain('😕');
  });

  it('includes escaped detail when provided', () => {
    const html = renderErrorHtml(500, '<script>alert("xss")</script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script>alert');
  });

  it('omits detail section when not provided', () => {
    const html = renderErrorHtml(404);
    expect(html).not.toContain('<pre class="detail">');
  });

  it('contains a back-to-app link', () => {
    const html = renderErrorHtml(500);
    expect(html).toContain('href="/"');
  });
});
