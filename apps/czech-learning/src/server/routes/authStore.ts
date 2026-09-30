import type { AuthStore } from '@personal-hub/auth-server';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { sessions, users } from '../db/schema.js';

export const authStore: AuthStore<typeof sessions.$inferSelect> = {
  async findUserByEmail(email) {
    return (await db.select().from(users).where(eq(users.email, email)))[0];
  },
  async findUserById(id) {
    return (await db.select().from(users).where(eq(users.id, id)))[0];
  },
  async setTotpSecret(userId, totpSecret) {
    await db.update(users).set({ totpSecret }).where(eq(users.id, userId));
  },
  async findSession(id) {
    return (await db.select().from(sessions).where(eq(sessions.id, id)))[0];
  },
  async createSession(session) {
    await db.insert(sessions).values(session);
  },
  async rotateSession(id, update) {
    await db.update(sessions).set(update).where(eq(sessions.id, id));
  },
  async deleteSession(id) {
    await db.delete(sessions).where(eq(sessions.id, id));
  },
};
