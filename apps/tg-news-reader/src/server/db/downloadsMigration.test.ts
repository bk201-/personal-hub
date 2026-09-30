import { createClient } from '@libsql/client';
import type { Client } from '@libsql/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ client: undefined as Client | undefined }));
vi.mock('./index.js', () => ({
  get client() {
    return state.client;
  },
}));
vi.mock('../logger.js', () => ({ logger: { info: vi.fn() } }));

import { createTestDb } from '../__tests__/testDb.js';
import { migrateDownloadsImageType } from './downloadsMigration.js';
import { runMigration } from './migrate.js';

async function createLegacyDownloads(client: Client) {
  await client.executeMultiple(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE news (id INTEGER PRIMARY KEY);
    INSERT INTO news VALUES (1), (2), (3);
    CREATE TABLE downloads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      news_id INTEGER NOT NULL REFERENCES news(id) ON DELETE CASCADE,
      type TEXT NOT NULL CHECK(type IN ('media', 'article')),
      url TEXT,
      priority INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'processing', 'done', 'failed')),
      error TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      processed_at INTEGER,
      UNIQUE(news_id, type)
    );
    CREATE INDEX idx_downloads_queue ON downloads(status, priority DESC, created_at ASC);
    INSERT INTO downloads (id, news_id, type, url, priority, status, error, created_at, processed_at)
    VALUES
      (7, 1, 'media', NULL, 0, 'pending', NULL, 100, NULL),
      (12, 1, 'article', 'https://example.test/article', 10, 'processing', NULL, 101, NULL),
      (23, 2, 'media', NULL, 5, 'done', NULL, 102, 200),
      (42, 2, 'article', 'https://example.test/failed', 20, 'failed', 'download failed', 103, 201);
    INSERT INTO downloads (id, news_id, type) VALUES (1000, 3, 'media');
    DELETE FROM downloads WHERE id = 1000;
  `);
}

describe('downloads type migration', () => {
  let client: Client;

  beforeEach(() => {
    client = createClient({ url: ':memory:' });
    state.client = client;
  });

  afterEach(() => {
    client.close();
  });

  it('allows image downloads after the startup migration', async () => {
    await runMigration();
    await client.execute("INSERT INTO channels (telegram_id, name) VALUES ('test-channel', 'Test')");
    await client.execute('INSERT INTO news (channel_id, telegram_msg_id, posted_at) VALUES (1, 1, 100)');

    await expect(client.execute("INSERT INTO downloads (news_id, type) VALUES (1, 'image')")).resolves.toMatchObject({
      rowsAffected: 1,
    });
    await runMigration();
    expect((await client.execute('SELECT type FROM downloads')).rows).toEqual([{ type: 'image' }]);
  });

  it('allows image downloads in the shared test database', async () => {
    const testDb = await createTestDb();
    try {
      await testDb.client.execute("INSERT INTO channels (telegram_id, name) VALUES ('test-channel', 'Test')");
      await testDb.client.execute('INSERT INTO news (channel_id, telegram_msg_id, posted_at) VALUES (1, 1, 100)');
      await expect(
        testDb.client.execute("INSERT INTO downloads (news_id, type) VALUES (1, 'image')"),
      ).resolves.toMatchObject({
        rowsAffected: 1,
      });
    } finally {
      testDb.client.close();
    }
  });

  it('preserves every row, explicit ID and the deleted-ID sequence high-water mark', async () => {
    await createLegacyDownloads(client);
    const before = await client.execute('SELECT * FROM downloads ORDER BY id');

    await migrateDownloadsImageType(client);

    expect((await client.execute('SELECT * FROM downloads ORDER BY id')).rows).toEqual(before.rows);
    const inserted = await client.execute("INSERT INTO downloads (news_id, type) VALUES (1, 'image') RETURNING *");
    expect(inserted.rows[0]).toMatchObject({
      id: 1001,
      news_id: 1,
      type: 'image',
      url: null,
      priority: 0,
      status: 'pending',
      error: null,
      processed_at: null,
    });
    expect(Number(inserted.rows[0].created_at)).toBeGreaterThan(0);
    expect((await client.execute('PRAGMA foreign_key_check')).rows).toEqual([]);
  });

  it('preserves queue ordering, custom indexes and the unique news/type constraint', async () => {
    await createLegacyDownloads(client);
    await client.execute('CREATE INDEX idx_downloads_url ON downloads(url) WHERE url IS NOT NULL');
    const indexes = await client.execute(
      "SELECT name, sql FROM sqlite_master WHERE type = 'index' AND tbl_name = 'downloads' ORDER BY name",
    );

    await migrateDownloadsImageType(client);

    expect(
      (
        await client.execute(
          "SELECT name, sql FROM sqlite_master WHERE type = 'index' AND tbl_name = 'downloads' ORDER BY name",
        )
      ).rows,
    ).toEqual(indexes.rows);
    expect((await client.execute("PRAGMA index_xinfo('idx_downloads_queue')")).rows.slice(0, 3)).toMatchObject([
      { name: 'status', desc: 0 },
      { name: 'priority', desc: 1 },
      { name: 'created_at', desc: 0 },
    ]);
    await expect(client.execute("INSERT INTO downloads (news_id, type) VALUES (1, 'media')")).rejects.toThrow(
      /UNIQUE constraint failed/,
    );
    await client.execute("INSERT INTO downloads (news_id, type) VALUES (1, 'image')");
    await expect(client.execute("INSERT INTO downloads (news_id, type) VALUES (1, 'image')")).rejects.toThrow(
      /UNIQUE constraint failed/,
    );
  });

  it.each(['invalid', '', 'IMAGE'])('rejects invalid type %j after migration', async (type) => {
    await createLegacyDownloads(client);
    await migrateDownloadsImageType(client);
    await expect(
      client.execute({
        sql: 'INSERT INTO downloads (news_id, type) VALUES (3, ?)',
        args: [type],
      }),
    ).rejects.toThrow(/CHECK constraint failed/);
    await expect(
      client.execute({
        sql: 'UPDATE downloads SET type = ? WHERE id = 7',
        args: [type],
      }),
    ).rejects.toThrow(/CHECK constraint failed/);
  });

  it('retains the status CHECK and accepts all four valid statuses for images', async () => {
    await createLegacyDownloads(client);
    await migrateDownloadsImageType(client);
    await client.execute("INSERT INTO downloads (news_id, type) VALUES (1, 'image')");
    for (const status of ['pending', 'processing', 'done', 'failed']) {
      await expect(
        client.execute({
          sql: "UPDATE downloads SET status = ? WHERE type = 'image'",
          args: [status],
        }),
      ).resolves.toMatchObject({ rowsAffected: 1 });
    }
    await expect(
      client.execute("INSERT INTO downloads (news_id, type, status) VALUES (3, 'image', 'cancelled')"),
    ).rejects.toThrow(/CHECK constraint failed/);
    await expect(client.execute("UPDATE downloads SET status = 'invalid' WHERE type = 'image'")).rejects.toThrow(
      /CHECK constraint failed/,
    );
  });

  it('retains NOT NULL constraints, rejects orphan news and cascades deletes for every type', async () => {
    await createLegacyDownloads(client);
    await migrateDownloadsImageType(client);
    for (const column of ['news_id', 'type', 'priority', 'status', 'created_at']) {
      await expect(client.execute(`UPDATE downloads SET ${column} = NULL WHERE id = 7`)).rejects.toThrow(
        /NOT NULL constraint failed/,
      );
    }
    await expect(client.execute("INSERT INTO downloads (news_id, type) VALUES (999, 'image')")).rejects.toThrow(
      /FOREIGN KEY constraint failed/,
    );
    await client.execute("INSERT INTO downloads (news_id, type) VALUES (1, 'image')");
    await client.execute('DELETE FROM news WHERE id = 1');
    expect((await client.execute('SELECT id FROM downloads ORDER BY id')).rows).toEqual([{ id: 23 }, { id: 42 }]);
    expect((await client.execute('PRAGMA foreign_keys')).rows[0].foreign_keys).toBe(1);
  });

  it('does not rebuild an already expanded table or alter image rows on repeat runs', async () => {
    await createLegacyDownloads(client);
    await migrateDownloadsImageType(client);
    await client.execute("INSERT INTO downloads (news_id, type) VALUES (1, 'image')");
    const rows = await client.execute('SELECT * FROM downloads ORDER BY id');
    const version = await client.execute('PRAGMA schema_version');
    const sequence = await client.execute('SELECT * FROM sqlite_sequence');

    await migrateDownloadsImageType(client);
    await migrateDownloadsImageType(client);

    expect((await client.execute('SELECT * FROM downloads ORDER BY id')).rows).toEqual(rows.rows);
    expect((await client.execute('PRAGMA schema_version')).rows).toEqual(version.rows);
    expect((await client.execute('SELECT * FROM sqlite_sequence')).rows).toEqual(sequence.rows);
    expect(
      (await client.execute("SELECT name FROM sqlite_master WHERE name = 'downloads_image_migration'")).rows,
    ).toEqual([]);
  });

  it.each([false, true])('preserves an empty table sequence (previous rows: %s)', async (hadRows) => {
    await createLegacyDownloads(client);
    await client.execute('DELETE FROM downloads');
    if (!hadRows) await client.execute("DELETE FROM sqlite_sequence WHERE name = 'downloads'");

    await migrateDownloadsImageType(client);

    const result = await client.execute("INSERT INTO downloads (news_id, type) VALUES (1, 'image') RETURNING id");
    expect(result.rows[0].id).toBe(hadRows ? 1001 : 1);
  });

  it('preserves sequence values beyond JavaScript safe integers', async () => {
    await createLegacyDownloads(client);
    await client.execute("UPDATE sqlite_sequence SET seq = 9007199254740993 WHERE name = 'downloads'");

    await migrateDownloadsImageType(client);

    const inserted = await client.execute("INSERT INTO downloads (news_id, type) VALUES (1, 'image')");
    expect(inserted.lastInsertRowid).toBe(9007199254740994n);
  });

  it('preserves triggers without firing them again for copied rows', async () => {
    await createLegacyDownloads(client);
    await client.executeMultiple(`
      CREATE TABLE download_audit (download_id INTEGER);
      CREATE TRIGGER audit_download AFTER INSERT ON downloads
      BEGIN INSERT INTO download_audit VALUES (NEW.id); END;
    `);

    await migrateDownloadsImageType(client);

    expect((await client.execute('SELECT * FROM download_audit')).rows).toEqual([]);
    await client.execute("INSERT INTO downloads (news_id, type) VALUES (1, 'image')");
    expect((await client.execute('SELECT * FROM download_audit')).rows).toEqual([{ download_id: 1001 }]);
  });

  it('rolls back rows, sequence and schema when a dependent table prevents replacement', async () => {
    await createLegacyDownloads(client);
    await client.executeMultiple(`
      CREATE TABLE dependent (download_id INTEGER REFERENCES downloads(id) ON DELETE RESTRICT);
      INSERT INTO dependent VALUES (7);
    `);
    const schema = await client.execute('SELECT type, name, sql FROM sqlite_master ORDER BY name');
    const rows = await client.execute('SELECT * FROM downloads ORDER BY id');
    const sequence = await client.execute('SELECT * FROM sqlite_sequence');

    await expect(migrateDownloadsImageType(client)).rejects.toThrow(/FOREIGN KEY constraint failed/);

    expect((await client.execute('SELECT type, name, sql FROM sqlite_master ORDER BY name')).rows).toEqual(schema.rows);
    expect((await client.execute('SELECT * FROM downloads ORDER BY id')).rows).toEqual(rows.rows);
    expect((await client.execute('SELECT * FROM sqlite_sequence')).rows).toEqual(sequence.rows);
    expect((await client.execute('PRAGMA foreign_keys')).rows[0].foreign_keys).toBe(1);
    await expect(client.execute("INSERT INTO downloads (news_id, type) VALUES (1, 'image')")).rejects.toThrow(
      /CHECK constraint failed/,
    );
    await client.execute('DROP TABLE dependent');
    await migrateDownloadsImageType(client);
    expect(
      (await client.execute("INSERT INTO downloads (news_id, type) VALUES (1, 'image') RETURNING id")).rows,
    ).toEqual([{ id: 1001 }]);
  });

  it('refuses a missing or unexpected table definition without modifying the database', async () => {
    await expect(migrateDownloadsImageType(client)).rejects.toThrow(/table is missing/);
    await client.execute('CREATE TABLE downloads (id INTEGER PRIMARY KEY, type TEXT)');
    const before = await client.execute('SELECT * FROM sqlite_master');

    await expect(migrateDownloadsImageType(client)).rejects.toThrow(/unrecognized type CHECK/);

    expect((await client.execute('SELECT * FROM sqlite_master')).rows).toEqual(before.rows);
  });

  it('rolls back a failed copy without silently losing invalid legacy rows', async () => {
    await createLegacyDownloads(client);
    await client.executeMultiple(`
      PRAGMA ignore_check_constraints = ON;
      UPDATE downloads SET status = 'invalid' WHERE id = 7;
      PRAGMA ignore_check_constraints = OFF;
    `);
    const rows = await client.execute('SELECT * FROM downloads ORDER BY id');
    const schema = await client.execute('SELECT type, name, sql FROM sqlite_master ORDER BY name');

    await expect(migrateDownloadsImageType(client)).rejects.toThrow(/CHECK constraint failed/);

    expect((await client.execute('SELECT * FROM downloads ORDER BY id')).rows).toEqual(rows.rows);
    expect((await client.execute('SELECT type, name, sql FROM sqlite_master ORDER BY name')).rows).toEqual(schema.rows);
    await client.execute("UPDATE downloads SET status = 'pending' WHERE id = 7");
    await migrateDownloadsImageType(client);
    const inserted = await client.execute("INSERT INTO downloads (news_id, type) VALUES (1, 'image') RETURNING id");
    expect(inserted.rows).toEqual([{ id: 1001 }]);
  });
});
