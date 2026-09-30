import { create } from 'zustand';

interface RateLimitStore {
  /** Timestamp (ms) until which the client is rate-limited. null = not limited. */
  until: number | null;
  setRateLimited: (until: number) => void;
  clear: () => void;
}

export const useRateLimitStore = create<RateLimitStore>((set) => ({
  until: null,
  setRateLimited: (until) => set({ until }),
  clear: () => set({ until: null }),
}));
