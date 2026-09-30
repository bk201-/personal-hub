import type { Channel } from '@shared/types';
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock dependencies
const mockChannels: Channel[] = [];
vi.mock('../../api/channels', () => ({
  useChannels: () => ({ data: mockChannels }),
}));

let mockSelectedChannelId: number | null = null;
let mockSelectedGroupId: number | null = null;
const mockSetSelectedChannelId = vi.fn();

vi.mock('../../store/uiStore', () => ({
  useUIStore: () => ({
    selectedChannelId: mockSelectedChannelId,
    setSelectedChannelId: mockSetSelectedChannelId,
    selectedGroupId: mockSelectedGroupId,
  }),
}));

// Import after mocks
import { useChannelHotkeys } from './useChannelHotkeys';

function makeChannel(id: number, groupId: number | null, sortOrder: number): Channel {
  return {
    id,
    telegramId: `ch${id}`,
    name: `Channel ${id}`,
    channelType: 'news',
    sortOrder,
    groupId,
    isUnavailable: 0,
    unreadCount: 0,
    totalNewsCount: 0,
    createdAt: 1700000000,
    supportsDigest: true,
  };
}

function fireKey(code: string, opts: Partial<KeyboardEvent> = {}) {
  const event = new KeyboardEvent('keydown', { code, bubbles: true, cancelable: true, ...opts });
  document.body.dispatchEvent(event);
}

function fireKeyWithTarget(code: string, target: HTMLElement) {
  const event = new KeyboardEvent('keydown', { code, bubbles: true, cancelable: true });
  target.dispatchEvent(event);
}

describe('useChannelHotkeys', () => {
  beforeEach(() => {
    mockSetSelectedChannelId.mockClear();
    mockSelectedChannelId = null;
    mockSelectedGroupId = null;
    mockChannels.length = 0;
  });

  it('] selects first channel when none selected', () => {
    mockChannels.push(makeChannel(1, null, 0), makeChannel(2, null, 1));
    renderHook(() => useChannelHotkeys());
    fireKey('BracketRight');
    expect(mockSetSelectedChannelId).toHaveBeenCalledWith(1);
  });

  it('[ selects first channel when none selected', () => {
    mockChannels.push(makeChannel(1, null, 0), makeChannel(2, null, 1));
    renderHook(() => useChannelHotkeys());
    fireKey('BracketLeft');
    expect(mockSetSelectedChannelId).toHaveBeenCalledWith(1);
  });

  it('] moves to next channel', () => {
    mockChannels.push(makeChannel(1, null, 0), makeChannel(2, null, 1), makeChannel(3, null, 2));
    mockSelectedChannelId = 1;
    renderHook(() => useChannelHotkeys());
    fireKey('BracketRight');
    expect(mockSetSelectedChannelId).toHaveBeenCalledWith(2);
  });

  it('[ moves to previous channel', () => {
    mockChannels.push(makeChannel(1, null, 0), makeChannel(2, null, 1), makeChannel(3, null, 2));
    mockSelectedChannelId = 2;
    renderHook(() => useChannelHotkeys());
    fireKey('BracketLeft');
    expect(mockSetSelectedChannelId).toHaveBeenCalledWith(1);
  });

  it('] clamps at last channel', () => {
    mockChannels.push(makeChannel(1, null, 0), makeChannel(2, null, 1));
    mockSelectedChannelId = 2;
    renderHook(() => useChannelHotkeys());
    fireKey('BracketRight');
    expect(mockSetSelectedChannelId).toHaveBeenCalledWith(2);
  });

  it('[ clamps at first channel', () => {
    mockChannels.push(makeChannel(1, null, 0), makeChannel(2, null, 1));
    mockSelectedChannelId = 1;
    renderHook(() => useChannelHotkeys());
    fireKey('BracketLeft');
    expect(mockSetSelectedChannelId).toHaveBeenCalledWith(1);
  });

  it('does nothing when channel list is empty', () => {
    renderHook(() => useChannelHotkeys());
    fireKey('BracketRight');
    expect(mockSetSelectedChannelId).not.toHaveBeenCalled();
  });

  it('filters channels by selected group', () => {
    mockChannels.push(makeChannel(1, null, 0), makeChannel(2, 5, 0), makeChannel(3, 5, 1));
    mockSelectedGroupId = 5;
    mockSelectedChannelId = 2;
    renderHook(() => useChannelHotkeys());
    fireKey('BracketRight');
    expect(mockSetSelectedChannelId).toHaveBeenCalledWith(3);
  });

  it('shows ungrouped channels when selectedGroupId is null', () => {
    mockChannels.push(makeChannel(1, null, 0), makeChannel(2, 5, 0), makeChannel(3, null, 1));
    mockSelectedGroupId = null;
    mockSelectedChannelId = 1;
    renderHook(() => useChannelHotkeys());
    fireKey('BracketRight');
    expect(mockSetSelectedChannelId).toHaveBeenCalledWith(3);
  });

  // Guards
  it('ignores modifier keys', () => {
    mockChannels.push(makeChannel(1, null, 0));
    renderHook(() => useChannelHotkeys());
    fireKey('BracketRight', { metaKey: true });
    expect(mockSetSelectedChannelId).not.toHaveBeenCalled();
  });

  it('ignores events from input', () => {
    mockChannels.push(makeChannel(1, null, 0));
    renderHook(() => useChannelHotkeys());
    const input = document.createElement('input');
    document.body.appendChild(input);
    fireKeyWithTarget('BracketRight', input);
    document.body.removeChild(input);
    expect(mockSetSelectedChannelId).not.toHaveBeenCalled();
  });
});
