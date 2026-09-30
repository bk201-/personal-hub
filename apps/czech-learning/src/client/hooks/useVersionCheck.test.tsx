// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useVersionCheck } from './useVersionCheck';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it('uses build identity in Czech without reloading the vocabulary editor', async () => {
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
  const fetcher = vi
    .fn()
    .mockResolvedValue({ ok: true, json: async () => ({ version: '1.0.0', buildId: 'czech:second' }) });
  const reloadPage = vi.fn();
  const { result } = renderHook(() =>
    useVersionCheck({
      isDev: false,
      clientBuildId: 'czech:first',
      fetcher,
      reloadPage,
    }),
  );
  await act(async () => {});
  expect(result.current.newVersionAvailable).toBe(true);
  expect(reloadPage).not.toHaveBeenCalled();
  act(() => result.current.dismiss());
  expect(result.current.newVersionAvailable).toBe(false);
});
