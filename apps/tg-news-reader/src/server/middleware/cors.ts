import { cors } from 'hono/cors';

const isDev = process.env.NODE_ENV !== 'production';

export const corsMiddleware = cors({
  origin: isDev
    ? ['http://localhost:5173', 'http://localhost:4173', 'http://localhost:3173']
    : process.env.ALLOWED_ORIGIN
      ? [process.env.ALLOWED_ORIGIN]
      : [],
  allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  credentials: true, // required for httpOnly cookie cross-origin in dev
});
