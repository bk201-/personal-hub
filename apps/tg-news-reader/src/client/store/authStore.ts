import { create } from 'zustand';

export interface AuthUser {
  id: number;
  email: string;
  role: string;
  hasTOTP?: boolean;
}

/** Parse unlockedGroupIds from JWT payload without verifying signature (client-side only) */
function parseUnlockedGroups(token: string): number[] {
  try {
    const payload = JSON.parse(atob(token.split('.')[1])) as { unlockedGroupIds?: number[] };
    return payload.unlockedGroupIds ?? [];
  } catch {
    return [];
  }
}

interface AuthStore {
  accessToken: string | null;
  user: AuthUser | null;
  unlockedGroupIds: number[];
  /** true while checking existing session on app load */
  isCheckingAuth: boolean;
  setAuth: (token: string, user: AuthUser) => void;
  updateToken: (token: string) => void;
  clearAuth: () => void;
  setCheckingAuth: (v: boolean) => void;
  updateUser: (patch: Partial<AuthUser>) => void;
  /** Optimistic local-only lock — call before the network request for instant UI response */
  lockGroupsLocally: () => void;
}

export const useAuthStore = create<AuthStore>()((set) => ({
  accessToken: null,
  user: null,
  unlockedGroupIds: [],
  isCheckingAuth: true,
  setAuth: (token, user) =>
    set({ accessToken: token, user, unlockedGroupIds: parseUnlockedGroups(token), isCheckingAuth: false }),
  updateToken: (token) => set({ accessToken: token, unlockedGroupIds: parseUnlockedGroups(token) }),
  clearAuth: () => set({ accessToken: null, user: null, unlockedGroupIds: [], isCheckingAuth: false }),
  setCheckingAuth: (v) => set({ isCheckingAuth: v }),
  updateUser: (patch) => set((s) => ({ user: s.user ? { ...s.user, ...patch } : null })),
  lockGroupsLocally: () => set({ unlockedGroupIds: [] }),
}));
