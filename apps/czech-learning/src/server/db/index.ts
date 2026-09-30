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
// PRAGMA foreign_keys only works for local SQLite (no-op on remote, but harmless)
await client.execute('PRAGMA foreign_keys = ON');
export const db = drizzle(client, { schema });
