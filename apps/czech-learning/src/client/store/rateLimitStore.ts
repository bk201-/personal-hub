import { create } from 'zustand';

interface RateLimitStore {
  until: number | null;
  setRateLimited: (until: number) => void;
  clear: () => void;
}

export const useRateLimitStore = create<RateLimitStore>((set) => ({
  until: null,
  setRateLimited: (until) => set({ until }),
  clear: () => set({ until: null }),
}));
