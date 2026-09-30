import { lstat, opendir } from 'node:fs/promises';
import { join, parse, resolve, sep } from 'node:path';
import type { ChannelStorageStats } from '../../shared/types.js';

interface ScanOptions {
  dataRoot?: string;
  maxEntries?: number;
  maxDepth?: number;
  maxDurationMs?: number;
  now?: () => number;
}

function isMissing(error: unknown): boolean {
  return (error as NodeJS.ErrnoException)?.code === 'ENOENT';
}

function validateChannelDirectory(telegramId: string): void {
  // Telegram usernames and numeric IDs only; no Windows devices, ADS or shared directories.
  if (
    !/^(?:[a-zA-Z0-9_]{1,64}|-?[0-9]{1,20})$/.test(telegramId) ||
    /^(?:tts|db|con|prn|aux|nul|com[0-9]|lpt[0-9])$/i.test(telegramId)
  ) {
    throw new Error('Unsafe channel storage directory');
  }
}

export async function scanChannelStorage(
  telegramId: string,
  {
    dataRoot = join(process.cwd(), 'data'),
    maxEntries = 50_000,
    maxDepth = 32,
    maxDurationMs = 10_000,
    now = Date.now,
  }: ScanOptions = {},
): Promise<ChannelStorageStats> {
  validateChannelDirectory(telegramId);
  const startedAt = now();
  let entries = 0;
  let bytes = 0;
  let fileCount = 0;

  function checkDeadline() {
    if (now() - startedAt >= maxDurationMs) throw new Error('Channel storage scan time limit exceeded');
  }

  async function inspect(path: string) {
    const absolute = resolve(path);
    const root = parse(absolute).root;
    const parts = absolute.slice(root.length).split(sep).filter(Boolean);
    let current = root;
    // Check every ancestor before lstat of a child: lstat alone follows parent junctions.
    // Node has no portable openat/no-follow traversal; this is not an atomic filesystem snapshot.
    for (let index = -1; index < parts.length; index++) {
      checkDeadline();
      if (index >= 0) current = join(current, parts[index]);
      let stat;
      try {
        stat = await lstat(current);
      } catch (error) {
        if (isMissing(error)) return undefined;
        throw error;
      }
      if (stat.isSymbolicLink()) throw new Error('Linked channel storage path');
      if (index < parts.length - 1 && !stat.isDirectory()) {
        throw new Error('Invalid channel storage ancestor');
      }
      if (index === parts.length - 1) return stat;
    }
  }

  async function walk(path: string, depth: number): Promise<void> {
    checkDeadline();
    if (depth > maxDepth) throw new Error('Channel storage scan depth limit exceeded');
    const stat = await inspect(path);
    if (!stat) return;
    if (!stat.isDirectory()) throw new Error('Invalid channel storage directory');

    try {
      const directory = await opendir(path);
      for await (const entry of directory) {
        checkDeadline();
        if (++entries > maxEntries) throw new Error('Channel storage scan entry limit exceeded');
        const child = join(path, entry.name);
        const childStat = await inspect(child);
        if (!childStat) continue; // A download/cleanup may remove an entry during the scan.
        if (childStat.isDirectory()) {
          await walk(child, depth + 1);
        } else if (childStat.isFile()) {
          if (!Number.isSafeInteger(childStat.size) || !Number.isSafeInteger(bytes + childStat.size)) {
            throw new Error('Channel storage size limit exceeded');
          }
          bytes += childStat.size;
          fileCount++;
        }
      }
    } catch (error) {
      if (!isMissing(error)) throw error;
    }
  }

  await walk(join(resolve(dataRoot), telegramId), 0);
  checkDeadline();
  return { bytes, fileCount, checkedAt: Math.floor(now() / 1000) };
}
