import { randomUUID } from 'crypto';
import { zValidator } from '@hono/zod-validator';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { sign } from 'hono/jwt';
import * as OTPAuth from 'otpauth';
import QRCode from 'qrcode';
import { JWT_ACCESS_EXPIRES_SEC, JWT_SECRET, REFRESH_EXPIRES_DAYS } from '../config.js';
import { db } from '../db/index.js';
import { sessions, users } from '../db/schema.js';
import { logger } from '../logger.js';
import { authMiddleware } from '../middleware/auth.js';
import { loginSchema, totpConfirmSchema } from './schemas.js';

const router = new Hono();
const isDev = process.env.NODE_ENV !== 'production';

function refreshCookieOptions() {
  return {
    httpOnly: true,
    secure: !isDev,
    sameSite: 'Strict' as const,
    maxAge: REFRESH_EXPIRES_DAYS * 24 * 60 * 60,
    path: '/',
  };
}

function mediaCookieOptions() {
  return {
    ...refreshCookieOptions(),
    path: '/api/media',
  };
}

async function issueAccessToken(
  userId: number,
  role: string,
  sessionId: string,
  unlockedGroupIds: number[] = [],
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return sign(
    { sub: String(userId), role, sessionId, unlockedGroupIds, exp: now + JWT_ACCESS_EXPIRES_SEC },
    JWT_SECRET,
    'HS256',
  );
}

export { issueAccessToken };

async function issueMediaToken(userId: number, role: string, sessionId: string, expiresAt: number): Promise<string> {
  return sign({ sub: String(userId), role, sessionId, exp: expiresAt }, JWT_SECRET, 'HS256');
}

// ─── Public routes ────────────────────────────────────────────────────────────

// POST /api/auth/login
router.post('/login', zValidator('json', loginSchema), async (c) => {
  const body = c.req.valid('json');
  const ip = c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ?? c.req.header('x-real-ip') ?? 'unknown';

  const [user] = await db.select().from(users).where(eq(users.email, body.email.toLowerCase().trim()));
  if (!user) {
    logger.warn({ module: 'auth', ip, event: 'login_failed', reason: 'user_not_found' }, 'login failed');
    return c.json({ error: 'Invalid credentials' }, 401);
  }

  const passwordOk = await bcrypt.compare(body.password, user.passwordHash);
  if (!passwordOk) {
    logger.warn({ module: 'auth', ip, event: 'login_failed', reason: 'wrong_password' }, 'login failed');
    return c.json({ error: 'Invalid credentials' }, 401);
  }

  // Check TOTP if enabled
  if (user.totpSecret) {
    if (!body.totpCode) {
      return c.json({ error: 'TOTP code required', requiresTOTP: true }, 401);
    }
    const totp = new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(user.totpSecret) });
    const delta = totp.validate({ token: body.totpCode.replace(/\s/g, ''), window: 1 });
    if (delta === null) {
      logger.warn({ module: 'auth', ip, event: 'login_failed', reason: 'wrong_totp' }, 'login failed');
      return c.json({ error: 'Invalid TOTP code' }, 401);
    }
  }

  // Create session
  const sessionId = randomUUID();
  const refreshToken = randomUUID();
  const refreshTokenHash = await bcrypt.hash(refreshToken, 8);
  const expiresAt = Math.floor(Date.now() / 1000) + REFRESH_EXPIRES_DAYS * 24 * 60 * 60;

  await db.insert(sessions).values({
    id: sessionId,
    userId: user.id,
    refreshTokenHash,
    expiresAt,
    userAgent: c.req.header('user-agent') ?? null,
    ip: c.req.header('x-forwarded-for')?.split(',')[0].trim() ?? null,
  });

  const accessToken = await issueAccessToken(user.id, user.role, sessionId);

  logger.info({ module: 'auth', ip, event: 'login_ok', userId: user.id, sessionId }, 'login successful');
  setCookie(c, 'refresh_token', `${sessionId}:${refreshToken}`, refreshCookieOptions());
  setCookie(c, 'media_token', await issueMediaToken(user.id, user.role, sessionId, expiresAt), mediaCookieOptions());

  return c.json({ accessToken, user: { id: user.id, email: user.email, role: user.role } });
});

// POST /api/auth/refresh
router.post('/refresh', async (c) => {
  const cookieValue = getCookie(c, 'refresh_token');
  if (!cookieValue) return c.json({ error: 'No refresh token' }, 401);

  const colonIdx = cookieValue.indexOf(':');
  const sessionId = cookieValue.slice(0, colonIdx);
  const refreshToken = cookieValue.slice(colonIdx + 1);

  const [session] = await db.select().from(sessions).where(eq(sessions.id, sessionId));
  if (!session) return c.json({ error: 'Session not found' }, 401);

  const now = Math.floor(Date.now() / 1000);
  if (session.expiresAt < now) {
    await db.delete(sessions).where(eq(sessions.id, sessionId));
    deleteCookie(c, 'refresh_token', { path: '/' });
    return c.json({ error: 'Session expired' }, 401);
  }

  const tokenOk = await bcrypt.compare(refreshToken, session.refreshTokenHash);
  if (!tokenOk) return c.json({ error: 'Invalid refresh token' }, 401);

  const [user] = await db.select().from(users).where(eq(users.id, session.userId));
  if (!user) return c.json({ error: 'User not found' }, 401);

  // Rotate refresh token: generate new token, update hash + expiry in DB, re-set cookie
  const newRefreshToken = randomUUID();
  const newRefreshTokenHash = await bcrypt.hash(newRefreshToken, 8);
  const newExpiresAt = Math.floor(Date.now() / 1000) + REFRESH_EXPIRES_DAYS * 24 * 60 * 60;

  await db
    .update(sessions)
    .set({ refreshTokenHash: newRefreshTokenHash, expiresAt: newExpiresAt })
    .where(eq(sessions.id, sessionId));

  setCookie(c, 'refresh_token', `${sessionId}:${newRefreshToken}`, refreshCookieOptions());
  setCookie(c, 'media_token', await issueMediaToken(user.id, user.role, sessionId, newExpiresAt), mediaCookieOptions());

  const unlockedGroupIds = JSON.parse(session.unlockedGroupIds ?? '[]') as number[];
  const accessToken = await issueAccessToken(user.id, user.role, sessionId, unlockedGroupIds);
  return c.json({ accessToken, user: { id: user.id, email: user.email, role: user.role } });
});

// POST /api/auth/logout
router.post('/logout', async (c) => {
  const cookieValue = getCookie(c, 'refresh_token');
  if (cookieValue) {
    const sessionId = cookieValue.split(':')[0];
    await db.delete(sessions).where(eq(sessions.id, sessionId));
  }
  deleteCookie(c, 'refresh_token', { path: '/' });
  deleteCookie(c, 'media_token', { path: '/api/media' });
  return c.json({ success: true });
});

// ─── Protected routes (require auth) ─────────────────────────────────────────

router.use('/me', authMiddleware);
router.use('/sessions', authMiddleware);
router.use('/sessions/:id', authMiddleware);
router.use('/totp/*', authMiddleware);

// GET /api/auth/me
router.get('/me', async (c) => {
  const userId = c.get('userId');
  const [user] = await db
    .select({ id: users.id, email: users.email, role: users.role, hasTOTP: users.totpSecret })
    .from(users)
    .where(eq(users.id, userId));
  if (!user) return c.json({ error: 'User not found' }, 404);
  return c.json({ id: user.id, email: user.email, role: user.role, hasTOTP: !!user.hasTOTP });
});

// GET /api/auth/totp/setup — generate new TOTP secret + QR code
router.get('/totp/setup', async (c) => {
  const userId = c.get('userId');
  const [user] = await db.select({ email: users.email }).from(users).where(eq(users.id, userId));

  const secret = new OTPAuth.Secret({ size: 20 });
  const totp = new OTPAuth.TOTP({
    issuer: 'TG News Reader',
    label: user.email,
    secret,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
  });

  const otpauthUrl = totp.toString();
  const qrCode = await QRCode.toDataURL(otpauthUrl);

  return c.json({ qrCode, secret: secret.base32, otpauthUrl });
});

// POST /api/auth/totp/confirm — verify code and save TOTP secret
router.post('/totp/confirm', zValidator('json', totpConfirmSchema), async (c) => {
  const userId = c.get('userId');
  const body = c.req.valid('json');

  const totp = new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(body.secret) });
  const delta = totp.validate({ token: body.code.replace(/\s/g, ''), window: 1 });
  if (delta === null) return c.json({ error: 'Invalid code. Make sure the time is correct.' }, 400);

  await db.update(users).set({ totpSecret: body.secret }).where(eq(users.id, userId));
  return c.json({ success: true });
});

// DELETE /api/auth/totp — disable TOTP
router.delete('/totp', async (c) => {
  const userId = c.get('userId');
  await db.update(users).set({ totpSecret: null }).where(eq(users.id, userId));
  return c.json({ success: true });
});

// GET /api/auth/sessions
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

  return c.json(result.map((s: (typeof result)[number]) => ({ ...s, isCurrent: s.id === currentSessionId })));
});

// DELETE /api/auth/sessions/:id
router.delete('/sessions/:id', async (c) => {
  const userId = c.get('userId');
  const sessionId = c.req.param('id');

  const [deleted] = await db.delete(sessions).where(eq(sessions.id, sessionId)).returning();

  if (!deleted || deleted.userId !== userId) {
    return c.json({ error: 'Session not found' }, 404);
  }
  return c.json({ success: true });
});

export default router;
