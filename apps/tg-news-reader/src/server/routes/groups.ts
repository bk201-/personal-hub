import { zValidator } from '@hono/zod-validator';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { db } from '../db/index.js';
import { channels, groups, sessions, users } from '../db/schema.js';
import { issueAccessToken } from './auth.js';
import { createGroupSchema, reorderItemsSchema, updateGroupSchema, verifyPinSchema } from './schemas.js';

type HonoEnv = { Variables: { userId: number; userRole: string; sessionId: string } };

const router = new Hono<HonoEnv>();

// GET /api/groups
router.get('/', async (c) => {
  const result = await db.select().from(groups).orderBy(groups.sortOrder, groups.createdAt);
  return c.json(
    result.map((g: (typeof result)[number]) => ({
      id: g.id,
      name: g.name,
      color: g.color,
      hasPIN: !!g.pinHash,
      sortOrder: g.sortOrder,
      createdAt: g.createdAt,
    })),
  );
});

// POST /api/groups
router.post('/', zValidator('json', createGroupSchema), async (c) => {
  const body = c.req.valid('json');

  const pinHash = body.pin ? await bcrypt.hash(body.pin, 10) : null;

  const [created] = await db
    .insert(groups)
    .values({
      name: body.name.trim(),
      color: body.color ?? '#1677ff',
      pinHash,
      sortOrder: body.sortOrder ?? 0,
    })
    .returning();

  return c.json(
    {
      id: created.id,
      name: created.name,
      color: created.color,
      hasPIN: !!created.pinHash,
      sortOrder: created.sortOrder,
      createdAt: created.createdAt,
    },
    201,
  );
});

// PATCH /api/groups/reorder
router.patch('/reorder', zValidator('json', reorderItemsSchema), async (c) => {
  const body = c.req.valid('json');
  for (const item of body.items) {
    await db.update(groups).set({ sortOrder: item.sortOrder }).where(eq(groups.id, item.id));
  }
  return c.json({ ok: true });
});

// PUT /api/groups/:id
router.put('/:id', zValidator('json', updateGroupSchema), async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  const body = c.req.valid('json');

  const updates: Partial<typeof groups.$inferInsert> = {};
  if (body.name !== undefined) updates.name = body.name.trim();
  if (body.color !== undefined) updates.color = body.color;
  if (body.sortOrder !== undefined) updates.sortOrder = body.sortOrder;
  // pin: null = remove PIN, string = set new PIN
  if (body.pin === null) {
    updates.pinHash = null;
  } else if (body.pin !== undefined) {
    updates.pinHash = await bcrypt.hash(body.pin, 10);
  }

  const [updated] = await db.update(groups).set(updates).where(eq(groups.id, id)).returning();
  if (!updated) return c.json({ error: 'Group not found' }, 404);

  return c.json({
    id: updated.id,
    name: updated.name,
    color: updated.color,
    hasPIN: !!updated.pinHash,
    sortOrder: updated.sortOrder,
    createdAt: updated.createdAt,
  });
});

// DELETE /api/groups/:id — channels' group_id becomes null
router.delete('/:id', async (c) => {
  const id = parseInt(c.req.param('id'), 10);

  // Unlink channels before deleting (ON DELETE SET NULL should handle this but be explicit)
  await db.update(channels).set({ groupId: null }).where(eq(channels.groupId, id));

  const [deleted] = await db.delete(groups).where(eq(groups.id, id)).returning();
  if (!deleted) return c.json({ error: 'Group not found' }, 404);

  return c.json({ success: true });
});

// POST /api/groups/lock-all — clear all unlocked groups from the current session
router.post('/lock-all', async (c) => {
  const sessionId = c.get('sessionId') as string | undefined;
  if (!sessionId) return c.json({ success: true });

  await db.update(sessions).set({ unlockedGroupIds: '[]' }).where(eq(sessions.id, sessionId));

  const [session] = await db.select({ userId: sessions.userId }).from(sessions).where(eq(sessions.id, sessionId));
  if (!session) return c.json({ success: true });

  const [user] = await db.select({ role: users.role }).from(users).where(eq(users.id, session.userId));
  if (!user) return c.json({ success: true });

  const accessToken = await issueAccessToken(session.userId, user.role, sessionId, []);
  return c.json({ success: true, accessToken });
});

// POST /api/groups/:id/verify-pin
router.post('/:id/verify-pin', zValidator('json', verifyPinSchema), async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  const body = c.req.valid('json');

  const [group] = await db.select().from(groups).where(eq(groups.id, id));
  if (!group) return c.json({ error: 'Group not found' }, 404);
  if (!group.pinHash) return c.json({ success: true }); // no PIN — always success

  const match = await bcrypt.compare(body.pin, group.pinHash);
  if (!match) return c.json({ error: 'Invalid PIN' }, 401);

  // Update session's unlocked groups and return a new access token
  const sessionId = c.get('sessionId') as string | undefined;
  if (sessionId) {
    const [session] = await db
      .select({ userId: sessions.userId, unlockedGroupIds: sessions.unlockedGroupIds })
      .from(sessions)
      .where(eq(sessions.id, sessionId));

    if (session) {
      const current = JSON.parse(session.unlockedGroupIds ?? '[]') as number[];
      const updated = current.includes(id) ? current : [...current, id];

      await db
        .update(sessions)
        .set({ unlockedGroupIds: JSON.stringify(updated) })
        .where(eq(sessions.id, sessionId));

      const [user] = await db.select({ role: users.role }).from(users).where(eq(users.id, session.userId));
      if (user) {
        const accessToken = await issueAccessToken(session.userId, user.role, sessionId, updated);
        return c.json({ success: true, accessToken, unlockedGroupIds: updated });
      }
    }
  }

  return c.json({ success: true });
});

export default router;
