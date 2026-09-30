import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../__tests__/renderWithProviders';
import { useAuthStore } from '../../store/authStore';
import { LoginPage } from './LoginPage';

describe('LoginPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useAuthStore.setState({ accessToken: null, user: null, isCheckingAuth: false });
  });

  it('renders email and password inputs and submit button', () => {
    renderWithProviders(<LoginPage />);
    expect(screen.getByPlaceholderText('auth.email_placeholder')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('auth.password_placeholder')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'auth.login_button' })).toBeInTheDocument();
  });

  it('calls fetch on form submit with credentials', async () => {
    const user = userEvent.setup();
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          accessToken: 'tok',
          user: { id: 1, email: 'a@b.com', role: 'admin' },
        }),
    } as Response);

    renderWithProviders(<LoginPage />);

    await user.type(screen.getByPlaceholderText('auth.email_placeholder'), 'a@b.com');
    await user.type(screen.getByPlaceholderText('auth.password_placeholder'), 'pass123');
    await user.click(screen.getByRole('button', { name: 'auth.login_button' }));

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        '/api/auth/login',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('a@b.com'),
        }),
      );
    });
  });

  it('shows error on failed login', async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: false,
      json: () => Promise.resolve({ error: 'Invalid credentials' }),
    } as Response);

    renderWithProviders(<LoginPage />);

    await user.type(screen.getByPlaceholderText('auth.email_placeholder'), 'a@b.com');
    await user.type(screen.getByPlaceholderText('auth.password_placeholder'), 'wrong');
    await user.click(screen.getByRole('button', { name: 'auth.login_button' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
  });

  it('shows TOTP step when server requires it', async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: false,
      json: () => Promise.resolve({ requiresTOTP: true }),
    } as Response);

    renderWithProviders(<LoginPage />);

    await user.type(screen.getByPlaceholderText('auth.email_placeholder'), 'a@b.com');
    await user.type(screen.getByPlaceholderText('auth.password_placeholder'), 'pass');
    await user.click(screen.getByRole('button', { name: 'auth.login_button' }));

    await waitFor(() => {
      expect(screen.getByText('auth.totp_prompt')).toBeInTheDocument();
    });
  });

  it('sets auth store on successful login', async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          accessToken: 'jwt-token',
          user: { id: 1, email: 'a@b.com', role: 'admin' },
        }),
    } as Response);

    renderWithProviders(<LoginPage />);

    await user.type(screen.getByPlaceholderText('auth.email_placeholder'), 'a@b.com');
    await user.type(screen.getByPlaceholderText('auth.password_placeholder'), 'pass');
    await user.click(screen.getByRole('button', { name: 'auth.login_button' }));

    await waitFor(() => {
      expect(useAuthStore.getState().accessToken).toBe('jwt-token');
    });
  });
});
