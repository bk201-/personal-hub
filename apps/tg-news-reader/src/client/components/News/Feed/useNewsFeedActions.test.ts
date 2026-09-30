import type { Channel, NewsItem } from '@shared/types';
import { act } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHookWithProviders } from '../../../__tests__/renderWithProviders';

// ── Mocks ──────────────────────────────────────────────────────────────
const mockMarkAllReadMutate = vi.fn();
const mockMarkReadMutate = vi.fn();
const mockFetchChannelMutate = vi.fn();
const mockCreateFilterMutateAsync = vi.fn().mockResolvedValue({});
const mockMarkReadAndFetchMutate = vi.fn();

let mockMarkReadIsPending = false;

vi.mock('../../../api/news', () => ({
  useMarkAllRead: () => ({ mutate: mockMarkAllReadMutate }),
  useMarkRead: () => ({ mutate: mockMarkReadMutate, isPending: mockMarkReadIsPending }),
}));

vi.mock('../../../api/filters', () => ({
  useCreateFilter: () => ({ mutateAsync: mockCreateFilterMutateAsync }),
}));

const mockAllChannels: Channel[] = [];
vi.mock('../../../api/channels', () => ({
  channelKeys: { fetch: ['channels', 'fetch'] },
  useFetchChannel: () => ({ mutate: mockFetchChannelMutate }),
  useChannels: () => ({ data: mockAllChannels }),
  useMarkReadAndFetch: () => ({ mutate: mockMarkReadAndFetchMutate }),
}));

import { useUIStore } from '../../../store/uiStore';
import { useNewsFeedActions } from './useNewsFeedActions';

function makeItem(id: number, overrides: Partial<NewsItem> = {}): NewsItem {
  return {
    id,
    channelId: 1,
    telegramMsgId: id * 10,
    text: `item-${id}`,
    links: [],
    hashtags: [],
    isRead: 0,
    postedAt: 1700000000 + id,
    ...overrides,
  };
}

function makeChannel(id: number, overrides: Partial<Channel> = {}): Channel {
  return {
    id,
    telegramId: `ch${id}`,
    name: `Channel ${id}`,
    channelType: 'news',
    filterForwards: 0,
    sortOrder: id,
    isUnavailable: 0,
    unreadCount: 5,
    totalNewsCount: 10,
    createdAt: 1700000000,
    supportsDigest: true,
    groupId: null,
    ...overrides,
  };
}

describe('useNewsFeedActions', () => {
  const channel = makeChannel(1);
  const setMediaProgressKey = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockMarkReadIsPending = false;
    mockAllChannels.length = 0;
    mockAllChannels.push(makeChannel(1), makeChannel(2), makeChannel(3));
    useUIStore.setState({
      selectedNewsId: null,
      newsFilterMode: 'filtered',
      autoAdvance: false,
      hashTagFilter: null,
    });
  });

  const renderActions = (items: NewsItem[], unread = 5, filteredOut = 0) =>
    renderHookWithProviders(() => useNewsFeedActions(channel, items, unread, filteredOut, setMediaProgressKey));

  it('handleSpaceKey marks unread item as read and advances', () => {
    const items = [makeItem(1, { isRead: 0 }), makeItem(2, { isRead: 0 })];
    const { result } = renderActions(items);

    act(() => {
      result.current.handleSpaceKey(items[0]);
    });

    expect(mockMarkReadMutate).toHaveBeenCalledWith(
      { id: 1, isRead: 1, channelId: 1 },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
  });

  it('handleSpaceKey on read item fetches when no next unread', () => {
    const items = [makeItem(1, { isRead: 1 })];
    const { result } = renderActions(items);

    act(() => {
      result.current.handleSpaceKey(items[0]);
    });

    expect(mockFetchChannelMutate).toHaveBeenCalledWith(
      { id: 1 },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
  });

  it('handleSpaceKey on read item advances to next unread', () => {
    const items = [makeItem(1, { isRead: 1 }), makeItem(2, { isRead: 0 })];
    const setSelectedNewsId = vi.fn();
    useUIStore.setState({ setSelectedNewsId });
    const { result } = renderActions(items);

    act(() => {
      result.current.handleSpaceKey(items[0]);
    });

    expect(setSelectedNewsId).toHaveBeenCalledWith(2);
  });

  it('handleMarkedRead selects next unread item', () => {
    const items = [makeItem(1, { isRead: 0 }), makeItem(2, { isRead: 0 }), makeItem(3, { isRead: 1 })];
    const setSelectedNewsId = vi.fn();
    useUIStore.setState({ setSelectedNewsId });
    const { result } = renderActions(items);

    act(() => {
      result.current.handleMarkedRead(1);
    });

    expect(setSelectedNewsId).toHaveBeenCalledWith(2);
  });

  // Regression: previously, finishing the last visible item while a hashtag filter was active
  // would call markAllRead({ channelId }) and silently mark every other unread news as read,
  // losing news that didn't match the tag.
  it('handleMarkedRead does NOT mark whole channel as read when hashTagFilter is active', () => {
    const items = [makeItem(1, { isRead: 0 })]; // last visible (filtered) unread
    useUIStore.setState({ newsFilterMode: 'filtered', hashTagFilter: '#tech' });
    // serverFilteredOut > 0 to simulate user-filter-hidden items present
    const { result } = renderActions(items, 5, 3);

    act(() => {
      result.current.handleMarkedRead(1);
    });

    expect(mockMarkAllReadMutate).not.toHaveBeenCalled();
  });

  // Original semantics preserved: when there's NO tag filter, finishing the last visible item
  // while server-filtered items exist still triggers the channel-wide mark-read sweep.
  it('handleMarkedRead marks whole channel as read when no hashTagFilter and serverFilteredOut>0', () => {
    const items = [makeItem(1, { isRead: 0 })];
    useUIStore.setState({ newsFilterMode: 'filtered', hashTagFilter: null });
    const { result } = renderActions(items, 5, 3);

    act(() => {
      result.current.handleMarkedRead(1);
    });

    expect(mockMarkAllReadMutate).toHaveBeenCalledWith({ channelId: 1 });
  });

  it('handleMarkedRead does NOT sweep channel when newsFilterMode is "hidden"', () => {
    // In hidden mode, finishing the last visible item must NOT mark the whole
    // channel as read — that would silently mark the non-hidden items the user
    // intentionally left out of view.
    const items = [makeItem(1, { isRead: 0 })];
    useUIStore.setState({ newsFilterMode: 'hidden', hashTagFilter: null });
    const { result } = renderActions(items, 5, 3);

    act(() => {
      result.current.handleMarkedRead(1);
    });

    expect(mockMarkAllReadMutate).not.toHaveBeenCalled();
  });

  it('handleTagClick addFilter creates a filter', async () => {
    const { result } = renderActions([]);

    await act(async () => {
      result.current.handleTagClick('#tech', 'addFilter');
    });

    expect(mockCreateFilterMutateAsync).toHaveBeenCalledWith({
      name: '#tech',
      type: 'tag',
      value: '#tech',
    });
  });

  it('goToNextChannel advances to next channel in same group', () => {
    const setSelectedChannelId = vi.fn();
    useUIStore.setState({ setSelectedChannelId });
    const { result } = renderActions([]);

    act(() => {
      result.current.goToNextChannel();
    });

    expect(setSelectedChannelId).toHaveBeenCalledWith(2);
  });

  it('goToNextChannel wraps around', () => {
    const ch3 = makeChannel(3);
    const setSelectedChannelId = vi.fn();
    useUIStore.setState({ setSelectedChannelId });
    const { result } = renderHookWithProviders(() => useNewsFeedActions(ch3, [], 0, 0, setMediaProgressKey));

    act(() => {
      result.current.goToNextChannel();
    });

    expect(setSelectedChannelId).toHaveBeenCalledWith(1);
  });

  it('handleMarkAllReadAndAdvance without autoAdvance just marks all read', () => {
    useUIStore.setState({ autoAdvance: false });
    const { result } = renderActions([]);

    act(() => {
      result.current.handleMarkAllReadAndAdvance();
    });

    expect(mockMarkAllReadMutate).toHaveBeenCalledWith(
      { channelId: 1 },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
    expect(mockMarkReadAndFetchMutate).not.toHaveBeenCalled();
  });

  it('handleMarkAllReadAndAdvance with autoAdvance uses markReadAndFetch', () => {
    useUIStore.setState({ autoAdvance: true });
    const { result } = renderActions([]);

    act(() => {
      result.current.handleMarkAllReadAndAdvance();
    });

    expect(mockMarkReadAndFetchMutate).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
  });

  it('handleMarkAllReadAndAdvance in "hidden" mode marks only currently loaded items', () => {
    // The user is looking at the hidden-only view; mark-all must NOT sweep the
    // whole channel (that would silently mark all the non-hidden items too).
    useUIStore.setState({ autoAdvance: false, newsFilterMode: 'hidden' });
    const items = [makeItem(11), makeItem(12)];
    const { result } = renderActions(items);

    act(() => {
      result.current.handleMarkAllReadAndAdvance();
    });

    expect(mockMarkAllReadMutate).toHaveBeenCalledWith(
      { newsIds: [11, 12] },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
    expect(mockMarkReadAndFetchMutate).not.toHaveBeenCalled();
  });

  it('handleMarkAllReadAndAdvance in "hidden" mode with empty list is a no-op', () => {
    useUIStore.setState({ autoAdvance: false, newsFilterMode: 'hidden' });
    const { result } = renderActions([]);

    act(() => {
      result.current.handleMarkAllReadAndAdvance();
    });

    expect(mockMarkAllReadMutate).not.toHaveBeenCalled();
    expect(mockMarkReadAndFetchMutate).not.toHaveBeenCalled();
  });

  it('never sends an empty scoped ID list when the hashtag view is empty', () => {
    useUIStore.setState({ hashTagFilter: '#tech' });
    const { result } = renderActions([]);
    act(() => result.current.handleMarkAllReadAndAdvance());
    expect(mockMarkAllReadMutate).not.toHaveBeenCalled();
  });

  it('handleMarkAllReadAndAdvance in "all" mode still marks whole channel', () => {
    useUIStore.setState({ autoAdvance: false, newsFilterMode: 'all' });
    const items = [makeItem(20), makeItem(21)];
    const { result } = renderActions(items);

    act(() => {
      result.current.handleMarkAllReadAndAdvance();
    });

    expect(mockMarkAllReadMutate).toHaveBeenCalledWith(
      { channelId: 1 },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
  });

  // ── Undo-toggle: second click reverts the previous bulk mark ───────────────

  describe('mark-all undo toggle', () => {
    function firstClickThen(callbackArg: (cb: (data: { success: true; affectedIds: number[] }) => void) => void) {
      // Helper: trigger the onSuccess callback from the most recent mutate call
      // with a controlled `affectedIds` payload so we can drive the snapshot state.
      const lastCall = mockMarkAllReadMutate.mock.calls.at(-1);
      const onSuccess = lastCall?.[1]?.onSuccess as (data: { success: true; affectedIds: number[] }) => void;
      expect(onSuccess).toBeTypeOf('function');
      callbackArg(onSuccess);
    }

    it.each(['default', 'period'] as const)('starts a fresh mark after a %s refresh replaces the view', (refresh) => {
      useUIStore.setState({ newsFilterMode: 'hidden' });
      const { result, rerender } = renderHookWithProviders(
        ({ items }: { items: NewsItem[] }) => useNewsFeedActions(channel, items, 5, 0, setMediaProgressKey),
        { initialProps: { items: [makeItem(11), makeItem(12)] } },
      );
      act(() => result.current.handleMarkAllReadAndAdvance());
      act(() => firstClickThen((cb) => cb({ success: true, affectedIds: [11, 12] })));
      act(() => {
        if (refresh === 'default') result.current.handleFetchDefault();
        else result.current.handleFetchPeriod('3');
      });
      act(() => mockFetchChannelMutate.mock.calls.at(-1)?.[1]?.onSuccess({ inserted: 0 }));
      rerender({ items: [makeItem(21), makeItem(22)] });
      mockMarkAllReadMutate.mockClear();
      act(() => result.current.handleMarkAllReadAndAdvance());
      expect(mockMarkAllReadMutate).toHaveBeenCalledWith(
        { newsIds: [21, 22] },
        expect.objectContaining({ onSuccess: expect.any(Function) }),
      );
    });

    it('does not restore a stale undo when mark-all finishes after refresh starts', () => {
      const { result } = renderActions([]);
      act(() => result.current.handleMarkAllReadAndAdvance());
      act(() => result.current.handleFetchDefault());
      act(() => firstClickThen((cb) => cb({ success: true, affectedIds: [11, 12] })));
      mockMarkAllReadMutate.mockClear();
      act(() => result.current.handleMarkAllReadAndAdvance());
      expect(mockMarkAllReadMutate).toHaveBeenCalledWith(
        { channelId: 1 },
        expect.objectContaining({ onSuccess: expect.any(Function) }),
      );
    });

    it('starts a fresh mark after changing the view filter mode', () => {
      const { result } = renderActions([makeItem(21)]);
      act(() => result.current.handleMarkAllReadAndAdvance());
      act(() => firstClickThen((cb) => cb({ success: true, affectedIds: [11, 12] })));
      act(() => useUIStore.setState({ newsFilterMode: 'hidden' }));
      mockMarkAllReadMutate.mockClear();
      act(() => result.current.handleMarkAllReadAndAdvance());
      expect(mockMarkAllReadMutate).toHaveBeenCalledWith(
        { newsIds: [21] },
        expect.objectContaining({ onSuccess: expect.any(Function) }),
      );
    });

    it('second click sends isRead=0 with the affectedIds from the first click', () => {
      useUIStore.setState({ autoAdvance: false, newsFilterMode: 'filtered' });
      const { result } = renderActions([]);

      // First click: full-channel mark
      act(() => {
        result.current.handleMarkAllReadAndAdvance();
      });
      // Simulate the server returning the IDs it just flipped
      act(() => {
        firstClickThen((cb) => cb({ success: true, affectedIds: [101, 102, 103] }));
      });

      mockMarkAllReadMutate.mockClear();

      // Second click: should undo using the captured IDs
      act(() => {
        result.current.handleMarkAllReadAndAdvance();
      });

      expect(mockMarkAllReadMutate).toHaveBeenCalledWith({ newsIds: [101, 102, 103], isRead: 0 });
    });

    it('third click after undo behaves like a fresh first click (no infinite toggle)', () => {
      useUIStore.setState({ autoAdvance: false, newsFilterMode: 'filtered' });
      const { result } = renderActions([]);

      // 1st click + capture
      act(() => result.current.handleMarkAllReadAndAdvance());
      act(() => firstClickThen((cb) => cb({ success: true, affectedIds: [50, 51] })));

      // 2nd click (undo)
      act(() => result.current.handleMarkAllReadAndAdvance());

      mockMarkAllReadMutate.mockClear();

      // 3rd click: should be a normal mark again, NOT another undo
      act(() => result.current.handleMarkAllReadAndAdvance());
      expect(mockMarkAllReadMutate).toHaveBeenCalledWith(
        { channelId: 1 },
        expect.objectContaining({ onSuccess: expect.any(Function) }),
      );
    });

    it('does not capture a snapshot when nothing was actually flipped', () => {
      useUIStore.setState({ autoAdvance: false });
      const { result } = renderActions([]);

      act(() => result.current.handleMarkAllReadAndAdvance());
      act(() => firstClickThen((cb) => cb({ success: true, affectedIds: [] })));

      mockMarkAllReadMutate.mockClear();

      // Next click: still a normal mark (no leftover empty snapshot triggering undo)
      act(() => result.current.handleMarkAllReadAndAdvance());
      expect(mockMarkAllReadMutate).toHaveBeenCalledWith(
        { channelId: 1 },
        expect.objectContaining({ onSuccess: expect.any(Function) }),
      );
    });

    it('snapshot is cleared when the user changes channel', () => {
      const setSelectedChannelId = vi.fn();
      useUIStore.setState({ autoAdvance: false, setSelectedChannelId });

      const otherChannel = makeChannel(2);
      const { result, rerender } = renderHookWithProviders(
        ({ ch }: { ch: Channel }) => useNewsFeedActions(ch, [], 5, 0, setMediaProgressKey),
        { initialProps: { ch: channel } },
      );

      // 1st click on channel 1 + capture
      act(() => result.current.handleMarkAllReadAndAdvance());
      {
        const onSuccess = mockMarkAllReadMutate.mock.calls.at(-1)?.[1]?.onSuccess as (d: {
          success: true;
          affectedIds: number[];
        }) => void;
        act(() => onSuccess({ success: true, affectedIds: [9, 10] }));
      }

      // Switch to channel 2 → the snapshot for channel 1 must NOT survive
      rerender({ ch: otherChannel });

      mockMarkAllReadMutate.mockClear();

      // Click on channel 2: should be a normal mark, NOT an undo for channel 1
      act(() => result.current.handleMarkAllReadAndAdvance());
      expect(mockMarkAllReadMutate).toHaveBeenCalledWith(
        { channelId: 2 },
        expect.objectContaining({ onSuccess: expect.any(Function) }),
      );
    });

    it('snapshot is cleared when the user changes the hashtag filter', () => {
      useUIStore.setState({ autoAdvance: false, hashTagFilter: null });

      const items = [makeItem(30), makeItem(31)];
      const { result } = renderActions(items);

      // 1st click + capture (no hashtag → full channel sweep)
      act(() => result.current.handleMarkAllReadAndAdvance());
      {
        const onSuccess = mockMarkAllReadMutate.mock.calls.at(-1)?.[1]?.onSuccess as (d: {
          success: true;
          affectedIds: number[];
        }) => void;
        act(() => onSuccess({ success: true, affectedIds: [30, 31] }));
      }

      // Activate hashtag filter — should invalidate the snapshot
      act(() => useUIStore.setState({ hashTagFilter: '#tech' }));

      mockMarkAllReadMutate.mockClear();

      // Click now should be a fresh mark (newsIds path because hashTagFilter is active)
      act(() => result.current.handleMarkAllReadAndAdvance());
      expect(mockMarkAllReadMutate).toHaveBeenCalledWith(
        { newsIds: [30, 31] },
        expect.objectContaining({ onSuccess: expect.any(Function) }),
      );
    });
  });
});
