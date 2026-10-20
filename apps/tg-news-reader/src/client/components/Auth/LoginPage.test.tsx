import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../__tests__/renderWithProviders';
import { useAuthStore } from '../../store/authStore';
import { LoginPage } from './LoginPage';

async function submitCredentials(password: string) {
  await act(async () => {
    fireEvent.change(screen.getByPlaceholderText('auth.email_placeholder'), { target: { value: 'a@b.com' } });
    fireEvent.change(screen.getByPlaceholderText('auth.password_placeholder'), { target: { value: password } });
    fireEvent.click(screen.getByRole('button', { name: 'auth.login_button' }));
    await vi.runAllTimersAsync();
  });
}

async function cleanupLoginPage() {
  cleanup();
  // Ant Design's form debounce can outlive unmount; flush it before jsdom removes window.
  await act(async () => {
    await vi.runOnlyPendingTimersAsync();
  });
}

describe('LoginPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.useFakeTimers();
    useAuthStore.setState({ accessToken: null, user: null, isCheckingAuth: false });
  });

  afterEach(async () => {
    try {
      await cleanupLoginPage();
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('renders email and password inputs and submit button', () => {
    renderWithProviders(<LoginPage />);
    expect(screen.getByPlaceholderText('auth.email_placeholder')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('auth.password_placeholder')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'auth.login_button' })).toBeInTheDocument();
  });

  it('finishes pending form updates before the browser environment is removed', async () => {
    renderWithProviders(<LoginPage />);
    expect(vi.getTimerCount()).toBeGreaterThan(0);

    await cleanupLoginPage();
    expect(vi.getTimerCount()).toBe(0);

    vi.stubGlobal('window', undefined);
    try {
      await vi.runAllTimersAsync();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('does not submit empty required fields', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    renderWithProviders(<LoginPage />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'auth.login_button' }));
      await vi.runAllTimersAsync();
    });

    expect(screen.getByPlaceholderText('auth.email_placeholder')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByPlaceholderText('auth.password_placeholder')).toHaveAttribute('aria-invalid', 'true');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('calls fetch on form submit with credentials', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          accessToken: 'tok',
          user: { id: 1, email: 'a@b.com', role: 'admin' },
        }),
    } as Response);

    renderWithProviders(<LoginPage />);

    await submitCredentials('pass123');

    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/auth/login',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ email: 'a@b.com', password: 'pass123' }),
      }),
    );
  });

  it('shows error on failed login', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: false,
      json: () => Promise.resolve({ error: 'Invalid credentials' }),
    } as Response);

    renderWithProviders(<LoginPage />);

    await submitCredentials('wrong');

    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('shows TOTP step when server requires it', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: false,
      json: () => Promise.resolve({ requiresTOTP: true }),
    } as Response);

    renderWithProviders(<LoginPage />);

    await submitCredentials('pass');

    expect(screen.getByText('auth.totp_prompt')).toBeInTheDocument();
  });

  it('sets auth store on successful login', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          accessToken: 'jwt-token',
          user: { id: 1, email: 'a@b.com', role: 'admin' },
        }),
    } as Response);

    renderWithProviders(<LoginPage />);

    await submitCredentials('pass');

    expect(useAuthStore.getState().accessToken).toBe('jwt-token');
  });
});
