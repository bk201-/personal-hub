import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerMediaServiceWorker } from './serviceWorker';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('media service worker update contract', () => {
  it('registers the media cache without reloading unsaved work on controller updates', async () => {
    vi.stubEnv('DEV', false);
    const worker = new EventTarget();
    Object.assign(worker, {
      controller: {},
      register: vi.fn().mockResolvedValue({ scope: '/' }),
    });
    const reload = vi.fn();
    let onLoad: (() => void) | undefined;
    vi.stubGlobal('navigator', { serviceWorker: worker });
    vi.stubGlobal('window', {
      location: { reload },
      addEventListener: vi.fn((name: string, listener: () => void) => {
        if (name === 'load') onLoad = listener;
      }),
    });
    registerMediaServiceWorker();
    onLoad?.();
    worker.dispatchEvent(new Event('controllerchange'));
    worker.dispatchEvent(new Event('controllerchange'));
    await Promise.resolve();
    expect((worker as EventTarget & { register: unknown }).register).toHaveBeenCalledWith('/sw.js', {
      scope: '/',
      updateViaCache: 'none',
    });
    expect(reload).not.toHaveBeenCalled();
  });

  it('does not register in development', () => {
    vi.stubEnv('DEV', true);
    const register = vi.fn();
    vi.stubGlobal('navigator', { serviceWorker: { register } });
    registerMediaServiceWorker();
    expect(register).not.toHaveBeenCalled();
  });
});
