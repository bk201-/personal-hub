import { lstat, open, opendir, unlink } from 'node:fs/promises';
import { dirname, join } from 'node:path';

// Only filenames produced by the Telegram media writers belong to this cleanup.
const MEDIA_NAME =
  /^(?:\d+|iv_\d+_\d+)\.(?:jpg|jpeg|png|gif|webp|mp4|webm|mov|ogg|mp3|m4a|flac|wav)(?:\.[0-9a-f-]{36}\.part)?$/i;
const CHANNEL_DIRECTORY = /^@?[a-zA-Z0-9_-]+$/;

export interface MediaCleanupProgress {
  phase: 'scanning' | 'deleting' | 'complete';
  foldersTotal: number;
  foldersScanned: number;
  filesScanned: number;
  filesKept: number;
  filesSkipped: number;
  orphanFiles: number;
  orphanBytes: number;
  filesProcessed: number;
  filesDeleted: number;
  bytesDeleted: number;
  errors: number;
}

interface CleanupOptions {
  root: string;
  apply?: boolean;
  loadReferences: () => Promise<ReadonlySet<string>>;
  onProgress?: (progress: MediaCleanupProgress) => void;
  onError?: (path: string, error: unknown) => void;
}

export function mediaReferenceKey(path: string): string {
  const normalized = path
    .replaceAll('\\', '/')
    .replace(/^\/?api\/media\//, '')
    .replace(/^\.\//, '');
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}

/** Offline maintenance only: callers must stop all writers before applying deletions. */
export async function cleanupOrphanMedia(options: CleanupOptions): Promise<MediaCleanupProgress> {
  const rootStat = await lstat(options.root);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) {
    throw new Error('Media root must be a real directory, not a symbolic link');
  }
  const lockPath = join(options.root, '.media-cleanup.lock');
  const lock = await open(lockPath, 'wx');
  try {
    return await scanAndClean(options);
  } finally {
    await lock.close();
    await unlink(lockPath);
  }
}

async function scanAndClean(options: CleanupOptions): Promise<MediaCleanupProgress> {
  // Finish every DB read before permitting even the first deletion.
  const references = new Set([...(await options.loadReferences())].map(mediaReferenceKey));
  const progress: MediaCleanupProgress = {
    phase: 'scanning',
    foldersTotal: 0,
    foldersScanned: 0,
    filesScanned: 0,
    filesKept: 0,
    filesSkipped: 0,
    orphanFiles: 0,
    orphanBytes: 0,
    filesProcessed: 0,
    filesDeleted: 0,
    bytesDeleted: 0,
    errors: 0,
  };
  const report = () => options.onProgress?.({ ...progress });
  const folders: string[] = [];
  for await (const entry of await opendir(options.root)) {
    if (entry.isDirectory() && entry.name.toLowerCase() !== 'tts' && CHANNEL_DIRECTORY.test(entry.name)) {
      folders.push(entry.name);
    }
  }
  progress.foldersTotal = folders.length;
  report();

  const candidates: { path: string; size: number; mtimeMs: number; ino: number }[] = [];
  for (const folder of folders) {
    const directory = join(options.root, folder);
    const directoryStat = await lstat(directory);
    if (!directoryStat.isDirectory() || directoryStat.isSymbolicLink()) {
      throw new Error('Media directory changed during cleanup; stop all storage writers');
    }
    for await (const entry of await opendir(directory)) {
      if (!entry.isFile() || !MEDIA_NAME.test(entry.name)) {
        progress.filesSkipped++;
        continue;
      }
      progress.filesScanned++;
      if (references.has(mediaReferenceKey(`${folder}/${entry.name}`))) {
        progress.filesKept++;
      } else {
        const path = join(directory, entry.name);
        const stat = await lstat(path);
        if (!stat.isFile() || stat.isSymbolicLink()) {
          throw new Error('Media file changed during cleanup; stop all storage writers');
        }
        candidates.push({ path, size: stat.size, mtimeMs: stat.mtimeMs, ino: stat.ino });
        progress.orphanFiles++;
        progress.orphanBytes += stat.size;
      }
      if (progress.filesScanned % 100 === 0) report();
    }
    progress.foldersScanned++;
    report();
  }

  if (options.apply) {
    progress.phase = 'deleting';
    report();
    for (const candidate of candidates) {
      try {
        const directory = await lstat(dirname(candidate.path));
        const stat = await lstat(candidate.path);
        if (
          !directory.isDirectory() ||
          directory.isSymbolicLink() ||
          !stat.isFile() ||
          stat.isSymbolicLink() ||
          stat.size !== candidate.size ||
          stat.mtimeMs !== candidate.mtimeMs ||
          stat.ino !== candidate.ino
        ) {
          throw new Error('Media file changed since scan; refusing to delete it');
        }
        await unlink(candidate.path);
        progress.filesDeleted++;
        progress.bytesDeleted += stat.size;
      } catch (err) {
        progress.errors++;
        options.onError?.(candidate.path, err);
      }
      progress.filesProcessed++;
      if (progress.filesProcessed % 100 === 0) report();
    }
  }
  progress.phase = 'complete';
  report();
  return progress;
}
