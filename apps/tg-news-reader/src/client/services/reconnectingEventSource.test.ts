import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock logger
vi.mock('../logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

type ESListener = (...args: unknown[]) => void;

class MockEventSource {
  static instances: MockEventSource[] = [];
  url: string;
  onerror: ((...args: unknown[]) => void) | null = null;
  private listeners = new Map<string, ESListener[]>();
  closed = false;

  constructor(url: string) {
    this.url = url;
    MockEventSource.instances.push(this);
  }

  addEventListener(event: string, listener: ESListener) {
    if (!this.listeners.has(event)) this.listeners.set(event, []);
    this.listeners.get(event)!.push(listener);
  }

  removeEventListener() {}

  /** Simulate 'open' event */
  simulateOpen() {
    for (const fn of this.listeners.get('open') ?? []) fn();
  }

  /** Simulate error */
  simulateError() {
    this.onerror?.();
  }

  close() {
    this.closed = true;
  }
}

describe('createReconnectingEventSource', () => {
  let originalES: typeof globalThis.EventSource;

  beforeEach(() => {
    vi.useFakeTimers();
    MockEventSource.instances = [];
    originalES = globalThis.EventSource;
    (globalThis as any).EventSource = MockEventSource;
  });

  afterEach(() => {
    vi.useRealTimers();
    (globalThis as any).EventSource = originalES;
  });

  async function importFresh() {
    return import('./reconnectingEventSource');
  }

  it('creates an EventSource on construction', async () => {
    const { createReconnectingEventSource } = await importFresh();
    const onConnect = vi.fn();
    createReconnectingEventSource({ getUrl: () => 'http://test/stream', onConnect });

    expect(MockEventSource.instances).toHaveLength(1);
    expect(MockEventSource.instances[0].url).toBe('http://test/stream');
    expect(onConnect).toHaveBeenCalledOnce();
  });

  it('reconnects with exponential backoff on error', async () => {
    const { createReconnectingEventSource } = await importFresh();
    const onConnect = vi.fn();
    createReconnectingEventSource({ getUrl: () => 'http://test/stream', onConnect });

    expect(MockEventSource.instances).toHaveLength(1);

    // First error — should schedule reconnect after 1s (1000 * 2^0)
    MockEventSource.instances[0].simulateError();
    expect(MockEventSource.instances[0].closed).toBe(true);
    await Promise.resolve(); // flush the async IIFE so setTimeout is scheduled

    vi.advanceTimersByTime(999);
    expect(MockEventSource.instances).toHaveLength(1); // not yet
    vi.advanceTimersByTime(1);
    expect(MockEventSource.instances).toHaveLength(2); // reconnected

    // Second error — 2s delay (1000 * 2^1)
    MockEventSource.instances[1].simulateError();
    await Promise.resolve(); // flush async IIFE
    vi.advanceTimersByTime(1999);
    expect(MockEventSource.instances).toHaveLength(2);
    vi.advanceTimersByTime(1);
    expect(MockEventSource.instances).toHaveLength(3);

    expect(onConnect).toHaveBeenCalledTimes(3);
  });

  it('resets backoff on successful open', async () => {
    const { createReconnectingEventSource } = await importFresh();
    createReconnectingEventSource({ getUrl: () => 'http://test/stream', onConnect: vi.fn() });

    // Error twice to bump attempt to 2 — use runAllTimersAsync to fast-forward
    MockEventSource.instances[0].simulateError();
    await vi.runAllTimersAsync();
    MockEventSource.instances[1].simulateError();
    await vi.runAllTimersAsync();

    // Third instance connects successfully
    MockEventSource.instances[2].simulateOpen(); // resets attempt

    // Error again — delay should be back to 1s (not 4s)
    MockEventSource.instances[2].simulateError();
    await Promise.resolve(); // flush IIFE only — don't fire the timer yet
    vi.advanceTimersByTime(999);
    expect(MockEventSource.instances).toHaveLength(3);
    vi.advanceTimersByTime(1);
    expect(MockEventSource.instances).toHaveLength(4);
  });

  it('does not reconnect after close()', async () => {
    const { createReconnectingEventSource } = await importFresh();
    const handle = createReconnectingEventSource({ getUrl: () => 'http://test/stream', onConnect: vi.fn() });

    handle.close();
    expect(MockEventSource.instances[0].closed).toBe(true);

    // Simulate error after close — should not reconnect
    vi.advanceTimersByTime(60_000);
    expect(MockEventSource.instances).toHaveLength(1);
  });

  it('caps delay at 30s', async () => {
    const { createReconnectingEventSource } = await importFresh();
    createReconnectingEventSource({ getUrl: () => 'http://test/stream', onConnect: vi.fn() });

    // Error many times to exceed cap
    for (let i = 0; i < 10; i++) {
      const last = MockEventSource.instances[MockEventSource.instances.length - 1];
      last.simulateError();

      await vi.runAllTimersAsync(); // flush async IIFE in onerror
    }

    // All should have reconnected (10 errors + 1 initial = 11)
    expect(MockEventSource.instances.length).toBe(11);
  });

  it('calls onBeforeReconnect before each reconnect attempt', async () => {
    const { createReconnectingEventSource } = await importFresh();
    const onBeforeReconnect = vi.fn().mockResolvedValue(undefined);
    createReconnectingEventSource({
      getUrl: () => 'http://test/stream',
      onConnect: vi.fn(),
      onBeforeReconnect,
    });

    MockEventSource.instances[0].simulateError();
    await vi.runAllTimersAsync();

    expect(onBeforeReconnect).toHaveBeenCalledOnce();
    expect(MockEventSource.instances).toHaveLength(2);
  });

  it('uses fresh URL from getUrl on each reconnect', async () => {
    const { createReconnectingEventSource } = await importFresh();
    let tokenVersion = 'token-v1';
    createReconnectingEventSource({
      getUrl: () => `http://test/stream?token=${tokenVersion}`,
      onConnect: vi.fn(),
    });

    expect(MockEventSource.instances[0].url).toBe('http://test/stream?token=token-v1');

    tokenVersion = 'token-v2';
    MockEventSource.instances[0].simulateError();
    await vi.runAllTimersAsync();

    expect(MockEventSource.instances[1].url).toBe('http://test/stream?token=token-v2');
  });

  it('does not reconnect if close() is called during onBeforeReconnect', async () => {
    const { createReconnectingEventSource } = await importFresh();
    const onBeforeReconnect = vi.fn();
    const handle = createReconnectingEventSource({
      getUrl: () => 'http://test/stream',
      onConnect: vi.fn(),
      onBeforeReconnect,
    });
    onBeforeReconnect.mockImplementation(async () => {
      // Simulate React closing the SSE hook during token refresh
      handle.close();
    });

    MockEventSource.instances[0].simulateError();
    await vi.runAllTimersAsync();

    expect(onBeforeReconnect).toHaveBeenCalledOnce();
    // close() was called during onBeforeReconnect — should NOT create a new EventSource
    expect(MockEventSource.instances).toHaveLength(1);
  });

  describe('pauseWhenHidden', () => {
    function setHidden(hidden: boolean) {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
      document.dispatchEvent(new Event('visibilitychange'));
    }

    afterEach(() => {
      // Reset visibility to the jsdom default for the next test
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
    });

    it('closes the connection while hidden and reconnects when visible again', async () => {
      const { createReconnectingEventSource } = await importFresh();
      const handle = createReconnectingEventSource({
        getUrl: () => 'http://test/stream',
        onConnect: vi.fn(),
        pauseWhenHidden: true,
      });

      expect(MockEventSource.instances).toHaveLength(1);
      expect(MockEventSource.instances[0].closed).toBe(false);

      // Page hidden → connection released, no new instance
      setHidden(true);
      expect(MockEventSource.instances[0].closed).toBe(true);
      expect(MockEventSource.instances).toHaveLength(1);

      // No background reconnect attempts while hidden
      await vi.advanceTimersByTimeAsync(60_000);
      expect(MockEventSource.instances).toHaveLength(1);

      // Page visible → reconnect immediately
      setHidden(false);
      expect(MockEventSource.instances).toHaveLength(2);
      expect(MockEventSource.instances[1].closed).toBe(false);

      handle.close();
    });

    it('does not connect when created while the page is already hidden', async () => {
      const { createReconnectingEventSource } = await importFresh();
      setHidden(true);

      const handle = createReconnectingEventSource({
        getUrl: () => 'http://test/stream',
        onConnect: vi.fn(),
        pauseWhenHidden: true,
      });

      expect(MockEventSource.instances).toHaveLength(0);

      setHidden(false);
      expect(MockEventSource.instances).toHaveLength(1);

      handle.close();
    });

    it('keeps the connection open when pauseWhenHidden is not set', async () => {
      const { createReconnectingEventSource } = await importFresh();
      const handle = createReconnectingEventSource({
        getUrl: () => 'http://test/stream',
        onConnect: vi.fn(),
      });

      expect(MockEventSource.instances).toHaveLength(1);
      setHidden(true);
      expect(MockEventSource.instances[0].closed).toBe(false);
      expect(MockEventSource.instances).toHaveLength(1);

      handle.close();
    });
  });
});
