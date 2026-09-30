import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ChannelDescription } from './ChannelDescription';

describe('ChannelDescription', () => {
  it('renders rich Markdown as safe React elements', () => {
    const { container } = render(
      <ChannelDescription
        description={'**Bold** and *italic* with `code`\n\n- List entry\n\n> Quote\n\n[Site](https://example.com)'}
      />,
    );
    expect(container.querySelector('strong')).toHaveTextContent('Bold');
    expect(container.querySelector('em')).toHaveTextContent('italic');
    expect(container.querySelector('code')).toHaveTextContent('code');
    expect(container.querySelector('li')).toHaveTextContent('List entry');
    expect(container.querySelector('blockquote')).toHaveTextContent('Quote');
    expect(screen.getByRole('link', { name: 'Site' })).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('never interprets HTML, unsafe links, images or embedded content', () => {
    const { container } = render(
      <ChannelDescription
        description={
          '<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>\n\n<iframe src="https://evil.test"></iframe>\n\n' +
          '[bad](javascript:alert%281%29) [data](data:text/html,evil) [relative](/api/logout) ' +
          '[protocol](//evil.test)\n\n![tracking](https://evil.test/pixel)\n\n<b>literal</b>'
        }
      />,
    );
    expect(container.querySelector('script, img, iframe, b')).toBeNull();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(container).toHaveTextContent('<b>literal</b>');
  });
});
