import { eq } from 'drizzle-orm';
import type { MiddlewareHandler } from 'hono';
import { getCookie } from 'hono/cookie';
import { verify } from 'hono/jwt';
import { JWT_SECRET } from '../config.js';
import { db } from '../db/index.js';
import { sessions } from '../db/schema.js';

export interface AuthPayload {
  sub: string;
  role: string;
  sessionId: string;
  exp: number;
}

async function authenticateMediaCookie(c: Parameters<MiddlewareHandler>[0]): Promise<boolean> {
  if (c.req.method !== 'GET' || !c.req.path.startsWith('/api/media/')) return false;

  const token = getCookie(c, 'media_token');
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

export const authMiddleware: MiddlewareHandler = async (c, next) => {
  const authHeader = c.req.header('Authorization');
  // Also accept ?token= query param for browser-native requests (img/video/EventSource)
  const queryToken = c.req.query('token');

  const raw = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : queryToken;
  if (!raw) {
    if (await authenticateMediaCookie(c)) {
      return next();
    }
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const token = raw;
  try {
    const payload = (await verify(token, JWT_SECRET, 'HS256')) as unknown as AuthPayload;
    c.set('userId', Number(payload.sub));
    c.set('userRole', payload.role);
    c.set('sessionId', payload.sessionId);
    await next();
  } catch {
    return c.json({ error: 'Invalid or expired token' }, 401);
  }
};
