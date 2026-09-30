import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./client', () => ({
  api: {
    get: vi.fn().mockResolvedValue([]),
    post: vi.fn().mockResolvedValue({ success: true }),
    put: vi.fn().mockResolvedValue({}),
    patch: vi.fn().mockResolvedValue({ ok: true }),
    delete: vi.fn().mockResolvedValue({}),
  },
}));

const mockUpdateToken = vi.fn();
vi.mock('../store/authStore', () => ({
  useAuthStore: (selector: (s: { updateToken: typeof mockUpdateToken }) => unknown) =>
    selector({ updateToken: mockUpdateToken }),
}));

import { api } from './client';
import {
  groupKeys,
  useGroups,
  useCreateGroup,
  useUpdateGroup,
  useDeleteGroup,
  useVerifyGroupPIN,
  useReorderGroups,
  useLockAllGroups,
} from './groups';

const mockedApi = vi.mocked(api);

function createWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const Wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children);
  return { Wrapper, queryClient: qc };
}

describe('groupKeys', () => {
  it('all returns correct key', () => {
    expect(groupKeys.all).toEqual(['groups']);
  });
});

describe('useGroups', () => {
  beforeEach(() => vi.clearAllMocks());

  it('fetches from /groups', async () => {
    const { Wrapper } = createWrapper();
    renderHook(() => useGroups(), { wrapper: Wrapper });
    await waitFor(() => expect(mockedApi.get).toHaveBeenCalledWith('/groups'));
  });
});

describe('useCreateGroup', () => {
  beforeEach(() => vi.clearAllMocks());

  it('posts and invalidates groups', async () => {
    const { Wrapper, queryClient } = createWrapper();
    const spy = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useCreateGroup(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync({ name: 'G1', color: '#f00' });
    });

    expect(mockedApi.post).toHaveBeenCalledWith('/groups', { name: 'G1', color: '#f00' });
    expect(spy).toHaveBeenCalledWith({ queryKey: groupKeys.all });
  });
});

describe('useUpdateGroup', () => {
  beforeEach(() => vi.clearAllMocks());

  it('puts and invalidates', async () => {
    const { Wrapper, queryClient } = createWrapper();
    const spy = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useUpdateGroup(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync({ id: 1, name: 'Updated' });
    });

    expect(mockedApi.put).toHaveBeenCalledWith('/groups/1', { name: 'Updated' });
    expect(spy).toHaveBeenCalledWith({ queryKey: groupKeys.all });
  });
});

describe('useDeleteGroup', () => {
  beforeEach(() => vi.clearAllMocks());

  it('deletes and invalidates groups + channels', async () => {
    const { Wrapper, queryClient } = createWrapper();
    const spy = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useDeleteGroup(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync(5);
    });

    expect(mockedApi.delete).toHaveBeenCalledWith('/groups/5');
    expect(spy).toHaveBeenCalledWith({ queryKey: groupKeys.all });
    expect(spy).toHaveBeenCalledWith({ queryKey: ['channels'] });
  });
});

describe('useVerifyGroupPIN', () => {
  beforeEach(() => vi.clearAllMocks());

  it('posts PIN and calls updateToken on success', async () => {
    mockedApi.post.mockResolvedValueOnce({
      success: true,
      accessToken: 'new-token',
      unlockedGroupIds: [1, 2],
    });

    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useVerifyGroupPIN(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync({ id: 3, pin: '1234' });
    });

    expect(mockedApi.post).toHaveBeenCalledWith('/groups/3/verify-pin', { pin: '1234' });
    expect(mockUpdateToken).toHaveBeenCalledWith('new-token');
  });

  it('does not call updateToken when no accessToken in response', async () => {
    mockedApi.post.mockResolvedValueOnce({ success: true });

    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useVerifyGroupPIN(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync({ id: 3, pin: '1234' });
    });

    expect(mockUpdateToken).not.toHaveBeenCalled();
  });
});

describe('useReorderGroups', () => {
  beforeEach(() => vi.clearAllMocks());

  it('patches and invalidates', async () => {
    const { Wrapper, queryClient } = createWrapper();
    const spy = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useReorderGroups(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync([{ id: 1, sortOrder: 0 }]);
    });

    expect(mockedApi.patch).toHaveBeenCalledWith('/groups/reorder', { items: [{ id: 1, sortOrder: 0 }] });
    expect(spy).toHaveBeenCalledWith({ queryKey: groupKeys.all });
  });
});

describe('useLockAllGroups', () => {
  beforeEach(() => vi.clearAllMocks());

  it('posts and calls updateToken', async () => {
    mockedApi.post.mockResolvedValueOnce({ success: true, accessToken: 'locked-token' });

    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useLockAllGroups(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync();
    });

    expect(mockedApi.post).toHaveBeenCalledWith('/groups/lock-all', {});
    expect(mockUpdateToken).toHaveBeenCalledWith('locked-token');
  });
});
