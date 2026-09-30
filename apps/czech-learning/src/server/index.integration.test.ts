// @vitest-environment node
import { serve } from '@hono/node-server';
import type { HttpBindings } from '@hono/node-server';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { client, db } from './db/index.js';
import { runMigration } from './db/migrate.js';
import { words } from './db/schema.js';

vi.mock('@hono/node-server', () => ({ serve: vi.fn() }));
vi.mock('./logger.js', () => ({ logger: { info: vi.fn(), warn: vi.fn() } }));
vi.mock('./db/index.js', async () => {
  const { createClient } = await import('@libsql/client');
  const { drizzle } = await import('drizzle-orm/libsql');
  const schema = await import('./db/schema.js');
  const client = createClient({ url: ':memory:' });
  return { client, db: drizzle(client, { schema }) };
});

await import('./index.js');
const fetchApp = vi.mocked(serve).mock.calls[0][0].fetch as (
  request: Request,
  bindings: HttpBindings,
) => Promise<Response>;
afterAll(() => client.close());

describe('fresh Czech application contract', () => {
  it('requires authentication before vocabulary and import routes', async () => {
    const wordsResponse = await fetchApp(new Request('http://localhost/api/words'), {} as HttpBindings);
    expect(wordsResponse.status).toBe(401);
    const importResponse = await fetchApp(
      new Request('http://localhost/api/import/words', { method: 'POST' }),
      {} as HttpBindings,
    );
    expect(importResponse.status).toBe(401);
  });

  it('initializes every vocabulary field in a fresh database and is repeatable', async () => {
    await runMigration();
    await expect(db.select().from(words)).resolves.toEqual([]);
  });

  it('preserves vocabulary when upgrading a pre-grammar database', async () => {
    await client.executeMultiple(`
      DROP TABLE words;
      CREATE TABLE words (
        id INTEGER PRIMARY KEY, czech TEXT NOT NULL, russian TEXT NOT NULL,
        created_at INTEGER NOT NULL DEFAULT (unixepoch())
      );
      INSERT INTO words (id, czech, russian) VALUES (1, 'ahoj', 'привет');
    `);
    await runMigration();
    await runMigration();
    const rows = await db.select().from(words);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: 1,
      czech: 'ahoj',
      russian: 'привет',
      declensionClass: null,
      conjugationClass: null,
    });
  });
});
