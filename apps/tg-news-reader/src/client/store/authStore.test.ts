import { beforeEach, describe, expect, it } from 'vitest';
import { useAuthStore } from './authStore';

/** Create a fake JWT with a given payload (no signature verification on client) */
function fakeJwt(payload: Record<string, unknown>): string {
  const header = btoa(JSON.stringify({ alg: 'HS256' }));
  const body = btoa(JSON.stringify(payload));
  return `${header}.${body}.fake-signature`;
}

describe('authStore', () => {
  beforeEach(() => {
    useAuthStore.setState({
      accessToken: null,
      user: null,
      unlockedGroupIds: [],
      isCheckingAuth: true,
    });
  });

  it('setAuth sets token, user, and parses unlockedGroupIds from JWT', () => {
    const token = fakeJwt({ sub: 1, unlockedGroupIds: [3, 7] });
    useAuthStore.getState().setAuth(token, { id: 1, email: 'a@b.com', role: 'admin' });

    const s = useAuthStore.getState();
    expect(s.accessToken).toBe(token);
    expect(s.user).toEqual({ id: 1, email: 'a@b.com', role: 'admin' });
    expect(s.unlockedGroupIds).toEqual([3, 7]);
    expect(s.isCheckingAuth).toBe(false);
  });

  it('setAuth handles JWT without unlockedGroupIds', () => {
    const token = fakeJwt({ sub: 1 });
    useAuthStore.getState().setAuth(token, { id: 1, email: 'a@b.com', role: 'user' });
    expect(useAuthStore.getState().unlockedGroupIds).toEqual([]);
  });

  it('updateToken updates token and re-parses unlockedGroupIds', () => {
    const token1 = fakeJwt({ unlockedGroupIds: [1] });
    const token2 = fakeJwt({ unlockedGroupIds: [1, 2, 3] });
    useAuthStore.getState().setAuth(token1, { id: 1, email: 'a@b.com', role: 'user' });
    useAuthStore.getState().updateToken(token2);

    expect(useAuthStore.getState().accessToken).toBe(token2);
    expect(useAuthStore.getState().unlockedGroupIds).toEqual([1, 2, 3]);
  });

  it('clearAuth resets everything', () => {
    const token = fakeJwt({ sub: 1 });
    useAuthStore.getState().setAuth(token, { id: 1, email: 'a@b.com', role: 'user' });
    useAuthStore.getState().clearAuth();

    const s = useAuthStore.getState();
    expect(s.accessToken).toBeNull();
    expect(s.user).toBeNull();
    expect(s.unlockedGroupIds).toEqual([]);
    expect(s.isCheckingAuth).toBe(false);
  });

  it('lockGroupsLocally clears unlockedGroupIds', () => {
    const token = fakeJwt({ unlockedGroupIds: [1, 2] });
    useAuthStore.getState().setAuth(token, { id: 1, email: 'a@b.com', role: 'user' });
    useAuthStore.getState().lockGroupsLocally();
    expect(useAuthStore.getState().unlockedGroupIds).toEqual([]);
  });

  it('updateUser patches existing user', () => {
    const token = fakeJwt({});
    useAuthStore.getState().setAuth(token, { id: 1, email: 'a@b.com', role: 'user' });
    useAuthStore.getState().updateUser({ hasTOTP: true });
    expect(useAuthStore.getState().user).toEqual({ id: 1, email: 'a@b.com', role: 'user', hasTOTP: true });
  });

  it('updateUser is no-op when user is null', () => {
    useAuthStore.getState().updateUser({ hasTOTP: true });
    expect(useAuthStore.getState().user).toBeNull();
  });

  it('handles malformed JWT gracefully', () => {
    useAuthStore.getState().setAuth('not.a.jwt', { id: 1, email: 'a@b.com', role: 'user' });
    expect(useAuthStore.getState().unlockedGroupIds).toEqual([]);
  });
});
