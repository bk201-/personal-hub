import { renderHook } from '@testing-library/react';
import type { Mock } from 'vitest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useNewsFeedHotkeys } from './useNewsFeedHotkeys';

function fireKey(code: string, opts: Partial<KeyboardEvent> = {}) {
  const event = new KeyboardEvent('keydown', { code, bubbles: true, cancelable: true, ...opts });
  document.body.dispatchEvent(event);
}

function fireKeyWithTarget(code: string, target: HTMLElement) {
  const event = new KeyboardEvent('keydown', { code, bubbles: true, cancelable: true });
  target.dispatchEvent(event);
}

describe('useNewsFeedHotkeys', () => {
  let onFetch: Mock<() => void>;
  let onCycleFilterMode: Mock<() => void>;
  let onMarkAllRead: Mock<() => void>;
  let onOpenFilters: Mock<() => void>;

  beforeEach(() => {
    onFetch = vi.fn();
    onCycleFilterMode = vi.fn();
    onMarkAllRead = vi.fn();
    onOpenFilters = vi.fn();
  });

  const renderIt = () =>
    renderHook(() => useNewsFeedHotkeys({ onFetch, onCycleFilterMode, onMarkAllRead, onOpenFilters }));

  it('U key calls onFetch', () => {
    renderIt();
    fireKey('KeyU');
    expect(onFetch).toHaveBeenCalled();
  });

  it('A key calls onCycleFilterMode', () => {
    renderIt();
    fireKey('KeyA');
    expect(onCycleFilterMode).toHaveBeenCalled();
  });

  it('M key calls onMarkAllRead', () => {
    renderIt();
    fireKey('KeyM');
    expect(onMarkAllRead).toHaveBeenCalled();
  });

  it('P key calls onOpenFilters', () => {
    renderIt();
    fireKey('KeyP');
    expect(onOpenFilters).toHaveBeenCalled();
  });

  it('ignores other keys', () => {
    renderIt();
    fireKey('KeyX');
    expect(onFetch).not.toHaveBeenCalled();
    expect(onCycleFilterMode).not.toHaveBeenCalled();
    expect(onMarkAllRead).not.toHaveBeenCalled();
    expect(onOpenFilters).not.toHaveBeenCalled();
  });

  // Modifier guards
  it('ignores metaKey', () => {
    renderIt();
    fireKey('KeyU', { metaKey: true });
    expect(onFetch).not.toHaveBeenCalled();
  });

  it('ignores ctrlKey', () => {
    renderIt();
    fireKey('KeyU', { ctrlKey: true });
    expect(onFetch).not.toHaveBeenCalled();
  });

  it('ignores altKey', () => {
    renderIt();
    fireKey('KeyU', { altKey: true });
    expect(onFetch).not.toHaveBeenCalled();
  });

  // Input element guards
  it('ignores events from input', () => {
    renderIt();
    const input = document.createElement('input');
    document.body.appendChild(input);
    fireKeyWithTarget('KeyU', input);
    document.body.removeChild(input);
    expect(onFetch).not.toHaveBeenCalled();
  });

  it('ignores events from textarea', () => {
    renderIt();
    const textarea = document.createElement('textarea');
    document.body.appendChild(textarea);
    fireKeyWithTarget('KeyU', textarea);
    document.body.removeChild(textarea);
    expect(onFetch).not.toHaveBeenCalled();
  });

  it('ignores events from contentEditable', () => {
    renderIt();
    const div = document.createElement('div');
    div.contentEditable = 'true';
    document.body.appendChild(div);
    fireKeyWithTarget('KeyU', div);
    document.body.removeChild(div);
    expect(onFetch).not.toHaveBeenCalled();
  });
});
