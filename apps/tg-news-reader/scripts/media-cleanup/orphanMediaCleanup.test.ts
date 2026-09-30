import { existsSync, unlinkSync, writeFileSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanupOrphanMedia } from './orphanMediaCleanup.js';
import type { MediaCleanupProgress } from './orphanMediaCleanup.js';

describe('orphan media cleanup', () => {
  let root: string;
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'tg-orphan-cleanup-'));
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  async function file(path: string, content = 'media') {
    const fullPath = join(root, ...path.split(/[\\/]/));
    await mkdir(join(fullPath, '..'), { recursive: true });
    await writeFile(fullPath, content);
    return fullPath;
  }

  it('previews without deleting and reports folder progress, file counts and exact bytes', async () => {
    await file('channel\\1.jpg', 'keep');
    const orphan = await file('deleted-channel\\2.mp4', 'orphan-video');
    const snapshots: MediaCleanupProgress[] = [];
    const result = await cleanupOrphanMedia({
      root,
      loadReferences: async () => new Set(['channel/1.jpg']),
      onProgress: (p) => snapshots.push(p),
    });
    expect(result).toMatchObject({
      phase: 'complete',
      foldersTotal: 2,
      foldersScanned: 2,
      filesScanned: 2,
      filesKept: 1,
      orphanFiles: 1,
      orphanBytes: 12,
      filesDeleted: 0,
      bytesDeleted: 0,
      errors: 0,
    });
    expect(snapshots[0]).toMatchObject({ phase: 'scanning', foldersTotal: 2, foldersScanned: 0 });
    expect(snapshots.some((p) => p.foldersScanned === 1)).toBe(true);
    expect(await readFile(orphan, 'utf8')).toBe('orphan-video');
    expect(existsSync(join(root, '.media-cleanup.lock'))).toBe(false);
  });

  it('deletes unreferenced media and abandoned partials, retaining referenced files of every kind', async () => {
    for (const name of ['1.jpg', '2.png', 'iv_4_0.jpg']) await file(`channel\\${name}`);
    const orphan = await file('channel\\3.mp4', '1234567');
    const partial = await file('old\\5.jpg.12345678-1234-1234-1234-123456789abc.part', '123');
    const result = await cleanupOrphanMedia({
      root,
      apply: true,
      loadReferences: async () => new Set(['channel\\1.jpg', '/api/media/channel/2.png', 'channel/iv_4_0.jpg']),
    });
    expect(result).toMatchObject({
      filesKept: 3,
      orphanFiles: 2,
      orphanBytes: 10,
      filesProcessed: 2,
      filesDeleted: 2,
      bytesDeleted: 10,
      errors: 0,
    });
    expect(existsSync(orphan)).toBe(false);
    expect(existsSync(partial)).toBe(false);
    expect(existsSync(join(root, 'channel', 'iv_4_0.jpg'))).toBe(true);
  });

  it('never touches root files, TTS, unknown files, nested folders or linked directories', async () => {
    const preserved = [
      await file('db.sqlite'),
      await file('123.mp4'),
      await file('tts\\hash\\0.mp3'),
      await file('channel\\notes.txt'),
      await file('channel\\nested\\3.jpg'),
      await file('.outside\\4.jpg'),
    ];
    await symlink(join(root, '.outside'), join(root, 'linked'), 'junction');
    const result = await cleanupOrphanMedia({ root, apply: true, loadReferences: async () => new Set() });
    expect(result.filesDeleted).toBe(0);
    expect(result.filesSkipped).toBe(2);
    for (const path of preserved) expect(existsSync(path)).toBe(true);
  });

  it('aborts before deleting anything if references cannot be loaded and releases the lock', async () => {
    const orphan = await file('channel\\1.jpg');
    await expect(
      cleanupOrphanMedia({
        root,
        apply: true,
        loadReferences: async () => {
          throw new Error('DB unavailable');
        },
      }),
    ).rejects.toThrow('DB unavailable');
    expect(existsSync(orphan)).toBe(true);
    expect(existsSync(join(root, '.media-cleanup.lock'))).toBe(false);
  });

  it('refuses overlapping cleanup runs', async () => {
    let release!: (value: ReadonlySet<string>) => void;
    const references = new Promise<ReadonlySet<string>>((resolve) => {
      release = resolve;
    });
    const loadReferences = vi.fn(() => references);
    const first = cleanupOrphanMedia({ root, loadReferences });
    await vi.waitFor(() => expect(loadReferences).toHaveBeenCalled());
    await expect(cleanupOrphanMedia({ root, loadReferences })).rejects.toMatchObject({ code: 'EEXIST' });
    release(new Set());
    await first;
  });

  it('refuses a linked storage root', async () => {
    const directory = join(root, 'real');
    const linked = join(root, 'linked');
    await mkdir(directory);
    await symlink(directory, linked, 'junction');
    await expect(cleanupOrphanMedia({ root: linked, loadReferences: async () => new Set() })).rejects.toThrow(
      'real directory',
    );
  });

  it('reports failed deletions without inflating freed bytes and continues other candidates', async () => {
    const disappeared = await file('channel\\1.jpg', 'missing');
    const remaining = await file('channel\\2.jpg', '1234');
    const onError = vi.fn();
    const result = await cleanupOrphanMedia({
      root,
      apply: true,
      loadReferences: async () => new Set(),
      onError,
      onProgress: (p) => {
        if (p.phase === 'deleting' && p.filesProcessed === 0) unlinkSync(disappeared);
      },
    });
    expect(result).toMatchObject({ filesDeleted: 1, bytesDeleted: 4, errors: 1, filesProcessed: 2 });
    expect(onError).toHaveBeenCalledWith(disappeared, expect.objectContaining({ code: 'ENOENT' }));
    expect(existsSync(remaining)).toBe(false);
  });

  it('does not delete a candidate replaced after the scan', async () => {
    const path = await file('channel\\1.jpg', 'old');
    const onError = vi.fn();
    const result = await cleanupOrphanMedia({
      root,
      apply: true,
      loadReferences: async () => new Set(),
      onError,
      onProgress: (p) => {
        if (p.phase === 'deleting') writeFileSync(path, 'new contents');
      },
    });
    expect(result).toMatchObject({ filesDeleted: 0, bytesDeleted: 0, errors: 1 });
    expect(onError).toHaveBeenCalledWith(
      path,
      expect.objectContaining({ message: expect.stringContaining('changed') }),
    );
    expect(await readFile(path, 'utf8')).toBe('new contents');
  });

  it('reports intermediate progress inside a large folder and while deleting', async () => {
    for (let i = 1; i <= 101; i++) await file(`channel\\${i}.jpg`, 'x');
    const onProgress = vi.fn();
    const result = await cleanupOrphanMedia({ root, apply: true, loadReferences: async () => new Set(), onProgress });
    expect(result).toMatchObject({ filesDeleted: 101, bytesDeleted: 101 });
    expect(onProgress).toHaveBeenCalledWith(expect.objectContaining({ phase: 'scanning', filesScanned: 100 }));
    expect(onProgress).toHaveBeenCalledWith(expect.objectContaining({ phase: 'deleting', filesProcessed: 100 }));
  });
});
