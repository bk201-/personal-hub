import { createHttpClient } from '@personal-hub/browser/http';
import { logger } from '../logger';
import { useAuthStore } from '../store/authStore';
import type { AuthUser } from '../store/authStore';
import { useRateLimitStore } from '../store/rateLimitStore';

export { ApiError } from '@personal-hub/browser/http';

const client = createHttpClient<AuthUser>({
  auth: {
    getToken: () => useAuthStore.getState().accessToken,
    setAuth: (token, user) => useAuthStore.getState().setAuth(token, user),
    clearAuth: () => useAuthStore.getState().clearAuth(),
  },
  onRateLimited: (until) => useRateLimitStore.getState().setRateLimited(until),
  networkRetries: 3,
  logger,
});

export const api = client.api;
// SSE and HTTP requests deliberately share the same in-flight refresh.
export const tryRefresh = client.tryRefresh;
