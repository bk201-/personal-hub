import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useVersionCheck, VersionBanner } from './version.js';

const payload = (buildId: unknown, version = '1.0.0') => ({
  ok: true,
  json: async () => ({ buildId, version }),
});

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('build update contract', () => {
  it('detects a rebuild at the same semver, but never reloads automatically', async () => {
    const fetcher = vi.fn().mockResolvedValue(payload('news:build-b'));
    const reloadPage = vi.fn();
    const { result } = renderHook(() => useVersionCheck({ clientBuildId: 'news:build-a', fetcher, reloadPage }));
    await act(async () => {});
    expect(result.current.newVersionAvailable).toBe(true);
    expect(reloadPage).not.toHaveBeenCalled();
    expect(fetcher).toHaveBeenCalledWith('/api/version', {
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    });
    act(() => result.current.reload());
    expect(reloadPage).toHaveBeenCalledOnce();
  });

  it('dismisses one build, and shows the next build without an intermediate match', async () => {
    const fetcher = vi.fn().mockResolvedValue(payload('news:build-b'));
    const { result } = renderHook(() => useVersionCheck({ clientBuildId: 'news:build-a', intervalMs: 1_000, fetcher }));
    await act(async () => {});
    act(() => result.current.dismiss());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
    expect(result.current.newVersionAvailable).toBe(false);
    fetcher.mockResolvedValue(payload('news:build-c'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
    expect(result.current.newVersionAvailable).toBe(true);
  });

  it.each([null, '', 1, undefined])(
    'ignores invalid build identity %s instead of comparing semver',
    async (buildId) => {
      const fetcher = vi.fn().mockResolvedValue(payload(buildId, '99.0.0'));
      const { result } = renderHook(() => useVersionCheck({ clientBuildId: 'czech:a', fetcher }));
      await act(async () => {});
      expect(result.current.newVersionAvailable).toBe(false);
    },
  );

  it('does not show matching builds or failed checks', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(payload('czech:a'))
      .mockResolvedValueOnce({ ok: false, json: async () => ({ buildId: 'czech:b' }) })
      .mockRejectedValueOnce(new TypeError('offline'));
    const { result } = renderHook(() => useVersionCheck({ clientBuildId: 'czech:a', intervalMs: 1_000, fetcher }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });
    expect(result.current.newVersionAvailable).toBe(false);
  });

  it('pauses hidden tabs and dev mode, catches up on visibility, and cleans up', async () => {
    const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    const fetcher = vi.fn().mockResolvedValue(payload('czech:b'));
    const { unmount } = renderHook(() => useVersionCheck({ clientBuildId: 'czech:a', fetcher, intervalMs: 1_000 }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000);
    });
    expect(fetcher).not.toHaveBeenCalled();
    hidden.mockReturnValue(false);
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(fetcher).toHaveBeenCalledOnce();
    unmount();
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
      await vi.advanceTimersByTimeAsync(3_000);
    });
    expect(fetcher).toHaveBeenCalledOnce();
    renderHook(() => useVersionCheck({ clientBuildId: 'dev', fetcher, isDev: true, intervalMs: 1_000 }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000);
    });
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it('does not overlap requests and ignores a response after unmount', async () => {
    let finish!: (value: ReturnType<typeof payload>) => void;
    const fetcher = vi.fn(
      () =>
        new Promise<ReturnType<typeof payload>>((resolve) => {
          finish = resolve;
        }),
    );
    const { result, unmount } = renderHook(() => useVersionCheck({ clientBuildId: 'a', fetcher, intervalMs: 1_000 }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });
    expect(fetcher).toHaveBeenCalledOnce();
    unmount();
    await act(async () => {
      finish(payload('b'));
    });
    expect(result.current.newVersionAvailable).toBe(false);
  });

  it('offers explicit reload and dismissal without unmounting unsaved work', () => {
    const reload = vi.fn();
    const dismiss = vi.fn();
    render(
      <>
        <input aria-label="Unsaved word" defaultValue="Příliš žluťoučký" />
        <VersionBanner
          newVersionAvailable
          reload={reload}
          dismiss={dismiss}
          message="New build"
          reloadLabel="Reload"
          dismissLabel="Dismiss"
        />
      </>,
    );
    expect(screen.getByRole('status').textContent).toContain('New build');
    expect(reload).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(dismiss).toHaveBeenCalledOnce();
    expect(screen.getByLabelText('Unsaved word').value).toBe('Příliš žluťoučký');
    fireEvent.click(screen.getByRole('button', { name: 'Reload' }));
    expect(reload).toHaveBeenCalledOnce();
  });
});
