import type { Channel } from '@shared/types';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '../../store/authStore';
import { ChannelInfoContent } from './ChannelInfoContent';

vi.unmock('antd-style');
vi.mock('../../api/groups', () => ({ useGroups: () => ({ data: [] }) }));
vi.mock('../../api/channelStorage', () => ({
  useChannelStorage: () => ({
    data: { bytes: 1234, fileCount: 2, checkedAt: 1_700_000_000 },
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  }),
}));

const channel: Channel = {
  id: 1,
  telegramId: 'example',
  name: 'Example channel',
  channelType: 'media',
  sortOrder: 0,
  filterForwards: 0,
  isUnavailable: 0,
  unreadCount: 3,
  totalNewsCount: 10,
  createdAt: 1_700_000_000,
  supportsDigest: true,
};

describe('channel information layout', () => {
  beforeEach(() => useAuthStore.setState({ accessToken: 'signed-in', unlockedGroupIds: [] }));

  it('keeps the close header outside the scrolling details on a short viewport', () => {
    render(
      <ChannelInfoContent
        channel={{ ...channel, description: 'Long description\n\n'.repeat(100) }}
        onClose={vi.fn()}
      />,
    );
    const dialog = screen.getByRole('dialog');
    const close = screen.getByRole('button', { name: 'channels.info.close' });
    const scrollArea = Array.from(dialog.children).find((child) => getComputedStyle(child).overflowY === 'auto');
    expect(scrollArea).toBeDefined();
    expect(scrollArea?.contains(close)).toBe(false);
    expect(getComputedStyle(dialog).overflow).toBe('hidden');
    expect(getComputedStyle(close.parentElement!).flexShrink).toBe('0');
  });

  it.each([undefined, '', '  \n '])(
    'omits missing description (%s) and storage implementation notes',
    (description) => {
      render(<ChannelInfoContent channel={{ ...channel, description }} onClose={vi.fn()} />);
      expect(screen.queryByText('channels.info.no_description')).not.toBeInTheDocument();
      expect(screen.queryByText('channels.info.description_source')).not.toBeInTheDocument();
      expect(screen.queryByText('channels.info.storage_scope')).not.toBeInTheDocument();
      expect(screen.getByText(/channels.info.checked_at/)).toBeInTheDocument();
    },
  );
});
