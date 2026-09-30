import { create } from 'zustand';

interface UIStore {
  isDarkTheme: boolean;
  toggleTheme: () => void;
}

export const useUIStore = create<UIStore>()((set) => ({
  isDarkTheme: localStorage.getItem('theme') === 'dark',
  toggleTheme: () =>
    set((state) => {
      const next = !state.isDarkTheme;
      localStorage.setItem('theme', next ? 'dark' : 'light');
      return { isDarkTheme: next };
    }),
}));
