import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./client', () => ({
  api: {
    get: vi.fn().mockResolvedValue([]),
    post: vi.fn().mockResolvedValue({}),
    put: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue({}),
  },
}));

import { api } from './client';
import { filterKeys, useFilters, useCreateFilter, useUpdateFilter, useDeleteFilter, useFilterStats } from './filters';

const mockedApi = vi.mocked(api);

function createWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const Wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children);
  return { Wrapper, queryClient: qc };
}

describe('filterKeys', () => {
  it('byChannel returns correct key', () => {
    expect(filterKeys.byChannel(5)).toEqual(['filters', 5]);
  });

  it('stats returns correct key', () => {
    expect(filterKeys.stats(5)).toEqual(['filter-stats', 5]);
  });
});

describe('useFilters', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls correct endpoint', async () => {
    const { Wrapper } = createWrapper();
    renderHook(() => useFilters(1), { wrapper: Wrapper });
    await waitFor(() => expect(mockedApi.get).toHaveBeenCalledWith('/channels/1/filters'));
  });

  it('does not fetch when channelId is 0', async () => {
    const { Wrapper } = createWrapper();
    renderHook(() => useFilters(0), { wrapper: Wrapper });
    // Wait a tick
    await new Promise((r) => setTimeout(r, 50));
    expect(mockedApi.get).not.toHaveBeenCalled();
  });
});

describe('useFilterStats', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls correct endpoint', async () => {
    const { Wrapper } = createWrapper();
    renderHook(() => useFilterStats(3), { wrapper: Wrapper });
    await waitFor(() => expect(mockedApi.get).toHaveBeenCalledWith('/channels/3/filters/stats'));
  });
});

describe('useCreateFilter', () => {
  beforeEach(() => vi.clearAllMocks());

  it('posts to correct endpoint and invalidates cache', async () => {
    const { Wrapper, queryClient } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useCreateFilter(2), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync({ name: 'tag1', type: 'tag', value: 'tag1' });
    });

    expect(mockedApi.post).toHaveBeenCalledWith('/channels/2/filters', { name: 'tag1', type: 'tag', value: 'tag1' });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['filters', 2] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['news', 2] });
  });
});

describe('useUpdateFilter', () => {
  beforeEach(() => vi.clearAllMocks());

  it('puts to correct endpoint', async () => {
    const { Wrapper, queryClient } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useUpdateFilter(2), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync({ id: 10, isActive: 0 });
    });

    expect(mockedApi.put).toHaveBeenCalledWith('/channels/2/filters/10', { isActive: 0 });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['filters', 2] });
  });
});

describe('useDeleteFilter', () => {
  beforeEach(() => vi.clearAllMocks());

  it('deletes and invalidates cache', async () => {
    const { Wrapper, queryClient } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useDeleteFilter(2), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync(10);
    });

    expect(mockedApi.delete).toHaveBeenCalledWith('/channels/2/filters/10');
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['filters', 2] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['news', 2] });
  });
});
