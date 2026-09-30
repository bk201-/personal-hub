import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock matchMedia before importing the module
const mockListeners = new Map<string, (e: MediaQueryListEvent) => void>();

function createMockMql(matches: boolean): MediaQueryList {
  return {
    matches,
    media: '',
    onchange: null,
    addEventListener: vi.fn((_, handler) => {
      mockListeners.set('change', handler);
    }),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  };
}

beforeEach(() => {
  mockListeners.clear();
  // Default: simulate a 1024px wide screen
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => {
      const widthMatch = /min-width:\s*(\d+)px/.exec(query);
      const bp = widthMatch ? parseInt(widthMatch[1], 10) : 0;
      return createMockMql(1024 >= bp);
    }),
  );
});

describe('breakpoints', () => {
  it('exports breakpoint constants', async () => {
    const { BP_SM, BP_MD, BP_LG, BP_XL, BP_XXL, MOBILE_TOOLBAR_HEIGHT } = await import('./breakpoints.js');
    expect(BP_SM).toBe(576);
    expect(BP_MD).toBe(768);
    expect(BP_LG).toBe(992);
    expect(BP_XL).toBe(1200);
    expect(BP_XXL).toBe(1600);
    expect(MOBILE_TOOLBAR_HEIGHT).toBe(44);
  });

  it('useBreakpoints returns correct state for 1024px screen', async () => {
    const { useBreakpoints } = await import('./breakpoints.js');
    const { result } = renderHook(() => useBreakpoints());

    // 1024 >= 576(sm), 768(md), 992(lg) but < 1200(xl), 1600(xxl)
    expect(result.current.isSm).toBe(true);
    expect(result.current.isMd).toBe(true);
    expect(result.current.isLg).toBe(true);
    expect(result.current.isXl).toBe(false);
    expect(result.current.isXxl).toBe(false);
  });

  it('useIsMd / useIsXl / useIsXxl return correct booleans', async () => {
    const { useIsMd, useIsXl, useIsXxl } = await import('./breakpoints.js');

    const { result: md } = renderHook(() => useIsMd());
    const { result: xl } = renderHook(() => useIsXl());
    const { result: xxl } = renderHook(() => useIsXxl());

    expect(md.current).toBe(true);
    expect(xl.current).toBe(false);
    expect(xxl.current).toBe(false);
  });
});
