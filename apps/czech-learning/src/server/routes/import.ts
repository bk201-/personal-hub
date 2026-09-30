import { inArray } from 'drizzle-orm';
import { Hono } from 'hono';
import { db } from '../db/index.js';
import { words } from '../db/schema.js';
import { logger } from '../logger.js';
import type { AppEnv } from '../types.js';

const router = new Hono<AppEnv>();

// ─── Types ────────────────────────────────────────────────────────────────────

// Accept both camelCase (from UI forms) and snake_case (from OCR script output)
interface WordInput {
  czech: string;
  russian: string;
  english?: string | null;
  pos?: string | null;
  gender?: 'ma' | 'mi' | 'f' | 'n' | null;
  // camelCase (UI form)
  numberType?: 'singular' | 'plural' | null;
  declensionClass?: string | null;
  verbPair?: string | null;
  conjugationClass?: string | null;
  // snake_case (OCR script)
  number_type?: 'singular' | 'plural' | null;
  declension_class?: string | null;
  verb_pair?: string | null;
  conjugation_class?: string | null;
  // shared
  aspect?: 'perfective' | 'imperfective' | null;
  notes?: string | null;
  lesson?: number | null;
  source?: 'textbook' | 'manual' | null;
}

// ─── POST /api/import/words ───────────────────────────────────────────────────

router.post('/words', async (c) => {
  // Admin-only
  if (c.get('userRole') !== 'admin') {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const body = await c.req.json<{ words: WordInput[] }>();
  if (!Array.isArray(body.words) || body.words.length === 0) {
    return c.json({ error: 'words array is required and must not be empty' }, 400);
  }

  // Validate and normalize inputs
  const incoming = body.words
    .map((w) => ({ ...w, czech: w.czech?.trim(), russian: w.russian?.trim() }))
    .filter((w) => w.czech && w.russian);

  if (incoming.length === 0) {
    return c.json({ error: 'No valid words (czech + russian required for each)' }, 400);
  }

  // Deduplicate: find existing czech values in one query
  const czechValues = [...new Set(incoming.map((w) => w.czech))];
  const existingRows = await db.select({ czech: words.czech }).from(words).where(inArray(words.czech, czechValues));
  const existingSet = new Set(existingRows.map((r) => r.czech));

  const toInsert = incoming.filter((w) => !existingSet.has(w.czech));
  const skipped = incoming.length - toInsert.length;

  if (toInsert.length === 0) {
    logger.info({ module: 'import', skipped }, 'import: all words already exist');
    return c.json({ inserted: 0, skipped });
  }

  // Batch insert (SQLite can handle ~999 params per statement; chunk at 100 rows)
  const CHUNK = 100;
  let inserted = 0;
  for (let i = 0; i < toInsert.length; i += CHUNK) {
    const chunk = toInsert.slice(i, i + CHUNK).map((w) => ({
      czech: w.czech,
      russian: w.russian,
      english: w.english ?? null,
      pos: (w.pos as typeof words.$inferInsert.pos) ?? null,
      gender: w.gender ?? null,
      numberType: w.numberType ?? w.number_type ?? null,
      declensionClass: w.declensionClass ?? w.declension_class ?? null,
      aspect: w.aspect ?? null,
      verbPair: w.verbPair ?? w.verb_pair ?? null,
      conjugationClass: w.conjugationClass ?? w.conjugation_class ?? null,
      notes: w.notes ?? null,
      lesson: w.lesson ?? null,
      source: (w.source ?? 'textbook') as typeof words.$inferInsert.source,
      seznamUrl: `https://slovnik.seznam.cz/preklad/cesky_rusky/${encodeURIComponent(w.czech)}`,
    }));
    await db.insert(words).values(chunk);
    inserted += chunk.length;
  }

  logger.info({ module: 'import', inserted, skipped }, 'import complete');
  return c.json({ inserted, skipped });
});

export default router;
