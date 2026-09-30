import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '../store/authStore';
import { useChannelStorage } from './channelStorage';
import { api } from './client';

vi.mock('./client', () => ({ api: { get: vi.fn() } }));
const stats = { bytes: 42, fileCount: 2, checkedAt: 1_700_000_000 };

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client }, children);
  return { client, wrapper };
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.get).mockResolvedValue(stats);
  useAuthStore.setState({
    accessToken: 'signed-in',
    user: { id: 1, email: 'test@example.com', role: 'user' },
    unlockedGroupIds: [],
  });
});

describe('useChannelStorage', () => {
  it('is lazy, reuses fresh data on reopening, and isolates channels', async () => {
    const { wrapper, client } = setup();
    const { result, rerender, unmount } = renderHook(({ id, enabled }) => useChannelStorage(id, enabled), {
      wrapper,
      initialProps: { id: 1, enabled: false },
    });
    expect(api.get).not.toHaveBeenCalled();
    rerender({ id: 1, enabled: true });
    await waitFor(() => expect(result.current.data).toEqual(stats));
    expect(api.get).toHaveBeenCalledWith('/channels/1/storage');
    rerender({ id: 1, enabled: false });
    rerender({ id: 1, enabled: true });
    expect(api.get).toHaveBeenCalledTimes(1);
    rerender({ id: 2, enabled: true });
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/channels/2/storage'));
    unmount();
    client.clear();
  });

  it('revalidates an expired client snapshot', async () => {
    const { wrapper, client } = setup();
    client.setQueryData(['channelStorage', 1, '', 1], stats, { updatedAt: Date.now() - 61_000 });
    const { result, unmount } = renderHook(() => useChannelStorage(1, true), { wrapper });
    await waitFor(() => expect(result.current.isFetching).toBe(false));
    expect(api.get).toHaveBeenCalledOnce();
    unmount();
    client.clear();
  });

  it('does not fetch without authentication', () => {
    useAuthStore.setState({ accessToken: null, user: null });
    const { wrapper, client } = setup();
    const { unmount } = renderHook(() => useChannelStorage(1, true), { wrapper });
    expect(api.get).not.toHaveBeenCalled();
    unmount();
    client.clear();
  });

  it('does not reuse snapshots across users or unlock scopes', async () => {
    const { wrapper, client } = setup();
    const { result, unmount } = renderHook(() => useChannelStorage(1, true), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    act(() => useAuthStore.setState({ unlockedGroupIds: [5] }));
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2));
    act(() => useAuthStore.setState({ user: { id: 2, email: 'other@example.com', role: 'user' } }));
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(3));
    unmount();
    client.clear();
  });

  it('exposes errors without automatic retries or presenting zero bytes', async () => {
    vi.mocked(api.get).mockRejectedValue(new Error('unavailable'));
    const { wrapper, client } = setup();
    const { result, unmount } = renderHook(() => useChannelStorage(1, true), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
    expect(api.get).toHaveBeenCalledOnce();
    unmount();
    client.clear();
  });
});
