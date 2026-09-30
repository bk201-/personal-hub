import type { Channel, Group } from '@shared/types.ts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfigProvider } from 'antd';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../api/client';
import { useIsMd } from '../../hooks/breakpoints';
import { useAuthStore } from '../../store/authStore';
import { ChannelItem } from './ChannelItem';

vi.mock('../../api/client', () => ({ api: { get: vi.fn() } }));
vi.mock('../../hooks/breakpoints', () => ({ useIsMd: vi.fn(() => true) }));
const channel: Channel = {
  id: 1,
  telegramId: 'test_channel',
  name: 'Test channel',
  description: '**Saved** description',
  channelType: 'news',
  groupId: null,
  sortOrder: 0,
  filterForwards: 0,
  isUnavailable: 0,
  unreadCount: 3,
  totalNewsCount: 10,
  createdAt: 1_700_000_000,
  supportsDigest: true,
};
const stats = { bytes: 1234, fileCount: 2, checkedAt: 1_700_000_000 };
let clients: QueryClient[] = [];

function setup(overrides: Partial<Channel> = {}, groups: Group[] = []) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  clients.push(client);
  client.setQueryData(['groups'], groups);
  const props = {
    channel: { ...channel, ...overrides },
    isSelected: false,
    isFetchingThis: false,
    unreadCount: 3,
    onSelect: vi.fn(),
    onFetch: vi.fn(),
    onEdit: vi.fn(),
    onDelete: vi.fn(),
  };
  render(
    <QueryClientProvider client={client}>
      <ConfigProvider theme={{ token: { motion: false } }}>
        <ChannelItem {...props} />
      </ConfigProvider>
    </QueryClientProvider>,
  );
  return props;
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(useIsMd).mockReturnValue(true);
  vi.mocked(api.get).mockImplementation(async (path) => (path === '/groups' ? [] : stats));
  useAuthStore.setState({
    accessToken: 'signed-in',
    user: { id: 1, email: 'test@example.com', role: 'user' },
    unlockedGroupIds: [],
  });
});
afterEach(() => {
  clients.forEach((client) => client.clear());
  clients = [];
});

describe('ChannelItem information popover', () => {
  it.each([true, false])('dismisses the action menu with Escape (desktop=%s)', async (desktop) => {
    vi.mocked(useIsMd).mockReturnValue(desktop);
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole('button', { name: 'channels.info.actions' }));
    await screen.findByRole('menu');
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
  });

  it('keeps mobile information closed after touch-generated hover', async () => {
    vi.mocked(useIsMd).mockReturnValue(false);
    const props = setup();
    expect(screen.queryByRole('button', { name: /channels.info.open/ })).not.toBeInTheDocument();
    const trigger = screen.getByRole('button', { name: 'channels.info.actions' });
    vi.useFakeTimers();
    try {
      fireEvent.mouseOver(trigger);
      act(() => vi.advanceTimersByTime(1000));
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(api.get).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
    fireEvent.touchStart(trigger);
    fireEvent.touchEnd(trigger);
    fireEvent.click(trigger);
    expect(api.get).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole('menuitem', { name: /channels.info.title/ }));
    await screen.findByRole('dialog');
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
    expect(await screen.findByText(/channels.info.storage_bytes/)).toBeInTheDocument();
    expect(screen.getByText('Saved')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('link', { name: '@test_channel' }));
    fireEvent.click(screen.getByRole('button', { name: 'channels.info.close' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    vi.useFakeTimers();
    try {
      fireEvent.mouseOver(trigger);
      fireEvent.touchStart(trigger);
      act(() => vi.advanceTimersByTime(1000));
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(props.onSelect).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
    fireEvent.click(trigger);
    fireEvent.click(await screen.findByRole('menuitem', { name: /channels.info.title/ }));
    expect(await screen.findByRole('button', { name: 'channels.info.close' })).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(props.onSelect).not.toHaveBeenCalled();
  });

  it('loads storage only after hovering the info button and renders existing metadata', async () => {
    const user = userEvent.setup();
    const props = setup();
    expect(api.get).not.toHaveBeenCalled();
    await user.hover(screen.getByRole('button', { name: /channels.info.open/ }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/channels/1/storage'));
    expect(await screen.findByText(/channels.info.storage_bytes/)).toHaveTextContent('"bytes":"1,234"');
    expect(screen.getByText('Saved').tagName).toBe('STRONG');
    expect(screen.getByText('10')).toBeInTheDocument();
    expect(screen.queryByText('channels.info.description_source')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'channels.info.close' })).not.toBeInTheDocument();
    expect(screen.queryByText('channels.info.storage_scope')).not.toBeInTheDocument();
    expect(screen.getByText(/channels.info.checked_at/)).toBeInTheDocument();
    expect(props.onSelect).not.toHaveBeenCalled();
  });

  it('does not open details or load storage when hovering the channel row or its menu', async () => {
    vi.useFakeTimers();
    try {
      setup();
      fireEvent.mouseOver(screen.getByText(channel.name));
      act(() => vi.advanceTimersByTime(500));
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      fireEvent.mouseOver(screen.getByRole('button', { name: 'channels.info.actions' }));
      act(() => vi.advanceTimersByTime(500));
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(api.get).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('opens by explicit click on touch without selecting and closes explicitly', async () => {
    const props = setup();
    const infoButton = screen.getByRole('button', { name: /channels.info.open/ });
    fireEvent.touchStart(infoButton);
    fireEvent.touchEnd(infoButton);
    fireEvent.click(infoButton);
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('link', { name: '@test_channel' }));
    expect(props.onSelect).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'channels.info.close' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(props.onSelect).not.toHaveBeenCalled();
  });

  it('displays large storage totals in readable units as well as exact bytes', async () => {
    vi.mocked(api.get).mockImplementation(async (path) =>
      path === '/groups' ? [] : { ...stats, bytes: 2.5 * 1024 ** 3 },
    );
    setup();
    fireEvent.click(screen.getByRole('button', { name: /channels.info.open/ }));
    expect(await screen.findByText('2.5 GB')).toBeInTheDocument();
    expect(screen.getByText(/channels.info.storage_bytes/)).toHaveTextContent('"bytes":"2,684,354,560"');
  });

  it('pins a hovered popover on click and keeps Close available after the pointer leaves', async () => {
    const user = userEvent.setup();
    setup();
    const button = screen.getByRole('button', { name: /channels.info.open/ });
    await user.hover(button);
    await screen.findByRole('dialog');
    await user.click(button);
    expect(screen.getByRole('button', { name: 'channels.info.close' })).toBeInTheDocument();
    await user.unhover(button);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'channels.info.close' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('supports keyboard info activation and Escape while preserving row selection', async () => {
    const user = userEvent.setup();
    const props = setup();
    screen.getByRole('button', { name: /channels.info.open/ }).focus();
    await user.keyboard('{Enter}');
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(props.onSelect).not.toHaveBeenCalled();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await user.keyboard(' ');
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    screen.getByRole('button', { name: 'channels.info.close' }).focus();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    screen.getByRole('option').focus();
    await user.keyboard('{Enter}');
    expect(props.onSelect).toHaveBeenCalledWith(1);
  });

  it('shows loading, failure, then real zero-byte success on retry', async () => {
    let reject!: (err: Error) => void;
    vi.mocked(api.get).mockImplementation((path) =>
      path === '/groups'
        ? Promise.resolve([])
        : new Promise((_resolve, fail) => {
            reject = fail;
          }),
    );
    setup({ description: '' });
    fireEvent.click(screen.getByRole('button', { name: /channels.info.open/ }));
    expect(await screen.findByRole('status')).toHaveTextContent('channels.info.storage_loading');
    expect(screen.queryByText('channels.info.no_description')).not.toBeInTheDocument();
    await act(async () => reject(new Error('disk offline')));
    expect(await screen.findByRole('alert')).toHaveTextContent('channels.info.storage_error');
    expect(screen.queryByText(/channels.info.storage_bytes/)).not.toBeInTheDocument();
    vi.mocked(api.get).mockResolvedValue({ bytes: 0, fileCount: 0, checkedAt: stats.checkedAt });
    fireEvent.click(screen.getByRole('button', { name: 'channels.info.retry' }));
    expect(await screen.findByText(/channels.info.storage_bytes/)).toHaveTextContent('"bytes":"0"');
  });

  it.each([true, false])('hides details and never requests stats for a locked group (desktop=%s)', async (desktop) => {
    vi.mocked(useIsMd).mockReturnValue(desktop);
    const group = { id: 5, name: 'Private', hasPIN: true, color: 'blue', sortOrder: 0, createdAt: 1 };
    vi.mocked(api.get).mockResolvedValue([group]);
    setup({ groupId: 5 }, [group]);
    if (desktop) {
      fireEvent.click(screen.getByRole('button', { name: /channels.info.open/ }));
    } else {
      fireEvent.click(screen.getByRole('button', { name: 'channels.info.actions' }));
      fireEvent.click(await screen.findByRole('menuitem', { name: /channels.info.title/ }));
    }
    expect(await screen.findByText('channels.info.locked')).toBeInTheDocument();
    expect(screen.queryByText('Saved')).not.toBeInTheDocument();
    expect(api.get).not.toHaveBeenCalledWith('/channels/1/storage');
  });

  it('removes visible private details immediately on local re-lock', async () => {
    const group = { id: 5, name: 'Private', hasPIN: true, color: 'blue', sortOrder: 0, createdAt: 1 };
    vi.mocked(api.get).mockImplementation(async (path) => (path === '/groups' ? [group] : stats));
    useAuthStore.setState({ unlockedGroupIds: [5] });
    setup({ groupId: 5 }, [group]);
    fireEvent.click(screen.getByRole('button', { name: /channels.info.open/ }));
    expect(await screen.findByText(/channels.info.storage_bytes/)).toBeInTheDocument();
    act(() => useAuthStore.getState().lockGroupsLocally());
    expect(screen.getByText('channels.info.locked')).toBeInTheDocument();
    expect(screen.queryByText(/channels.info.storage_bytes/)).not.toBeInTheDocument();
  });

  it.each([true, false])(
    'preserves the channel action menu without selecting the row (desktop=%s)',
    async (desktop) => {
      vi.mocked(useIsMd).mockReturnValue(desktop);
      const user = userEvent.setup();
      const props = setup();
      fireEvent.click(screen.getByRole('button', { name: 'channels.info.actions' }));
      await screen.findByRole('menu');
      expect(!!screen.queryByRole('menuitem', { name: /channels.info.title/ })).toBe(!desktop);
      await user.click(await screen.findByText('channels.edit_tooltip'));
      expect(props.onEdit).toHaveBeenCalledWith(channel);
      expect(props.onSelect).not.toHaveBeenCalled();
    },
  );
});
