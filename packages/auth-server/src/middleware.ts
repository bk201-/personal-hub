import type { Context, MiddlewareHandler } from 'hono';
import { verify } from 'hono/jwt';
import type { AuthEnv, AuthPayload } from './types.js';

export function createAuthMiddleware(
  secret: string,
  fallback?: (c: Context<AuthEnv>) => Promise<boolean>,
): MiddlewareHandler<AuthEnv> {
  return async (c, next) => {
    const authHeader = c.req.header('Authorization');
    const raw = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : c.req.query('token');
    if (!raw) {
      if (fallback && (await fallback(c))) return next();
      return c.json({ error: 'Unauthorized' }, 401);
    }
    try {
      const payload = (await verify(raw, secret, 'HS256')) as unknown as AuthPayload;
      c.set('userId', Number(payload.sub));
      c.set('userRole', payload.role);
      c.set('sessionId', payload.sessionId);
      await next();
    } catch {
      return c.json({ error: 'Invalid or expired token' }, 401);
    }
  };
}
