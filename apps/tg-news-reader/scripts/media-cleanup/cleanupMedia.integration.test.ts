import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { seedChannel, seedNews } from '../../src/server/__tests__/seed.js';
import { createTestDb } from '../../src/server/__tests__/testDb.js';

const exec = promisify(execFile);
const entry = fileURLToPath(new URL('./cleanupMedia.ts', import.meta.url));

describe('media cleanup CLI', { timeout: 45_000 }, () => {
  let directory: string;
  let port: number;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'tg-cleanup-cli-'));
    const data = join(directory, 'data');
    await mkdir(join(data, 'channel'), { recursive: true });
    const testDb = await createTestDb();
    try {
      const channel = await seedChannel(testDb.db);
      await seedNews(testDb.db, channel.id, { localMediaPath: 'channel/1.jpg' });
      await testDb.client.execute({ sql: 'VACUUM INTO ?', args: [join(data, 'db.sqlite')] });
    } finally {
      testDb.client.close();
    }
    await writeFile(join(data, 'channel', '1.jpg'), 'keep');
    await writeFile(join(data, 'channel', '2.jpg'), 'orphan');
    const server = createServer();
    await new Promise<void>((resolve) => server.listen(0, '0.0.0.0', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Expected TCP address');
    port = address.port;
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  function run(...args: string[]) {
    const env: NodeJS.ProcessEnv = { ...process.env, NODE_ENV: 'test', SERVER_PORT: String(port) };
    delete env.DATABASE_URL;
    delete env.TURSO_AUTH_TOKEN;
    return exec(process.execPath, ['--import', import.meta.resolve('tsx/esm'), entry, ...args], {
      cwd: directory,
      env,
      timeout: 15_000,
    });
  }

  it('previews and then deletes only the orphan, reporting exact totals', async () => {
    const preview = await run();
    expect(preview.stdout).toContain('"dryRun":true');
    expect(preview.stdout).toContain('"orphanFiles":1');
    expect(existsSync(join(directory, 'data', 'channel', '2.jpg'))).toBe(true);
    const applied = await run('--apply', '--offline');
    expect(applied.stdout).toContain('"filesDeleted":1');
    expect(applied.stdout).toContain('"bytesDeleted":6');
    expect(existsSync(join(directory, 'data', 'channel', '1.jpg'))).toBe(true);
    expect(existsSync(join(directory, 'data', 'channel', '2.jpg'))).toBe(false);
    expect(existsSync(join(directory, 'data', 'db.sqlite'))).toBe(true);
  });

  it('refuses applying without offline confirmation and leaves files intact', async () => {
    await expect(run('--apply')).rejects.toMatchObject({ code: 1 });
    expect(existsSync(join(directory, 'data', 'channel', '2.jpg'))).toBe(true);
  });

  it('refuses applying while a local server is running', async () => {
    const server = createServer();
    await new Promise<void>((resolve) => server.listen(port, '0.0.0.0', resolve));
    try {
      await expect(run('--apply', '--offline')).rejects.toMatchObject({ code: 1 });
      expect(existsSync(join(directory, 'data', 'channel', '2.jpg'))).toBe(true);
    } finally {
      await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
    }
  });
});
