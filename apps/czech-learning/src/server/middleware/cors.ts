import { cors } from 'hono/cors';

const isDev = process.env.NODE_ENV !== 'production';

export const corsMiddleware = cors({
  origin: isDev
    ? [
        'http://localhost:5174',
        'http://localhost:4174',
        'http://localhost:3174',
        'http://127.0.0.1:5174',
        'http://127.0.0.1:4174',
        'http://127.0.0.1:3174',
      ]
    : process.env.ALLOWED_ORIGIN
      ? [process.env.ALLOWED_ORIGIN]
      : [],
  allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  credentials: true, // required for httpOnly cookie cross-origin in dev
});
