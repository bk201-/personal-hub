import { createRateLimitMiddleware } from '@personal-hub/auth-server';
import { logger } from '../logger.js';

export const rateLimitMiddleware = createRateLimitMiddleware({
  windowMs: 60 * 1000,
  limit: 120,
  logger,
});
