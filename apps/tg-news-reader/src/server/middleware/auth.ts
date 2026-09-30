import { createAuthMiddleware } from '@personal-hub/auth-server';
import type { AuthEnv, AuthPayload } from '@personal-hub/auth-server';
import { eq } from 'drizzle-orm';
import type { Context } from 'hono';
import { getCookie } from 'hono/cookie';
import { verify } from 'hono/jwt';
import { JWT_SECRET } from '../config.js';
import { db } from '../db/index.js';
import { sessions } from '../db/schema.js';
import { authCookies } from './authCookies.js';

export type { AuthPayload } from '@personal-hub/auth-server';

async function authenticateMediaCookie(c: Context<AuthEnv>): Promise<boolean> {
  if (c.req.method !== 'GET' || !c.req.path.startsWith('/api/media/')) return false;

  const token = getCookie(c, authCookies.media);
  if (!token) return false;

  try {
    const payload = (await verify(token, JWT_SECRET, 'HS256')) as unknown as AuthPayload;
    const userId = Number(payload.sub);
    const [session] = await db.select().from(sessions).where(eq(sessions.id, payload.sessionId));
    if (!session || session.userId !== userId || session.expiresAt < Math.floor(Date.now() / 1000)) return false;

    c.set('userId', userId);
    c.set('userRole', payload.role);
    c.set('sessionId', session.id);
    return true;
  } catch {
    return false;
  }
}

export const authMiddleware = createAuthMiddleware(JWT_SECRET, authenticateMediaCookie);
