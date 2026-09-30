import type { MiddlewareHandler } from 'hono';
import { verify } from 'hono/jwt';
import { JWT_SECRET } from '../config.js';
import type { AppEnv } from '../types.js';

export interface AuthPayload {
  sub: string;
  role: string;
  sessionId: string;
  exp: number;
}

export const authMiddleware: MiddlewareHandler<AppEnv> = async (c, next) => {
  const authHeader = c.req.header('Authorization');
  // Also accept ?token= query param for browser-native requests (img/EventSource)
  const queryToken = c.req.query('token');

  const raw = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : queryToken;
  if (!raw) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  try {
    const payload = (await verify(raw, JWT_SECRET, 'HS256')) as unknown as AuthPayload;
    c.set('userId', Number(payload.sub));
    c.set('userRole', payload.role);
    c.set('sessionId', payload.sessionId);
    await next();
  } catch {
    return c.json({ error: 'Invalid or expired token' }, 401);
  }
};

