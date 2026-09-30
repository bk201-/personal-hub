import { zValidator } from '@hono/zod-validator';
import { and, eq, inArray } from 'drizzle-orm';
import { Hono } from 'hono';
import { client, db } from '../db/index.js';
import { filters } from '../db/schema.js';
import { reprocessChannelFilters } from '../services/filterEngine.js';
import { batchFiltersSchema, createFilterSchema, updateFilterSchema } from './schemas.js';

const router = new Hono();

// GET /api/channels/:channelId/filters
router.get('/', async (c) => {
  const channelId = parseInt(c.req.param('channelId')!, 10);
  const result = await db.select().from(filters).where(eq(filters.channelId, channelId)).orderBy(filters.createdAt);
  return c.json(result);
});

// GET /api/channels/:channelId/filters/stats
router.get('/stats', async (c) => {
  const channelId = parseInt(c.req.param('channelId')!, 10);
  const rows = await client.execute({
    sql: `SELECT f.id as filter_id,
            COALESCE(SUM(CASE WHEN fs.date >= date('now', '-6 days') THEN fs.hit_count ELSE 0 END), 0) as hits_last7,
            COALESCE(SUM(fs.hit_count), 0) as hits_total,
            MAX(fs.date) as last_hit_date
          FROM filters f
          LEFT JOIN filter_stats fs ON fs.filter_id = f.id
          WHERE f.channel_id = ?
          GROUP BY f.id`,
    args: [channelId],
  });
  const result = rows.rows.map((r) => ({
    filterId: r[0] as number,
    hitsLast7: r[1] as number,
    hitsTotal: r[2] as number,
    lastHitDate: r[3] as string | null,
  }));
  return c.json(result);
});

// POST /api/channels/:channelId/filters/batch
// Apply multiple filter additions and deletions in a single request.
// Runs one reprocessChannelFilters pass instead of one per change.
router.post('/batch', zValidator('json', batchFiltersSchema), async (c) => {
  const channelId = parseInt(c.req.param('channelId')!, 10);
  const { toAdd, toDelete } = c.req.valid('json');

  if (toAdd.length === 0 && toDelete.length === 0) {
    return c.json({ added: [], deleted: 0 });
  }

  const added = toAdd.length
    ? await db
        .insert(filters)
        .values(
          toAdd.map((f) => ({
            channelId,
            name: f.name.trim(),
            type: f.type,
            value: f.value.trim().toLowerCase(),
          })),
        )
        .returning()
    : [];

  const deletedCount = toDelete.length
    ? (
        await db
          .delete(filters)
          .where(and(eq(filters.channelId, channelId), inArray(filters.id, toDelete)))
          .returning()
      ).length
    : 0;

  await reprocessChannelFilters(channelId);
  return c.json({ added, deleted: deletedCount });
});

// POST /api/channels/:channelId/filters
router.post('/', zValidator('json', createFilterSchema), async (c) => {
  const channelId = parseInt(c.req.param('channelId')!, 10);
  const body = c.req.valid('json');
  const [created] = await db
    .insert(filters)
    .values({
      channelId,
      name: body.name.trim(),
      type: body.type,
      value: body.value.trim().toLowerCase(),
    })
    .returning();
  await reprocessChannelFilters(channelId);
  return c.json(created, 201);
});

// PUT /api/channels/:channelId/filters/:id
router.put('/:id', zValidator('json', updateFilterSchema), async (c) => {
  const channelId = parseInt(c.req.param('channelId')!, 10);
  const id = parseInt(c.req.param('id'), 10);
  const body = c.req.valid('json');
  const [updated] = await db
    .update(filters)
    .set({
      ...(body.name !== undefined && { name: body.name }),
      ...(body.type !== undefined && { type: body.type }),
      ...(body.value !== undefined && { value: body.value.toLowerCase() }),
      ...(body.isActive !== undefined && { isActive: body.isActive }),
    })
    .where(and(eq(filters.id, id), eq(filters.channelId, channelId)))
    .returning();
  if (!updated) return c.json({ error: 'Filter not found' }, 404);
  await reprocessChannelFilters(channelId);
  return c.json(updated);
});

// DELETE /api/channels/:channelId/filters/:id
router.delete('/:id', async (c) => {
  const channelId = parseInt(c.req.param('channelId')!, 10);
  const id = parseInt(c.req.param('id'), 10);
  const [deleted] = await db
    .delete(filters)
    .where(and(eq(filters.id, id), eq(filters.channelId, channelId)))
    .returning();
  if (!deleted) return c.json({ error: 'Filter not found' }, 404);
  await reprocessChannelFilters(channelId);
  return c.json({ success: true });
});

export default router;
