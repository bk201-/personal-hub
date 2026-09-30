import { createRateLimitMiddleware } from '@personal-hub/auth-server';
import { RATE_LIMIT_GET_MULTIPLIER, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS } from '../config.js';
import { logger } from '../logger.js';

export const rateLimitMiddleware = createRateLimitMiddleware({
  windowMs: RATE_LIMIT_WINDOW_MS,
  limit: RATE_LIMIT_MAX,
  readMultiplier: RATE_LIMIT_GET_MULTIPLIER,
  logger,
});
