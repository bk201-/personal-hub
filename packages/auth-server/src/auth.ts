import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { Hono } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { sign } from 'hono/jwt';
import * as OTPAuth from 'otpauth';
import { registerTotpRoutes } from './totp.js';
import type { AuthEnv, AuthOptions, AuthSession, AuthUser } from './types.js';

export function createAuth<Session extends AuthSession>(options: AuthOptions<Session>) {
  const { store, logger, refresh } = options;
  const router = new Hono<AuthEnv>();
  const now = () => Math.floor(Date.now() / 1000);
  const cookieOptions = {
    httpOnly: true,
    secure: refresh.secure,
    sameSite: 'Strict' as const,
    maxAge: refresh.expiresDays * 24 * 60 * 60,
    path: '/',
  };
  const publicUser = (user: AuthUser) => ({
    id: user.id,
    email: user.email,
    role: user.role,
    ...(options.includeHasTotp ? { hasTOTP: !!user.totpSecret } : {}),
  });
  const issueAccessToken = (
    userId: number,
    role: string,
    sessionId: string,
    claims: Record<string, unknown> = options.accessClaims?.() ?? {},
  ): Promise<string> =>
    sign(
      { ...claims, sub: String(userId), role, sessionId, exp: now() + options.jwt.accessExpiresSec },
      options.jwt.secret,
      'HS256',
    );

  if (options.validation) router.post('/login', options.validation.login);
  router.post('/login', async (c) => {
    const body = await c.req.json<{ email: string; password: string; totpCode?: string }>();
    const ip = c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ?? c.req.header('x-real-ip') ?? 'unknown';
    const user = await store.findUserByEmail(body.email.toLowerCase().trim());
    if (!user) {
      logger.warn({ module: 'auth', ip, event: 'login_failed', reason: 'user_not_found' }, 'login failed');
      return c.json({ error: options.invalidCredentialsMessage }, 401);
    }
    if (!(await bcrypt.compare(body.password, user.passwordHash))) {
      logger.warn({ module: 'auth', ip, event: 'login_failed', reason: 'wrong_password' }, 'login failed');
      return c.json({ error: options.invalidCredentialsMessage }, 401);
    }
    if (user.totpSecret) {
      if (!body.totpCode) return c.json({ error: 'TOTP code required', requiresTOTP: true }, 401);
      const totp = new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(user.totpSecret) });
      if (totp.validate({ token: body.totpCode.replace(/\s/g, ''), window: 1 }) === null) {
        logger.warn({ module: 'auth', ip, event: 'login_failed', reason: 'wrong_totp' }, 'login failed');
        return c.json({ error: 'Invalid TOTP code' }, 401);
      }
    }
    const sessionId = randomUUID();
    const refreshToken = randomUUID();
    const refreshTokenHash = await bcrypt.hash(refreshToken, 8);
    const expiresAt = now() + cookieOptions.maxAge;
    await store.createSession({
      id: sessionId,
      userId: user.id,
      refreshTokenHash,
      expiresAt,
      userAgent: c.req.header('user-agent') ?? null,
      ip: c.req.header('x-forwarded-for')?.split(',')[0].trim() ?? null,
    });
    const accessToken = await issueAccessToken(user.id, user.role, sessionId);
    logger.info({ module: 'auth', ip, event: 'login_ok', userId: user.id, sessionId }, 'login successful');
    setCookie(c, refresh.cookieName, `${sessionId}:${refreshToken}`, cookieOptions);
    await options.onSessionCookie?.(c, user, sessionId, expiresAt);
    return c.json({ accessToken, user: publicUser(user) });
  });

  router.post('/refresh', async (c) => {
    const cookieValue = getCookie(c, refresh.cookieName);
    if (!cookieValue) return c.json({ error: 'No refresh token' }, 401);
    const colonIdx = cookieValue.indexOf(':');
    const sessionId = cookieValue.slice(0, colonIdx);
    const refreshToken = cookieValue.slice(colonIdx + 1);
    const session = await store.findSession(sessionId);
    if (!session) return c.json({ error: 'Session not found' }, 401);
    if (session.expiresAt < now()) {
      await store.deleteSession(sessionId);
      deleteCookie(c, refresh.cookieName, { path: '/' });
      return c.json({ error: 'Session expired' }, 401);
    }
    if (!(await bcrypt.compare(refreshToken, session.refreshTokenHash))) {
      return c.json({ error: 'Invalid refresh token' }, 401);
    }
    const user = await store.findUserById(session.userId);
    if (!user) return c.json({ error: 'User not found' }, 401);
    if (refresh.rotate) {
      const newRefreshToken = randomUUID();
      const refreshTokenHash = await bcrypt.hash(newRefreshToken, 8);
      const expiresAt = now() + cookieOptions.maxAge;
      await store.rotateSession(sessionId, { refreshTokenHash, expiresAt });
      setCookie(c, refresh.cookieName, `${sessionId}:${newRefreshToken}`, cookieOptions);
      await options.onSessionCookie?.(c, user, sessionId, expiresAt);
    }
    const accessToken = await issueAccessToken(user.id, user.role, sessionId, options.accessClaims?.(session) ?? {});
    return c.json({ accessToken, user: publicUser(user) });
  });

  router.post('/logout', async (c) => {
    const cookieValue = getCookie(c, refresh.cookieName);
    if (cookieValue) await store.deleteSession(cookieValue.split(':')[0]);
    deleteCookie(c, refresh.cookieName, { path: '/' });
    options.onLogout?.(c);
    return c.json({ success: true });
  });

  router.use('/me', options.middleware);
  router.get('/me', async (c) => {
    const user = await store.findUserById(c.get('userId'));
    if (!user) return c.json({ error: 'User not found' }, 404);
    return c.json({ id: user.id, email: user.email, role: user.role, hasTOTP: !!user.totpSecret });
  });
  registerTotpRoutes(router, options);
  return { router, issueAccessToken };
}
