/**
 * Auth helpers for integration tests — create users, sessions, and JWT tokens.
 */

import { randomUUID } from 'crypto';
import bcrypt from 'bcryptjs';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import { sign } from 'hono/jwt';
import type * as schema from '../db/schema.js';
import { sessions, users } from '../db/schema.js';

const TEST_JWT_SECRET = 'test-secret-key';

interface TestUser {
  id: number;
  email: string;
  role: string;
}

interface TestSession {
  id: string;
  refreshToken: string;
  cookieValue: string;
}

/**
 * Insert a test user and return the record.
 */
export async function createTestUser(
  db: LibSQLDatabase<typeof schema>,
  overrides: { email?: string; password?: string; role?: string; totpSecret?: string | null } = {},
): Promise<TestUser> {
  const email = overrides.email ?? `test-${randomUUID().slice(0, 8)}@example.com`;
  const passwordHash = await bcrypt.hash(overrides.password ?? 'password123', 4); // low rounds for speed
  const role = overrides.role ?? 'admin';

  const [user] = await db
    .insert(users)
    .values({ email, passwordHash, role, totpSecret: overrides.totpSecret ?? null })
    .returning();

  return { id: user.id, email: user.email, role: user.role };
}

/**
 * Create a session row and return its id + raw refresh token + cookie value.
 */
export async function createTestSession(db: LibSQLDatabase<typeof schema>, userId: number): Promise<TestSession> {
  const sessionId = randomUUID();
  const refreshToken = randomUUID();
  const refreshTokenHash = await bcrypt.hash(refreshToken, 4);
  const expiresAt = Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60; // +7 days

  await db.insert(sessions).values({
    id: sessionId,
    userId,
    refreshTokenHash,
    expiresAt,
  });

  return {
    id: sessionId,
    refreshToken,
    cookieValue: `${sessionId}:${refreshToken}`,
  };
}

/**
 * Generate a valid JWT access token for test requests.
 */
export async function generateTestToken(
  userId: number,
  opts: { role?: string; sessionId?: string; unlockedGroupIds?: number[] } = {},
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return sign(
    {
      sub: String(userId),
      role: opts.role ?? 'admin',
      sessionId: opts.sessionId ?? 'test-session',
      unlockedGroupIds: opts.unlockedGroupIds ?? [],
      exp: now + 900, // 15 min
    },
    TEST_JWT_SECRET,
    'HS256',
  );
}

/**
 * Build a headers object with Authorization for authenticated requests.
 */
export async function authHeaders(
  userId: number,
  opts: { role?: string; sessionId?: string } = {},
): Promise<Record<string, string>> {
  const token = await generateTestToken(userId, opts);
  return { Authorization: `Bearer ${token}` };
}
