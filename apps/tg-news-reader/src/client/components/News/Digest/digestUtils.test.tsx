import { render } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { inlineRefs } from './digestUtils';

// Helper: render the result to a container and return its innerHTML
function renderToHtml(node: React.ReactNode): string {
  const { container } = render(<>{node}</>);
  return container.innerHTML;
}

describe('inlineRefs', () => {
  const refMap: Record<number, number> = { 1: 101, 2: 102, 3: 103 };
  const onClick = vi.fn();
  const chipClass = 'test-chip';

  it('returns plain string unchanged when no [N] markers present', () => {
    const result = inlineRefs('hello world', refMap, onClick, chipClass);
    expect(result).toBe('hello world');
  });

  it('replaces [1] with a clickable Tag chip', () => {
    const result = inlineRefs('see [1] here', refMap, onClick, chipClass);
    const html = renderToHtml(result);
    expect(html).toContain('see ');
    expect(html).toContain(' here');
    // Ant Design Tag renders with the text content
    expect(html).toContain('1');
  });

  it('replaces multiple [N] markers', () => {
    const result = inlineRefs('[1] and [2]', refMap, onClick, chipClass);
    const html = renderToHtml(result);
    expect(html).toContain('1');
    expect(html).toContain('2');
    expect(html).toContain(' and ');
  });

  it('handles grouped refs like [1,2,3]', () => {
    const result = inlineRefs('refs [1,2,3] here', refMap, onClick, chipClass);
    const html = renderToHtml(result);
    expect(html).toContain('1');
    expect(html).toContain('2');
    expect(html).toContain('3');
  });

  it('preserves [N] as text when N is not in refMap', () => {
    const result = inlineRefs('see [99]', refMap, onClick, chipClass);
    const html = renderToHtml(result);
    expect(html).toContain('[99]');
  });

  it('returns non-string primitives unchanged', () => {
    expect(inlineRefs(null, refMap, onClick, chipClass)).toBeNull();
    expect(inlineRefs(undefined, refMap, onClick, chipClass)).toBeUndefined();
    expect(inlineRefs(42 as unknown as React.ReactNode, refMap, onClick, chipClass)).toBe(42);
  });

  it('processes children inside React elements recursively', () => {
    const input = React.createElement('strong', null, 'bold [1] text');
    const result = inlineRefs(input, refMap, onClick, chipClass);
    const html = renderToHtml(result);
    expect(html).toContain('<strong');
    expect(html).toContain('1');
    expect(html).toContain('bold ');
  });

  it('processes arrays of children', () => {
    const input = ['text [1]', ' more [2]'];
    const result = inlineRefs(input, refMap, onClick, chipClass);
    const html = renderToHtml(result);
    expect(html).toContain('1');
    expect(html).toContain('2');
  });

  it('applies chipClass to generated Tag elements', () => {
    const result = inlineRefs('[1]', refMap, onClick, chipClass);
    const html = renderToHtml(result);
    expect(html).toContain('test-chip');
  });

  it('skips cloneElement when element has no [N] in children', () => {
    const input = React.createElement('em', null, 'no refs here');
    const result = inlineRefs(input, refMap, onClick, chipClass);
    // Should return the exact same element reference (identity check)
    expect(result).toBe(input);
  });
});
