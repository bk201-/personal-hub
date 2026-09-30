import { createAuth } from '@personal-hub/auth-server';
import { JWT_ACCESS_EXPIRES_SEC, JWT_SECRET, REFRESH_EXPIRES_DAYS } from '../config.js';
import { logger } from '../logger.js';
import { authMiddleware } from '../middleware/auth.js';
import { authCookies } from '../middleware/authCookies.js';
import { authStore } from './authStore.js';

const auth = createAuth({
  store: authStore,
  logger,
  jwt: { secret: JWT_SECRET, accessExpiresSec: JWT_ACCESS_EXPIRES_SEC },
  refresh: {
    cookieName: authCookies.refresh,
    expiresDays: REFRESH_EXPIRES_DAYS,
    secure: process.env.NODE_ENV === 'production',
    rotate: false,
  },
  totpIssuer: 'Czech Learning',
  invalidCredentialsMessage: 'Invalid email or password',
  includeHasTotp: true,
  middleware: authMiddleware,
});

export const issueAccessToken = (userId: number, role: string, sessionId: string): Promise<string> =>
  auth.issueAccessToken(userId, role, sessionId);

export default auth.router;
