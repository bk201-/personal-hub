import { mkdirSync } from 'fs';
import { join } from 'path';
import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import * as schema from './schema.js';

let clientUrl: string;
let authToken: string | undefined;

if (process.env.DATABASE_URL) {
  // Turso (or any remote libsql) — use env vars
  clientUrl = process.env.DATABASE_URL;
  authToken = process.env.TURSO_AUTH_TOKEN;
} else {
  // Local SQLite fallback
  const dataDir = join(process.cwd(), 'data');
  mkdirSync(dataDir, { recursive: true });
  // file: URL — forward slashes required, works on Windows too
  const dbPath = join(dataDir, 'db.sqlite').replace(/\\/g, '/');
  clientUrl = `file:${dbPath}`;
}

export const client = createClient({ url: clientUrl, authToken });
// WAL mode: allows concurrent readers + 1 writer, drastically reduces SQLITE_BUSY
// under load (10 worker threads writing simultaneously). Persists in the DB file,
// so only needs to be set once, but it's safe to run on every startup.
// busy_timeout: makes the SQLite driver wait up to 5 s for the write lock before
// throwing SQLITE_BUSY — avoids spurious task failures during peak writes.
// foreign_keys: enforce referential integrity.
// Skip on Turso (remote libsql): executeMultiple with PRAGMAs returns HTTP 400;
// WAL/busy_timeout/foreign_keys are managed server-side on Turso anyway.
if (!process.env.DATABASE_URL) {
  await client.executeMultiple('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON;');
}
export const db = drizzle(client, { schema });
