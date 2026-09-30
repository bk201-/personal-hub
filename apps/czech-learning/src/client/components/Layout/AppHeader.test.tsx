// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../api/client';
import { useAuthStore } from '../../store/authStore';
import { useUIStore } from '../../store/uiStore';
import { AppHeader } from './AppHeader';

const { changeLanguage } = vi.hoisted(() => ({ changeLanguage: vi.fn() }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en', changeLanguage } }),
}));
vi.mock('../../api/client', () => ({ api: { post: vi.fn().mockResolvedValue({}), delete: vi.fn() } }));
vi.mock('./TotpSetupModal', () => ({
  TotpSetupModal: ({ open }: { open: boolean }) => (open ? <span>Czech two-factor setup</span> : null),
}));

beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
  useUIStore.setState({ isDarkTheme: false });
  useAuthStore.setState({
    accessToken: 'czech-token',
    user: { id: 1, email: 'learner@example.test', role: 'admin', hasTOTP: false },
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('Czech header adapter', () => {
  it('keeps the product title, language control, and two-factor setup local', async () => {
    render(<AppHeader />);
    expect(screen.getByText('Czech Learning')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'header.theme_dark' }));
    expect(useUIStore.getState().isDarkTheme).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'header.user_menu_label' }));
    fireEvent.click(await screen.findByRole('button', { name: 'RU' }));
    expect(changeLanguage).toHaveBeenCalledWith('ru');
    fireEvent.click(screen.getByText('auth.totp_setup.enable'));
    expect(screen.getByText('Czech two-factor setup')).toBeDefined();
  });

  it('keeps the existing logout endpoint and clears only Czech auth', async () => {
    render(<AppHeader />);
    fireEvent.click(screen.getByRole('button', { name: 'header.user_menu_label' }));
    fireEvent.click(await screen.findByText('header.user_menu.logout'));
    expect(api.post).toHaveBeenCalledWith('/auth/logout', {});
    await vi.waitFor(() => expect(useAuthStore.getState().accessToken).toBeNull());
  });
});
