import { readFileSync } from 'fs';
import { resolve } from 'path';
/**
 * Imports words from data/ocr-output/words-final.json into the database.
 *
 * Usage:
 *   npm run import:words -- --email admin@example.com --password MyPass123
 *
 * Or with a custom file:
 *   npm run import:words -- --email admin@example.com --password MyPass123 --file ./data/ocr-output/words-final.json
 */
import 'dotenv/config';

// ─── Parse args ───────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
function getArg(name: string): string | undefined {
  const idx = args.indexOf(`--${name}`);
  return idx !== -1 ? args[idx + 1] : undefined;
}

const email = getArg('email');
const password = getArg('password');
const filePath = getArg('file') ?? './data/ocr-output/words-final.json';
const serverUrl = getArg('url') ?? 'http://localhost:3173';
const BATCH = 100;

if (!email || !password) {
  console.error(
    'Usage: npm run import:words -- --email <email> --password <password> [--file <path>] [--url <server>]',
  );
  process.exit(1);
}

// ─── Read file ────────────────────────────────────────────────────────────────

const absolutePath = resolve(filePath);
let allWords: unknown[];
try {
  allWords = JSON.parse(readFileSync(absolutePath, 'utf-8')) as unknown[];
  console.log(`📂 Loaded ${allWords.length} words from ${absolutePath}`);
} catch (e) {
  console.error(`❌ Cannot read file: ${absolutePath}`);
  console.error((e as Error).message);
  process.exit(1);
}

// ─── Login ────────────────────────────────────────────────────────────────────

console.log(`🔐 Logging in as ${email}…`);
const loginRes = await fetch(`${serverUrl}/api/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password }),
});

if (!loginRes.ok) {
  const err = (await loginRes.json().catch(() => ({ error: loginRes.statusText }))) as { error?: string };
  console.error(`❌ Login failed: ${err.error ?? loginRes.statusText}`);
  process.exit(1);
}

const { accessToken } = (await loginRes.json()) as { accessToken: string };
console.log('✅ Login successful\n');

// ─── Import in batches ────────────────────────────────────────────────────────

let totalInserted = 0;
let totalSkipped = 0;
const batches = Math.ceil(allWords.length / BATCH);

for (let i = 0; i < allWords.length; i += BATCH) {
  const batch = allWords.slice(i, i + BATCH);
  const batchNum = Math.floor(i / BATCH) + 1;

  process.stdout.write(`  Batch ${batchNum}/${batches} (${batch.length} words)… `);

  const res = await fetch(`${serverUrl}/api/import/words`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ words: batch }),
  });

  if (!res.ok) {
    const err = (await res.json().catch(() => ({ error: res.statusText }))) as { error?: string };
    console.error(`\n❌ Import failed on batch ${batchNum}: ${err.error ?? res.statusText}`);
    process.exit(1);
  }

  const result = (await res.json()) as { inserted: number; skipped: number };
  totalInserted += result.inserted;
  totalSkipped += result.skipped;
  console.log(`inserted=${result.inserted} skipped=${result.skipped}`);
}

console.log(`\n✅ Import complete:`);
console.log(`   Inserted: ${totalInserted}`);
console.log(`   Skipped:  ${totalSkipped} (already existed)`);
console.log(`   Total:    ${totalInserted + totalSkipped}`);
