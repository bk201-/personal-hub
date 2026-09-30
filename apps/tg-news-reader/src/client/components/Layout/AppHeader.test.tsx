import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useUIStore } from '../../store/uiStore';
import { AppHeader } from './AppHeader';

const { isXxl } = vi.hoisted(() => ({ isXxl: vi.fn(() => true) }));
vi.mock('../../hooks/breakpoints', () => ({ useIsXxl: isXxl, BP_XL: 1200 }));
vi.mock('../../api/channels', () => ({ useChannels: () => ({ data: [{ id: 7, name: 'Local news' }] }) }));
vi.mock('./DownloadsPanel', () => ({ DownloadsPanel: () => <span>News downloads</span> }));
vi.mock('./LogsPanel', () => ({ LogsPanel: () => <span>News logs</span> }));
vi.mock('./TotpSetupModal', () => ({ TotpSetupModal: () => null }));
vi.mock('./UserMenu', () => ({ useUserMenuItems: () => [{ key: 'news-action', label: 'News-only action' }] }));
vi.mock('../common/MaybeTooltip', () => ({ MaybeTooltip: ({ children }: { children: React.ReactNode }) => children }));

beforeEach(() => {
  isXxl.mockReturnValue(true);
  useUIStore.setState({ selectedChannelId: 7, isDarkTheme: false, sidebarDrawerOpen: false });
});

describe('News header adapter', () => {
  it('retains news title/channel/actions while sharing theme and user controls', async () => {
    render(<AppHeader />);
    expect(screen.getByText('TG News Reader')).toBeDefined();
    expect(screen.getByText('— Local news')).toBeDefined();
    expect(screen.getByText('News downloads')).toBeDefined();
    expect(screen.getByText('News logs')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'header.theme_dark' }));
    expect(useUIStore.getState().isDarkTheme).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'header.user_menu_label' }));
    expect(await screen.findByText('News-only action')).toBeDefined();
  });

  it('retains compact sidebar navigation', () => {
    isXxl.mockReturnValue(false);
    render(<AppHeader />);
    expect(screen.queryByText('TG News Reader')).toBeNull();
    expect(screen.getByText('Local news')).toBeDefined();
    fireEvent.click(screen.getAllByRole('button')[0]);
    expect(useUIStore.getState().sidebarDrawerOpen).toBe(true);
  });
});
