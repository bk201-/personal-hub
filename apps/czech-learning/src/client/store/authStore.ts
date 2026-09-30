import type { AuthUser } from '@shared/types';
import { create } from 'zustand';

export type { AuthUser };

interface AuthStore {
  accessToken: string | null;
  user: AuthUser | null;
  /** true while checking existing session on app load */
  isCheckingAuth: boolean;
  setAuth: (token: string, user: AuthUser) => void;
  updateToken: (token: string) => void;
  updateUser: (patch: Partial<AuthUser>) => void;
  clearAuth: () => void;
}

export const useAuthStore = create<AuthStore>()((set) => ({
  accessToken: null,
  user: null,
  isCheckingAuth: true,
  setAuth: (token, user) => set({ accessToken: token, user, isCheckingAuth: false }),
  updateToken: (token) => set({ accessToken: token }),
  updateUser: (patch) => set((s) => ({ user: s.user ? { ...s.user, ...patch } : null })),
  clearAuth: () => set({ accessToken: null, user: null, isCheckingAuth: false }),
}));
