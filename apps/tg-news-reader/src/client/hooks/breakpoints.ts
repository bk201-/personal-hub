import { useEffect, useState } from 'react';

/** Ant Design breakpoints — mirrors Grid.useBreakpoint() thresholds.
 *  In CSS: use these numbers for media query px values. */
export const BP_SM = 576;
export const BP_MD = 768;
export const BP_LG = 992;
export const BP_XL = 1200;
export const BP_XXL = 1600;

// ── Height constants ──────────────────────────────────────────────────
export const MOBILE_TOOLBAR_HEIGHT = 44;

// ── Singleton breakpoint store ────────────────────────────────────────
// A single set of 5 matchMedia listeners broadcasts to all React subscribers.

export interface BreakpointState {
  isSm: boolean;
  isMd: boolean;
  isLg: boolean;
  isXl: boolean;
  isXxl: boolean;
}

type BpListener = (state: BreakpointState) => void;

function readBreakpoints(): BreakpointState {
  return {
    isSm: window.matchMedia(`(min-width: ${BP_SM}px)`).matches,
    isMd: window.matchMedia(`(min-width: ${BP_MD}px)`).matches,
    isLg: window.matchMedia(`(min-width: ${BP_LG}px)`).matches,
    isXl: window.matchMedia(`(min-width: ${BP_XL}px)`).matches,
    isXxl: window.matchMedia(`(min-width: ${BP_XXL}px)`).matches,
  };
}

function createBreakpointStore() {
  let current = readBreakpoints();
  const listeners = new Set<BpListener>();

  const notify = () => {
    current = readBreakpoints();
    listeners.forEach((l) => l(current));
  };

  // One `change` handler per breakpoint threshold — fires only at the crossing point.
  [BP_SM, BP_MD, BP_LG, BP_XL, BP_XXL].forEach((bp) => {
    window.matchMedia(`(min-width: ${bp}px)`).addEventListener('change', notify);
  });

  return {
    get: () => current,
    subscribe: (listener: BpListener): (() => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

// Instantiated once at module load — shared across the entire app lifetime.
const bpStore = createBreakpointStore();

// ── React hooks ───────────────────────────────────────────────────────

/** Returns the full breakpoint state object. Re-renders only when a breakpoint threshold is crossed. */
export function useBreakpoints(): BreakpointState {
  const [state, setState] = useState(() => bpStore.get());
  useEffect(() => bpStore.subscribe(setState), []);
  return state;
}

/** ≥ 768px (md) — touch vs pointer, SortModal drag */
export const useIsMd = () => useBreakpoints().isMd;
/** ≥ 1200px (xl) — list view available, below forces accordion */
export const useIsXl = () => useBreakpoints().isXl;
/** ≥ 1600px (xxl) — full desktop: inline sidebar, pin downloads panel */
export const useIsXxl = () => useBreakpoints().isXxl;
