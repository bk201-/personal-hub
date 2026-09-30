// Client test setup — mock browser APIs that Zustand / antd may access at import time.
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach, vi } from 'vitest';

// Ensure proper cleanup between tests (vitest doesn't auto-cleanup without globals: true)
afterEach(() => cleanup());

// localStorage mock (jsdom provides one, but ensure it's clean between tests)
beforeEach(() => localStorage.clear());

// ── antd-style mock ─────────────────────────────────────────────────────
// createStyles returns a useStyles hook that provides empty classnames + passthrough cx.
vi.mock('antd-style', () => ({
  createStyles: () => () => ({
    styles: new Proxy({}, { get: (_t, prop) => `mock-${String(prop)}` }),
    cx: (...args: unknown[]) => args.filter(Boolean).join(' '),
    theme: {},
  }),
}));

// ── react-i18next mock ──────────────────────────────────────────────────
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      if (opts) return `${key}:${JSON.stringify(opts)}`;
      return key;
    },
    i18n: { language: 'en', changeLanguage: vi.fn() },
  }),
  Trans: ({ children }: { children: React.ReactNode }) => children,
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

// ── client logger mock ──────────────────────────────────────────────────
vi.mock('./logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// matchMedia mock — jsdom doesn't provide it
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});

// ResizeObserver mock — jsdom doesn't provide it (needed by antd/rc-component)
class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}
// Set on both globalThis and window to cover all access patterns
globalThis.ResizeObserver = ResizeObserverMock as unknown as typeof ResizeObserver;
if (typeof window !== 'undefined') {
  window.ResizeObserver = ResizeObserverMock as unknown as typeof ResizeObserver;
}

// Suppress jsdom "Not implemented" warnings — antd/rc-components trigger these; harmless in tests.
// jsdom writes these via its virtualConsole → process.stderr, bypassing global console.
const origStderrWrite = process.stderr.write.bind(process.stderr);
process.stderr.write = ((chunk: unknown, ...args: unknown[]) => {
  if (typeof chunk === 'string' && chunk.includes('Not implemented:')) return true;
  return origStderrWrite(chunk as string | Uint8Array, ...(args as []));
}) as typeof process.stderr.write;

// isContentEditable polyfill — jsdom doesn't implement this getter
if (typeof HTMLElement !== 'undefined' && !('isContentEditable' in HTMLElement.prototype)) {
  Object.defineProperty(HTMLElement.prototype, 'isContentEditable', {
    get() {
      return this.contentEditable === 'true' || this.contentEditable === '';
    },
  });
}
