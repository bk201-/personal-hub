import { createAuthMiddleware } from '@personal-hub/auth-server';
import { JWT_SECRET } from '../config.js';

export type { AuthPayload } from '@personal-hub/auth-server';
export const authMiddleware = createAuthMiddleware(JWT_SECRET);
