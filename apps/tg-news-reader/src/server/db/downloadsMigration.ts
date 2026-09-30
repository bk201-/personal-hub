import type { Client } from '@libsql/client';

const legacyTypeCheck = /CHECK\s*\(\s*type\s+IN\s*\(\s*'media'\s*,\s*'article'\s*\)\s*\)/i;
const expandedTypeCheck = /CHECK\s*\(\s*type\s+IN\s*\(\s*'media'\s*,\s*'article'\s*,\s*'image'\s*\)\s*\)/i;

/** Run after downloads has been created, before starting download workers. */
export async function migrateDownloadsImageType(client: Client): Promise<void> {
  const table = await client.execute("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'downloads'");
  const definition = table.rows[0]?.sql;
  if (typeof definition !== 'string') {
    throw new Error('Cannot migrate downloads: table is missing');
  }
  if (expandedTypeCheck.test(definition)) return;
  if (!legacyTypeCheck.test(definition)) {
    throw new Error('Cannot migrate downloads: unrecognized type CHECK');
  }

  const objects = await client.execute(`
    SELECT sql FROM sqlite_master
    WHERE tbl_name = 'downloads' AND type IN ('index', 'trigger') AND sql IS NOT NULL
    ORDER BY type, name
  `);
  const replacement = definition
    .slice(definition.indexOf('('))
    .replace(legacyTypeCheck, "CHECK(type IN ('media', 'article', 'image'))");

  // batch is atomic on both local SQLite and Turso, and retains the in-memory
  // connection. Keep foreign keys enabled: downloads has no incoming references.
  await client.batch(
    [
      `CREATE TABLE downloads_image_migration ${replacement}`,
      'INSERT INTO downloads_image_migration SELECT * FROM downloads',
      // MAX(id) is not enough: deleted downloads may have raised the sequence.
      "DELETE FROM sqlite_sequence WHERE name = 'downloads_image_migration'",
      `INSERT INTO sqlite_sequence (name, seq)
       SELECT 'downloads_image_migration', seq FROM sqlite_sequence WHERE name = 'downloads'`,
      'DROP TABLE downloads',
      'ALTER TABLE downloads_image_migration RENAME TO downloads',
      ...objects.rows.map((row) => String(row.sql)),
    ],
    'write',
  );
}
