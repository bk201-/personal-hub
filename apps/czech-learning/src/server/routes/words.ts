import { and, count, desc, eq, like, or } from 'drizzle-orm';
import { Hono } from 'hono';
import type { WordPos } from '../../shared/types.js';
import { db } from '../db/index.js';
import { words } from '../db/schema.js';
import { logger } from '../logger.js';
import type { AppEnv } from '../types.js';

const router = new Hono<AppEnv>();

type WordPatch = Partial<{
  czech: string;
  russian: string;
  english: string | null;
  pos:
    | 'noun'
    | 'verb'
    | 'adjective'
    | 'adverb'
    | 'pronoun'
    | 'numeral'
    | 'preposition'
    | 'conjunction'
    | 'interjection'
    | 'phrase'
    | null;
  gender: 'ma' | 'mi' | 'f' | 'n' | null;
  numberType: 'singular' | 'plural' | null;
  declensionClass: string | null;
  aspect: 'perfective' | 'imperfective' | null;
  verbPair: string | null;
  conjugationClass: string | null;
  notes: string | null;
  lesson: number | null;
  source: 'textbook' | 'manual' | null;
  seznamUrl: string | null;
}>;

function buildSeznamUrl(czech: string) {
  return `https://slovnik.seznam.cz/preklad/cesky_rusky/${encodeURIComponent(czech)}`;
}

// ─── GET /api/words ───────────────────────────────────────────────────────────

router.get('/', async (c) => {
  const page = Math.max(1, parseInt(c.req.query('page') ?? '1', 10));
  const limit = Math.min(200, Math.max(1, parseInt(c.req.query('limit') ?? '50', 10)));
  const offset = (page - 1) * limit;

  const search = c.req.query('search')?.trim() || undefined;
  const gender = (c.req.query('gender') || undefined) as 'ma' | 'mi' | 'f' | 'n' | undefined;
  const pos = (c.req.query('pos') || undefined) as WordPos | undefined;
  const lessonStr = c.req.query('lesson');
  const lesson = lessonStr ? parseInt(lessonStr, 10) : undefined;

  const conditions = [];
  if (gender) conditions.push(eq(words.gender, gender));
  if (pos) conditions.push(eq(words.pos, pos));
  if (lesson !== undefined && !isNaN(lesson)) conditions.push(eq(words.lesson, lesson));
  if (search) {
    const searchCond = or(like(words.czech, `%${search}%`), like(words.russian, `%${search}%`));
    if (searchCond) conditions.push(searchCond);
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [{ total }] = await db.select({ total: count() }).from(words).where(where);
  const items = await db.select().from(words).where(where).orderBy(desc(words.createdAt)).limit(limit).offset(offset);

  return c.json({ items, total, page, limit });
});

// ─── GET /api/words/:id ───────────────────────────────────────────────────────

router.get('/:id', async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  if (isNaN(id)) return c.json({ error: 'Invalid id' }, 400);

  const [word] = await db.select().from(words).where(eq(words.id, id));
  if (!word) return c.json({ error: 'Word not found' }, 404);
  return c.json(word);
});

// ─── POST /api/words ──────────────────────────────────────────────────────────

router.post('/', async (c) => {
  const body = await c.req.json<{
    czech: string;
    russian: string;
    pos?:
      | 'noun'
      | 'verb'
      | 'adjective'
      | 'adverb'
      | 'pronoun'
      | 'numeral'
      | 'preposition'
      | 'conjunction'
      | 'interjection'
      | 'phrase'
      | null;
    gender?: 'ma' | 'mi' | 'f' | 'n' | null;
    numberType?: 'singular' | 'plural' | null;
    declensionClass?: string | null;
    aspect?: 'perfective' | 'imperfective' | null;
    verbPair?: string | null;
    conjugationClass?: string | null;
    notes?: string | null;
    lesson?: number | null;
    source?: 'textbook' | 'manual' | null;
  }>();

  if (!body.czech?.trim() || !body.russian?.trim()) {
    return c.json({ error: 'Czech and Russian are required' }, 400);
  }

  const czech = body.czech.trim();
  const russian = body.russian.trim();

  const [word] = await db
    .insert(words)
    .values({
      czech,
      russian,
      pos: body.pos ?? null,
      gender: body.gender ?? null,
      numberType: body.numberType ?? null,
      declensionClass: body.declensionClass ?? null,
      aspect: body.aspect ?? null,
      verbPair: body.verbPair?.trim() ?? null,
      conjugationClass: body.conjugationClass ?? null,
      notes: body.notes?.trim() ?? null,
      lesson: body.lesson ?? null,
      source: body.source ?? 'manual',
      seznamUrl: buildSeznamUrl(czech),
    })
    .returning();

  logger.info({ module: 'words', id: word.id, czech }, 'word created');
  return c.json(word, 201);
});

// ─── PATCH /api/words/:id ─────────────────────────────────────────────────────

router.patch('/:id', async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  if (isNaN(id)) return c.json({ error: 'Invalid id' }, 400);

  const body = await c.req.json<{
    czech?: string;
    russian?: string;
    pos?:
      | 'noun'
      | 'verb'
      | 'adjective'
      | 'adverb'
      | 'pronoun'
      | 'numeral'
      | 'preposition'
      | 'conjunction'
      | 'interjection'
      | 'phrase'
      | null;
    gender?: 'ma' | 'mi' | 'f' | 'n' | null;
    numberType?: 'singular' | 'plural' | null;
    declensionClass?: string | null;
    aspect?: 'perfective' | 'imperfective' | null;
    verbPair?: string | null;
    conjugationClass?: string | null;
    notes?: string | null;
    lesson?: number | null;
    source?: 'textbook' | 'manual' | null;
  }>();

  const patch: WordPatch = {};
  if (body.czech !== undefined) {
    patch.czech = body.czech.trim();
    patch.seznamUrl = buildSeznamUrl(body.czech.trim());
  }
  if (body.russian !== undefined) patch.russian = body.russian.trim();
  if (body.pos !== undefined) patch.pos = body.pos;
  if (body.gender !== undefined) patch.gender = body.gender;
  if (body.numberType !== undefined) patch.numberType = body.numberType;
  if (body.declensionClass !== undefined) patch.declensionClass = body.declensionClass;
  if (body.aspect !== undefined) patch.aspect = body.aspect;
  if (body.verbPair !== undefined) patch.verbPair = body.verbPair?.trim() ?? null;
  if (body.conjugationClass !== undefined) patch.conjugationClass = body.conjugationClass;
  if (body.notes !== undefined) patch.notes = body.notes?.trim() ?? null;
  if (body.lesson !== undefined) patch.lesson = body.lesson;
  if (body.source !== undefined) patch.source = body.source;

  if (Object.keys(patch).length === 0) {
    return c.json({ error: 'Nothing to update' }, 400);
  }

  const [word] = await db.update(words).set(patch).where(eq(words.id, id)).returning();
  if (!word) return c.json({ error: 'Word not found' }, 404);

  logger.info({ module: 'words', id, fields: Object.keys(patch) }, 'word updated');
  return c.json(word);
});

// ─── DELETE /api/words/:id ────────────────────────────────────────────────────

router.delete('/:id', async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  if (isNaN(id)) return c.json({ error: 'Invalid id' }, 400);

  const [word] = await db.delete(words).where(eq(words.id, id)).returning();
  if (!word) return c.json({ error: 'Word not found' }, 404);

  logger.info({ module: 'words', id }, 'word deleted');
  return c.json({ success: true });
});

export default router;
