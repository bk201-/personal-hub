import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../__tests__/renderWithProviders';
import { useAuthStore } from '../../store/authStore';
import { AuthGate } from './AuthGate';

describe('AuthGate', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    // Mock fetch for the refresh call — default: server rejects (expired / no session)
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({}),
    } as Response);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows spinner when checking auth', () => {
    useAuthStore.setState({ isCheckingAuth: true, accessToken: null });

    renderWithProviders(
      <AuthGate>
        <div>App Content</div>
      </AuthGate>,
    );

    // Ant Design Spin renders a .ant-spin element
    expect(document.querySelector('.ant-spin')).toBeInTheDocument();
    expect(screen.queryByText('App Content')).not.toBeInTheDocument();
  });

  it('shows login page when not authenticated', async () => {
    useAuthStore.setState({ isCheckingAuth: false, accessToken: null });

    renderWithProviders(
      <AuthGate>
        <div>App Content</div>
      </AuthGate>,
    );

    await waitFor(() => {
      // LoginPage renders the login button
      expect(screen.getByText('auth.login_button')).toBeInTheDocument();
    });
    expect(screen.queryByText('App Content')).not.toBeInTheDocument();
  });

  it('renders children when authenticated', () => {
    useAuthStore.setState({
      isCheckingAuth: false,
      accessToken: 'valid-token',
      user: { id: 1, email: 'a@b.com', role: 'admin' },
    });

    renderWithProviders(
      <AuthGate>
        <div>App Content</div>
      </AuthGate>,
    );

    // isRetry=false on mount — does NOT call setCheckingAuth(true), so existing state preserved
    expect(screen.getByText('App Content')).toBeInTheDocument();
  });

  it('calls /api/auth/refresh on mount', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({}),
    } as Response);

    useAuthStore.setState({ isCheckingAuth: true, accessToken: null });

    renderWithProviders(
      <AuthGate>
        <div>App Content</div>
      </AuthGate>,
    );

    expect(fetchSpy).toHaveBeenCalledWith('/api/auth/refresh', expect.objectContaining({ method: 'POST' }));
  });

  it('restores session from cookie on successful refresh', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          accessToken: 'restored-token',
          user: { id: 1, email: 'a@b.com', role: 'admin' },
        }),
    } as Response);

    useAuthStore.setState({ isCheckingAuth: true, accessToken: null });

    renderWithProviders(
      <AuthGate>
        <div>App Content</div>
      </AuthGate>,
    );

    await waitFor(() => {
      expect(useAuthStore.getState().accessToken).toBe('restored-token');
    });
  });

  it('shows "no connection" screen on network error during initial load', async () => {
    // Use fake timers to skip fetchWithNetworkRetry retry delays (500ms + 1s + 2s)
    vi.useFakeTimers();
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));

    useAuthStore.setState({ isCheckingAuth: true, accessToken: null });

    renderWithProviders(
      <AuthGate>
        <div>App Content</div>
      </AuthGate>,
    );

    // Flush all timers (retry delays) and resulting promise chains
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(screen.getByText('auth.noConnection')).toBeInTheDocument();
    expect(screen.queryByText('App Content')).not.toBeInTheDocument();
    // Must NOT show the login page — session may still be valid once network recovers
    expect(screen.queryByText('auth.login_button')).not.toBeInTheDocument();
  });

  it('retries session restore when Retry button is clicked after network error', async () => {
    vi.useFakeTimers();
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));

    useAuthStore.setState({ isCheckingAuth: true, accessToken: null });

    renderWithProviders(
      <AuthGate>
        <div>App Content</div>
      </AuthGate>,
    );

    // Skip initial retry delays → "no connection" screen appears
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(screen.getByText('auth.noConnection')).toBeInTheDocument();

    // Now next calls succeed
    fetchSpy.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          accessToken: 'recovered-token',
          user: { id: 1, email: 'a@b.com', role: 'admin' },
        }),
    } as Response);

    fireEvent.click(screen.getByText('auth.retry'));

    // Flush again (setCheckingAuth(true) → spinner → tryRefresh → resolves)
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(useAuthStore.getState().accessToken).toBe('recovered-token');
  });
});
