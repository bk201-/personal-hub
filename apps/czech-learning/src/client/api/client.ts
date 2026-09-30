import { createHttpClient } from '@personal-hub/browser/http';
import i18n from '../i18n';
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
  sessionExpiredMessage: () => i18n.t('auth.session_expired'),
  refreshFailurePolicy: 'any-failure',
  logger,
});

export const api = client.api;
export const tryRefresh = client.tryRefresh;
