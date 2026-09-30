import { access } from 'node:fs/promises';
import { join } from 'node:path';
import 'dotenv/config';
import { logger } from '../../src/server/logger.js';
import { parseCleanupArgs, reserveMaintenancePort } from './mediaCleanupCommand.js';
import { cleanupOrphanMedia } from './orphanMediaCleanup.js';

async function main(): Promise<void> {
  const { apply, help } = parseCleanupArgs(process.argv.slice(2));
  if (help) {
    console.log('media:cleanup [--apply --offline]');
    console.log('Default: dry run. Apply only after stopping ALL app replicas and storage writers.');
    console.log('Run from the app directory with the matching database and mounted data directory.');
    return;
  }
  const root = join(process.cwd(), 'data');
  // Never create an empty fallback database against somebody else's media volume.
  if (!process.env.DATABASE_URL) await access(join(root, 'db.sqlite'));
  const releasePort = apply ? await reserveMaintenancePort(Number(process.env.SERVER_PORT ?? 3173)) : undefined;
  try {
    const { client } = await import('../../src/server/db/index.js');
    try {
      const { loadMediaCleanupReferences } = await import('./mediaCleanupReferences.js');
      console.log(apply ? 'Deleting orphan media (offline).' : 'DRY RUN: no media files will be deleted.');
      const result = await cleanupOrphanMedia({
        root,
        apply,
        loadReferences: loadMediaCleanupReferences,
        onProgress: (p) => {
          console.log(
            `${p.phase}: folders ${p.foldersScanned}/${p.foldersTotal}; scanned ${p.filesScanned}; ` +
              `orphans ${p.orphanFiles} (${p.orphanBytes} bytes); processed ${p.filesProcessed}/${p.orphanFiles}; ` +
              `deleted ${p.filesDeleted} (${p.bytesDeleted} bytes); errors ${p.errors}`,
          );
        },
        onError: (path, err) => logger.error({ module: 'media-cleanup', path, err }, 'could not delete orphan media'),
      });
      console.log(JSON.stringify({ dryRun: !apply, ...result }));
      if (result.errors > 0) process.exitCode = 1;
    } finally {
      client.close();
    }
  } finally {
    await releasePort?.();
  }
}

void main().catch((err: unknown) => {
  logger.error({ module: 'media-cleanup', err }, 'media cleanup failed');
  process.exitCode = 1;
});
