import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { theme } from 'antd';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HeaderBar, LanguageSwitcher, RateLimitBanner, ThemeProvider, ThemeToggle, UserMenu } from './ui.js';

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
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('shared UI contract', () => {
  it('leaves product content and actions with the application', () => {
    const toggle = vi.fn();
    render(
      <HeaderBar compact actions={<ThemeToggle isDark onClick={toggle} lightLabel="Light" darkLabel="Dark" />}>
        <span>Vocabulary</span>
      </HeaderBar>,
    );
    expect(screen.getByText('Vocabulary')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Light' }));
    expect(toggle).toHaveBeenCalledOnce();
  });

  it('allows language changes without bubbling into the surrounding menu', () => {
    const onChange = vi.fn();
    const outerClick = vi.fn();
    render(
      <div onClick={outerClick}>
        <LanguageSwitcher
          label="Language"
          value="en"
          onChange={onChange}
          languages={[
            { value: 'en', label: 'EN' },
            { value: 'ru', label: 'RU' },
          ]}
        />
      </div>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'RU' }));
    expect(onChange).toHaveBeenCalledWith('ru');
    expect(outerClick).not.toHaveBeenCalled();
  });

  it('retains app-owned user-menu actions', async () => {
    const logout = vi.fn();
    render(<UserMenu label="Account" items={[{ key: 'logout', label: 'Sign out', onClick: logout }]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Account' }));
    fireEvent.click(await screen.findByText('Sign out'));
    expect(logout).toHaveBeenCalledOnce();
  });

  it('keeps an active rate-limit banner until its deadline', async () => {
    vi.useFakeTimers();
    const onExpired = vi.fn();
    render(
      <RateLimitBanner
        until={Date.now() + 2_000}
        onExpired={onExpired}
        message={(seconds) => `Wait ${seconds}`}
        description="Slow down"
      />,
    );
    expect(screen.getByText('Wait 2')).toBeDefined();
    expect(onExpired).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
    expect(screen.getByText('Wait 1')).toBeDefined();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
    expect(screen.queryByRole('alert')).toBeNull();
    expect(onExpired).toHaveBeenCalledOnce();
  });

  it('applies the selected theme while retaining a separate app token prefix', () => {
    function Consumer() {
      const { token } = theme.useToken();
      return <span data-testid="token">{token.colorBgBase}</span>;
    }
    const { rerender } = render(
      <ThemeProvider prefix="news" isDark={false}>
        <Consumer />
      </ThemeProvider>,
    );
    const light = screen.getByTestId('token').textContent;
    rerender(
      <ThemeProvider prefix="news" isDark>
        <Consumer />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('token').textContent).not.toBe(light);
  });
});
