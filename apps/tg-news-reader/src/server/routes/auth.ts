import { zValidator } from '@hono/zod-validator';
import { createAuth } from '@personal-hub/auth-server';
import { eq } from 'drizzle-orm';
import { deleteCookie, setCookie } from 'hono/cookie';
import { sign } from 'hono/jwt';
import { JWT_ACCESS_EXPIRES_SEC, JWT_SECRET, REFRESH_EXPIRES_DAYS } from '../config.js';
import { db } from '../db/index.js';
import { sessions } from '../db/schema.js';
import { logger } from '../logger.js';
import { authMiddleware } from '../middleware/auth.js';
import { authCookies } from '../middleware/authCookies.js';
import { authStore } from './authStore.js';
import { loginSchema, totpConfirmSchema } from './schemas.js';

const secure = process.env.NODE_ENV === 'production';
const auth = createAuth({
  store: authStore,
  logger,
  jwt: { secret: JWT_SECRET, accessExpiresSec: JWT_ACCESS_EXPIRES_SEC },
  refresh: { cookieName: authCookies.refresh, expiresDays: REFRESH_EXPIRES_DAYS, secure, rotate: true },
  totpIssuer: 'TG News Reader',
  invalidCredentialsMessage: 'Invalid credentials',
  middleware: authMiddleware,
  validation: {
    login: zValidator('json', loginSchema),
    totpConfirm: zValidator('json', totpConfirmSchema),
  },
  accessClaims: (session) => ({
    unlockedGroupIds: JSON.parse(session?.unlockedGroupIds ?? '[]') as number[],
  }),
  async onSessionCookie(c, user, sessionId, expiresAt) {
    const token = await sign({ sub: String(user.id), role: user.role, sessionId, exp: expiresAt }, JWT_SECRET, 'HS256');
    setCookie(c, authCookies.media, token, {
      httpOnly: true,
      secure,
      sameSite: 'Strict',
      maxAge: REFRESH_EXPIRES_DAYS * 24 * 60 * 60,
      path: '/api/media',
    });
  },
  onLogout(c) {
    deleteCookie(c, authCookies.media, { path: '/api/media' });
  },
});

export function issueAccessToken(
  userId: number,
  role: string,
  sessionId: string,
  unlockedGroupIds: number[] = [],
): Promise<string> {
  return auth.issueAccessToken(userId, role, sessionId, { unlockedGroupIds });
}

const router = auth.router;
router.use('/sessions', authMiddleware);
router.use('/sessions/:id', authMiddleware);
router.get('/sessions', async (c) => {
  const userId = c.get('userId');
  const currentSessionId = c.get('sessionId');
  const result = await db
    .select({
      id: sessions.id,
      userAgent: sessions.userAgent,
      ip: sessions.ip,
      createdAt: sessions.createdAt,
      expiresAt: sessions.expiresAt,
    })
    .from(sessions)
    .where(eq(sessions.userId, userId));
  return c.json(result.map((s) => ({ ...s, isCurrent: s.id === currentSessionId })));
});

router.delete('/sessions/:id', async (c) => {
  const userId = c.get('userId');
  const sessionId = c.req.param('id');
  const [deleted] = await db.delete(sessions).where(eq(sessions.id, sessionId)).returning();
  if (!deleted || deleted.userId !== userId) return c.json({ error: 'Session not found' }, 404);
  return c.json({ success: true });
});

export default router;
